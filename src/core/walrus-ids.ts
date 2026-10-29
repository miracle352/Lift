import { fromBase64, toBase64 } from '@mysten/sui/utils';

/**
 * Walrus blob ids appear in two encodings:
 *  - on Sui (Blob object `blob_id` field): a u256 as a decimal string
 *  - in Walrus / Walrus Memory APIs (`blob_id` in remember/recall results): URL-safe base64
 *    (no padding) of the 32 little-endian bytes of that u256
 */
export function blobIdFromU256(u256: string | bigint): string {
  let n = BigInt(u256);
  if (n < BigInt(0) || n >= BigInt(1) << BigInt(256)) throw new Error('blob id out of u256 range');
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = Number(n & BigInt(0xff));
    n >>= BigInt(8);
  }
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function u256FromBlobId(blobId: string): string {
  const b64 = blobId.replace(/-/g, '+').replace(/_/g, '/');
  const bytes = fromBase64(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  if (bytes.length !== 32) throw new Error(`blob id must decode to 32 bytes, got ${bytes.length}`);
  let n = BigInt(0);
  for (let i = 31; i >= 0; i--) n = (n << BigInt(8)) | BigInt(bytes[i]);
  return n.toString();
}
