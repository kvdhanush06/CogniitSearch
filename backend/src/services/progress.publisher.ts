import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import {
  type PipelineStage,
  type StreamChunkProgress,
  progressRatio,
} from './stream.types.js';

/**
 * Per-request progress channel.
 *
 * Each chat request gets a `jobId` and the API subscribes to
 * `cogniit:progress:<jobId>` in Redis. Workers publish progress events to
 * the same channel; the API forwards them to the SSE stream.
 *
 * BullMQ already gives us a jobId; we reuse it for the channel name so
 * no extra correlation is needed.
 */
const CHANNEL_PREFIX = 'cogniit:progress:';

function channelFor(jobId: string): string {
  return `${CHANNEL_PREFIX}${jobId}`;
}

// Dedicated ioredis client for pub/sub. BullMQ already uses its own
// connection; pub/sub needs a separate client because subscribed clients
// can only run subscribe/unsubscribe/psubscribe.
function createPubClient(): Redis {
  return new Redis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
    db: env.REDIS_DB,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
  });
}

function createSubClient(): Redis {
  // BullMQ requires maxRetriesPerRequest:null and enableReadyCheck:false
  // on its connections. For pub/sub, those are not required, but the
  // defaults above are fine here.
  return createPubClient();
}

export interface ProgressPublisher {
  publish(jobId: string, stage: PipelineStage, message: string, count?: number): Promise<void>;
}

export class RedisProgressPublisher implements ProgressPublisher {
  private client: Redis;

  constructor() {
    this.client = createPubClient();
    this.client.on('error', (err: Error) => {
      logger.error({ err: err.message }, 'Progress publisher Redis error');
    });
  }

  async publish(jobId: string, stage: PipelineStage, message: string, count?: number): Promise<void> {
    const payload: StreamChunkProgress = {
      type: 'progress',
      stage,
      message,
      count,
      ratio: progressRatio(stage),
    };
    try {
      await this.client.publish(channelFor(jobId), JSON.stringify(payload));
    } catch (err) {
      // Don't fail the worker just because a progress emit failed.
      logger.warn({ err, jobId, stage }, 'Failed to publish progress event');
    }
  }

  async close(): Promise<void> {
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }
}

export class RedisProgressSubscriber {
  private client: Redis;
  private currentJobId: string | null = null;
  private onEvent: ((p: StreamChunkProgress) => void) | null = null;

  constructor() {
    this.client = createSubClient();
    this.client.on('error', (err: Error) => {
      logger.error({ err: err.message }, 'Progress subscriber Redis error');
    });
    this.client.on('message', (channel: string, message: string) => {
      if (!this.currentJobId || !this.onEvent) return;
      if (channel !== channelFor(this.currentJobId)) return;
      try {
        const parsed = JSON.parse(message) as StreamChunkProgress;
        if (parsed.type === 'progress') {
          this.onEvent(parsed);
        }
      } catch (err) {
        logger.debug({ err, channel }, 'Failed to parse progress event');
      }
    });
  }

  async subscribe(jobId: string, onEvent: (p: StreamChunkProgress) => void): Promise<void> {
    if (this.currentJobId) {
      await this.unsubscribe();
    }
    this.currentJobId = jobId;
    this.onEvent = onEvent;
    await this.client.subscribe(channelFor(jobId));
  }

  async unsubscribe(): Promise<void> {
    if (this.currentJobId) {
      try {
        await this.client.unsubscribe(channelFor(this.currentJobId));
      } catch {
        // ignore
      }
    }
    this.currentJobId = null;
    this.onEvent = null;
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

// Module-level singletons. Workers use the publisher; the API uses the
// subscriber (one per active SSE response).
export const progressPublisher = new RedisProgressPublisher();
export function createProgressSubscriber(): RedisProgressSubscriber {
  return new RedisProgressSubscriber();
}
