/**
 * Standalone worker entrypoint.
 *
 * Used by `npm run start:workers` and the production container's
 * `start:all` script (via `npm-run-all -p start start:workers`).
 *
 * The API process is in a different Node process; the workers share
 * Redis with the API but otherwise run independently.
 */

import { logger } from '../config/logger.js';
import { disconnectRedis } from '../config/redis.js';
import { workerManager } from './worker-manager.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Worker process: shutdown signal received');

  const forceExit = setTimeout(() => {
    logger.error('Worker shutdown timed out, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  try {
    await workerManager.close();
    await disconnectRedis();
    logger.info('Worker process: shutdown complete');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Worker process: error during shutdown');
    process.exit(1);
  }
}

async function main(): Promise<void> {
  try {
    await workerManager.start();
    logger.info('Worker process: all workers are running');
  } catch (err) {
    logger.fatal({ err }, 'Worker process: failed to start');
    process.exit(1);
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.fatal({ err: reason }, 'Worker process: unhandled rejection');
    process.exit(1);
  });
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Worker process: uncaught exception');
    process.exit(1);
  });
}

void main();
