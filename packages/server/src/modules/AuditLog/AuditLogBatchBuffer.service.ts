import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { SystemAuditLog } from './models/SystemAuditLog.model';
import {
  AUDIT_LOG_BATCH_MAX,
  AUDIT_LOG_BATCH_INTERVAL_MS,
  AUDIT_LOG_BATCH_QUEUE,
  AUDIT_LOG_BUFFER_HARD_CAP,
} from './AuditLog.constants';

export interface BatchEntry {
  // Idempotency token: stamped by AuditLogService.queue so a redelivered
  // BullMQ job can no-op on `INSERT IGNORE` against the unique index on
  // `system_audit_logs.event_uuid`. Required — never null in a BatchEntry.
  eventUuid: string;
  userId: number | null;
  tenantId: number | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
}

interface DrainedBatch {
  batch: BatchEntry[];
  droppedCount: number;
}

/**
 * In-process pre-aggregation buffer for high-volume audit events
 * (currently just `api_key.used`, one per authenticated request).
 *
 * Design: events pile up in memory until `AUDIT_LOG_BATCH_MAX` is reached
 * or `AUDIT_LOG_BATCH_INTERVAL_MS` elapses, then a single BullMQ job is
 * enqueued carrying the whole batch. The worker does one bulk insert.
 *
 * Why not enqueue per-event? That adds a Redis round-trip to the hot path
 * of every API request — defeats the purpose of batching for latency.
 * Why BullMQ at all (vs a direct bulk insert)? Cross-instance durability
 * through process restarts once the batch has been handed off.
 *
 * Loss window: up to `AUDIT_LOG_BATCH_INTERVAL_MS` of events can be lost
 * on a hard crash before handoff. Acceptable for this event class.
 *
 * Backpressure: if a flush is already in flight when size threshold hits,
 * a follow-up flush is chained so we don't wait for the interval. Buffer
 * has a hard cap (`AUDIT_LOG_BUFFER_HARD_CAP`); events past the cap are
 * dropped with a counter log rather than OOM-ing the process.
 *
 * Shutdown: `onModuleDestroy` awaits the in-flight flush before calling
 * `flushDirect()` — otherwise an in-progress batch would be lost if
 * shutdown races with the interval.
 *
 * Two public flush methods:
 * - `flush()`       — BullMQ-preferred path with direct-write fallback on
 *                     Redis outage. Used by the interval and size-trigger.
 * - `flushDirect()` — synchronous bulk insert only. Used on shutdown to
 *                     avoid depending on Redis during teardown.
 */
@Injectable()
export class AuditLogBatchBuffer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuditLogBatchBuffer.name);
  private buffer: BatchEntry[] = [];
  private flushTimer: NodeJS.Timeout | null = null;

  // Tracks the currently-running flush so shutdown can await it and so
  // a chained follow-up flush can sequence after it.
  private inflight: Promise<void> | null = null;

  // Set to true when a size-triggered flush arrives during an in-flight
  // flush; consumed when that in-flight flush completes.
  private pendingChainedFlush = false;

  // Counter of events dropped because the hard cap was hit. Logged and
  // reset on each flush so an operator can see the pressure.
  private droppedSinceLastFlush = 0;

  constructor(
    @InjectQueue(AUDIT_LOG_BATCH_QUEUE)
    private readonly batchQueue: Queue,

    @Inject(SystemAuditLog.name)
    private readonly systemAuditLogModel: typeof SystemAuditLog,
  ) {}

  onModuleInit() {
    this.flushTimer = setInterval(
      () => this.flush().catch((err) => this.logUnexpectedFlushError('interval', err)),
      AUDIT_LOG_BATCH_INTERVAL_MS,
    );
    // Don't hold the event loop open just for the flush timer.
    this.flushTimer.unref?.();
  }

  async onModuleDestroy() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    // Wait for any flush already in flight — its promise carries the
    // current batch, and letting it finish prevents double-writes in the
    // final direct-write path below.
    if (this.inflight) {
      try {
        await this.inflight;
      } catch (err) {
        // Normally runFlush catches terminal errors internally; this
        // handles the unlikely case it throws (or a future refactor
        // drops the inner catch). Warn so contract drift is visible.
        this.logger.warn(
          `In-flight flush errored during shutdown: ${(err as Error)?.message}`,
        );
      }
    }
    // Drain anything still in the buffer synchronously so we don't depend
    // on Redis during teardown.
    await this.flushDirect();
  }

  push(entry: BatchEntry): void {
    if (this.buffer.length >= AUDIT_LOG_BUFFER_HARD_CAP) {
      // Hard cap — we're already backlogged past what an in-flight flush
      // could plausibly drain. Drop and count rather than grow without
      // bound. The counter is logged on the next successful flush so an
      // operator notices.
      this.droppedSinceLastFlush++;
      return;
    }

    this.buffer.push(entry);

    if (this.buffer.length >= AUDIT_LOG_BATCH_MAX) {
      this.scheduleFlush();
    }
  }

  /**
   * BullMQ-preferred flush. Enqueues the batch as a single job; if Redis
   * is unreachable, falls through to a synchronous bulk insert so events
   * aren't dropped during an outage.
   *
   * Concurrency note — the `this.inflight` check + assign below is not
   * a cross-thread atomic, but it IS safe under Node.js's single-thread
   * execution model: the check at line ~below, the `hasWorkToFlush` call,
   * and the `this.inflight = this.runFlush(...)` assignment all run in
   * one synchronous prefix (no `await` between them), so no other
   * caller's synchronous prefix can interleave and observe `inflight`
   * as null-then-set. DO NOT port this class to worker_threads or
   * SharedArrayBuffer without re-designing the guard around a proper
   * atomic primitive.
   */
  private async flush(): Promise<void> {
    if (this.inflight) {
      return this.inflight;
    }
    if (!this.hasWorkToFlush()) return;

    // Synchronous assign — no await between the check above and here.
    // This is what makes the guard safe in single-threaded Node.
    this.inflight = this.runFlush(async (batch) => {
      try {
        await this.batchQueue.add(
          'flush',
          { entries: batch },
          { removeOnComplete: true, removeOnFail: { age: 3600 } },
        );
      } catch (enqueueErr) {
        // Redis unreachable — fall through to synchronous bulk insert.
        this.logger.warn(
          `Audit batch enqueue failed, falling back to direct write: ${(enqueueErr as Error)?.message}`,
        );
        await this.writeDirect(batch);
      }
    });
    try {
      await this.inflight;
    } finally {
      this.inflight = null;
      this.consumeChainedFlush();
    }
  }

  /**
   * Direct-write flush. Skips BullMQ entirely and bulk-inserts to
   * `system_audit_logs`. Used on shutdown, where we don't want a
   * teardown-time Redis dependency.
   */
  private async flushDirect(): Promise<void> {
    if (this.inflight) {
      return this.inflight;
    }
    if (!this.hasWorkToFlush()) return;

    this.inflight = this.runFlush((batch) => this.writeDirect(batch));
    try {
      await this.inflight;
    } finally {
      this.inflight = null;
      // No chained-flush consumption here — shutdown doesn't queue more.
    }
  }

  /**
   * Fire-and-forget size-triggered flush. If a flush is already running,
   * arm a chained follow-up rather than dropping the signal — otherwise
   * the buffer would grow past MAX and wait for the interval tick.
   */
  private scheduleFlush(): void {
    if (this.inflight) {
      this.pendingChainedFlush = true;
      return;
    }
    this.flush().catch((err) => this.logUnexpectedFlushError('size-trigger', err));
  }

  private hasWorkToFlush(): boolean {
    return this.buffer.length > 0 || this.droppedSinceLastFlush > 0;
  }

  /**
   * Shared flush runner. Drains the buffer + dropped counter, logs any
   * dropped events, then invokes `writer` with the batch. Errors are
   * caught and logged — never re-thrown — so a flush failure can't
   * take out the interval timer or the caller's request flow.
   */
  private runFlush(writer: (batch: BatchEntry[]) => Promise<void>): Promise<void> {
    return (async () => {
      const { batch, droppedCount } = this.drainBatch();
      this.logDroppedIfAny(droppedCount);
      if (batch.length === 0) return;

      try {
        await writer(batch);
      } catch (err) {
        // Terminal failure. Log and drop — re-queuing here risks an
        // infinite retry loop on persistent DB/Redis outages.
        this.logger.error(
          `Audit batch of ${batch.length} entries lost: ${(err as Error)?.message}`,
        );
      }
    })();
  }

  /**
   * Swap-and-replace: the old array becomes the batch, a fresh empty
   * array takes its place as the live buffer. Dropped-events counter is
   * snapshot + reset atomically with the swap so a concurrent push can't
   * lose a drop count.
   */
  private drainBatch(): DrainedBatch {
    const batch = this.buffer;
    this.buffer = [];
    const droppedCount = this.droppedSinceLastFlush;
    this.droppedSinceLastFlush = 0;
    return { batch, droppedCount };
  }

  private logDroppedIfAny(droppedCount: number): void {
    if (droppedCount > 0) {
      this.logger.warn(
        `Audit batch buffer dropped ${droppedCount} events due to hard cap pressure.`,
      );
    }
  }

  private consumeChainedFlush(): void {
    if (!this.pendingChainedFlush) return;
    this.pendingChainedFlush = false;
    if (this.buffer.length > 0) {
      // Not awaited — same fire-and-forget contract as scheduleFlush.
      this.flush().catch((err) => this.logUnexpectedFlushError('chained', err));
    }
  }

  /**
   * Catches errors that escape `runFlush`'s inner handling — e.g. a
   * programming bug in `drainBatch` or `hasWorkToFlush`. These aren't
   * expected in practice, so a single error-level log is the right
   * signal. Never rethrown.
   */
  private logUnexpectedFlushError(site: string, err: unknown): void {
    this.logger.error(
      `Unexpected flush error at ${site}: ${(err as Error)?.message}`,
      (err as Error)?.stack,
    );
  }

  private async writeDirect(batch: BatchEntry[]): Promise<void> {
    if (batch.length === 0) return;
    // `onConflict('event_uuid').ignore()` turns a retried/duplicate
    // bulk insert into a no-op on the conflicting rows. Safe because
    // each BatchEntry carries a UUID stamped at queue() time; the
    // unique index ensures dup rows can't slip past.
    await this.systemAuditLogModel
      .query()
      .insert(batch as Partial<SystemAuditLog>[])
      .onConflict('event_uuid')
      .ignore();
  }
}
