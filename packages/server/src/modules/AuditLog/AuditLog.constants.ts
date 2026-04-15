// BullMQ queue name for batched audit writes. Producer is the in-process
// buffer inside AuditLogService; consumer is AuditLogBatchProcessor.
export const AUDIT_LOG_BATCH_QUEUE = 'AuditLogBatchQueue';

// Batch tuning. Flushes whichever happens first: N events buffered, or T
// ms elapsed since the last flush. Values are deliberately conservative —
// lower cost of losing a 5-second window on crash against the benefit of
// not burning one Redis round-trip per request.
export const AUDIT_LOG_BATCH_MAX = 500;
export const AUDIT_LOG_BATCH_INTERVAL_MS = 5000;

// Hard cap on buffered events. Protects against memory exhaustion if
// flushes are stalled (Redis + DB simultaneously unreachable, or extreme
// request rate that outpaces flush throughput). Sized to roughly 20x the
// normal batch — past this we drop and log a counter rather than OOM.
export const AUDIT_LOG_BUFFER_HARD_CAP = 10_000;
