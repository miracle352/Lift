import { createClient, type Client } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from './schema';

/**
 * libSQL database: `file:./local.db` in dev, Turso (`libsql://…` + DATABASE_AUTH_TOKEN) in production,
 * `:memory:` in tests (see tests/helpers when you add DB tests: run migrations from ./drizzle first).
 */
export type Db = LibSQLDatabase<typeof schema>;

let db: Db | null = null;
let raw: Client | null = null;

export function getDb(): Db {
  if (typeof window !== 'undefined') throw new Error('getDb() is server-only');
  if (db) return db;
  const url = process.env.DATABASE_URL ?? 'file:./local.db';
  raw = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
  if (url.startsWith('file:')) {
    // the worker and the web app share one SQLite file on the server: WAL + a busy timeout avoid "database is locked"
    void raw.execute('PRAGMA journal_mode = WAL').catch(() => {});
    void raw.execute('PRAGMA busy_timeout = 5000').catch(() => {});
  }
  db = drizzle(raw, { schema });
  return db;
}

/** For tests: a fresh in-memory database. */
export function createTestDb(): { db: Db; client: Client } {
  const client = createClient({ url: ':memory:' });
  return { db: drizzle(client, { schema }), client };
}

export { schema };
