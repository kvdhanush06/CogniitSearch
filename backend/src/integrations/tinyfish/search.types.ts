// Request types
export interface TinyfishSearchParams {
  query: string;
  maxResults?: number;
  language?: string;
  region?: string;
  safeSearch?: boolean;
  freshness?: 'day' | 'week' | 'month' | 'none';
}

// Response types
export interface TinyfishSearchResponse {
  results: TinyfishSearchResult[];
  query: string;
  totalResults: number;
  responseTime: number;
}

export interface TinyfishSearchResult {
  title: string;
  url: string;
  snippet: string;
  publishedDate?: string;
  domain: string;
  favicon?: string;
  score: number;
}

// Error types
export interface TinyfishApiError {
  code: string;
  message: string;
  status: number;
}
