import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import { logger } from '../config/logger.js';
import { tinyfishCrawlClient, TinyfishCrawlError } from '../integrations/tinyfish/crawl.client.js';
import { cacheService } from './cache.service.js';
import type { RankedResult, CrawledPage } from './search.types.js';

function isPrivateOrLocalIp(address: string): boolean {
  if (isIP(address) === 4) {
    const parts = address.split('.').map(Number);
    const [a, b] = parts;
    return (
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b !== undefined && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b !== undefined && b >= 64 && b <= 127) ||
      a === 0
    );
  }

  const normalized = address.toLowerCase();
  return (
    normalized === '::1' ||
    normalized === '::' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb')
  );
}

async function isSafeCrawlUrl(rawUrl: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) return false;
  if (parsed.username || parsed.password) return false;
  if (parsed.hostname === 'localhost' || parsed.hostname.endsWith('.localhost') || parsed.hostname.endsWith('.local')) {
    return false;
  }

  const addresses = await lookup(parsed.hostname, { all: true, verbatim: true });
  return addresses.length > 0 && addresses.every(({ address }) => !isPrivateOrLocalIp(address));
}

export class RetrievalService {
  async crawlPages(rankedResults: RankedResult[], maxPages: number): Promise<Map<string, CrawledPage>> {
    const startTime = Date.now();
    const pagesToCrawl = rankedResults.slice(0, maxPages);

    logger.info({ pageCount: pagesToCrawl.length, maxPages }, 'Starting page retrieval');
    const crawlResults = await this.crawlWithConcurrency(pagesToCrawl);

    const resultMap = new Map<string, CrawledPage>();
    for (const result of crawlResults) {
      if (result.success && result.data) resultMap.set(result.url, result.data);
    }

    logger.info(
      {
        totalAttempted: pagesToCrawl.length,
        successful: resultMap.size,
        failed: pagesToCrawl.length - resultMap.size,
        duration: Date.now() - startTime,
      },
      'Page retrieval completed',
    );
    return resultMap;
  }

  buildContext(
    crawledPages: Map<string, CrawledPage>,
    rankedResults: RankedResult[],
    maxSources: number,
  ): {
    context: string;
    sources: Array<{ url: string; title: string; content: string; relevanceScore: number }>;
  } {
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

    const context = scoredPages
      .map((source, index) => `[Source ${index + 1}]: ${source.title}\nURL: ${source.url}\nRelevance: ${(source.relevanceScore * 100).toFixed(1)}%\n\n${source.content}\n---`)
      .join('\n\n');

    logger.debug({ sourceCount: scoredPages.length, contextLength: context.length }, 'Context built from crawled pages');
    return { context, sources: scoredPages };
  }

  private async crawlWithConcurrency(
    pages: RankedResult[],
  ): Promise<Array<{ url: string; success: boolean; data?: CrawledPage; error?: string }>> {
    const CONCURRENCY_LIMIT = 3;
    const results: Array<{ url: string; success: boolean; data?: CrawledPage; error?: string }> = [];

    const tasks = pages.map((page) => async () => {
      try {
        if (!(await isSafeCrawlUrl(page.url))) {
          logger.warn({ url: page.url }, 'Rejected unsafe crawl target');
          return { url: page.url, success: false, error: 'Unsafe crawl target' };
        }

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
          links: response.links.map((link) => ({ url: link.url, text: link.text, type: link.type })),
        };

        return { url: page.url, success: true, data: crawledPage };
      } catch (error) {
        const errorMessage = error instanceof TinyfishCrawlError ? error.message : 'Unknown crawl error';
        logger.warn({ url: page.url, error: errorMessage }, 'Failed to crawl page');
        return { url: page.url, success: false, error: errorMessage };
      }
    });

    let index = 0;
    const worker = async () => {
      while (index < tasks.length) {
        const currentIndex = index++;
        const task = tasks[currentIndex];
        if (task) results[currentIndex] = await task();
      }
    };

    const workerCount = Math.min(CONCURRENCY_LIMIT, tasks.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    return results;
  }
}

export const retrievalService = new RetrievalService();
