import { registerAs } from '@nestjs/config';

/**
 * Audit logging configuration.
 *
 * `enabled` is a kill-switch: when false, `AuditLogService.record()` becomes
 * a no-op. Default on; flip AUDIT_LOG_ENABLED=false if the subsystem is
 * causing unexpected load and we need to disable without a deploy.
 *
 * `retentionDays` is the global default, overridable per-tenant via the
 * `tenants.audit_log_retention_days` column.
 */
export default registerAs('auditLog', () => ({
  enabled: process.env.AUDIT_LOG_ENABLED !== 'false',
  retentionDays: parseInt(process.env.AUDIT_LOG_RETENTION_DAYS, 10) || 180,
}));
