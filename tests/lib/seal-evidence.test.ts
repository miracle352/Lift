import { describe, expect, it, vi } from 'vitest';
import { blobIdFromU256 } from '@/core';
import { captureSealEvidence, locateBlobObject, type SuiCoreLike } from '@/lib/seal-evidence';
import { loadFixture } from '../helpers/fixtures';
import { sampleBlind } from '../helpers/sample-forecast';

const OWNER = '0x7643a4bf08bb984e9c7cf7a2157c7b87d206dccfd9c899f0205e5d77ff8fd451';
const ACCOUNT = '0x49cb5c5550e8f69445a4af7ec37f2088b54ed8ce10667dc0fa03c2f503ca2cb5';
type Page = { objects: Array<{ objectId: string; previousTransaction: string; json: { blob_id: string } }>; cursor: string | null; hasNextPage: boolean };

function fakeClient(pages: Page[], tx: unknown = null, obj: unknown = null): SuiCoreLike & { calls: number } {
  let i = 0;
  const c = {
    calls: 0,
    core: {
      listOwnedObjects: vi.fn(async () => {
        c.calls++;
        return pages[i++] ?? { objects: [], cursor: null, hasNextPage: false };
      }),
      getTransaction: vi.fn(async () => tx),
      getObject: vi.fn(async () => obj),
    },
  };
  return c;
}

describe('locateBlobObject', () => {
  const page = loadFixture<Page>('sui/grpc-listOwnedObjects-blobs.json');

  it('finds a Blob object by its Walrus blob id (real recorded page)', async () => {
    const target = page.objects[1];
    const client = fakeClient([page]);
    const found = await locateBlobObject(client, { owner: OWNER, walrusBlobId: blobIdFromU256(target.json.blob_id) });
    expect(found).toMatchObject({ blobObjectId: target.objectId, previousTransaction: target.previousTransaction, endEpoch: 55 });
  });

  it('pages until found and reuses the cache afterwards', async () => {
    const empty: Page = { objects: [], cursor: 'next', hasNextPage: true };
    const client = fakeClient([empty, { ...page, hasNextPage: false }]);
    const cache = new Map();
    const id = blobIdFromU256(page.objects[4].json.blob_id);
    expect((await locateBlobObject(client, { owner: OWNER, walrusBlobId: id, cache }))?.blobObjectId).toBe(page.objects[4].objectId);
    expect(client.calls).toBe(2);
    await locateBlobObject(client, { owner: OWNER, walrusBlobId: id, cache });
    expect(client.calls).toBe(2);
  });

  it('returns null when the blob is not (yet) owned by the account owner', async () => {
    const client = fakeClient([{ ...page, hasNextPage: false }]);
    expect(await locateBlobObject(client, { owner: OWNER, walrusBlobId: blobIdFromU256(1n) })).toBeNull();
  });
});

describe('captureSealEvidence', () => {
  it('locates the blob, fetches its commit tx and verifies the seal', async () => {
    const blob = loadFixture<{ object: { objectId: string; previousTransaction: string; json: { blob_id: string } } }>('sui/grpc-getObject-blob.json');
    const page: Page = { objects: [{ objectId: blob.object.objectId, previousTransaction: blob.object.previousTransaction, json: blob.object.json }], cursor: null, hasNextPage: false };
    const client = fakeClient([page], loadFixture('sui/synthetic-tx-seal.json'), blob);
    const r = await captureSealEvidence(client, { forecast: sampleBlind(), walrusBlobId: blobIdFromU256(blob.object.json.blob_id), owner: OWNER, accountId: ACCOUNT });
    expect(r?.verification.status).toBe('valid');
    expect(client.core.getTransaction).toHaveBeenCalledWith({ digest: '4xK2gvv6Gv3BYcbpDFP15pqMxLNxt3zuKsuamiUq9JBJ', include: { transaction: true, effects: true } });
  });
});
