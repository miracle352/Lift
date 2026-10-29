/**
 * Register a marketplace advisor without the web app (same code path as POST /api/arena/advisors).
 *   pnpm tsx --env-file=.env.local scripts/register-advisor.ts '<json>'
 * Example JSON: {"name":"Crowd Plus","pitch":"...","endpointUrl":"https://...","payoutAddress":"0x...","priceUsd":0.01}
 */
import { join } from 'node:path';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { registerAdvisor } from '../src/arena/external';
import { getDb } from '../src/db/client';

const db = getDb();
await migrate(db, { migrationsFolder: join(process.cwd(), 'drizzle') });
console.log(await registerAdvisor(db, JSON.parse(process.argv[2])));
