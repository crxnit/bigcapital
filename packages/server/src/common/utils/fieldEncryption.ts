import * as crypto from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;
const VERSION = 'v1';

/**
 * Loads the field-encryption key from env. Must be 32 bytes hex-encoded
 * (64 hex chars). Generated with: `openssl rand -hex 32`.
 *
 * Memoized after first successful load — the key is process-lifetime
 * immutable, so the env read and Buffer allocation only need to happen
 * once. Tests that need to reset the cache (e.g. swap keys between
 * scenarios) can call `_resetKeyCacheForTests()`.
 */
let cachedKey: Buffer | null = null;
let cachedHex: string | null = null;

function getKey(): Buffer {
  const hex = process.env.FIELD_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      'FIELD_ENCRYPTION_KEY must be set to a 64-character hex string (32 bytes). Generate with: openssl rand -hex 32',
    );
  }
  // Re-parse if the env var changed (tests, hot config reload). The
  // String comparison is O(64), cheaper than a Buffer allocation.
  if (cachedKey && cachedHex === hex) return cachedKey;
  cachedHex = hex;
  cachedKey = Buffer.from(hex, 'hex');
  return cachedKey;
}

export function _resetKeyCacheForTests(): void {
  cachedKey = null;
  cachedHex = null;
}

/**
 * Detects whether a string is a ciphertext produced by this module.
 */
function isEncrypted(value: string): boolean {
  return typeof value === 'string' && value.startsWith(`${VERSION}:`);
}

/**
 * Encrypts plaintext to `v1:<iv>:<tag>:<ciphertext>` (all base64).
 * Idempotent: returns the input unchanged if already encrypted.
 */
export function encryptField(plaintext: string | null | undefined): string | null | undefined {
  if (plaintext === null || plaintext === undefined || plaintext === '') return plaintext;
  if (isEncrypted(plaintext)) return plaintext;

  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${VERSION}:${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
}

/**
 * Decrypts `v1:<iv>:<tag>:<ciphertext>`. Returns the input unchanged if it
 * doesn't look encrypted (supports legacy plaintext rows).
 */
export function decryptField(value: string | null | undefined): string | null | undefined {
  if (value === null || value === undefined || value === '') return value;
  if (!isEncrypted(value)) return value;

  const parts = value.split(':');
  if (parts.length !== 4) return value;
  const [, ivB64, tagB64, ctB64] = parts;

  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const ciphertext = Buffer.from(ctB64, 'base64');

  if (iv.length !== IV_LEN || tag.length !== TAG_LEN) {
    throw new Error('Invalid encrypted field format');
  }

  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  return plaintext.toString('utf8');
}
