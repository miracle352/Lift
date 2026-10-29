import { join } from 'node:path';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { getDb } from '@/db/client';
import { getMemWal } from '@/lib/memwal';
import { getSuiClient } from '@/lib/sui';
import { requireEnv } from '@/lib/env';
import { budgetedTatum } from './budget';
import { DEFAULT_ASSETS, type ArenaDeps } from './deps';
import { isAssetKey } from './fast-markets';
import { payConfigFromEnv } from './pay/wallets';

/** Real dependencies from the environment (worker + API routes). */
export async function liveArenaDeps(opts: { migrate?: boolean } = {}): Promise<ArenaDeps> {
  const db = getDb();
  if (opts.migrate) await migrate(db, { migrationsFolder: join(process.cwd(), 'drizzle') });
  const assets = (process.env.ARENA_ASSETS ?? DEFAULT_ASSETS.join(',')).split(',').map((s) => s.trim()).filter(isAssetKey);
  return {
    db,
    tatum: budgetedTatum(db, { apiKey: requireEnv('TATUM_API_KEY'), dailyCap: Number(process.env.TATUM_DAILY_CREDIT_CAP ?? 7000) }),
    mem: getMemWal(),
    sui: getSuiClient(),
    fetch,
    now: Date.now,
    config: {
      assets,
      cadenceMin: Number(process.env.ARENA_CADENCE_MIN ?? 60),
      lockMinute: Number(process.env.ARENA_LOCK_MINUTE ?? 6),
      memwalAccountId: requireEnv('MEMWAL_ACCOUNT_ID'),
      memwalOwner: requireEnv('MEMWAL_OWNER_ADDRESS'),
    },
    log: (msg, extra) => console.log(new Date().toISOString(), msg, extra ? JSON.stringify(extra) : ''),
    pay: (() => {
      const cfg = payConfigFromEnv();
      if (!cfg || process.env.ARENA_PAYMENTS === '0') return undefined;
      return { cfg, baseUrl: process.env.ARENA_TAKES_URL ?? `http://127.0.0.1:${process.env.ARENA_PAY_PORT ?? 8787}` };
    })(),
  };
}
