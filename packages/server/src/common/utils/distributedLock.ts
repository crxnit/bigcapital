import { Logger } from '@nestjs/common';
import { RedisService } from '@liaoliaots/nestjs-redis';

const logger = new Logger('DistributedLock');

/**
 * Runs `fn` exactly once across a horizontally-scaled deployment by
 * holding a Redis-backed lock for its duration.
 *
 * Semantics:
 * - `key` — stable identifier for the critical section (e.g. cron name).
 * - `ttlMs` — upper bound on how long `fn` is allowed to hold the lock.
 *   Must be greater than the worst-case runtime; the lock auto-expires
 *   if the holder crashes without releasing.
 * - If the lock is already held, returns `null` without running `fn`.
 *   The caller treats "another replica is doing it" as success-by-skip.
 *
 * Intended use: retention crons and other scheduled jobs that should
 * run once per cluster, not once per replica. NOT a mutual-exclusion
 * primitive for request-path critical sections — BullMQ or a proper
 * queue is the right tool there.
 */
export async function withDistributedLock<T>(
  redis: RedisService,
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T | null> {
  const client = redis.getOrThrow();
  const lockKey = `lock:${key}`;
  // Unique token so release only deletes our own lock, never a later
  // holder's in the event the ttl expired mid-run.
  const token = `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2)}`;

  const acquired = await client.set(lockKey, token, 'PX', ttlMs, 'NX');
  if (acquired !== 'OK') {
    logger.debug(`Lock ${key} held elsewhere; skipping`);
    return null;
  }

  try {
    return await fn();
  } finally {
    // Compare-and-delete via Lua so we only release our own hold.
    const releaseScript = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    try {
      await client.eval(releaseScript, 1, lockKey, token);
    } catch (err) {
      // Lock will expire on its own via the PX ttl — safe to warn and move on.
      logger.warn(
        `Failed to release distributed lock ${key}: ${(err as Error)?.message}`,
      );
    }
  }
}
