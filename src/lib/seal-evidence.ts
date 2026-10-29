import { normalizeSuiAddress } from '@mysten/sui/utils';
import { WALRUS_MAINNET } from '@/core/constants';
import type { ForecastV1 } from '@/core/forecast';
import { verifySeal, type SealVerification } from '@/core/evidence';
import { u256FromBlobId } from '@/core/walrus-ids';

/**
 * Turning a Walrus Memory write into on-chain evidence (docs/PROOF.md, "Capturing evidence").
 *
 * rememberAndWait() returns only the Walrus blob id. The Sui side is found like this:
 *  1. scan the account owner's Blob objects (listOwnedObjects is ordered by object id, not time,
 *     so we page until the blob id matches; callers pass a cache to skip known objects)
 *  2. the Blob's previousTransaction is the relayer's "set metadata + transfer" tx — the commit tx —
 *     as long as nothing touched the blob since. Capture it immediately after the write and store it.
 *  3. fetch that tx and run verifySeal against it.
 */

/** The subset of the @mysten/sui core client we use (SuiGrpcClient satisfies it). */
export interface SuiCoreLike {
  core: {
    listOwnedObjects(opts: { owner: string; type?: string; limit?: number; cursor?: string | null; include?: { json?: boolean; previousTransaction?: boolean } }): Promise<{
      objects: Array<{ objectId: string; previousTransaction?: string | null; json?: unknown }>;
      cursor: string | null;
      hasNextPage: boolean;
    }>;
    getTransaction(opts: { digest: string; include?: { transaction?: boolean; effects?: boolean } }): Promise<unknown>;
    getObject(opts: { objectId: string; include?: { json?: boolean; previousTransaction?: boolean } }): Promise<unknown>;
  };
}

export interface LocatedBlob {
  blobObjectId: string;
  /** Last transaction that modified the Blob object (the commit tx if untouched). */
  previousTransaction: string | null;
  endEpoch: number | null;
}

/** Map of u256 blob id -> located blob; persist it (e.g. in the DB) to avoid rescanning. */
export type BlobLocatorCache = Map<string, LocatedBlob>;

export async function locateBlobObject(
  client: SuiCoreLike,
  args: { owner: string; walrusBlobId: string; cache?: BlobLocatorCache; pageSize?: number; maxPages?: number },
): Promise<LocatedBlob | null> {
  const target = u256FromBlobId(args.walrusBlobId);
  const cache = args.cache ?? new Map<string, LocatedBlob>();
  const hit = cache.get(target);
  if (hit) return hit;
  let cursor: string | null = null;
  for (let page = 0; page < (args.maxPages ?? 50); page++) {
    const res = await client.core.listOwnedObjects({
      owner: normalizeSuiAddress(args.owner),
      type: WALRUS_MAINNET.blobType,
      limit: args.pageSize ?? 500,
      cursor,
      include: { json: true, previousTransaction: true },
    });
    for (const o of res.objects) {
      const json = (o.json ?? {}) as { blob_id?: string; storage?: { end_epoch?: number | string } };
      if (!json.blob_id) continue;
      const located: LocatedBlob = {
        blobObjectId: normalizeSuiAddress(o.objectId),
        previousTransaction: o.previousTransaction ?? null,
        endEpoch: json.storage?.end_epoch == null ? null : Number(json.storage.end_epoch),
      };
      cache.set(String(json.blob_id), located);
    }
    const found = cache.get(target);
    if (found) return found;
    if (!res.hasNextPage || !res.cursor) return null;
    cursor = res.cursor;
  }
  return null;
}

export interface CapturedEvidence {
  located: LocatedBlob;
  verification: SealVerification;
}

/**
 * Run right after rememberAndWait() for a seal. Returns null if the blob is not on chain yet
 * (the relayer finalises asynchronously; retry with backoff for a few minutes).
 */
export async function captureSealEvidence(
  client: SuiCoreLike,
  args: { forecast: ForecastV1; walrusBlobId: string; owner: string; accountId: string; closeTime?: string; cache?: BlobLocatorCache },
): Promise<CapturedEvidence | null> {
  const located = await locateBlobObject(client, { owner: args.owner, walrusBlobId: args.walrusBlobId, cache: args.cache });
  if (!located?.previousTransaction) return null;
  const commitTx = await client.core.getTransaction({ digest: located.previousTransaction, include: { transaction: true, effects: true } });
  const blobObject = await client.core.getObject({ objectId: located.blobObjectId, include: { json: true, previousTransaction: true } });
  const verification = verifySeal({
    forecast: args.forecast,
    commitTx,
    blobObject,
    expectedAccountId: args.accountId,
    expectedOwner: args.owner,
    closeTime: args.closeTime,
  });
  return { located, verification };
}
