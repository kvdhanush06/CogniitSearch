import { Worker, type Job } from 'bullmq';
import { defaultWorkerOptions } from '../config/bullmq.js';
import { logger } from '../config/logger.js';
import { searchService } from '../services/search.service.js';
import { queryRewriteService } from '../services/query-rewrite.service.js';
import { DEFAULT_PIPELINE_CONFIG } from '../services/search.types.js';
import type { SearchJobData, SearchJobResult } from '../jobs/index.js';

/**
 * Search worker. Calls the search service (Tinyfish + rank), returns the
 * ranked URLs. The orchestrator subscribes to the per-job progress
 * channel separately and emits `search` and `rank` frames on its own;
 * this worker just runs the work.
 */
export class SearchWorker {
  private worker: Worker<SearchJobData, SearchJobResult>;

  constructor() {
    this.worker = new Worker<SearchJobData, SearchJobResult>(
      'search',
      async (job: Job<SearchJobData, SearchJobResult>) => {
        const { query, userId, maxResults, correlationId, messages } = job.data;
        const jobId = job.id ?? 'unknown';

        logger.info(
          { jobId, correlationId, query, attempt: job.attemptsMade },
          'Search job started',
        );

        // Resolve pronouns / references against the recent conversation
        // BEFORE handing the query to Tinyfish. The search-cache key
        // is built from the query we pass in here, so the rewrite
        // affects both the live call and the cache key.
        const { rewritten, used, duration: rewriteDuration } = await queryRewriteService.rewrite(
          query,
          messages ?? [],
        );
        if (used) {
          logger.info(
            { jobId, correlationId, original: query, rewritten, rewriteDuration },
            'Search query rewritten from conversation context',
          );
        }

        const pipeline = await searchService.executePipeline(rewritten, userId, {
          ...DEFAULT_PIPELINE_CONFIG,
          maxSearchResults: maxResults ?? DEFAULT_PIPELINE_CONFIG.maxSearchResults,
        });

        const result: SearchJobResult = {
          query,
          ranked: pipeline.rankedResults.map((r) => ({
            url: r.url,
            title: r.title,
            snippet: r.snippet,
            domain: r.domain,
            publishedDate: r.publishedDate,
            searchScore: r.searchScore,
            relevanceScore: r.relevanceScore,
            qualityScore: r.qualityScore,
            freshnessScore: r.freshnessScore,
            finalScore: r.finalScore,
            wordCount: r.wordCount,
          })),
          totalResults: pipeline.metadata.totalResults,
          userId,
          conversationId: job.data.conversationId,
          messageId: job.data.messageId,
          correlationId,
        };
        logger.info(
          { jobId, correlationId, ranked: result.ranked.length },
          'Search job completed',
        );
        return result;
      },
      {
        ...defaultWorkerOptions,
        concurrency: 5,
        limiter: { max: 10, duration: 1000 },
      },
    );
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.worker.on('failed', (job, err) => {
      logger.error(
        { jobId: job?.id, err: err.message, attempt: job?.attemptsMade },
        'Search job failed',
      );
    });
    this.worker.on('error', (err) => {
      logger.error({ err: err.message }, 'Search worker error');
    });
  }

  async start(): Promise<void> {
    await this.worker.waitUntilReady();
    logger.info('Search worker started');
  }
  async close(): Promise<void> {
    await this.worker.close();
  }
}

export const searchWorker = new SearchWorker();
