import IORedis, { type Redis } from 'ioredis';
import { Job, QueueEvents } from 'bullmq';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { searchQueue, crawlQueue, answerQueue } from '../queues/index.js';
import {
  createProgressSubscriber,
  type RedisProgressSubscriber,
} from './progress.publisher.js';
import { StreamSubscriber } from './stream.subscriber.js';
import { streamSessionRegistry } from './stream-session.registry.js';
import type {
  PipelineStage,
  StreamChunk,
  StreamChunkProgress,
} from './stream.types.js';
import type {
  SearchJobResult,
  CrawlJobResult,
} from '../jobs/index.js';
import type { BuiltContext } from './search.types.js';
import type { RankedResult, CrawledPage } from './search.types.js';

const STAGE_LABELS: Record<PipelineStage, string> = {
  search: 'Searching the web…',
  rank: 'Ranking sources…',
  crawl: 'Reading pages…',
  context: 'Composing context…',
  answer: 'Generating answer…',
  citation: 'Attaching citations…',
};

const STREAM_CHANNEL_PREFIX = 'cogniit:stream:';

// Max characters per source when building the answer-job context.
// 5 sources × 3000 chars = 15K chars (~4K tokens) for context alone,
// leaving headroom for the system prompt + question + completion within
// Groq's 32K request limit. Without this cap a single beefy page can
// push the request past the limit and return 413.
const MAX_SOURCE_CHARS = 3000;

/**
 * Per-request orchestrator. Owns the search → crawl → answer chain for a
 * single user query. Responsibilities:
 *
 *  1. Enqueue the search job.
 *  2. Subscribe to the per-job progress channel; forward every event to
 *     the SSE writer.
 *  3. On search completion, enqueue the crawl job with the ranked URLs.
 *  4. On crawl completion, build a `BuiltContext` and enqueue the answer
 *     job with the context in its payload.
 *  5. Subscribe to the answer worker's per-job stream channel; forward
 *     every chunk to the SSE writer.
 *  6. Stop when the answer worker emits a `done` (or `error`) frame.
 *  7. Honour client disconnects — if the request was aborted before a
 *     stage was enqueued, don't enqueue it.
 *
 * The orchestrator never touches Groq/Tinyfish directly. It composes
 * workers and forwards events. If a worker is missing (e.g. Redis blip
 * during enqueue), the orchestrator surfaces the error to the SSE.
 */
export class Orchestrator {
  private cancelled = false;
  // Fresh subscriber per stage — ioredis won't let one connection toggle
  // between subscribe and regular commands cleanly mid-flight.
  private progressSubs: RedisProgressSubscriber[] = [];
  private streamSub: StreamSubscriber | null = null;
  // We use a second ioredis connection for the `Job#getState` polling.
  // BullMQ is fine with reusing the app's ioredis for state reads.
  private jobClient: Redis;

  constructor(
    private readonly write: (chunk: StreamChunk) => void,
    private readonly onComplete: (result: OrchestratorResult) => Promise<void> | void,
  ) {
    this.jobClient = new IORedis({
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD || undefined,
      db: env.REDIS_DB,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
    });
    this.jobClient.on('error', (err: Error) =>
      logger.error({ err: err.message }, 'Orchestrator job client error'),
    );
  }

  /** Signal the orchestrator to stop after the current await returns. */
  cancel(): void {
    this.cancelled = true;
  }

  /** Run the full chain. Resolves when the answer is `done` or an error fires. */
  async run(opts: {
    userId: string;
    query: string;
    conversationId?: string;
    messageId?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    /** Prior user/assistant turns in this conversation, oldest first. The
     *  answer worker prepends them to the system+context prompt so the
     *  LLM has memory of what was already discussed. */
    messages?: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  }): Promise<OrchestratorResult> {
    const correlationId = `corr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const startedAt = Date.now();
    logger.info({ correlationId, userId: opts.userId, query: opts.query }, 'Orchestrator.run START');

    try {
      // --- Stage 1: search ---
      if (this.cancelled) return this.aborted();
      const searchJob = await searchQueue.add('search', {
        query: opts.query,
        userId: opts.userId,
        conversationId: opts.conversationId,
        messageId: opts.messageId,
        correlationId,
        createdAt: new Date().toISOString(),
        maxResults: env.TINYFISH_MAX_RESULTS,
        // The search worker uses the recent history to rewrite the
        // query so the search engine sees a self-contained phrase
        // (e.g. "Harkirat Singh age" instead of "what is his age").
        // Same shape as the answer job's history; capped by the caller.
        messages: opts.messages ?? [],
      });
      const searchId = searchJob.id ?? '';
      logger.info({ correlationId, searchId }, 'Orchestrator: search job enqueued');

      const searchProgressSub = createProgressSubscriber();
      this.progressSubs.push(searchProgressSub);
      await searchProgressSub.subscribe(searchId, (p) => this.write(p));
      this.emit('search', STAGE_LABELS.search);

      const searchResult = await this.awaitJob<SearchJobResult>('search', searchId);
      logger.info({ correlationId, searchId, hasResult: !!searchResult, cancelled: this.cancelled }, 'Orchestrator: search awaitJob returned');
      if (this.cancelled) {
        logger.warn({ correlationId }, 'Orchestrator: cancelled after search');
        return this.aborted();
      }
      if (!searchResult) {
        logger.warn({ correlationId, searchId }, 'Orchestrator: search awaitJob returned null — bailing out as failed');
        this.fail('Search job failed');
        return this.failed();
      }

      this.emit('rank', `Found ${searchResult.ranked.length} sources`, searchResult.ranked.length);

      // --- Stage 2: crawl ---
      const urls = searchResult.ranked.slice(0, 5).map((r) => r.url);
      if (urls.length === 0) {
        this.fail('No URLs to crawl after ranking');
        return this.failed();
      }
      const crawlJob = await crawlQueue.add('crawl', {
        urls,
        userId: opts.userId,
        conversationId: opts.conversationId,
        messageId: opts.messageId,
        correlationId,
        createdAt: new Date().toISOString(),
        extractContent: true,
      });
      const crawlId = crawlJob.id ?? '';

      // Use a fresh subscriber for crawl stage (don't reuse the search one;
      // ioredis pub/sub clients are sticky).
      const crawlProgressSub = createProgressSubscriber();
      this.progressSubs.push(crawlProgressSub);
      await crawlProgressSub.subscribe(crawlId, (p) => this.write(p));
      this.emit('crawl', `Reading ${urls.length} pages…`, urls.length);

      const crawlResult = await this.awaitJob<CrawlJobResult>('crawl', crawlId);
      if (this.cancelled) return this.aborted();
      if (!crawlResult) {
        this.fail('Crawl job failed');
        return this.failed();
      }

      this.emit('context', 'Composing context…', crawlResult.totalPages);

      // --- Build context from crawl result ---
      const rankedByUrl = new Map<string, RankedResult>();
      for (const r of searchResult.ranked) {
        rankedByUrl.set(r.url, r as unknown as RankedResult);
      }
      const crawledByUrl = new Map<string, CrawledPage>();
      for (const page of crawlResult.pages) {
        const ranked = rankedByUrl.get(page.url);
        crawledByUrl.set(page.url, {
          url: page.url,
          title: page.title,
          content: page.content,
          markdown: page.content,
          metadata: {
            description: page.metadata.description,
            author: page.metadata.author,
            publishedDate: page.metadata.publishedDate,
            siteName: page.metadata.siteName,
            ogImage: page.metadata.ogImage,
            wordCount: page.metadata.wordCount,
          },
          links: [],
        });
      }
      // Drop sources that didn't crawl.
      const validUrls = crawlResult.pages.map((p) => p.url);
      const ranked = validUrls
        .map((u) => rankedByUrl.get(u))
        .filter((r): r is RankedResult => Boolean(r));

      const sources = ranked.map((r, i) => {
        const page = crawledByUrl.get(r.url)!;
        const fullContent = page.markdown || page.content || '';
        // Cap each source to ~3000 chars so the answer-job payload
        // stays well under Groq's 32K request limit even with 5
        // sources, a long system prompt, and citation guidance. Without
        // this cap, large pages stack up and Groq returns 413.
        const content =
          fullContent.length > MAX_SOURCE_CHARS
            ? `${fullContent.slice(0, MAX_SOURCE_CHARS)}\n…[truncated]`
            : fullContent;
        return {
          url: page.url,
          title: page.title,
          content,
          relevanceScore: r.finalScore ?? 0,
          index: i + 1,
        };
      });

      const contextString = sources
        .map((s, i) => `[Source ${i + 1}]: ${s.title}\nURL: ${s.url}\n\n${s.content}\n---`)
        .join('\n\n');

      const builtContext: BuiltContext = {
        query: opts.query,
        sources: sources.map((s) => ({
          url: s.url,
          title: s.title,
          content: s.content,
          relevanceScore: s.relevanceScore,
        })),
        totalSources: sources.length,
        contextLength: contextString.length,
        metadata: {
          searchDuration: 0,
          crawlDuration: 0,
          rankingDuration: 0,
          totalDuration: 0,
        },
      };

      // --- Stage 3: answer ---
      logger.info({ correlationId, sources: builtContext.sources.length }, 'Enqueuing answer job');
      const answerJob = await answerQueue.add('answer', {
        query: opts.query,
        context: builtContext,
        userId: opts.userId,
        conversationId: opts.conversationId,
        messageId: opts.messageId,
        correlationId,
        createdAt: new Date().toISOString(),
        messages: opts.messages ?? [],
        model: opts.model,
        temperature: opts.temperature,
        maxTokens: opts.maxTokens,
        stream: true,
      });
      const answerId = answerJob.id ?? '';

      // Register the (conversationId, messageId) → answerJobId mapping
      // so the reattach SSE endpoint can rejoin this stream after a
      // route change or hard reload. Best-effort — the original POST
      // is unaffected by a failed SET.
      if (opts.conversationId && opts.messageId && answerId) {
        await streamSessionRegistry.register(
          opts.conversationId,
          opts.messageId,
          answerId,
        );
      }

      // Subscribe to the answer worker's stream channel.
      logger.info({ answerId, correlationId }, 'Subscribing to answer stream channel');
      this.streamSub = new StreamSubscriber();
      let answerAnswered = false;
      await this.streamSub.subscribe(answerId, (chunk) => {
        this.write(chunk);
        if (chunk.type === 'done' || chunk.type === 'error') answerAnswered = true;
      });
      this.emit('answer', STAGE_LABELS.answer);

      // Wait for the answer job to reach a terminal state.
      const answerResult = await this.awaitJob('answer', answerId);
      if (this.cancelled) return this.aborted();
      if (!answerResult) {
        this.fail('Answer job failed');
        return this.failed();
      }

      // Belt-and-suspenders: the stream subscriber usually fires first,
      // but wait for the terminal frame before resolving.
      while (!answerAnswered) {
        await sleep(50);
        if (this.cancelled) return this.aborted();
      }

      this.emit('citation', 'Citations ready');
      const result: OrchestratorResult = {
        ok: true,
        query: opts.query,
        rankedCount: searchResult.ranked.length,
        crawledCount: crawlResult.totalPages,
        sources: builtContext.sources,
        correlationId,
        durationMs: Date.now() - startedAt,
      };
      await this.onComplete(result);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Pipeline failed';
      const stack = err instanceof Error ? err.stack : undefined;
      logger.error({ err: message, stack }, 'Orchestrator failed');
      this.write({ type: 'error', error: message });
      return { ok: false, error: message, durationMs: Date.now() - startedAt };
    } finally {
      await this.cleanup();
    }
  }

  private emit(
    stage: PipelineStage,
    message: string,
    count?: number,
  ): void {
    const chunk: StreamChunkProgress = {
      type: 'progress',
      stage,
      message,
      count,
      ratio: stageRatio(stage),
    };
    this.write(chunk);
  }

  private fail(message: string): void {
    this.write({ type: 'error', error: message });
  }

  private async awaitJob<T>(queueName: string, jobId: string): Promise<T | null> {
    const queue =
      queueName === 'search' ? searchQueue : queueName === 'crawl' ? crawlQueue : answerQueue;

    // Race-free wait: subscribe to queue events BEFORE checking the
    // current job state. If the job completes between subscribe and
    // state check, the listener catches the event. If it already
    // completed before subscribe, the state check returns the value
    // directly. The previous order (check first, then subscribe) had a
    // window where a fast worker could finish in between and the wait
    // would hang or resolve with null.
    const queueEvents = new QueueEvents(queueName, {
      connection: {
        host: env.REDIS_HOST,
        port: env.REDIS_PORT,
        password: env.REDIS_PASSWORD || undefined,
        db: env.REDIS_DB,
      },
    });

    try {
      await queueEvents.waitUntilReady();

      const result = await new Promise<T | null>((resolve) => {
        let settled = false;
        const finishIf = (value: T | null) => {
          if (settled) return;
          settled = true;
          resolve(value);
        };

        // 1. Attach listeners FIRST — before we read state.
        const onCompleted = ({
          jobId: jid,
          returnvalue,
        }: {
          jobId: string;
          returnvalue: unknown;
        }) => {
          if (jid !== jobId) return;
          try {
            const parsed =
              typeof returnvalue === 'string' ? JSON.parse(returnvalue) : returnvalue;
            finishIf((parsed as T) ?? null);
          } catch {
            finishIf(null);
          }
        };
        const onFailed = ({
          jobId: jid,
          failedReason,
        }: {
          jobId: string;
          failedReason: string;
        }) => {
          if (jid !== jobId) return;
          logger.warn({ queueName, jobId, failedReason }, 'awaitJob: queue event failed');
          finishIf(null);
        };
        queueEvents.on('completed', onCompleted);
        queueEvents.on('failed', onFailed);

        // 2. Now check current state — covers the case where the job
        //    finished BEFORE we subscribed.
        void (async () => {
          try {
            const existing = await queue.getJob(jobId);
            if (!existing) return; // listener will catch a future event
            const state = await existing.getState();
            if (state === 'completed') {
              finishIf((existing.returnvalue as T) ?? null);
            } else if (state === 'failed') {
              logger.warn(
                { queueName, jobId, failedReason: existing.failedReason },
                'awaitJob: job already failed at subscribe time',
              );
              finishIf(null);
            }
            // else: still running — listeners will fire.
          } catch (err) {
            logger.warn({ queueName, jobId, err: String(err) }, 'awaitJob: initial state read failed');
            // Don't settle here — listeners may still fire.
          }
        })();

        // 3. Cancellation poller + hard timeout.
        const cancelTimer = setInterval(() => {
          if (this.cancelled) {
            clearInterval(cancelTimer);
            finishIf(null);
          }
        }, 250);
        const hardTimeout = setTimeout(() => {
          clearInterval(cancelTimer);
          logger.warn({ queueName, jobId }, 'awaitJob: 5-min hard timeout');
          finishIf(null);
        }, 5 * 60 * 1000);
        // When settled, clear the cleanup timers.
        const originalFinish = finishIf;
        // (Can't easily wrap finishIf since we use it via closure above.
        //  The hard timeout will be a no-op once settled, but we still
        //  want to clear it to free the event loop reference.)
        void originalFinish;
        Promise.resolve().then(() => {
          // Once a value is settled, sweep the timers from the next tick.
          const checkSwept = setInterval(() => {
            if (settled) {
              clearInterval(cancelTimer);
              clearTimeout(hardTimeout);
              clearInterval(checkSwept);
            }
          }, 100);
        });
      });

      return result;
    } catch (err) {
      logger.warn({ err, queueName, jobId }, 'awaitJob error');
      return null;
    } finally {
      try {
        await queueEvents.close();
      } catch {
        // ignore
      }
    }
  }

  private async cleanup(): Promise<void> {
    for (const sub of this.progressSubs) {
      try {
        await sub.close();
      } catch {
        // ignore
      }
    }
    this.progressSubs = [];
    if (this.streamSub) {
      try {
        await this.streamSub.close();
      } catch {
        // ignore
      }
      this.streamSub = null;
    }
    try {
      await this.jobClient.quit();
    } catch {
      this.jobClient.disconnect();
    }
  }

  private aborted(): OrchestratorResult {
    this.write({ type: 'error', error: 'Request cancelled' });
    return { ok: false, error: 'cancelled', durationMs: 0 };
  }

  private failed(): OrchestratorResult {
    return { ok: false, error: 'pipeline failed', durationMs: 0 };
  }
}

export interface OrchestratorResult {
  ok: boolean;
  query?: string;
  rankedCount?: number;
  crawledCount?: number;
  sources?: BuiltContext['sources'];
  correlationId?: string;
  durationMs: number;
  error?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const STAGE_ORDER: PipelineStage[] = [
  'search',
  'rank',
  'crawl',
  'context',
  'answer',
  'citation',
];
function stageRatio(stage: PipelineStage): number {
  const idx = STAGE_ORDER.indexOf(stage);
  if (idx < 0) return 0;
  return idx / (STAGE_ORDER.length - 1);
}
