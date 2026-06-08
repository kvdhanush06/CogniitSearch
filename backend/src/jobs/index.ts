// Base job data interface
export interface BaseJobData {
  userId: string;
  conversationId?: string;
  messageId?: string;
  correlationId: string;
  createdAt: string;
}

// Search job interfaces
export interface SearchJobData extends BaseJobData {
  query: string;
  maxResults?: number;
  language?: string;
  region?: string;
  safeSearch?: boolean;
  freshness?: 'day' | 'week' | 'month' | 'none';
  /**
   * Recent user/assistant turns (oldest first) for this conversation.
   * The search worker uses them to rewrite the query so the search engine
   * receives a self-contained phrase. Same shape as AnswerJobData.messages.
   */
  messages?: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
}

export interface SearchJobRanked {
  url: string;
  title: string;
  snippet: string;
  domain: string;
  publishedDate?: string;
  searchScore: number;
  relevanceScore: number;
  qualityScore: number;
  freshnessScore: number;
  finalScore: number;
  wordCount?: number;
}

export interface SearchJobResult {
  query: string;
  ranked: SearchJobRanked[];
  totalResults: number;
  userId: string;
  conversationId?: string;
  messageId?: string;
  correlationId: string;
}

// Crawl job interfaces
export interface CrawlJobData extends BaseJobData {
  urls: string[];
  maxDepth?: number;
  maxPages?: number;
  followLinks?: boolean;
  extractContent?: boolean;
}

export interface CrawlJobResult {
  pages: Array<{
    url: string;
    title: string;
    content: string;
    metadata: {
      description?: string;
      author?: string;
      publishedDate?: string;
      siteName?: string;
      ogImage?: string;
      wordCount: number;
    };
  }>;
  totalPages: number;
  correlationId: string;
}

// Answer job interfaces
export interface AnswerJobData extends BaseJobData {
  query: string;
  context: import('../services/search.types.js').BuiltContext;
  messages?: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface AnswerJobResult {
  answer: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason: string;
  responseTime: number;
  citations: import('../services/citation.service.js').CitationAnalysis;
  sources: import('../services/citation.service.js').SourceAttribution[];
  followUps: string[];
  userId: string;
  conversationId?: string;
  messageId?: string;
  correlationId: string;
}

// Job name constants
export const JobNames = {
  SEARCH: 'search',
  CRAWL: 'crawl',
  ANSWER: 'answer',
} as const;

export type JobName = (typeof JobNames)[keyof typeof JobNames];

// Job result union type
export type JobResult = SearchJobResult | CrawlJobResult | AnswerJobResult;

// Job data union type
export type JobData = SearchJobData | CrawlJobData | AnswerJobData;
