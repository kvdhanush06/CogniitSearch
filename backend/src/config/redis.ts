import IORedis, { type Redis } from 'ioredis';
import { env } from './env.js';
import { logger } from './logger.js';

function createRedisClient(): Redis {
  const client = new IORedis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
    db: env.REDIS_DB,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
    retryStrategy(times: number): number | null {
      if (times > env.REDIS_MAX_RETRIES) {
        logger.error({ attempt: times }, 'Redis max retries reached, giving up');
        return null;
      }
      const delay = Math.min(times * env.REDIS_RETRY_DELAY, 10000);
      logger.warn({ attempt: times, delay }, 'Redis reconnecting...');
      return delay;
    },
  });

  client.on('connect', () => {
    logger.info('Redis client connected');
  });

  client.on('ready', () => {
    logger.info('Redis client ready');
  });

  client.on('error', (err: Error) => {
    logger.error({ err }, 'Redis client error');
  });

  client.on('close', () => {
    logger.warn('Redis connection closed');
  });

  client.on('reconnecting', () => {
    logger.info('Redis client reconnecting...');
  });

  return client;
}

export const redis: Redis = createRedisClient();

export async function disconnectRedis(): Promise<void> {
  try {
    await redis.quit();
    logger.info('Redis disconnected gracefully');
  } catch (err) {
    logger.error({ err }, 'Error disconnecting Redis');
    redis.disconnect();
  }
}
