import { logger } from '../config/logger.js';
import { tinyfishCrawlClient } from '../integrations/tinyfish/crawl.client.js';
import { TinyfishCrawlError } from '../integrations/tinyfish/crawl.client.js';
import { cacheService } from './cache.service.js';
import type { RankedResult, CrawledPage } from './search.types.js';

export class RetrievalService {
  /**
   * Crawl top-ranked pages to extract full content
   */
  async crawlPages(
    rankedResults: RankedResult[],
    maxPages: number,
  ): Promise<Map<string, CrawledPage>> {
    const startTime = Date.now();

    // Select top N results for crawling
    const pagesToCrawl = rankedResults.slice(0, maxPages);

    logger.info(
      { pageCount: pagesToCrawl.length, maxPages },
      'Starting page retrieval',
    );

    // Crawl pages with concurrency control
    const crawlResults = await this.crawlWithConcurrency(pagesToCrawl);

    // Build result map
    const resultMap = new Map<string, CrawledPage>();
    for (const result of crawlResults) {
      if (result.success && result.data) {
        resultMap.set(result.url, result.data);
      }
    }

    const duration = Date.now() - startTime;
    logger.info(
      {
        totalAttempted: pagesToCrawl.length,
        successful: resultMap.size,
        failed: pagesToCrawl.length - resultMap.size,
        duration,
      },
      'Page retrieval completed',
    );

    return resultMap;
  }

  /**
   * Build context string from crawled pages for LLM consumption
   */
  buildContext(
    crawledPages: Map<string, CrawledPage>,
    rankedResults: RankedResult[],
    maxSources: number,
  ): {
    context: string;
    sources: Array<{
      url: string;
      title: string;
      content: string;
      relevanceScore: number;
    }>;
  } {
    // Merge crawl data with rankings and sort by relevance
    const scoredPages = rankedResults
      .filter((r) => crawledPages.has(r.url))
      .slice(0, maxSources)
      .map((ranking) => {
        const page = crawledPages.get(ranking.url)!;
        return {
          url: page.url,
          title: page.title,
          content: page.markdown || page.content,
          relevanceScore: ranking.finalScore,
        };
      });

    // Build structured context string
    const contextParts = scoredPages.map((source, index) => {
      return `[Source ${index + 1}]: ${source.title}
URL: ${source.url}
Relevance: ${(source.relevanceScore * 100).toFixed(1)}%

${source.content}
---`;
    });

    const context = contextParts.join('\n\n');

    logger.debug(
      {
        sourceCount: scoredPages.length,
        contextLength: context.length,
      },
      'Context built from crawled pages',
    );

    return {
      context,
      sources: scoredPages,
    };
  }

  /**
   * Crawl pages with controlled concurrency (with per-URL context cache).
   *
   * For each URL, the cache is checked first. Cache hits avoid a
   * Tinyfish round-trip; misses are crawled and the result is stored
   * for 24h. A page crawled once in the window is reused across all
   * queries that selected it.
   */
  private async crawlWithConcurrency(
    pages: RankedResult[],
  ): Promise<Array<{ url: string; success: boolean; data?: CrawledPage; error?: string }>> {
    const CONCURRENCY_LIMIT = 3;
    const results: Array<{ url: string; success: boolean; data?: CrawledPage; error?: string }> =
      [];

    // Create crawl tasks
    const tasks = pages.map((page) => async () => {
      try {
        const response = await cacheService.getOrSet('context', [page.url], () =>
          tinyfishCrawlClient.crawl({
            url: page.url,
            extractContent: true,
            extractLinks: true,
          }),
        );

        const crawledPage: CrawledPage = {
          url: response.url,
          title: response.title,
          content: response.content,
          markdown: response.markdown,
          metadata: {
            description: response.metadata.description,
            author: response.metadata.author,
            publishedDate: response.metadata.publishedDate,
            siteName: response.metadata.siteName,
            ogImage: response.metadata.ogImage,
            wordCount: response.metadata.wordCount,
          },
          links: response.links.map((link) => ({
            url: link.url,
            text: link.text,
            type: link.type,
          })),
        };

        return {
          url: page.url,
          success: true,
          data: crawledPage,
        };
      } catch (error) {
        const errorMessage =
          error instanceof TinyfishCrawlError ? error.message : 'Unknown crawl error';

        logger.warn(
          {
            url: page.url,
            error: errorMessage,
            status: (error as TinyfishCrawlError).status,
          },
          'Failed to crawl page',
        );

        return {
          url: page.url,
          success: false,
          error: errorMessage,
        };
      }
    });

    // Execute with concurrency control
    let index = 0;
    const workers: Promise<void>[] = [];

    const worker = async () => {
      while (index < tasks.length) {
        const currentIndex = index++;
        const task = tasks[currentIndex];
        if (task) {
          const result = await task();
          results[currentIndex] = result;
        }
      }
    };

    // Start workers
    const workerCount = Math.min(CONCURRENCY_LIMIT, tasks.length);
    for (let i = 0; i < workerCount; i++) {
      workers.push(worker());
    }

    await Promise.all(workers);

    return results;
  }
}

export const retrievalService = new RetrievalService();
