import { redis } from '../config/redis.js';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';

const KEY_PREFIX = 'cogniit:stream-key:';

function keyFor(conversationId: string, messageId: string): string {
  return `${KEY_PREFIX}${conversationId}:${messageId}`;
}

/**
 * Maps a (conversationId, messageId) pair to the BullMQ answer-job id
 * whose stream chunks are flowing on the per-job Redis pub/sub channel.
 *
 * Written when the orchestrator enqueues the answer job, read by the
 * reattach SSE endpoint so a route change or hard reload mid-stream
 * can pick up the live answer instead of waiting for the orchestrator
 * to finish (and miss the window entirely).
 *
 * The TTL is generous — long enough that a user who reloads at any
 * point during a normal turn still gets a live reattach, short enough
 * that abandoned sessions don't pile up in Redis.
 */
export class StreamSessionRegistry {
  private readonly ttlSeconds: number;

  constructor(ttlSeconds = 60 * 60) {
    this.ttlSeconds = ttlSeconds;
  }

  async register(
    conversationId: string,
    messageId: string,
    answerJobId: string,
  ): Promise<void> {
    if (!conversationId || !messageId || !answerJobId) return;
    try {
      await redis.set(
        keyFor(conversationId, messageId),
        answerJobId,
        'EX',
        this.ttlSeconds,
      );
    } catch (err) {
      // Best-effort. A failed SET only means reattach won't find a
      // live session — the original POST /chat stream is unaffected.
      logger.warn(
        { err, conversationId, messageId, answerJobId },
        'Failed to register stream session in Redis',
      );
    }
  }

  async lookup(
    conversationId: string,
    messageId: string,
  ): Promise<string | null> {
    if (!conversationId || !messageId) return null;
    try {
      return await redis.get(keyFor(conversationId, messageId));
    } catch (err) {
      logger.warn(
        { err, conversationId, messageId },
        'Failed to look up stream session in Redis',
      );
      return null;
    }
  }

  async clear(conversationId: string, messageId: string): Promise<void> {
    try {
      await redis.del(keyFor(conversationId, messageId));
    } catch {
      // ignore — TTL will reap it
    }
  }
}

export const streamSessionRegistry = new StreamSessionRegistry();

// Re-export for tests / external callers that need to set a different TTL.
export const __test__ = { keyFor, KEY_PREFIX, env };
