import { gte, sql } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { tatumCalls } from '@/db/schema';
import { TatumBudgetError, TatumPrediction, type TatumCallRecord } from './tatum';

/**
 * Tatum credit budget. The free plan is 100k credits for the key's lifetime, so the worker refuses
 * calls past a daily cap (TATUM_DAILY_CREDIT_CAP, default 6000 ≈ 60 calls) and past a lifetime floor.
 */
export async function creditsSince(db: Db, sinceMs: number): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${tatumCalls.credits}), 0)` })
    .from(tatumCalls)
    .where(gte(tatumCalls.at, new Date(sinceMs)));
  return Number(row?.total ?? 0);
}

export const utcMidnight = (nowMs: number) => Math.floor(nowMs / 86_400_000) * 86_400_000;

export function budgetedTatum(db: Db, opts: { apiKey: string; dailyCap: number; now?: () => number; fetch?: typeof fetch }): TatumPrediction {
  const now = opts.now ?? Date.now;
  return new TatumPrediction({
    apiKey: opts.apiKey,
    fetch: opts.fetch,
    beforeCall: async (endpoint, credits) => {
      const spent = await creditsSince(db, utcMidnight(now()));
      if (spent + credits > opts.dailyCap) throw new TatumBudgetError(`Tatum daily credit cap reached (${spent}/${opts.dailyCap}); skipping ${endpoint}`);
    },
    onCall: async (rec: TatumCallRecord) => {
      await db.insert(tatumCalls).values({ endpoint: rec.endpoint, path: rec.path, credits: rec.credits, status: rec.status, ms: rec.ms });
    },
  });
}
