import { logger } from '../config/logger.js';
import { tinyfishSearchClient } from '../integrations/tinyfish/search.client.js';
import { TinyfishSearchError } from '../integrations/tinyfish/search.client.js';
import { rankingService } from './ranking.service.js';
import { retrievalService } from './retrieval.service.js';
import { cacheService } from './cache.service.js';
import type {
  RankedResult,
  CrawledPage,
  BuiltContext,
  SearchPipelineConfig,
} from './search.types.js';
import { DEFAULT_PIPELINE_CONFIG } from './search.types.js';
import type { TinyfishSearchParams } from '../integrations/tinyfish/search.types.js';

export interface SearchPipelineResult {
  query: string;
  rankedResults: RankedResult[];
  crawledPages: Map<string, CrawledPage>;
  context: BuiltContext;
  metadata: {
    totalResults: number;
    searchDuration: number;
    rankingDuration: number;
    crawlDuration: number;
    contextBuildDuration: number;
    totalDuration: number;
    config: SearchPipelineConfig;
  };
}

export class SearchService {
  /**
   * Execute the complete search pipeline:
   * Search → Rank → Crawl → Build Context
   */
  async executePipeline(
    query: string,
    userId: string,
    config: Partial<SearchPipelineConfig> = {},
  ): Promise<SearchPipelineResult> {
    const totalStartTime = Date.now();
    const pipelineConfig = { ...DEFAULT_PIPELINE_CONFIG, ...config };

    logger.info(
      {
        query,
        userId,
        config: pipelineConfig,
      },
      'Search pipeline started',
    );

    // Step 1: Execute search
    const { searchResults, duration: searchDuration } = await this.executeSearch(query, pipelineConfig);

    if (searchResults.length === 0) {
      logger.warn({ query }, 'No search results found');
      return this.buildEmptyResult(query, pipelineConfig, totalStartTime);
    }

    // Step 2: Rank results
    const { rankedResults, duration: rankingDuration } = this.executeRanking(
      searchResults,
      query,
      pipelineConfig,
    );

    // Step 3: Crawl top pages (if enabled)
    let crawledPages = new Map<string, CrawledPage>();
    let crawlDuration = 0;

    if (pipelineConfig.enableCrawl && rankedResults.length > 0) {
      const crawlResult = await this.executeCrawl(rankedResults, pipelineConfig);
      crawledPages = crawlResult.crawledPages;
      crawlDuration = crawlResult.duration;

      // Enhance rankings with crawl data
      const enhancedRankings = rankingService.enhanceWithCrawlData(
        rankedResults,
        crawlResult.crawlResponses,
      );

      // Re-sort after enhancement
      enhancedRankings.sort((a, b) => b.finalScore - a.finalScore);
      rankedResults.length = 0;
      rankedResults.push(...enhancedRankings);
    }

    // Step 4: Build context
    const { context, duration: contextBuildDuration } = this.executeContextBuild(
      query,
      crawledPages,
      rankedResults,
      pipelineConfig,
    );

    const totalDuration = Date.now() - totalStartTime;

    const result: SearchPipelineResult = {
      query,
      rankedResults,
      crawledPages,
      context,
      metadata: {
        totalResults: searchResults.length,
        searchDuration,
        rankingDuration,
        crawlDuration,
        contextBuildDuration,
        totalDuration,
        config: pipelineConfig,
      },
    };

    logger.info(
      {
        query,
        totalDuration,
        resultCount: rankedResults.length,
        crawledCount: crawledPages.size,
        contextSources: context.sources.length,
      },
      'Search pipeline completed',
    );

    return result;
  }

  /**
   * Step 1: Execute search via Tinyfish (with search-cache).
   *
   * Search results are cached in Redis with a content-hash key derived
   * from the normalized query + freshness preference. Same query inside
   * the TTL window returns instantly without a Tinyfish call.
   */
  private async executeSearch(
    query: string,
    config: SearchPipelineConfig,
  ): Promise<{ searchResults: Array<any>; duration: number; fromCache: boolean }> {
    const startTime = Date.now();
    const cacheKey = [query.trim().toLowerCase(), String(config.maxSearchResults)];

    try {
      const response = await cacheService.getOrSet(
        'search',
        cacheKey,
        async () => {
          const params: TinyfishSearchParams = {
            query,
            maxResults: config.maxSearchResults,
          };
          return tinyfishSearchClient.search(params);
        },
      );

      const duration = Date.now() - startTime;
      logger.debug(
        {
          query,
          resultCount: response.results.length,
          totalResults: response.totalResults,
          duration,
        },
        'Search completed',
      );

      return { searchResults: response.results, duration, fromCache: false };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof TinyfishSearchError ? error.message : 'Unknown search error';

      logger.error(
        {
          query,
          error: errorMessage,
          status: (error as TinyfishSearchError).status,
          duration,
        },
        'Search failed',
      );

      throw error;
    }
  }

  /**
   * Step 2: Rank search results
   */
  private executeRanking(
    searchResults: Array<any>,
    query: string,
    config: SearchPipelineConfig,
  ): { rankedResults: RankedResult[]; duration: number } {
    const startTime = Date.now();

    const rankedResults = rankingService.rankSearchResults(searchResults, query, {
      relevance: config.relevanceWeight,
      quality: config.qualityWeight,
      freshness: config.freshnessWeight,
    });

    // Filter by minimum score
    const filteredResults = rankingService.filterByMinScore(
      rankedResults,
      config.minRelevanceScore,
    );

    const duration = Date.now() - startTime;
    logger.debug(
      {
        originalCount: searchResults.length,
        rankedCount: rankedResults.length,
        filteredCount: filteredResults.length,
        duration,
      },
      'Ranking completed',
    );

    return {
      rankedResults: filteredResults,
      duration,
    };
  }

  /**
   * Step 3: Crawl top-ranked pages
   */
  private async executeCrawl(
    rankedResults: RankedResult[],
    config: SearchPipelineConfig,
  ): Promise<{
    crawledPages: Map<string, CrawledPage>;
    crawlResponses: Map<string, any>;
    duration: number;
  }> {
    const startTime = Date.now();

    // Crawl pages
    const crawledPages = await retrievalService.crawlPages(
      rankedResults,
      config.maxCrawlPages,
    );

    // Build crawl responses map for ranking enhancement
    const crawlResponses = new Map<string, any>();
    for (const [url, page] of crawledPages) {
      crawlResponses.set(url, {
        url: page.url,
        title: page.title,
        content: page.content,
        markdown: page.markdown,
        metadata: page.metadata,
        links: page.links,
      });
    }

    const duration = Date.now() - startTime;
    logger.debug(
      {
        pagesToCrawl: Math.min(rankedResults.length, config.maxCrawlPages),
        crawledCount: crawledPages.size,
        duration,
      },
      'Crawl completed',
    );

    return {
      crawledPages,
      crawlResponses,
      duration,
    };
  }

  /**
   * Step 4: Build context from crawled pages
   */
  private executeContextBuild(
    query: string,
    crawledPages: Map<string, CrawledPage>,
    rankedResults: RankedResult[],
    config: SearchPipelineConfig,
  ): { context: BuiltContext; duration: number } {
    const startTime = Date.now();

    const { context, sources } = retrievalService.buildContext(
      crawledPages,
      rankedResults,
      config.maxContextSources,
    );

    const duration = Date.now() - startTime;

    const builtContext: BuiltContext = {
      query,
      sources,
      totalSources: sources.length,
      contextLength: context.length,
      metadata: {
        searchDuration: 0, // Will be set by caller
        crawlDuration: 0, // Will be set by caller
        rankingDuration: 0, // Will be set by caller
        totalDuration: 0, // Will be set by caller
      },
    };

    logger.debug(
      {
        sourceCount: sources.length,
        contextLength: context.length,
        duration,
      },
      'Context build completed',
    );

    return {
      context: builtContext,
      duration,
    };
  }

  /**
   * Build empty result when no search results found
   */
  private buildEmptyResult(
    query: string,
    config: SearchPipelineConfig,
    startTime: number,
  ): SearchPipelineResult {
    const totalDuration = Date.now() - startTime;

    return {
      query,
      rankedResults: [],
      crawledPages: new Map(),
      context: {
        query,
        sources: [],
        totalSources: 0,
        contextLength: 0,
        metadata: {
          searchDuration: 0,
          crawlDuration: 0,
          rankingDuration: 0,
          totalDuration,
        },
      },
      metadata: {
        totalResults: 0,
        searchDuration: 0,
        rankingDuration: 0,
        crawlDuration: 0,
        contextBuildDuration: 0,
        totalDuration,
        config,
      },
    };
  }
}

export const searchService = new SearchService();
