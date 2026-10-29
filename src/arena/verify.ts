import { verifyBatchSeal, type BatchPhase } from '@/core/batch';
import { ForecastV1 } from '@/core/forecast';
import type { Db } from '@/db/client';
import type { SuiCoreLike } from '@/lib/seal-evidence';
import { withSuiRetry } from '@/lib/sui';
import { receipt } from './queries';

/**
 * Live verification of one revealed forecast against Sui mainnet (through Tatum's gRPC gateway):
 * recompute its hash, walk its Merkle path to the root, and check that the root's namespace was written
 * by the arena's Walrus Memory account in a successful transaction before the market closed.
 * It reads the chain fresh every time — nothing from our database is trusted except where to look.
 */
export async function liveVerify(db: Db, sui: SuiCoreLike, hash: string, opts: { accountId: string; owner: string; nowMs?: number; tamper?: Record<string, unknown> }) {
  const r = await receipt(db, hash, opts.nowMs);
  if (!r) return { error: 'not found' as const };
  if (!r.revealed || !r.forecast) return { error: 'not revealed yet' as const, closeTime: r.market.closeTime };
  if (!r.batch?.digest || !r.proof) return { error: 'seal not on chain yet' as const };
  const forecast = ForecastV1.parse({ ...r.forecast, ...(opts.tamper ?? {}) });
  const commitTx = await withSuiRetry(() => sui.core.getTransaction({ digest: r.batch!.digest!, include: { transaction: true, effects: true } }));
  let blindCommitTimestampMs: number | undefined;
  if (r.kind === 'informed') {
    const blindHash = forecast.prev;
    const b = blindHash ? await receipt(db, blindHash, opts.nowMs) : null;
    const v = b?.batch?.verification as { commit?: { timestampMs?: number } } | null;
    blindCommitTimestampMs = v?.commit?.timestampMs ?? undefined;
  }
  const verification = verifyBatchSeal({
    forecast,
    roundId: r.roundId,
    phase: r.kind as BatchPhase,
    steps: r.proof.steps,
    root: r.batch.root,
    commitTx,
    expectedAccountId: opts.accountId,
    expectedOwner: opts.owner,
    closeTime: r.market.closeTime,
    blindCommitTimestampMs,
  });
  return { receipt: { ...r, forecast }, verification, tampered: !!opts.tamper };
}
