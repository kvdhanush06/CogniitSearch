import axios, { type AxiosInstance, type AxiosError } from 'axios';

// API Response envelope — every backend response uses this shape.
export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T;
  error?: {
    message: string;
    code: string;
    details?: Record<string, unknown>;
  };
}

export interface ApiError {
  message: string;
  code: string;
  status: number;
  details?: Record<string, unknown>;
}

// API Client class.
//
// Sessions are httpOnly cookies issued by the backend. The browser sends
// them automatically because we set `withCredentials: true` (axios) and
// `credentials: 'include'` (raw fetch, used for SSE).
//
// The frontend NEVER talks to Supabase, Groq, Tinyfish, or Google directly.
export class ApiClient {
  private client: AxiosInstance;

  constructor(baseURL: string) {
    this.client = axios.create({
      baseURL,
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' },
      withCredentials: true,
    });
    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError<ApiError>) => {
        const apiError: ApiError = {
          message: error.response?.data?.message ?? error.message,
          code: error.response?.data?.code ?? 'UNKNOWN_ERROR',
          status: error.response?.status ?? 0,
          details: error.response?.data?.details,
        };
        return Promise.reject(apiError);
      },
    );
  }

  async get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
    const response = await this.client.get<ApiResponse<T>>(url, { params });
    return response.data.data;
  }

  async post<T>(url: string, data?: unknown): Promise<T> {
    const response = await this.client.post<ApiResponse<T>>(url, data);
    return response.data.data;
  }

  async put<T>(url: string, data?: unknown): Promise<T> {
    const response = await this.client.put<ApiResponse<T>>(url, data);
    return response.data.data;
  }

  async delete<T>(url: string): Promise<T> {
    const response = await this.client.delete<ApiResponse<T>>(url);
    return response.data.data;
  }

  /**
   * Streaming method (raw fetch; axios can't stream response bodies).
   * The session cookie is sent via `credentials: 'include'`.
   */
  async *stream(url: string, data?: unknown): AsyncIterableIterator<string> {
    const response = await fetch(`${this.client.defaults.baseURL}${url}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`Stream failed: ${response.statusText}`);
    }
    yield* this.readSseStream(response);
  }

  /**
   * GET variant of `stream` for SSE endpoints (e.g. the reattach
   * endpoint). Identical parsing; only the method differs.
   */
  async *streamGet(url: string): AsyncIterableIterator<string> {
    const response = await fetch(`${this.client.defaults.baseURL}${url}`, {
      method: 'GET',
      credentials: 'include',
    });
    if (!response.ok) {
      throw new Error(`Stream failed: ${response.statusText}`);
    }
    yield* this.readSseStream(response);
  }

  private async *readSseStream(response: Response): AsyncIterableIterator<string> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('ReadableStream not supported');
    }
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          yield trimmed.slice(6);
        }
      }
    }
  }
}

// In dev, the Vite dev server's proxy is bypassed because we hit the absolute
// URL directly. In prod, VITE_API_URL is empty and we fall back to the
// relative origin (nginx serves the SPA and proxies /api/* to the backend).
const API_URL = import.meta.env.VITE_API_URL ?? '';
const API_PREFIX = import.meta.env.VITE_API_PREFIX ?? '/api/v1';

export const apiClient = new ApiClient(`${API_URL}${API_PREFIX}`);
