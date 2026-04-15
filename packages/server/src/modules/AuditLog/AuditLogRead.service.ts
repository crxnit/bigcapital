import { Inject, Injectable } from '@nestjs/common';
import { QueryBuilder } from 'objection';
import { AuditLog } from './models/AuditLog.model';
import { SystemAuditLog } from './models/SystemAuditLog.model';
import { TenantModelProxy } from '@/modules/System/models/TenantBaseModel';
import { AuditLogQueryDto, SystemAuditLogQueryDto } from './dtos/AuditLogQuery.dto';
import { redactStoredMetadata } from './AuditLog.redaction';

export interface PaginatedAuditLogs<T> {
  data: T[];
  pagination: { page: number; pageSize: number; total: number };
}

type AuditLogRow = AuditLog | SystemAuditLog;
type AuditLogQueryBuilder = QueryBuilder<AuditLog> | QueryBuilder<SystemAuditLog>;

/**
 * Read-side of the audit log. Writes go through AuditLogService; this
 * service is called only by the two read controllers.
 *
 * Metadata is re-redacted before being returned. Write-side redaction
 * should already have run, but if a future code path bypasses it (or a
 * historical row was written before redaction existed), the read path
 * still protects.
 */
@Injectable()
export class AuditLogReadService {
  constructor(
    @Inject(AuditLog.name)
    private readonly auditLogModel: TenantModelProxy<typeof AuditLog>,

    @Inject(SystemAuditLog.name)
    private readonly systemAuditLogModel: typeof SystemAuditLog,
  ) {}

  async listTenant(query: AuditLogQueryDto): Promise<PaginatedAuditLogs<AuditLog>> {
    const { page, pageSize } = this.parsePagination(query);

    const q = this.auditLogModel()
      .query()
      .orderBy('created_at', 'desc');

    this.applyCommonFilters(q, query);

    // NOTE: Objection's `.page(n, size)` runs a separate `SELECT COUNT(*)`
    // to populate `total`. At expected audit-log volumes (millions of rows
    // with the 180-day retention) this COUNT is the dominant cost of the
    // endpoint. Migrate to cursor-based pagination on created_at when the
    // observed p95 exceeds ~300ms.
    const { results, total } = await q.page(page - 1, pageSize);
    return {
      data: results.map((row) => this.sanitize(row)),
      pagination: { page, pageSize, total },
    };
  }

  async listSystem(
    query: SystemAuditLogQueryDto,
  ): Promise<PaginatedAuditLogs<SystemAuditLog>> {
    const { page, pageSize } = this.parsePagination(query);

    const q = this.systemAuditLogModel
      .query()
      .orderBy('created_at', 'desc');

    this.applyCommonFilters(q, query);
    if (query.tenantId !== undefined) {
      // The `tenantId` filter is user-supplied and NOT validated against
      // a tenant-existence check. Safe today because SystemAdminGuard
      // gates this controller; an admin can already enumerate tenants
      // directly. If this route ever loses admin-only gating, add an
      // existence check (or drop the filter) to prevent tenant-ID
      // enumeration by non-admins.
      q.where('tenant_id', query.tenantId);
    }

    // See note in listTenant about .page()'s COUNT cost.
    const { results, total } = await q.page(page - 1, pageSize);
    return {
      data: results.map((row) => this.sanitize(row)),
      pagination: { page, pageSize, total },
    };
  }

  private parsePagination(query: AuditLogQueryDto) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize = query.pageSize && query.pageSize > 0 ? query.pageSize : 50;
    return { page, pageSize };
  }

  private applyCommonFilters(q: AuditLogQueryBuilder, query: AuditLogQueryDto) {
    if (query.action) q.where('action', query.action);
    if (query.userId !== undefined) q.where('user_id', query.userId);
    if (query.resourceType) q.where('resource_type', query.resourceType);
    if (query.resourceId) q.where('resource_id', query.resourceId);
    if (query.from) q.where('created_at', '>=', query.from);
    if (query.to) q.where('created_at', '<', query.to);
  }

  /**
   * Returns a shallow copy of `row` with redacted metadata. Uses the
   * read-path redact variant that skips the write-side size check —
   * stored data is already capped at MAX_PAYLOAD_BYTES on write, so
   * re-measuring per row is pure overhead.
   *
   * Does not mutate the Objection model instance — callers holding the
   * original `results` array won't see redacted values sneak in.
   *
   * Behavior on redaction failure: propagates the exception (fail-fast
   * on corrupt stored JSON). Callers see a 500. This is intentional —
   * audit-log read is admin-only, and silent degradation on corrupt
   * rows would hide data corruption from the people best-placed to
   * notice it.
   */
  private sanitize<T extends AuditLogRow>(row: T): T {
    if (!row?.metadata) return row;
    const redacted = redactStoredMetadata(row.metadata as Record<string, unknown>);
    return { ...row, metadata: redacted } as T;
  }
}
