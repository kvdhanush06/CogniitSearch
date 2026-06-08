import { Queue, Worker, type Job } from 'bullmq';
import { defaultQueueOptions, defaultWorkerOptions } from '../config/bullmq.js';
import { logger } from '../config/logger.js';
import type { JobData, JobResult } from '../jobs/index.js';

// Dead-letter queue for failed jobs
export const deadLetterQueue = new Queue<JobData>('dead-letter', {
  ...defaultQueueOptions,
  defaultJobOptions: {
    ...defaultQueueOptions.defaultJobOptions,
    attempts: 1,
    removeOnFail: false, // Keep all failed jobs for inspection
  },
});

// Dead-letter queue worker for monitoring and cleanup
export class DeadLetterWorker {
  private worker: Worker<JobData, JobResult>;

  constructor() {
    this.worker = new Worker<JobData, JobResult>(
      'dead-letter',
      async (job: Job<JobData, JobResult>) => {
        logger.warn(
          {
            jobId: job.id,
            originalJobId: job.data.correlationId,
            failedReason: job.failedReason,
            attemptsMade: job.attemptsMade,
          },
          'Processing dead-letter job',
        );

        // Dead-letter jobs are for inspection only
        // Don't process them further unless explicitly retried
        // Return unchanged to mark as processed
        return job.returnvalue ?? ({} as JobResult);
      },
      {
        ...defaultWorkerOptions,
        concurrency: 1, // Low concurrency for careful handling
      },
    );

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.worker.on('completed', (job: Job<JobData, JobResult>) => {
      logger.info(
        {
          jobId: job.id,
          correlationId: job.data.correlationId,
        },
        'Dead-letter job processed',
      );
    });

    this.worker.on('failed', (job: Job<JobData, JobResult> | undefined, error: Error) => {
      logger.error(
        {
          jobId: job?.id,
          correlationId: job?.data.correlationId,
          error: error.message,
        },
        'Dead-letter job processing failed',
      );
    });

    this.worker.on('error', (error: Error) => {
      logger.error({ error: error.message }, 'Dead-letter worker error');
    });
  }

  async start(): Promise<void> {
    await this.worker.waitUntilReady();
    logger.info('Dead-letter worker started');
  }

  async close(): Promise<void> {
    await this.worker.close();
    logger.info('Dead-letter worker closed');
  }

  getWorker(): Worker<JobData, JobResult> {
    return this.worker;
  }

  /**
   * Move a failed job from the dead-letter queue back to its original queue for retry
   */
  async retryJob(jobId: string, targetQueue: Queue): Promise<void> {
    const job = await deadLetterQueue.getJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found in dead-letter queue`);
    }

    await targetQueue.add(job.name, job.data, {
      attempts: job.opts.attempts,
      backoff: job.opts.backoff,
    });

    await job.remove();

    logger.info(
      {
        jobId,
        targetQueue: targetQueue.name,
      },
      'Job moved from dead-letter queue to target queue',
    );
  }

  /**
   * Get all jobs in the dead-letter queue
   */
  async getDeadJobs(): Promise<Array<{ id: string; data: JobData; failedReason?: string }>> {
    const jobs = await deadLetterQueue.getJobs(['failed']);
    return jobs.map((job) => ({
      id: job.id!,
      data: job.data,
      failedReason: job.failedReason,
    }));
  }

  /**
   * Clear all jobs from the dead-letter queue
   */
  async clearDeadJobs(): Promise<void> {
    await deadLetterQueue.obliterate({ force: true });
    logger.info('Dead-letter queue cleared');
  }
}

export const deadLetterWorker = new DeadLetterWorker();
