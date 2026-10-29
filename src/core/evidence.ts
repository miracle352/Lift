import { bcs } from '@mysten/sui/bcs';
import { fromBase64, normalizeSuiAddress } from '@mysten/sui/utils';
import { MEMWAL_LABEL } from './constants';
import type { ForecastV1 } from './forecast';
import { forecastHash } from './forecast';
import { marketTag, parseSealNamespace, sealNamespaceFor, userTag } from './namespace';

/**
 * Verifies a sealed forecast against Sui history (docs/PROOF.md).
 *
 * Inputs are the "core API" shapes returned by @mysten/sui clients
 * (`client.core.getTransaction(...)`, `client.core.getObject(...)`), so the same code
 * works with Tatum's gRPC gateway, a JSON-RPC client, or recorded fixtures.
 *
 * Key rule: Blob attributes can be changed later by the blob's owner, so the namespace is
 * read from the INPUTS of the transaction that wrote it (immutable history), never from the
 * Blob object's current state.
 */

// ---------- minimal structural types for the core API (only the fields we read) ----------

type Arg = { $kind: string; Input?: number };
type Command =
  | { $kind: 'MoveCall'; MoveCall: { package: string; module: string; function: string; arguments: Arg[] } }
  | { $kind: 'TransferObjects'; TransferObjects: { objects: Arg[]; address: Arg } }
  | { $kind: string; [key: string]: unknown };
type Input =
  | { $kind: 'Pure'; Pure: { bytes: string | Uint8Array } }
  | { $kind: 'Object'; Object: { $kind: string; [key: string]: unknown } }
  | { $kind: string; [key: string]: unknown };

export interface CoreTransaction {
  digest: string;
  timestampMs?: number | string | null;
  checkpoint?: string | number | null;
  status?: { success: boolean; error?: unknown } | null;
  transaction?: { inputs: Input[]; commands: Command[] } | null;
}

export interface CoreObject {
  objectId: string;
  previousTransaction?: string | null;
  owner?: unknown;
  json?: { storage?: { end_epoch?: number | string } } & Record<string, unknown>;
}

/** Accepts either `{ $kind: 'Transaction', Transaction: {...} }` (getTransaction result) or the inner object. */
export function unwrapTransaction(result: unknown): CoreTransaction {
  const r = result as { $kind?: string; Transaction?: CoreTransaction; FailedTransaction?: CoreTransaction };
  if (r?.Transaction) return r.Transaction;
  if (r?.FailedTransaction) return r.FailedTransaction;
  return result as CoreTransaction;
}

/** Accepts either `{ object: {...} }` (getObject result) or the inner object. */
export function unwrapObject(result: unknown): CoreObject {
  const r = result as { object?: CoreObject };
  return r?.object ?? (result as CoreObject);
}

// ---------- parsing ----------

export interface MemoryWrite {
  blobObjectId: string;
  /** key -> value pairs written by insert_or_update_metadata_pair in THIS transaction */
  labels: Record<string, string>;
  /** account object passed to the seal_encrypt_fence call that precedes this blob's labels, if any */
  accountId: string | null;
  /** address the blob was transferred to in this transaction, if any */
  transferredTo: string | null;
}

function pureBytes(input: Input | undefined): Uint8Array | null {
  if (!input || input.$kind !== 'Pure') return null;
  const raw = (input as { Pure: { bytes: string | Uint8Array } }).Pure.bytes;
  return typeof raw === 'string' ? fromBase64(raw) : raw;
}

function objectIdOf(input: Input | undefined): string | null {
  if (!input || input.$kind !== 'Object') return null;
  const obj = (input as { Object: Record<string, unknown> }).Object;
  const inner = obj[obj.$kind as string] as { objectId?: string } | undefined;
  return inner?.objectId ? normalizeSuiAddress(inner.objectId) : null;
}

function inputAt(tx: CoreTransaction, arg: Arg | undefined): Input | undefined {
  if (!arg || arg.$kind !== 'Input' || arg.Input === undefined) return undefined;
  return tx.transaction?.inputs[arg.Input];
}

/**
 * Lists every Walrus Memory write in a transaction, grouped per Blob object.
 * Handles relayer batching (several blobs, possibly several accounts, in one PTB):
 * a seal_encrypt_fence call applies to the blob whose labels follow it.
 */
export function extractMemoryWrites(txResult: unknown): MemoryWrite[] {
  const tx = unwrapTransaction(txResult);
  const writes = new Map<string, MemoryWrite>();
  let pendingAccount: string | null = null;
  for (const cmd of tx.transaction?.commands ?? []) {
    if (cmd.$kind === 'MoveCall') {
      const call = (cmd as Extract<Command, { $kind: 'MoveCall' }>).MoveCall;
      if (call.module === 'account' && call.function === 'seal_encrypt_fence') {
        pendingAccount = objectIdOf(inputAt(tx, call.arguments[2]));
      } else if (call.module === 'blob' && call.function === 'insert_or_update_metadata_pair') {
        const blobId = objectIdOf(inputAt(tx, call.arguments[0]));
        const key = pureBytes(inputAt(tx, call.arguments[1]));
        const value = pureBytes(inputAt(tx, call.arguments[2]));
        if (!blobId || !key || !value) continue;
        let w = writes.get(blobId);
        if (!w) {
          w = { blobObjectId: blobId, labels: {}, accountId: pendingAccount, transferredTo: null };
          writes.set(blobId, w);
          pendingAccount = null;
        }
        w.labels[bcs.string().parse(key)] = bcs.string().parse(value);
      }
    } else if (cmd.$kind === 'TransferObjects') {
      const t = (cmd as Extract<Command, { $kind: 'TransferObjects' }>).TransferObjects;
      const toBytes = pureBytes(inputAt(tx, t.address));
      const to = toBytes ? normalizeSuiAddress(bcs.Address.parse(toBytes)) : null;
      for (const o of t.objects) {
        const id = objectIdOf(inputAt(tx, o));
        const w = id ? writes.get(id) : undefined;
        if (w) w.transferredTo = to;
      }
    }
  }
  return [...writes.values()];
}

// ---------- verification ----------

export type CheckId =
  | 'hash'
  | 'tags'
  | 'label_in_tx'
  | 'tx_success'
  | 'account'
  | 'owner'
  | 'before_close'
  | 'untouched'
  | 'alive'
  | 'after_blind';

export interface Check {
  id: CheckId;
  /** true = passed, false = failed, null = could not be evaluated (missing input) */
  ok: boolean | null;
  /** hard checks make the seal invalid when they fail; notes only add context */
  severity: 'hard' | 'timing' | 'note';
  detail: string;
}

export type SealStatus = 'valid' | 'valid_with_notes' | 'late' | 'invalid';

export interface SealVerification {
  status: SealStatus;
  hash: string;
  namespace: string;
  commit: { digest: string; timestampMs: number | null; checkpoint: string | null; blobObjectId: string | null };
  checks: Check[];
}

export interface VerifySealInput {
  /** The revealed forecast JSON. */
  forecast: ForecastV1;
  /** Result of core.getTransaction for the commit tx (include: { transaction: true }). */
  commitTx: unknown;
  /** Optional: result of core.getObject for the Blob (include: { json: true, previousTransaction: true }). */
  blobObject?: unknown;
  /** The app's Walrus Memory account object id; when set, the fence must reference it. */
  expectedAccountId?: string;
  /** The account owner's address; when set, memwal_owner and the transfer recipient must match it. */
  expectedOwner?: string;
  /** Authoritative market close time (from Tatum). Falls back to forecast.market.closeTime. */
  closeTime?: string;
  /** Current Walrus epoch, to report whether the blob is still stored. */
  currentWalrusEpoch?: number;
  /** For informed seals: chain time of the referenced blind seal. */
  blindCommitTimestampMs?: number;
}

const toNumber = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));

export function verifySeal(input: VerifySealInput): SealVerification {
  const { forecast } = input;
  const tx = unwrapTransaction(input.commitTx);
  const checks: Check[] = [];
  const add = (id: CheckId, ok: boolean | null, severity: Check['severity'], detail: string) => checks.push({ id, ok, severity, detail });

  const hash = forecastHash(forecast);
  const namespace = sealNamespaceFor(forecast);
  const parsed = parseSealNamespace(namespace);
  add('hash', parsed?.hash === hash, 'hard', `sha256(JCS(forecast)) = ${hash}`);
  add(
    'tags',
    parsed?.userTag === userTag(forecast.user) && parsed?.marketTag === marketTag(forecast.market.platform, forecast.market.id),
    'hard',
    'namespace tags match the revealed user and market',
  );

  const write = extractMemoryWrites(tx).find((w) => w.labels[MEMWAL_LABEL.namespace] === namespace) ?? null;
  add('label_in_tx', write !== null, 'hard', write ? `tx ${tx.digest} labelled blob ${write.blobObjectId} with this namespace` : `tx ${tx.digest} does not write this namespace`);
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
  const closeIso = input.closeTime ?? forecast.market.closeTime;
  const closeMs = Date.parse(closeIso);
  add('before_close', ts === null ? null : ts < closeMs, 'timing', ts === null ? 'commit time unknown' : `committed ${new Date(ts).toISOString()} vs close ${new Date(closeMs).toISOString()}`);

  if (forecast.kind === 'informed') {
    const b = input.blindCommitTimestampMs;
    add('after_blind', b === undefined || ts === null ? null : b <= ts, 'note', b === undefined ? 'blind seal time not provided' : `blind committed ${new Date(b).toISOString()}`);
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
    namespace,
    commit: { digest: tx.digest, timestampMs: ts, checkpoint: tx.checkpoint == null ? null : String(tx.checkpoint), blobObjectId: write?.blobObjectId ?? null },
    checks,
  };
}
