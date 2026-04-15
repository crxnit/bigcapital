import { SystemModel } from '@/modules/System/models/SystemModel';

/**
 * System-scoped audit log. Records events that happen before a tenant has
 * been selected (login success/failure, signup, password reset, API key
 * lifecycle). `tenant_id` is optional — set when the event is attributable
 * to a tenant, null otherwise (e.g. failed login from an unknown email).
 */
export class SystemAuditLog extends SystemModel {
  readonly id!: number;
  readonly userId!: number | null;
  readonly tenantId!: number | null;
  readonly action!: string;
  readonly resourceType!: string | null;
  readonly resourceId!: string | null;
  readonly metadata!: Record<string, unknown> | null;
  readonly ip!: string | null;
  readonly userAgent!: string | null;
  readonly createdAt!: Date;

  // Idempotency token stamped by the BullMQ batch path
  // (AuditLogService.queue). Unique when non-null — lets the batch
  // processor use INSERT IGNORE on redelivery. NULL for rows written
  // by the synchronous record() path, which isn't retried.
  readonly eventUuid!: string | null;

  static get tableName() {
    return 'system_audit_logs';
  }

  get timestamps() {
    return ['createdAt'];
  }

  $beforeInsert() {
    if (!this.createdAt) (this as any).createdAt = new Date();
  }
}
