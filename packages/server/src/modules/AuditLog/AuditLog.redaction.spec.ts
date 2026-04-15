import {
  redactMetadata,
  REDACTED,
  AuditMetadataTooLargeError,
  MAX_PAYLOAD_BYTES,
} from './AuditLog.redaction';

describe('redactMetadata', () => {
  it('returns null for null/undefined input', () => {
    expect(redactMetadata(null)).toBeNull();
    expect(redactMetadata(undefined)).toBeNull();
  });

  it('redacts sensitive keys at the top level', () => {
    const out = redactMetadata({ password: 'hunter2', email: 'a@b.com' });
    expect(out).toEqual({ password: REDACTED, email: 'a@b.com' });
  });

  it('redacts sensitive keys regardless of case', () => {
    const out = redactMetadata({ API_KEY: 'k', Authorization: 'Bearer x' });
    expect(out).toEqual({ API_KEY: REDACTED, Authorization: REDACTED });
  });

  it('redacts sensitive keys at any depth', () => {
    const out = redactMetadata({
      outer: { inner: { token: 'abc', safe: 1 } },
    });
    expect(out).toEqual({ outer: { inner: { token: REDACTED, safe: 1 } } });
  });

  it('redacts sensitive keys inside arrays', () => {
    const out = redactMetadata({ items: [{ secret: 's', ok: 1 }] });
    expect(out).toEqual({ items: [{ secret: REDACTED, ok: 1 }] });
  });

  it('preserves non-sensitive fields', () => {
    const meta = { userId: 42, email: 'x@y.com', count: 3, ok: true };
    expect(redactMetadata(meta)).toEqual(meta);
  });

  it('truncates oversized string values', () => {
    const big = 'x'.repeat(2048);
    const out = redactMetadata({ note: big }) as Record<string, string>;
    expect(out.note.length).toBeLessThan(big.length);
    expect(out.note).toMatch(/truncated/);
  });

  it('throws when the serialized payload exceeds the cap', () => {
    // Build an object whose serialized form is clearly over the cap.
    const huge: Record<string, string> = {};
    for (let i = 0; i < 20; i++) {
      // Each value is ~500 bytes; 20 of them plus keys blow past 4 KB.
      huge[`k${i}`] = 'y'.repeat(500);
    }
    expect(() => redactMetadata(huge)).toThrow(AuditMetadataTooLargeError);
  });

  it('accepts payloads at the boundary', () => {
    const ok: Record<string, string> = { field: 'a'.repeat(100) };
    expect(() => redactMetadata(ok)).not.toThrow();
  });

  it('drops non-serializable values like functions', () => {
    const out = redactMetadata({
      fn: (() => 1) as any,
      email: 'x@y.com',
    }) as Record<string, unknown>;
    expect(out.fn).toBeUndefined();
    expect(out.email).toBe('x@y.com');
  });

  it('verifies the cap constant is 4 KB', () => {
    expect(MAX_PAYLOAD_BYTES).toBe(4096);
  });
});
