import axios, { type AxiosInstance, type AxiosError } from 'axios';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import type { TinyfishSearchParams, TinyfishSearchResponse, TinyfishApiError } from './search.types.js';

const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 500;

export class TinyfishSearchError extends Error {
  public readonly code: string;
  public readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'TinyfishSearchError';
    this.code = code;
    this.status = status;
  }
}

// Real Tinyfish Search API response shape (per docs.tinyfish.ai).
// GET https://api.search.tinyfish.ai?query=...&location=...&language=...
// Returns: { query, results: [{ position, site_name, title, snippet, url }], total_results, page? }
interface RealTinyfishSearchResult {
  position: number;
  site_name: string;
  title: string;
  snippet: string;
  url: string;
}

interface RealTinyfishSearchResponse {
  query: string;
  results: RealTinyfishSearchResult[];
  total_results: number;
  page?: number;
}

function createSearchAxiosInstance(): AxiosInstance {
  return axios.create({
    baseURL: env.TINYFISH_SEARCH_URL,
    timeout: env.TINYFISH_TIMEOUT_MS,
    headers: {
      // Tinyfish requires X-API-Key, NOT Authorization: Bearer.
      // See docs: https://docs.tinyfish.ai/authentication
      'X-API-Key': env.TINYFISH_API_KEY,
      Accept: 'application/json',
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
        `Tinyfish search request failed, retrying...`,
      );
      await sleep(delay);
    }
  }

  throw lastError;
}

function isRetryableError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status;
  if (!status) return true; // network errors are retryable
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
 * Map the real Tinyfish Search API response into the internal shape
 * (TinyfishSearchResponse) that the rest of the codebase consumes.
 *
 * Adapter pattern: keep the external contract stable so downstream
 * ranking/retrieval services don't care about API changes.
 */
function adaptSearchResponse(
  real: RealTinyfishSearchResponse,
  startedAtMs: number,
): TinyfishSearchResponse {
  const responseTime = Date.now() - startedAtMs;
  return {
    query: real.query,
    totalResults: real.total_results ?? real.results.length,
    responseTime,
    results: real.results.map((r) => {
      const domain = r.site_name || safeDomainFromUrl(r.url);
      return {
        title: r.title,
        url: r.url,
        snippet: r.snippet,
        domain,
        // Tinyfish doesn't return a numeric score; use inverse position as
        // a stand-in (position 1 -> 1.0, position 10 -> 0.1). Downstream
        // ranking re-scores anyway.
        score: r.position > 0 ? 1 / r.position : 0,
      };
    }),
  };
}

function safeDomainFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

export class TinyfishSearchClient {
  private readonly http: AxiosInstance;

  constructor() {
    this.http = createSearchAxiosInstance();
  }

  async search(params: TinyfishSearchParams): Promise<TinyfishSearchResponse> {
    const maxResults = params.maxResults ?? env.TINYFISH_MAX_RESULTS;
    const startedAt = Date.now();

    // Build query-string params for GET. Tinyfish Search is GET, not POST.
    // maxResults isn't a supported query parameter on Tinyfish Search;
    // the API returns a fixed page of results. We still cap downstream.
    const queryParams: Record<string, string> = { query: params.query };
    if (params.language) queryParams.language = params.language;
    if (params.region) queryParams.location = params.region;

    try {
      const response = await withRetry(
        () =>
          this.http.get<RealTinyfishSearchResponse>('', {
            params: queryParams,
          }),
        `search query="${params.query}"`,
      );

      const adapted = adaptSearchResponse(response.data, startedAt);
      // Respect the caller's maxResults cap.
      adapted.results = adapted.results.slice(0, maxResults);

      logger.debug(
        {
          query: params.query,
          totalResults: adapted.totalResults,
          returnedResults: adapted.results.length,
          responseTime: adapted.responseTime,
        },
        'Tinyfish search completed',
      );

      return adapted;
    } catch (error: unknown) {
      const { message, code, status } = extractApiError(error);

      logger.error(
        { query: params.query, code, status, message },
        'Tinyfish search request failed',
      );

      throw new TinyfishSearchError(message, code, status);
    }
  }
}

export const tinyfishSearchClient = new TinyfishSearchClient();
