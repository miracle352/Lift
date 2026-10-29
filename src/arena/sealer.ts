import { and, asc, eq, inArray, lte, or, isNull } from 'drizzle-orm';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import { verifyBatchSeal, type BatchPhase } from '@/core/batch';
import { WALRUS_MAINNET } from '@/core/constants';
import { ForecastV1 } from '@/core/forecast';
import { buildProofs } from '@/core/merkle';
import { u256FromBlobId } from '@/core/walrus-ids';
import { arenaBatches, arenaEvents, arenaForecasts, arenaMarkets, arenaTakes, blobLocator } from '@/db/schema';
import { withSuiRetry } from '@/lib/sui';
import type { ArenaDeps } from './deps';

/**
 * Batch seal lifecycle: queued → submitted (relayer job) → stored (Walrus blob id) → on_chain (commit tx found
 * and checked) → verified. Every step is idempotent and retried with backoff from the worker loop.
 */

const backoff = (attempts: number) => Math.min(10 * 60_000, 15_000 * 2 ** attempts);

export async function submitBatch(deps: ArenaDeps, batchId: string): Promise<void> {
  const [b] = await deps.db.select().from(arenaBatches).where(eq(arenaBatches.id, batchId));
  if (!b || b.status !== 'queued') return;
  try {
    // idempotencyKey: re-submitting the same root never creates a second memory
    const res = await deps.mem.remember(b.manifestJson, b.id, { idempotencyKey: `batch:${b.root}` });
    await deps.db.update(arenaBatches).set({ status: 'submitted', jobId: res.job_id, attempts: b.attempts + 1, updatedAt: new Date(deps.now()) }).where(eq(arenaBatches.id, b.id));
    await event(deps, b.roundId, 'batch_submitted', { phase: b.phase, root: b.root, leaves: b.leafCount, namespace: b.id });
  } catch (err) {
    await deps.db
      .update(arenaBatches)
      .set({ attempts: b.attempts + 1, error: String((err as Error).message ?? err).slice(0, 500), nextAttemptAt: new Date(deps.now() + backoff(b.attempts)), updatedAt: new Date(deps.now()) })
      .where(eq(arenaBatches.id, b.id));
    deps.log('batch submit failed', { batchId, err: String(err) });
  }
}

/** Advances every unfinished batch one step. Returns how many changed state. */
export async function advanceBatches(deps: ArenaDeps): Promise<number> {
  const now = new Date(deps.now());
  const rows = await deps.db
    .select()
    .from(arenaBatches)
    .where(and(inArray(arenaBatches.status, ['queued', 'submitted', 'stored']), or(isNull(arenaBatches.nextAttemptAt), lte(arenaBatches.nextAttemptAt, now))))
    .orderBy(asc(arenaBatches.createdAt));
  let changed = 0;
  const phaseOrder: Record<BatchPhase, number> = { blind: 0, take: 1, informed: 2 };
  rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || phaseOrder[a.phase] - phaseOrder[b.phase]);

  for (const b of rows.filter((r) => r.status === 'queued')) {
    await submitBatch(deps, b.id);
    changed++;
  }
  for (const b of rows.filter((r) => r.status === 'submitted' && r.jobId)) {
    const st = await deps.mem.getRememberStatus(b.jobId!).catch(() => null);
    if (st?.status === 'done' && st.blob_id) {
      await deps.db.update(arenaBatches).set({ status: 'stored', walrusBlobId: st.blob_id, updatedAt: now }).where(eq(arenaBatches.id, b.id));
      changed++;
    } else if (st?.status === 'failed' || st?.status === 'not_found') {
      await deps.db.update(arenaBatches).set({ status: 'queued', jobId: null, error: st.error ?? st.status, nextAttemptAt: new Date(deps.now() + backoff(b.attempts)), updatedAt: now }).where(eq(arenaBatches.id, b.id));
    }
  }
  const stored = (await deps.db.select().from(arenaBatches).where(eq(arenaBatches.status, 'stored'))).sort((a, b) => phaseOrder[a.phase] - phaseOrder[b.phase]);
  if (stored.length) changed += await captureEvidence(deps, stored);
  return changed;
}

/** Finds the Sui Blob objects for stored batches (one owner scan for all of them), then verifies the commits. */
async function captureEvidence(deps: ArenaDeps, rows: (typeof arenaBatches.$inferSelect)[]): Promise<number> {
  const targets = new Map(rows.map((r) => [u256FromBlobId(r.walrusBlobId!), r]));
  const cached = await deps.db.select().from(blobLocator).where(inArray(blobLocator.blobIdU256, [...targets.keys()]));
  const found = new Map(cached.map((c) => [c.blobIdU256, c]));
  if (found.size < targets.size) {
    let cursor: string | null = null;
    for (let page = 0; page < 40; page++) {
      const res = await withSuiRetry(() =>
        deps.sui.core.listOwnedObjects({ owner: normalizeSuiAddress(deps.config.memwalOwner), type: WALRUS_MAINNET.blobType, limit: 500, cursor, include: { json: true, previousTransaction: true } }),
      );
      for (const o of res.objects) {
        const json = (o.json ?? {}) as { blob_id?: string; storage?: { end_epoch?: number | string } };
        if (!json.blob_id) continue;
        const row = { blobIdU256: String(json.blob_id), blobObjectId: normalizeSuiAddress(o.objectId), previousTransaction: o.previousTransaction ?? null, endEpoch: json.storage?.end_epoch == null ? null : Number(json.storage.end_epoch) };
        await deps.db.insert(blobLocator).values(row).onConflictDoUpdate({ target: blobLocator.blobIdU256, set: { previousTransaction: row.previousTransaction, endEpoch: row.endEpoch } });
        if (targets.has(row.blobIdU256)) found.set(row.blobIdU256, { ...row, seenAt: new Date() });
      }
      if (!res.hasNextPage || !res.cursor || found.size === targets.size) break;
      cursor = res.cursor;
    }
  }
  let changed = 0;
  for (const [u256, b] of targets) {
    const loc = found.get(u256);
    if (!loc?.previousTransaction) {
      await deps.db.update(arenaBatches).set({ attempts: b.attempts + 1, nextAttemptAt: new Date(deps.now() + backoff(Math.min(b.attempts, 3))) }).where(eq(arenaBatches.id, b.id));
      continue;
    }
    const v = await verifyBatchCommit(deps, b, loc.previousTransaction, loc.blobObjectId);
    await deps.db
      .update(arenaBatches)
      .set({
        status: v.status === 'invalid' ? 'failed' : 'verified',
        blobObjectId: loc.blobObjectId,
        commitDigest: v.commit.digest,
        commitTimestampMs: v.commit.timestampMs,
        checkpoint: v.commit.checkpoint,
        verificationJson: JSON.stringify(v),
        error: v.status === 'invalid' ? 'verification failed' : null,
        updatedAt: new Date(deps.now()),
      })
      .where(eq(arenaBatches.id, b.id));
    await event(deps, b.roundId, 'batch_on_sui', { phase: b.phase, digest: v.commit.digest, status: v.status, checkpoint: v.commit.checkpoint });
    changed++;
  }
  return changed;
}

/** Verifies a batch commit by checking one real member forecast end-to-end (hash → Merkle path → Sui tx). */
export async function verifyBatchCommit(deps: ArenaDeps, b: typeof arenaBatches.$inferSelect, digest: string, blobObjectId: string) {
  const member = await sampleMember(deps, b);
  const commitTx = await withSuiRetry(() => deps.sui.core.getTransaction({ digest, include: { transaction: true, effects: true } }));
  const blobObject = await withSuiRetry(() => deps.sui.core.getObject({ objectId: blobObjectId, include: { json: true, previousTransaction: true } }));
  const manifest = JSON.parse(b.manifestJson) as { leaves: string[] };
  const proof = buildProofs(manifest.leaves).proofs.get(member.hash)!;
  let blindCommitTimestampMs: number | undefined;
  if (b.phase === 'informed') {
    const [blind] = await deps.db.select().from(arenaBatches).where(and(eq(arenaBatches.roundId, b.roundId), eq(arenaBatches.phase, 'blind')));
    blindCommitTimestampMs = blind?.commitTimestampMs ?? undefined;
  }
  return verifyBatchSeal({
    blindCommitTimestampMs,
    forecast: member.forecast,
    roundId: b.roundId,
    phase: b.phase,
    steps: proof.steps,
    root: b.root,
    commitTx,
    blobObject,
    expectedAccountId: deps.config.memwalAccountId,
    expectedOwner: deps.config.memwalOwner,
  });
}

async function sampleMember(deps: ArenaDeps, b: typeof arenaBatches.$inferSelect): Promise<{ hash: string; forecast: ForecastV1 }> {
  if (b.phase === 'take') {
    const [t] = await deps.db
      .select({ hash: arenaTakes.hash, json: arenaTakes.forecastJson })
      .from(arenaTakes)
      .innerJoin(arenaMarkets, eq(arenaMarkets.id, arenaTakes.marketId))
      .where(eq(arenaMarkets.roundId, b.roundId))
      .limit(1);
    return { hash: t.hash, forecast: ForecastV1.parse(JSON.parse(t.json)) };
  }
  const [f] = await deps.db.select().from(arenaForecasts).where(eq(arenaForecasts.batchId, b.id)).limit(1);
  return { hash: f.hash, forecast: ForecastV1.parse(JSON.parse(f.forecastJson)) };
}

export async function event(deps: ArenaDeps, roundId: string | null, type: string, payload: Record<string, unknown>, who: { agentId?: string; advisorId?: string } = {}) {
  await deps.db.insert(arenaEvents).values({ roundId, type, agentId: who.agentId ?? null, advisorId: who.advisorId ?? null, payloadJson: JSON.stringify(payload) });
}
