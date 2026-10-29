import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Loads a recorded fixture, turning `{ "$bytes": "<base64>" }` back into Uint8Array. */
export function loadFixture<T = unknown>(relativePath: string): T {
  const raw = readFileSync(join(__dirname, '..', 'fixtures', relativePath), 'utf8');
  return JSON.parse(raw, (_k, v) => (v && typeof v === 'object' && typeof v.$bytes === 'string' ? new Uint8Array(Buffer.from(v.$bytes, 'base64')) : v)) as T;
}

/** Deep clone (keeps Uint8Array) for building variants of a fixture inside a test. */
export function clone<T>(value: T): T {
  return structuredClone(value);
}
