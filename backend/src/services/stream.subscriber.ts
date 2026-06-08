import IORedis, { type Redis } from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import type { StreamChunk } from './stream.types.js';

const STREAM_CHANNEL_PREFIX = 'cogniit:stream:';
function channelFor(jobId: string): string {
  return `${STREAM_CHANNEL_PREFIX}${jobId}`;
}

/**
 * Per-job stream subscriber. Used by the API process to listen to
 * answer-worker chunk emissions on a per-request basis. When the SSE
 * response ends, the subscriber is unsubscribed and the connection is
 * closed — no leak.
 */
export class StreamSubscriber {
  private client: Redis;
  private jobId: string | null = null;
  private onChunk: ((chunk: StreamChunk) => void) | null = null;

  constructor() {
    this.client = new IORedis({
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD || undefined,
      db: env.REDIS_DB,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
    });
    this.client.on('error', (err: Error) =>
      logger.error({ err: err.message }, 'Stream subscriber Redis error'),
    );
    this.client.on('message', (channel: string, message: string) => {
      if (!this.jobId || !this.onChunk) return;
      if (channel !== channelFor(this.jobId)) return;
      try {
        const parsed = JSON.parse(message) as StreamChunk;
        this.onChunk(parsed);
      } catch (err) {
        logger.debug({ err, channel }, 'Failed to parse stream chunk');
      }
    });
  }

  async subscribe(jobId: string, onChunk: (chunk: StreamChunk) => void): Promise<void> {
    if (this.jobId) await this.unsubscribe();
    this.jobId = jobId;
    this.onChunk = onChunk;
    await this.client.subscribe(channelFor(jobId));
  }

  async unsubscribe(): Promise<void> {
    if (this.jobId) {
      try {
        await this.client.unsubscribe(channelFor(this.jobId));
      } catch {
        // ignore
      }
    }
    this.jobId = null;
    this.onChunk = null;
  }

  async close(): Promise<void> {
    await this.unsubscribe();
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }
}
