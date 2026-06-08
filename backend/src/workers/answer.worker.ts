import { Worker, type Job } from 'bullmq';
import { defaultWorkerOptions } from '../config/bullmq.js';
import { logger } from '../config/logger.js';
import IORedis, { type Redis } from 'ioredis';
import { env } from '../config/env.js';
import { groqChatClient } from '../integrations/groq/groq.chat.js';
import { citationService } from '../services/citation.service.js';
import { followUpsService } from '../services/followups.service.js';
import { buildAnswerMessages } from '../services/prompts/answer.prompt.js';
import type { AnswerJobData, AnswerJobResult } from '../jobs/index.js';
import type { StreamChunk } from '../services/stream.types.js';

const STREAM_CHANNEL_PREFIX = 'cogniit:stream:';
function streamChannel(jobId: string): string {
  return `${STREAM_CHANNEL_PREFIX}${jobId}`;
}

let publisher: Redis | null = null;
function getPublisher(): Redis {
  if (!publisher) {
    publisher = new IORedis({
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD || undefined,
      db: env.REDIS_DB,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
    });
    publisher.on('error', (err: Error) =>
      logger.error({ err: err.message }, 'Answer worker stream publisher error'),
    );
  }
  return publisher;
}

async function emit(jobId: string, chunk: StreamChunk): Promise<void> {
  try {
    await getPublisher().publish(streamChannel(jobId), JSON.stringify(chunk));
  } catch (err) {
    logger.debug({ err, jobId }, 'Failed to publish answer stream chunk');
  }
}

/**
 * Answer worker. Streams the Groq completion to a per-job Redis channel.
 * The orchestrator subscribes to that channel and forwards frames to
 * the SSE response. After the model finishes, the worker runs citation
 * extraction + follow-up generation and emits the final `done` frame.
 */
export class AnswerWorker {
  private worker: Worker<AnswerJobData, AnswerJobResult>;

  constructor() {
    this.worker = new Worker<AnswerJobData, AnswerJobResult>(
      'answer',
      async (job: Job<AnswerJobData, AnswerJobResult>) => {
        const { query, context, messages, model, temperature, maxTokens, userId, correlationId } =
          job.data;
        const jobId = job.id ?? 'unknown';

        logger.info(
          { jobId, correlationId, query, model, attempt: job.attemptsMade },
          'Answer job started',
        );

        try {
          const promptMessages = buildAnswerMessages({
            query,
            context,
            conversationHistory: messages,
          });

          let fullAnswer = '';
          for await (const groqChunk of groqChatClient.streamComplete({
            messages: promptMessages,
            model: model ?? env.GROQ_MODEL,
            temperature: temperature ?? env.GROQ_TEMPERATURE,
            maxTokens: maxTokens ?? env.GROQ_MAX_TOKENS,
            stream: true as const,
          })) {
            const delta = groqChunk.choices?.[0]?.delta?.content;
            if (delta) {
              fullAnswer += delta;
              await emit(jobId, { type: 'content', content: delta });
            }
          }

          // Citations + follow-ups.
          const citations = citationService.extractCitations(fullAnswer, context);
          const sources = citationService.buildSourceAttribution(context, citations);
          const fu = await followUpsService.generate(query, fullAnswer, context);
          if (fu.questions.length > 0) {
            await emit(jobId, { type: 'follow_ups', questions: fu.questions });
          }

          await emit(jobId, {
            type: 'done',
            content: JSON.stringify({
              citations,
              sources,
              followUps: fu.questions,
              metadata: {
                followUpDuration: fu.duration,
                followUpModel: fu.model,
                model: model ?? env.GROQ_MODEL,
                streamed: true,
              },
            }),
          });

          const result: AnswerJobResult = {
            answer: fullAnswer,
            model: model ?? env.GROQ_MODEL,
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            finishReason: 'stop',
            responseTime: 0,
            citations,
            sources,
            followUps: fu.questions,
            userId,
            conversationId: job.data.conversationId,
            messageId: job.data.messageId,
            correlationId,
          };
          logger.info(
            { jobId, correlationId, length: fullAnswer.length, sources: sources.length },
            'Answer job completed',
          );
          return result;
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Answer job failed';
          logger.error({ jobId, err: message }, 'Answer job error');
          await emit(jobId, { type: 'error', error: message });
          throw err;
        }
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
        'Answer job failed',
      );
    });
    this.worker.on('error', (err) => {
      logger.error({ err: err.message }, 'Answer worker error');
    });
  }

  async start(): Promise<void> {
    await this.worker.waitUntilReady();
    logger.info('Answer worker started');
  }
  async close(): Promise<void> {
    await this.worker.close();
    if (publisher) {
      try {
        await publisher.quit();
      } catch {
        publisher.disconnect();
      }
      publisher = null;
    }
  }
}

export const answerWorker = new AnswerWorker();
