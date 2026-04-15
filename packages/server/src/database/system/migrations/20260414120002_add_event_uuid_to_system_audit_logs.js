/**
 * Idempotency key for batch-inserted audit events.
 *
 * The BullMQ-backed audit-batch path (`AuditLogBatchBuffer` +
 * `AuditLogBatchProcessor`) can redeliver a job on worker crash after a
 * partial bulk insert. Without a client-side idempotency token, a
 * redelivered job inserts duplicate rows. `event_uuid` is stamped by
 * the producer (`AuditLogService.queue`) for every batched event; the
 * unique index lets the processor use `INSERT IGNORE` (`onConflict`
 * ignore) to make redelivery a no-op.
 *
 * Nullable because rows written by `AuditLogService.record()` (the
 * synchronous path) don't need it — that path isn't retried and never
 * produces duplicates. MariaDB/MySQL unique indexes allow multiple
 * NULLs, so legacy rows and non-batched rows coexist cleanly.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.alterTable('system_audit_logs', (table) => {
    table.string('event_uuid', 36).nullable();
    table.unique(['event_uuid'], 'system_audit_logs_event_uuid_unq');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.alterTable('system_audit_logs', (table) => {
    table.dropUnique(['event_uuid'], 'system_audit_logs_event_uuid_unq');
    table.dropColumn('event_uuid');
  });
};
