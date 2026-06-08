import { env } from './env.js';

import type { QueueOptions, WorkerOptions } from 'bullmq';

/**
 * Redis connection configuration for BullMQ.
 * BullMQ creates its own internal Redis connections — do NOT reuse the main app Redis client.
 * Passing a config object lets BullMQ instantiate connections with its own bundled ioredis.
 */
const bullmqRedisConfig = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD || undefined,
  db: env.REDIS_DB,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
} as const;

export type BullMQRedisConfig = typeof bullmqRedisConfig;

export const defaultQueueOptions: QueueOptions = {
  connection: bullmqRedisConfig,
  defaultJobOptions: {
    attempts: env.BULLMQ_DEFAULT_ATTEMPTS,
    backoff: {
      type: env.BULLMQ_BACKOFF_TYPE,
      delay: env.BULLMQ_BACKOFF_DELAY,
    },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
};

export const defaultWorkerOptions: Pick<WorkerOptions, 'connection' | 'concurrency' | 'limiter'> = {
  connection: bullmqRedisConfig,
  concurrency: 5,
  limiter: {
    max: 10,
    duration: 1000,
  },
};
