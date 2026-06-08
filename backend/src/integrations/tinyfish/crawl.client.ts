import axios, { type AxiosInstance, type AxiosError } from 'axios';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import type { TinyfishCrawlParams, TinyfishCrawlResponse } from './crawl.types.js';
import type { TinyfishApiError } from './search.types.js';

const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 500;
const CONCURRENCY_LIMIT = 3;

export class TinyfishCrawlError extends Error {
  public readonly code: string;
  public readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'TinyfishCrawlError';
    this.code = code;
    this.status = status;
  }
}

// Real Tinyfish Fetch API request/response (per docs.tinyfish.ai).
// POST https://api.fetch.tinyfish.ai with body { urls: [...], format: 'markdown', links?, image_links?, ttl? }
// Returns: { results: [{ url, final_url, title, description, language, author, published_date, text, format, links?, image_links?, latency_ms }], errors: [{ url, error, status? }] }
interface RealFetchRequestBody {
  urls: string[];
  format?: 'markdown' | 'html' | 'json';
  links?: boolean;
  image_links?: boolean;
  ttl?: number;
}

interface RealFetchResult {
  url: string;
  final_url: string;
  title?: string | null;
  description?: string | null;
  language?: string | null;
  author?: string | null;
  published_date?: string | null;
  text: string;
  format: string;
  links?: string[];
  image_links?: string[];
  latency_ms?: number | null;
}

interface RealFetchError {
  url: string;
  error: string;
  status?: number;
}

interface RealFetchResponse {
  results: RealFetchResult[];
  errors: RealFetchError[];
}

function createCrawlAxiosInstance(): AxiosInstance {
  return axios.create({
    baseURL: env.TINYFISH_CRAWL_URL,
    timeout: env.TINYFISH_TIMEOUT_MS,
    headers: {
      'Content-Type': 'application/json',
      // Tinyfish requires X-API-Key, NOT Authorization: Bearer.
      'X-API-Key': env.TINYFISH_API_KEY,
    },
  });
}

async function withRetry<T>(
  fn: () => Promise<T>,
  context: string,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error;

      const isRetryable = isRetryableError(error);
      if (!isRetryable || attempt === MAX_RETRIES) {
        break;
      }

      const delay = BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
      logger.warn(
        { attempt, maxRetries: MAX_RETRIES, delay, context },
        `Tinyfish crawl request failed, retrying...`,
      );
      await sleep(delay);
    }
  }

  throw lastError;
}

function isRetryableError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status;
  if (!status) return true;
  return status === 429 || status >= 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractApiError(error: unknown): { message: string; code: string; status: number } {
  if (axios.isAxiosError(error)) {
    const axiosErr = error as AxiosError<TinyfishApiError>;
    const status = axiosErr.response?.status ?? 0;
    const data = axiosErr.response?.data;
    const message = data?.message ?? axiosErr.message;
    const code = data?.code ?? axiosErr.code ?? 'UNKNOWN_ERROR';
    return { message, code, status };
  }

  if (error instanceof Error) {
    return { message: error.message, code: 'UNKNOWN_ERROR', status: 0 };
  }

  return { message: 'An unknown error occurred', code: 'UNKNOWN_ERROR', status: 0 };
}

/**
 * Map a Tinyfish Fetch API result into the internal CrawledPage shape
 * (TinyfishCrawlResponse) that the rest of the codebase consumes.
 */
function adaptFetchResult(
  real: RealFetchResult,
  startedAtMs: number,
  requestedLinks: boolean,
): TinyfishCrawlResponse {
  const responseTime = real.latency_ms ?? Date.now() - startedAtMs;
  const text = real.text ?? '';
  return {
    url: real.url,
    title: real.title ?? '',
    content: text,
    markdown: text, // We always request format=markdown, so text IS markdown.
    links: requestedLinks
      ? (real.links ?? []).map((href) => ({
          url: href,
          text: '',
          type: classifyLink(real.final_url || real.url, href),
        }))
      : [],
    metadata: {
      description: real.description ?? undefined,
      author: real.author ?? undefined,
      publishedDate: real.published_date ?? undefined,
      siteName: undefined,
      ogImage: undefined,
      wordCount: text ? text.split(/\s+/).filter(Boolean).length : 0,
    },
    responseTime,
  };
}

function classifyLink(pageUrl: string, linkHref: string): 'internal' | 'external' {
  try {
    const pageHost = new URL(pageUrl).hostname;
    const linkHost = new URL(linkHref).hostname;
    return pageHost === linkHost ? 'internal' : 'external';
  } catch {
    return 'external';
  }
}

async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
): Promise<T[]> {
  const results: T[] = [];
  let index = 0;

  async function worker(): Promise<void> {
    while (index < tasks.length) {
      const currentIndex = index++;
      const task = tasks[currentIndex];
      if (task) {
        results[currentIndex] = await task();
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker());
  await Promise.all(workers);

  return results;
}

export class TinyfishCrawlClient {
  private readonly http: AxiosInstance;

  constructor() {
    this.http = createCrawlAxiosInstance();
  }

  /**
   * Fetch a single URL via the Tinyfish Fetch API.
   *
   * The real API accepts a batch (`urls: []`), but we wrap it as
   * single-URL here so the existing per-page concurrency loop in
   * retrieval.service.ts keeps working unchanged.
   */
  async crawl(params: TinyfishCrawlParams): Promise<TinyfishCrawlResponse> {
    const startedAt = Date.now();
    const wantLinks = params.extractLinks === true;

    const body: RealFetchRequestBody = {
      urls: [params.url],
      format: 'markdown',
      links: wantLinks,
    };

    try {
      const response = await withRetry(
        () => this.http.post<RealFetchResponse>('', body),
        `crawl url="${params.url}"`,
      );

      // Per-URL failures come back in errors[] alongside a 200 — surface
      // them as TinyfishCrawlError so the caller's catch path triggers.
      const perUrlError = response.data.errors.find((e) => e.url === params.url);
      if (perUrlError) {
        throw new TinyfishCrawlError(
          `Fetch failed for ${params.url}: ${perUrlError.error}`,
          perUrlError.error,
          perUrlError.status ?? 0,
        );
      }

      const realResult =
        response.data.results.find((r) => r.url === params.url) ?? response.data.results[0];
      if (!realResult) {
        throw new TinyfishCrawlError(
          `No result returned for ${params.url}`,
          'NO_RESULT',
          0,
        );
      }

      const adapted = adaptFetchResult(realResult, startedAt, wantLinks);

      logger.debug(
        {
          url: params.url,
          title: adapted.title,
          responseTime: adapted.responseTime,
        },
        'Tinyfish crawl completed',
      );

      return adapted;
    } catch (error: unknown) {
      if (error instanceof TinyfishCrawlError) throw error;
      const { message, code, status } = extractApiError(error);

      logger.error(
        { url: params.url, code, status, message },
        'Tinyfish crawl request failed',
      );

      throw new TinyfishCrawlError(message, code, status);
    }
  }

  async crawlMultiple(urls: string[]): Promise<TinyfishCrawlResponse[]> {
    const tasks = urls.map(
      (url) => () => this.crawl({ url }),
    );

    return runWithConcurrency(tasks, CONCURRENCY_LIMIT);
  }
}

export const tinyfishCrawlClient = new TinyfishCrawlClient();
