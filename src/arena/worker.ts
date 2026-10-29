import { and, eq, gte } from 'drizzle-orm';
import { arenaRounds } from '@/db/schema';
import type { ArenaDeps } from './deps';
import { roundIdFor } from './deps';
import { nextCloseAfter } from './fast-markets';
import { lockRound } from './lock';
import { flushMemoryOutbox } from './memory';
import { advanceBatches } from './sealer';
import { settleDue } from './settle';
import { sendDuePayouts } from './pay/payouts';

/**
 * One worker tick (run every ~20 s by scripts/arena-worker.ts):
 *  - lock the current round when its lock time has come (once; a missed lock is skipped, never back-filled)
 *  - push batch seals forward (relayer → Walrus → Sui evidence)
 *  - settle closed markets, write episode/lesson memories
 * Every step catches its own errors so one outage never stops the others.
 */
export async function tick(deps: ArenaDeps): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  const now = deps.now();
  const close = nextCloseAfter(now, 15);
  const lockAt = close - 15 * 60_000 + deps.config.lockMinute * 60_000;
  const onCadence = Math.floor(close / 60_000) % deps.config.cadenceMin === 0;
  // lock window: from lockAt until 2 minutes later (late starts are skipped to keep the timing honest)
  if (onCadence && now >= lockAt && now < lockAt + 2 * 60_000) {
    const [exists] = await deps.db.select({ id: arenaRounds.id }).from(arenaRounds).where(eq(arenaRounds.id, roundIdFor(close)));
    if (!exists) out.lock = await step(deps, 'lock', () => lockRound(deps, close));
  }
  out.batches = await step(deps, 'batches', () => advanceBatches(deps));
  out.settle = await step(deps, 'settle', () => settleDue(deps));
  out.memory = await step(deps, 'memory', () => flushMemoryOutbox(deps));
  if (deps.pay) out.payouts = await step(deps, 'payouts', () => sendDuePayouts(deps));
  return out;
}

async function step<T>(deps: ArenaDeps, name: string, fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (err) {
    deps.log(`${name} failed`, { err: String((err as Error).stack ?? err).slice(0, 800) });
    return { error: String((err as Error).message ?? err) };
  }
}

/** Rounds locked in the last `hours` (for health output). */
export async function recentRounds(deps: ArenaDeps, hours = 6) {
  return deps.db.select().from(arenaRounds).where(and(gte(arenaRounds.closeTime, new Date(deps.now() - hours * 3600_000))));
}
