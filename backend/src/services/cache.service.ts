import { createHash } from 'node:crypto';
import { redis } from '../config/redis.js';
import { logger } from '../config/logger.js';

/**
 * Redis-backed JSON cache with TTLs and content-hash keys.
 *
 * Two roles today:
 *   1. Search cache — `searchCache.getOrSet({query, freshness}, loader)`
 *      keyed by sha256 of normalized query + freshness. 1h TTL.
 *   2. Context cache — `contextCache.getOrSet(url, loader)`
 *      keyed by sha256 of the URL. 24h TTL.
 *
 * Future roles (rate-limit, conversation cache) plug into the same primitives.
 *
 * Cache miss/hit is logged at debug level; a hit/miss counter is in the
 * service-level metrics hook (deferred).
 */

const NS = 'cogniit:cache:';

export type CacheRole = 'search' | 'context';

const DEFAULT_TTL_SECONDS: Record<CacheRole, number> = {
  search: 60 * 60, // 1 hour
  context: 60 * 60 * 24, // 24 hours
};

function namespaceFor(role: CacheRole): string {
  return `${NS}${role}:`;
}

function hashKey(parts: Array<string | undefined>): string {
  const h = createHash('sha256');
  for (const p of parts) {
    h.update(p ?? '');
    h.update('|');
  }
  return h.digest('hex').slice(0, 32);
}

export interface CacheService {
  get<T>(role: CacheRole, keyParts: string[]): Promise<T | null>;
  set<T>(role: CacheRole, keyParts: string[], value: T, ttlSeconds?: number): Promise<void>;
  delete(role: CacheRole, keyParts: string[]): Promise<void>;
  /**
   * Read-through: returns the cached value if present, otherwise calls
   * `loader()`, stores its result, and returns it. `loader` is only
   * invoked on miss.
   */
  getOrSet<T>(role: CacheRole, keyParts: string[], loader: () => Promise<T>): Promise<T>;
}

class RedisCacheService implements CacheService {
  async get<T>(role: CacheRole, keyParts: string[]): Promise<T | null> {
    const key = `${namespaceFor(role)}${hashKey(keyParts)}`;
    try {
      const raw = await redis.get(key);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch (err) {
      logger.warn({ err, key, role }, 'Cache get failed');
      return null;
    }
  }

  async set<T>(role: CacheRole, keyParts: string[], value: T, ttlSeconds?: number): Promise<void> {
    const key = `${namespaceFor(role)}${hashKey(keyParts)}`;
    const ttl = ttlSeconds ?? DEFAULT_TTL_SECONDS[role];
    try {
      await redis.set(key, JSON.stringify(value), 'EX', ttl);
    } catch (err) {
      logger.warn({ err, key, role }, 'Cache set failed');
    }
  }

  async delete(role: CacheRole, keyParts: string[]): Promise<void> {
    const key = `${namespaceFor(role)}${hashKey(keyParts)}`;
    try {
      await redis.del(key);
    } catch (err) {
      logger.warn({ err, key, role }, 'Cache delete failed');
    }
  }

  async getOrSet<T>(role: CacheRole, keyParts: string[], loader: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(role, keyParts);
    if (cached !== null) {
      logger.debug({ role, keyParts: keyParts.slice(0, 2) }, 'Cache hit');
      return cached;
    }
    const value = await loader();
    await this.set(role, keyParts, value);
    return value;
  }
}

export const cacheService: CacheService = new RedisCacheService();
