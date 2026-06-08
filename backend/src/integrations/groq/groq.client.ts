import axios, { type AxiosInstance, type AxiosError } from 'axios';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import type { GroqApiError } from './groq.types.js';

const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 500;

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503]);
const NON_RETRYABLE_STATUS_CODES = new Set([400, 401, 403]);

export class GroqClientError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly type: string;

  constructor(message: string, code: string, status: number, type: string) {
    super(message);
    this.name = 'GroqClientError';
    this.code = code;
    this.status = status;
    this.type = type;
  }
}

function createGroqAxiosInstance(): AxiosInstance {
  return axios.create({
    baseURL: 'https://api.groq.com/openai/v1',
    timeout: env.GROQ_TIMEOUT_MS,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.GROQ_API_KEY}`,
    },
  });
}

function isRetryableError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status;
  if (!status) return true; // network errors are retryable
  if (NON_RETRYABLE_STATUS_CODES.has(status)) return false;
  return RETRYABLE_STATUS_CODES.has(status);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  context: string,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error;

      const retryable = isRetryableError(error);
      if (!retryable || attempt === MAX_RETRIES) {
        break;
      }

      const delay = BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
      logger.warn(
        { attempt, maxRetries: MAX_RETRIES, delay, context },
        `Groq API request failed, retrying...`,
      );
      await sleep(delay);
    }
  }

  throw lastError;
}

export function handleGroqError(error: unknown): never {
  if (axios.isAxiosError(error)) {
    const axiosErr = error as AxiosError<GroqApiError>;
    const status = axiosErr.response?.status ?? 0;
    const data = axiosErr.response?.data;
    const message = data?.error?.message ?? axiosErr.message;
    const code = data?.error?.code ?? axiosErr.code ?? 'UNKNOWN_ERROR';
    const type = data?.error?.type ?? 'api_error';

    logger.error({ code, status, type, message }, 'Groq API request failed');
    throw new GroqClientError(message, code, status, type);
  }

  if (error instanceof GroqClientError) {
    throw error;
  }

  if (error instanceof Error) {
    logger.error({ message: error.message }, 'Groq API unexpected error');
    throw new GroqClientError(error.message, 'UNKNOWN_ERROR', 0, 'unexpected_error');
  }

  throw new GroqClientError('An unknown error occurred', 'UNKNOWN_ERROR', 0, 'unexpected_error');
}

export const groqHttpClient: AxiosInstance = createGroqAxiosInstance();
