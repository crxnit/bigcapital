// Redaction for audit-log metadata. Rules:
//   - Any key matching the sensitive-key regex has its value replaced with
//     [REDACTED], regardless of depth.
//   - Any string value longer than MAX_VALUE_CHARS is truncated (measured
//     in UTF-16 code units — see note below).
//   - The whole JSON-serialized payload is capped at MAX_PAYLOAD_BYTES;
//     oversize payloads are rejected (the caller must shrink the metadata).
//
// These rules are intentionally conservative. If a key is borderline, err on
// the side of redaction — it's always safer to lose a field than to leak one.

const SENSITIVE_KEY_REGEX = /password|token|secret|apikey|api_key|hash|cvv|pin|authorization|bearer/i;

// Per-value truncation length, measured in UTF-16 code units (String.length),
// NOT bytes. Multibyte UTF-8 input may yield a truncated value slightly
// larger in bytes; the goal is to bound blast radius per value, not hit an
// exact byte size. The whole-payload byte cap below is the hard limit.
const MAX_VALUE_CHARS = 1024;
const TRUNCATION_SUFFIX = '...(truncated)';

export const MAX_PAYLOAD_BYTES = 4 * 1024;

export const REDACTED = '[REDACTED]';

export class AuditMetadataTooLargeError extends Error {
  constructor(bytes: number) {
    super(
      `Audit log metadata exceeds ${MAX_PAYLOAD_BYTES} bytes (got ${bytes}). Reduce the payload before calling record().`,
    );
    this.name = 'AuditMetadataTooLargeError';
  }
}

function truncateString(value: string): string {
  if (value.length <= MAX_VALUE_CHARS) return value;
  return value.slice(0, MAX_VALUE_CHARS - TRUNCATION_SUFFIX.length) + TRUNCATION_SUFFIX;
}

function redactRecursive(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return truncateString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map((v) => redactRecursive(v));

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      // Sensitive-key decision lives at the only site that has the key
      // name — here. Nested sensitive keys are caught because this
      // branch recurses through non-sensitive keys until it finds one.
      out[k] = SENSITIVE_KEY_REGEX.test(k) ? REDACTED : redactRecursive(v);
    }
    return out;
  }

  // Functions, symbols, etc — drop.
  return undefined;
}

/**
 * Returns a sanitized copy of `metadata` safe for persistence. Throws
 * AuditMetadataTooLargeError if the serialized payload exceeds the cap.
 *
 * Intended for the WRITE path — the serialize + size check catches rows
 * with oversized metadata before they hit the DB. Read-path callers
 * should use `redactStoredMetadata()` instead to skip the size check.
 */
export function redactMetadata(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (metadata === null || metadata === undefined) return null;

  const redacted = redactRecursive(metadata) as Record<string, unknown>;
  // This serialize is for the size check only; Objection/MySQL will
  // serialize again when writing the JSON column. The duplication is
  // acceptable at the current 4 KB cap; if MAX_PAYLOAD_BYTES is ever
  // raised significantly, pass `serialized` through to the DB layer
  // to avoid the second stringify pass.
  const serialized = JSON.stringify(redacted);
  const size = Buffer.byteLength(serialized, 'utf8');

  if (size > MAX_PAYLOAD_BYTES) {
    throw new AuditMetadataTooLargeError(size);
  }
  return redacted;
}

/**
 * Fast variant for the READ path. Stored metadata is already ≤ MAX_PAYLOAD_BYTES
 * (enforced on write), so the serialize + size check in `redactMetadata`
 * is pure overhead here. This variant just applies redaction — one
 * linear walk, no extra JSON.stringify pass.
 *
 * Used by `AuditLogReadService.sanitize()` as defense-in-depth against
 * any row that was written before the current redaction rules existed.
 */
export function redactStoredMetadata(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (metadata === null || metadata === undefined) return null;
  return redactRecursive(metadata) as Record<string, unknown>;
}
