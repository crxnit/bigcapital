import * as crypto from 'crypto';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import { TenantModelProxy } from '@/modules/System/models/TenantBaseModel';
import { AuditLog } from './models/AuditLog.model';
import { SystemAuditLog } from './models/SystemAuditLog.model';
import {
  redactMetadata,
  AuditMetadataTooLargeError,
} from './AuditLog.redaction';
import { AuditLogBatchBuffer, BatchEntry } from './AuditLogBatchBuffer.service';

export type AuditScope = 'tenant' | 'system';

export interface AuditRecordInput {
  action: string;
  scope: AuditScope;
  userId?: number | null;
  tenantId?: number | null;
  resourceType?: string | null;
  resourceId?: string | number | null;
  metadata?: Record<string, unknown> | null;
  // Override CLS-derived values (tests, background jobs without a request).
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Central write path for audit events. Call sites should use this rather
 * than touching the AuditLog / SystemAuditLog models directly, so redaction
 * and the feature flag are always applied.
 *
 * Two write paths:
 * - `record()` — synchronous insert, appropriate for low-frequency events.
 * - `queue()`  — buffered + batched, for high-frequency events like
 *                `api_key.used` where per-request latency matters.
 *
 * `queue()` only writes to `system_audit_logs` (the batch buffer is
 * system-scoped). Tenant-scoped events should use `record()`.
 */
@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly cls: ClsService,

    @Inject(AuditLog.name)
    private readonly auditLogModel: TenantModelProxy<typeof AuditLog>,

    @Inject(SystemAuditLog.name)
    private readonly systemAuditLogModel: typeof SystemAuditLog,

    // Optional so tests / environments without BullMQ can still construct
    // the service; queue() falls back to synchronous record() if missing.
    @Optional()
    private readonly batchBuffer?: AuditLogBatchBuffer,
  ) {}

  async record(input: AuditRecordInput): Promise<void> {
    if (!this.configService.get<boolean>('auditLog.enabled')) return;

    const row = this.buildRow(input);

    try {
      if (input.scope === 'system') {
        await this.systemAuditLogModel
          .query()
          .insert({ ...row, tenantId: input.tenantId ?? null });
      } else {
        await this.auditLogModel()
          .query()
          .insert(row);
      }
    } catch (err) {
      // Never let an audit-write failure take down the caller's flow.
      // Include scope + resourceType so a wave of failures points the
      // operator at the right table and subsystem (tenant vs system,
      // which resource trended).
      this.logger.error(
        `Failed to record audit log scope=${input.scope} action=${input.action} resourceType=${input.resourceType ?? '-'}`,
        (err as Error)?.stack,
      );
    }
  }

  /**
   * Buffered write path for high-frequency events (`api_key.used`). The
   * buffer flushes in batches — up to ~5s of events can sit in memory
   * before handoff to BullMQ, which is acceptable for this event class.
   *
   * Always writes to `system_audit_logs` (pre-tenant-selection scope).
   */
  queue(input: Omit<AuditRecordInput, 'scope'>): void {
    if (!this.configService.get<boolean>('auditLog.enabled')) return;
    if (!this.batchBuffer) {
      // No buffer wired — fall back to synchronous system-scope write so
      // the event isn't silently dropped.
      void this.record({ ...input, scope: 'system' });
      return;
    }

    const row = this.buildRow({ ...input, scope: 'system' });
    const entry: BatchEntry = {
      ...row,
      tenantId: input.tenantId ?? null,
      createdAt: new Date(),
      // Idempotency key for the BullMQ retry path — see SystemAuditLog
      // model comment and the AuditLogBatchProcessor's `.onConflict`
      // call. Each queued entry gets its own UUID so redelivery can
      // dedupe at the DB.
      eventUuid: crypto.randomUUID(),
    };
    this.batchBuffer.push(entry);
  }

  /**
   * Shared prep for both `record()` and `queue()`. Applies redaction (with
   * oversize-safe degradation), reads CLS request context, and stringifies
   * the resourceId. Both write paths use exactly this shape so they can't
   * drift on the redaction or CLS behavior.
   */
  private buildRow(input: AuditRecordInput) {
    const metadata = this.safeRedact(input.action, input.metadata);
    const ctx = this.resolveRequestContext(input);
    return {
      userId: ctx.userId,
      action: input.action,
      resourceType: input.resourceType ?? null,
      resourceId:
        input.resourceId === undefined || input.resourceId === null
          ? null
          : String(input.resourceId),
      metadata,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    };
  }

  /**
   * Runs metadata through the redaction layer, degrading oversize
   * payloads to null rather than dropping the event. Emits a single warn
   * log line per degraded event so operators can see pressure.
   */
  private safeRedact(
    action: string,
    metadata: Record<string, unknown> | null | undefined,
  ): Record<string, unknown> | null {
    try {
      return redactMetadata(metadata);
    } catch (err) {
      if (err instanceof AuditMetadataTooLargeError) {
        this.logger.warn(
          `Audit metadata exceeded size cap for action=${action}; recording without metadata.`,
        );
        return null;
      }
      throw err;
    }
  }

  /**
   * Pulls ip / user-agent / userId defaults from the active request via CLS.
   * Explicit values on `input` override CLS. Missing values stay null.
   */
  private resolveRequestContext(input: AuditRecordInput) {
    const userIdFromCls = this.cls.get('userId') as number | undefined;
    const reqIp = this.cls.get('ip') as string | undefined;
    const reqUserAgent = this.cls.get('userAgent') as string | undefined;

    return {
      userId: input.userId !== undefined ? input.userId : userIdFromCls ?? null,
      ip: input.ip !== undefined ? input.ip : reqIp ?? null,
      userAgent:
        input.userAgent !== undefined ? input.userAgent : reqUserAgent ?? null,
    };
  }
}
