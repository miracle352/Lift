import canonicalize from 'canonicalize';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

/**
 * RFC 8785 (JCS) canonical JSON. Works in Node and the browser.
 * Do not hand-roll JSON.stringify for anything that gets hashed.
 */
export function canonicalJson(value: unknown): string {
  const out = canonicalize(value);
  if (out === undefined) throw new Error('canonicalJson: value is not JSON-serialisable');
  return out;
}

export function sha256Hex(input: string | Uint8Array): string {
  return bytesToHex(sha256(typeof input === 'string' ? utf8ToBytes(input) : input));
}

/** sha256 of the canonical JSON of `value`. */
export function hashJson(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}

/** 32 random bytes as hex, from the platform CSPRNG (Node >= 19 and browsers expose globalThis.crypto). */
export function randomSaltHex(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}
