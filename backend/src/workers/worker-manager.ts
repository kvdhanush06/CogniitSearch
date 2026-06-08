import { logger } from '../config/logger.js';
import { searchWorker } from './search.worker.js';
import { crawlWorker } from './crawl.worker.js';
import { answerWorker } from './answer.worker.js';
import { deadLetterWorker } from './dead-letter.worker.js';

export class WorkerManager {
  private workers = [searchWorker, crawlWorker, answerWorker, deadLetterWorker];

  async start(): Promise<void> {
    logger.info('Starting all workers...');

    await Promise.all(
      this.workers.map(async (worker) => {
        try {
          await worker.start();
        } catch (error) {
          logger.error({ worker: worker.constructor.name, error }, 'Failed to start worker');
          throw error;
        }
      }),
    );

    logger.info('All workers started successfully');
  }

  async close(): Promise<void> {
    logger.info('Closing all workers...');

    await Promise.all(
      this.workers.map(async (worker) => {
        try {
          await worker.close();
        } catch (error) {
          logger.error({ worker: worker.constructor.name, error }, 'Error closing worker');
        }
      }),
    );

    logger.info('All workers closed');
  }
}

export const workerManager = new WorkerManager();
