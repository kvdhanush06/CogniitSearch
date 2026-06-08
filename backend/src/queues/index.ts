import { Queue } from 'bullmq';
import { defaultQueueOptions } from '../config/bullmq.js';
import { logger } from '../config/logger.js';
import type { SearchJobData, CrawlJobData, AnswerJobData } from '../jobs/index.js';

// Typed queue instances
export const searchQueue = new Queue<SearchJobData>('search', {
  ...defaultQueueOptions,
  defaultJobOptions: {
    ...defaultQueueOptions.defaultJobOptions,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
  },
});

export const crawlQueue = new Queue<CrawlJobData>('crawl', {
  ...defaultQueueOptions,
  defaultJobOptions: {
    ...defaultQueueOptions.defaultJobOptions,
    attempts: 2,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
});

export const answerQueue = new Queue<AnswerJobData>('answer', {
  ...defaultQueueOptions,
  defaultJobOptions: {
    ...defaultQueueOptions.defaultJobOptions,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
  },
});

// Queue manager for lifecycle management
export class QueueManager {
  private queues: Queue[] = [searchQueue, crawlQueue, answerQueue];

  async initialize(): Promise<void> {
    logger.info('Initializing BullMQ queues...');

    for (const queue of this.queues) {
      const jobCount = await queue.getJobCountByTypes('waiting', 'active', 'delayed');
      logger.info({ queue: queue.name, pendingJobs: jobCount }, 'Queue initialized');
    }

    logger.info('All BullMQ queues initialized successfully');
  }

  async close(): Promise<void> {
    logger.info('Closing BullMQ queues...');

    await Promise.all(
      this.queues.map(async (queue) => {
        await queue.close();
        logger.info({ queue: queue.name }, 'Queue closed');
      }),
    );

    logger.info('All BullMQ queues closed');
  }

  async getQueueStats(): Promise<Record<string, unknown>> {
    const stats: Record<string, unknown> = {};

    await Promise.all(
      this.queues.map(async (queue) => {
        const [waiting, active, completed, failed, delayed] = await Promise.all([
          queue.getJobCountByTypes('waiting'),
          queue.getJobCountByTypes('active'),
          queue.getJobCountByTypes('completed'),
          queue.getJobCountByTypes('failed'),
          queue.getJobCountByTypes('delayed'),
        ]);

        stats[queue.name] = {
          waiting,
          active,
          completed,
          failed,
          delayed,
        };
      }),
    );

    return stats;
  }
}

export const queueManager = new QueueManager();
