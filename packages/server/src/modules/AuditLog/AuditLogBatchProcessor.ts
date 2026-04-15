import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { SystemAuditLog } from './models/SystemAuditLog.model';
import { AUDIT_LOG_BATCH_QUEUE } from './AuditLog.constants';
import type { BatchEntry } from './AuditLogBatchBuffer.service';

interface BatchJobData {
  entries: BatchEntry[];
}

/**
 * Drains audit-log batch jobs and performs a single bulk insert per batch
 * into `system_audit_logs`. Failures throw so BullMQ retries per its
 * default policy; after final retry the job lands in the failed set and
 * is swept by the queue-wide retention options (configured in App.module).
 *
 * TODO: the retry policy is inherited from BullMQ's defaults (no explicit
 * `attempts` or `backoff` on the `queue.add()` call in AuditLogBatchBuffer).
 * A DB outage could cause tight-loop retries. Set explicit
 * `attempts: 3, backoff: { type: 'exponential', delay: 2000 }` when
 * enqueueing, or document the intended retry behavior here.
 */
@Processor(AUDIT_LOG_BATCH_QUEUE)
export class AuditLogBatchProcessor extends WorkerHost {
  private readonly logger = new Logger(AuditLogBatchProcessor.name);

  constructor(
    @Inject(SystemAuditLog.name)
    private readonly systemAuditLogModel: typeof SystemAuditLog,
  ) {
    super();
  }

  async process(job: Job<BatchJobData>): Promise<void> {
    const entries = job.data?.entries ?? [];
    if (entries.length === 0) return;

    try {
      // `onConflict('event_uuid').ignore()` makes redelivery a no-op.
      // BullMQ can redeliver a batch after a worker crash between a
      // successful bulk insert and the ack; without this, we'd get
      // duplicate audit rows. Producer-stamped UUID + unique index
      // close the loop.
      await this.systemAuditLogModel
        .query()
        .insert(entries as Partial<SystemAuditLog>[])
        .onConflict('event_uuid')
        .ignore();
    } catch (err) {
      this.logger.error(
        `Audit batch bulk insert failed for ${entries.length} entries`,
        (err as Error)?.stack,
      );
      throw err; // allow BullMQ retry
    }
  }
}
