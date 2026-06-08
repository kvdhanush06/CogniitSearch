import { Worker, type Job } from 'bullmq';
import { defaultWorkerOptions } from '../config/bullmq.js';
import { logger } from '../config/logger.js';
import { retrievalService } from '../services/retrieval.service.js';
import type { CrawlJobData, CrawlJobResult } from '../jobs/index.js';

/**
 * Crawl worker. Fetches the top-N ranked URLs in parallel. The per-URL
 * context cache short-circuits already-crawled pages. The orchestrator
 * owns the progress channel; this worker just runs the work and returns.
 */
export class CrawlWorker {
  private worker: Worker<CrawlJobData, CrawlJobResult>;

  constructor() {
    this.worker = new Worker<CrawlJobData, CrawlJobResult>(
      'crawl',
      async (job: Job<CrawlJobData, CrawlJobResult>) => {
        const { urls, correlationId } = job.data;
        const jobId = job.id ?? 'unknown';

        logger.info(
          { jobId, correlationId, urlCount: urls.length, attempt: job.attemptsMade },
          'Crawl job started',
        );

        const rankedLike = urls.map((url) => ({
          url,
          title: '',
          snippet: '',
          domain: '',
          searchScore: 0,
          relevanceScore: 0,
          qualityScore: 0,
          freshnessScore: 0,
          finalScore: 0,
          hasContent: false,
        }));

        const pages = await retrievalService.crawlPages(rankedLike, urls.length);

        const result: CrawlJobResult = {
          pages: Array.from(pages.entries()).map(([url, page]) => ({
            url,
            title: page.title,
            content: page.markdown || page.content,
            metadata: {
              description: page.metadata.description,
              author: page.metadata.author,
              publishedDate: page.metadata.publishedDate,
              siteName: page.metadata.siteName,
              ogImage: page.metadata.ogImage,
              wordCount: page.metadata.wordCount,
            },
          })),
          totalPages: pages.size,
          correlationId,
        };
        logger.info(
          { jobId, correlationId, pages: result.totalPages, of: urls.length },
          'Crawl job completed',
        );
        return result;
      },
      {
        ...defaultWorkerOptions,
        concurrency: 3,
        limiter: { max: 5, duration: 1000 },
      },
    );
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.worker.on('failed', (job, err) => {
      logger.error(
        { jobId: job?.id, err: err.message, attempt: job?.attemptsMade },
        'Crawl job failed',
      );
    });
    this.worker.on('error', (err) => {
      logger.error({ err: err.message }, 'Crawl worker error');
    });
  }

  async start(): Promise<void> {
    await this.worker.waitUntilReady();
    logger.info('Crawl worker started');
  }
  async close(): Promise<void> {
    await this.worker.close();
  }
}

export const crawlWorker = new CrawlWorker();
