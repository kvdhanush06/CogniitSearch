import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { env } from '../config/env.js';
import { redis } from '../config/redis.js';
import { logger } from '../config/logger.js';

/**
 * Token-bucket rate limiter backed by Redis.
 *
 * For an authenticated user, the bucket key is `cogniit:rl:user:<id>`.
 * For an anonymous caller, it's `cogniit:rl:ip:<ip>`. Each request
 * consumes one token; tokens refill smoothly (a "leaky bucket" with a
 * continuous refill) so a user who hasn't asked in an hour can fire
 * multiple queries in a row, then is throttled to a steady rate.
 *
 * Configured via env:
 *   RATE_LIMIT_BUCKET_CAPACITY (default 100) — burst size
 *   RATE_LIMIT_REFILL_PER_HOUR (default 100)  — sustained rate
 *
 * On Redis failure the request is allowed (fail open); a 500 is worse
 * than a temporarily unbounded user.
 */

const KEY_PREFIX = 'cogniit:rl:';

interface BucketState {
  tokens: number;
  lastRefillMs: number;
}

function identityFor(req: Request): string {
  if (req.user?.id) return `user:${req.user.id}`;
  const fwd = req.headers['x-forwarded-for'];
  const ip =
    (Array.isArray(fwd) ? fwd[0] : typeof fwd === 'string' ? fwd.split(',')[0]?.trim() : null) ??
    req.socket.remoteAddress ??
    'unknown';
  return `ip:${ip}`;
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
      // Persist with a 2h safety TTL so abandoned keys eventually clear.
      await redis.set(key, JSON.stringify(after), 'EX', 2 * 60 * 60);
      res.setHeader('X-RateLimit-Remaining', String(Math.floor(after.tokens)));
      next();
    } catch (err) {
      // Fail open — don't block users on a Redis blip.
      logger.warn({ err }, 'Rate limit check failed; allowing request');
      next();
    }
  })();
};
