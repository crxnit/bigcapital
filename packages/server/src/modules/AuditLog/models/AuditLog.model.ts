import { BaseModel } from '@/models/Model';

/**
 * Tenant-scoped audit log. Records actions that have a natural tenant
 * context (invoice voided, role changed, plaid item linked, etc). Rows are
 * insert-only; the cleanup cron is the only path that deletes.
 */
export class AuditLog extends BaseModel {
  readonly id!: number;
  readonly userId!: number | null;
  readonly action!: string;
  readonly resourceType!: string | null;
  readonly resourceId!: string | null;
  readonly metadata!: Record<string, unknown> | null;
  readonly ip!: string | null;
  readonly userAgent!: string | null;
  readonly createdAt!: Date;

  static get tableName() {
    return 'audit_logs';
  }

  // Only created_at is managed (no updated_at). Rows never mutate.
  get timestamps() {
    return ['createdAt'];
  }

  $beforeInsert() {
    if (!this.createdAt) (this as any).createdAt = new Date();
  }
}
