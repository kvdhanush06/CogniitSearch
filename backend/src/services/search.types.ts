// Ranked search result with relevance score
export interface RankedResult {
  url: string;
  title: string;
  snippet: string;
  domain: string;
  favicon?: string;
  publishedDate?: string;
  
  // Scoring
  searchScore: number;      // Original search API score
  relevanceScore: number;   // Query relevance score
  qualityScore: number;     // Content quality score
  freshnessScore: number;   // Recency score
  finalScore: number;       // Weighted composite score
  
  // Metadata
  wordCount?: number;
  hasContent: boolean;
}

// Crawl result with extracted content
export interface CrawledPage {
  url: string;
  title: string;
  content: string;
  markdown: string;
  metadata: {
    description?: string;
    author?: string;
    publishedDate?: string;
    siteName?: string;
    ogImage?: string;
    wordCount: number;
  };
  links: Array<{
    url: string;
    text: string;
    type: 'internal' | 'external';
  }>;
}

// Context builder output for LLM
export interface BuiltContext {
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

// Search pipeline configuration
export interface SearchPipelineConfig {
  maxSearchResults: number;
  maxCrawlPages: number;
  maxContextSources: number;
  minRelevanceScore: number;
  enableCrawl: boolean;
  enableRanking: boolean;
  freshnessWeight: number;
  relevanceWeight: number;
  qualityWeight: number;
}

// Default configuration
export const DEFAULT_PIPELINE_CONFIG: SearchPipelineConfig = {
  maxSearchResults: 10,
  maxCrawlPages: 5,
  maxContextSources: 5,
  minRelevanceScore: 0.3,
  enableCrawl: true,
  enableRanking: true,
  freshnessWeight: 0.2,
  relevanceWeight: 0.5,
  qualityWeight: 0.3,
};
