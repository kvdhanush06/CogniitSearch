// Search-related types
export interface SearchRequest {
  query: string;
  maxResults?: number;
  language?: string;
  region?: string;
  safeSearch?: boolean;
  freshness?: 'day' | 'week' | 'month' | 'none';
  enableCrawl?: boolean;
  enableRanking?: boolean;
}

export interface SearchResult {
  url: string;
  title: string;
  snippet: string;
  domain: string;
  favicon?: string;
  publishedDate?: string;
  searchScore: number;
  relevanceScore: number;
  qualityScore: number;
  freshnessScore: number;
  finalScore: number;
  wordCount?: number;
  hasContent: boolean;
}

export interface SearchContext {
  query: string;
  sources: Array<{
    url: string;
    title: string;
    content: string;
    relevanceScore: number;
  }>;
  totalSources: number;
  contextLength: number;
  metadata: {
    searchDuration: number;
    crawlDuration: number;
    rankingDuration: number;
    totalDuration: number;
  };
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  context: SearchContext;
  metadata: {
    totalResults: number;
    searchDuration: number;
    rankingDuration: number;
    crawlDuration: number;
    contextBuildDuration: number;
    totalDuration: number;
    config: Record<string, unknown>;
  };
}
