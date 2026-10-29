import { join } from 'node:path';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { createTestDb } from '@/db/client';

/** Fresh in-memory database with all migrations from ./drizzle applied. */
export async function migratedTestDb() {
  const { db, client } = createTestDb();
  await migrate(db, { migrationsFolder: join(__dirname, '..', '..', 'drizzle') });
  return { db, client };
}
