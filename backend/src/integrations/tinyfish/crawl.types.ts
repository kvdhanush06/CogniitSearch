// Request types
export interface TinyfishCrawlParams {
  url: string;
  extractContent?: boolean;
  extractLinks?: boolean;
  waitForSelector?: string;
  timeout?: number;
}

// Response types
export interface TinyfishCrawlResponse {
  url: string;
  title: string;
  content: string;
  markdown: string;
  links: TinyfishCrawlLink[];
  metadata: TinyfishCrawlMetadata;
  responseTime: number;
}

export interface TinyfishCrawlLink {
  url: string;
  text: string;
  type: 'internal' | 'external';
}

export interface TinyfishCrawlMetadata {
  description?: string;
  author?: string;
  publishedDate?: string;
  siteName?: string;
  ogImage?: string;
  wordCount: number;
}
