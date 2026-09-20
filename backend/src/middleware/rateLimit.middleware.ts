import type { Request, RequestHandler } from 'express';

import { env } from '../config/env.js';
import { redis } from '../config/redis.js';
import { logger } from '../config/logger.js';

const KEY_PREFIX = 'cogniit:rl:';

interface BucketState {
  tokens: number;
  lastRefillMs: number;
}

function identityFor(req: Request): string {
  if (req.user?.id) return `user:${req.user.id}`;
  // Express derives req.ip from the configured trust-proxy policy. Do not
  // trust a raw X-Forwarded-For header in application code.
  return `ip:${req.ip || req.socket.remoteAddress || 'unknown'}`;
}

function refill(state: BucketState, capacity: number, refillPerHour: number, nowMs: number): BucketState {
  const elapsedMs = nowMs - state.lastRefillMs;
  if (elapsedMs <= 0) return state;
  const refillPerMs = refillPerHour / (60 * 60 * 1000);
  const refilled = state.tokens + elapsedMs * refillPerMs;
  return { tokens: Math.min(capacity, refilled), lastRefillMs: nowMs };
}

function parseBucketState(raw: string | null): BucketState {
  if (!raw) return { tokens: 0, lastRefillMs: 0 };
  try {
    const parsed = JSON.parse(raw) as { tokens?: number; lastRefillMs?: number };
    return {
      tokens: typeof parsed.tokens === 'number' ? parsed.tokens : 0,
      lastRefillMs: typeof parsed.lastRefillMs === 'number' ? parsed.lastRefillMs : 0,
    };
  } catch {
    return { tokens: 0, lastRefillMs: 0 };
  }
}

function secondsUntilOneToken(refillPerHour: number): number {
  const refillPerMs = refillPerHour / (60 * 60 * 1000);
  if (refillPerMs <= 0) return 60;
  return Math.ceil(1 / refillPerMs / 1000);
}

export const rateLimit: RequestHandler = (req, res, next) => {
  const capacity = env.RATE_LIMIT_BUCKET_CAPACITY;
  const refillPerHour = env.RATE_LIMIT_REFILL_PER_HOUR;
  const key = `${KEY_PREFIX}${identityFor(req)}`;

  void (async () => {
    try {
      const now = Date.now();
      const raw = await redis.get(key);
      const before = refill(parseBucketState(raw), capacity, refillPerHour, now);
      if (before.tokens < 1) {
        const retryAfter = secondsUntilOneToken(refillPerHour);
        res.setHeader('Retry-After', String(retryAfter));
        res.setHeader('X-RateLimit-Remaining', '0');
        res.status(429).json({
          success: false,
          error: {
            message: 'Rate limit exceeded. Try again shortly.',
            code: 'RATE_LIMITED',
            details: { retryAfterSeconds: retryAfter },
          },
        });
        return;
      }

      const after: BucketState = { tokens: before.tokens - 1, lastRefillMs: now };
      await redis.set(key, JSON.stringify(after), 'EX', 2 * 60 * 60);
      res.setHeader('X-RateLimit-Remaining', String(Math.floor(after.tokens)));
      next();
    } catch (err) {
      // Redis protects an expensive external-API operation. Failing open
      // during an outage can turn a Redis incident into an unbounded cost
      // incident, so reject the request instead.
      logger.error({ err }, 'Rate limit check failed; rejecting request');
      res.status(503).json({
        success: false,
        error: { message: 'Service temporarily unavailable', code: 'RATE_LIMIT_UNAVAILABLE' },
      });
    }
  })();
};
