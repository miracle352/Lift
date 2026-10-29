import { normalizeSuiAddress } from '@mysten/sui/utils';
import { z } from 'zod';
import { MEMWAL_LABEL } from './constants';
import { extractMemoryWrites, unwrapObject, unwrapTransaction, type Check, type CheckId, type SealStatus } from './evidence';
import { forecastHash, type ForecastV1 } from './forecast';
import { sha256Hex } from './hash';
import { buildProofs, rootFromProof, type InclusionProof, type ProofStep } from './merkle';

/**
 * Batch seals (docs/PROOF.md, "Batch seals").
 *
 * An arena round produces many forecasts at once (every agent, every market). Instead of one Walrus
 * Memory write per forecast, the round seals the Merkle root of all their hashes in ONE write:
 *
 *   namespace = rcptb1:<roundTag>:<phaseChar>:<merkleRoot>
 *
 * roundTag  = first 12 hex of sha256("receipts:round:" + roundId)
 * phaseChar = b (blind calls) | i (informed calls) | t (advisor takes)
 *
 * Anyone holding a revealed forecast + its inclusion proof can recompute the leaf (forecastHash),
 * the root (Merkle path), and check that the root was written on Sui before the market closed —
 * exactly like a single seal, with one extra "inclusion" check.
 */

export const BATCH_SCHEMA = 'receipts.batch.v1';
export const BATCH_PREFIX = 'rcptb1';

export const BatchPhase = z.enum(['blind', 'informed', 'take']);
export type BatchPhase = z.infer<typeof BatchPhase>;
const PHASE_CHAR: Record<BatchPhase, string> = { blind: 'b', informed: 'i', take: 't' };
const CHAR_PHASE: Record<string, BatchPhase> = { b: 'blind', i: 'informed', t: 'take' };

export function roundTag(roundId: string): string {
  return sha256Hex(`receipts:round:${roundId}`).slice(0, 12);
}

export function batchNamespace(roundId: string, phase: BatchPhase, root: string): string {
  return [BATCH_PREFIX, roundTag(roundId), PHASE_CHAR[phase], root].join(':');
}

export function parseBatchNamespace(ns: string): { roundTag: string; phase: BatchPhase; root: string } | null {
  const m = /^rcptb1:([0-9a-f]{12}):([bit]):([0-9a-f]{64})$/.exec(ns);
  return m ? { roundTag: m[1], phase: CHAR_PHASE[m[2]], root: m[3] } : null;
}

/** What gets written as the memory text: enough for anyone with the decrypting key to re-derive the tree. */
export const BatchManifestV1 = z
  .object({
    schema: z.literal(BATCH_SCHEMA),
    roundId: z.string().min(1).max(128),
    phase: BatchPhase,
    root: z.string().regex(/^[0-9a-f]{64}$/),
    leaves: z.array(z.string().regex(/^[0-9a-f]{64}$/)).min(1),
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type BatchManifestV1 = z.infer<typeof BatchManifestV1>;

export interface BuiltBatch {
  roundId: string;
  phase: BatchPhase;
  root: string;
  namespace: string;
  manifest: BatchManifestV1;
  proofs: Map<string, InclusionProof>;
}

/** Builds the batch for a set of forecasts (leaf = forecastHash). */
export function buildBatch(args: { roundId: string; phase: BatchPhase; forecasts: ForecastV1[]; createdAt?: string }): BuiltBatch {
  const hashes = args.forecasts.map((f) => forecastHash(f));
  const { root, leaves, proofs } = buildProofs(hashes);
  const manifest = BatchManifestV1.parse({
    schema: BATCH_SCHEMA,
    roundId: args.roundId,
    phase: args.phase,
    root,
    leaves,
    createdAt: args.createdAt ?? new Date().toISOString(),
  });
  return { roundId: args.roundId, phase: args.phase, root, namespace: batchNamespace(args.roundId, args.phase, root), manifest, proofs };
}

/** Self-contained receipt for one forecast inside a batch: what /api/receipts returns after reveal. */
export interface BatchReceipt {
  forecast: ForecastV1;
  roundId: string;
  phase: BatchPhase;
  proof: { root: string; steps: ProofStep[]; index: number; leafCount: number };
  commit: { digest: string; blobObjectId?: string | null };
}

export type BatchCheckId = CheckId | 'inclusion';
export interface BatchCheck extends Omit<Check, 'id'> {
  id: BatchCheckId;
}

export interface BatchVerification {
  status: SealStatus;
  hash: string;
  root: string;
  namespace: string;
  commit: { digest: string; timestampMs: number | null; checkpoint: string | null; blobObjectId: string | null };
  checks: BatchCheck[];
}

export interface VerifyBatchInput {
  forecast: ForecastV1;
  roundId: string;
  phase: BatchPhase;
  steps: ProofStep[];
  /** The root the receipt claims; must equal the recomputed one. */
  root: string;
  commitTx: unknown;
  blobObject?: unknown;
  expectedAccountId?: string;
  expectedOwner?: string;
  closeTime?: string;
  currentWalrusEpoch?: number;
  /** For informed batches: chain time of the round's blind batch. */
  blindCommitTimestampMs?: number;
}

const toNumber = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));

export function verifyBatchSeal(input: VerifyBatchInput): BatchVerification {
  const tx = unwrapTransaction(input.commitTx);
  const checks: BatchCheck[] = [];
  const add = (id: BatchCheckId, ok: boolean | null, severity: Check['severity'], detail: string) => checks.push({ id, ok, severity, detail });

  const hash = forecastHash(input.forecast);
  let recomputed: string | null = null;
  try {
    recomputed = rootFromProof(hash, input.steps);
  } catch {
    recomputed = null;
  }
  const kindOk = input.phase === 'take' ? input.forecast.kind === 'take' : input.forecast.kind === input.phase;
  add('hash', kindOk, 'hard', `sha256(JCS(forecast)) = ${hash}; kind ${input.forecast.kind} in a ${input.phase} batch`);
  add('inclusion', recomputed !== null && recomputed === input.root.toLowerCase(), 'hard', `Merkle path from this forecast gives root ${recomputed ?? 'n/a'}`);

  const namespace = batchNamespace(input.roundId, input.phase, input.root.toLowerCase());
  add('tags', parseBatchNamespace(namespace)?.roundTag === roundTag(input.roundId), 'hard', `round ${input.roundId}`);

  const write = extractMemoryWrites(tx).find((w) => w.labels[MEMWAL_LABEL.namespace] === namespace) ?? null;
  add('label_in_tx', write !== null, 'hard', write ? `tx ${tx.digest} labelled blob ${write.blobObjectId} with ${namespace}` : `tx ${tx.digest} does not write ${namespace}`);
  add('tx_success', tx.status ? tx.status.success === true : null, 'hard', tx.status?.success ? 'transaction succeeded' : 'transaction status missing or failed');

  if (input.expectedAccountId) {
    const ok = write ? write.accountId === normalizeSuiAddress(input.expectedAccountId) : false;
    add('account', ok, 'hard', `seal fence account = ${write?.accountId ?? 'none'}`);
  }
  if (input.expectedOwner) {
    const owner = normalizeSuiAddress(input.expectedOwner);
    const labelled = write?.labels[MEMWAL_LABEL.owner];
    const ok = !!write && labelled !== undefined && normalizeSuiAddress(labelled) === owner && (write.transferredTo === null || write.transferredTo === owner);
    add('owner', ok, 'hard', `memwal_owner = ${labelled ?? 'none'}, transferred to ${write?.transferredTo ?? 'n/a'}`);
  }

  const ts = toNumber(tx.timestampMs);
  const closeMs = Date.parse(input.closeTime ?? input.forecast.market.closeTime);
  add('before_close', ts === null ? null : ts < closeMs, 'timing', ts === null ? 'commit time unknown' : `committed ${new Date(ts).toISOString()} vs close ${new Date(closeMs).toISOString()}`);

  if (input.phase === 'informed') {
    const b = input.blindCommitTimestampMs;
    add('after_blind', b === undefined || ts === null ? null : b <= ts, 'note', b === undefined ? 'blind batch time not provided' : `blind batch committed ${new Date(b).toISOString()}`);
  }

  if (input.blobObject !== undefined) {
    const obj = unwrapObject(input.blobObject);
    const sameBlob = write ? normalizeSuiAddress(obj.objectId) === write.blobObjectId : false;
    add('untouched', sameBlob ? obj.previousTransaction === tx.digest : null, 'note', sameBlob ? `blob last modified by ${obj.previousTransaction}` : 'blob object does not match the write');
    if (input.currentWalrusEpoch !== undefined) {
      const end = toNumber(obj.json?.storage?.end_epoch);
      add('alive', end === null ? null : end > input.currentWalrusEpoch, 'note', `stored until Walrus epoch ${end ?? '?'} (now ${input.currentWalrusEpoch})`);
    }
  }

  const hardFail = checks.some((c) => c.severity === 'hard' && c.ok !== true);
  const late = checks.some((c) => c.id === 'before_close' && c.ok === false);
  const notes = checks.some((c) => c.severity !== 'hard' && c.ok !== true);
  const status: SealStatus = hardFail ? 'invalid' : late ? 'late' : notes ? 'valid_with_notes' : 'valid';
  return {
    status,
    hash,
    root: input.root.toLowerCase(),
    namespace,
    commit: { digest: tx.digest, timestampMs: ts, checkpoint: tx.checkpoint == null ? null : String(tx.checkpoint), blobObjectId: write?.blobObjectId ?? null },
    checks,
  };
}
