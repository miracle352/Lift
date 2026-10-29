import { describe, expect, it } from 'vitest';
import { extractMemoryWrites, verifySeal } from '@/core';
import { clone, loadFixture } from '../helpers/fixtures';
import { sampleBlind } from '../helpers/sample-forecast';

const ACCOUNT = '0x49cb5c5550e8f69445a4af7ec37f2088b54ed8ce10667dc0fa03c2f503ca2cb5';
const OWNER = '0x7643a4bf08bb984e9c7cf7a2157c7b87d206dccfd9c899f0205e5d77ff8fd451';
const BLOB = '0x37bd39b0ba11aa73fb27f383671b39aff23a114d0666759929e8fb661f2db80e';
const DIGEST = '4xK2gvv6Gv3BYcbpDFP15pqMxLNxt3zuKsuamiUq9JBJ';

describe('extractMemoryWrites (real mainnet tx via Tatum gRPC)', () => {
  it('reads the labels from the transaction inputs, not from current object state', () => {
    const writes = extractMemoryWrites(loadFixture('sui/grpc-getTransaction.json'));
    expect(writes).toHaveLength(1);
    expect(writes[0]).toEqual({
      blobObjectId: BLOB,
      accountId: ACCOUNT,
      transferredTo: OWNER,
      labels: {
        memwal_namespace: 'pb-wallie',
        memwal_owner: OWNER,
        memwal_package_id: '0xe7c16fbea0560e7057e2bf7422feaa4fb313749fc69c9e9092fac7a33b81d7f5',
        memwal_agent_id: '7e84521f69d3918662df4d51d12830dc5188d4540669c8a7acb63626016625c5',
      },
    });
  });

  it('groups labels per blob when the relayer batches several blobs into one transaction', () => {
    const writes = extractMemoryWrites(loadFixture('sui/synthetic-tx-two-blobs.json'));
    expect(writes.map((w) => [w.blobObjectId, w.labels.memwal_namespace, w.accountId, w.transferredTo])).toEqual([
      [BLOB, 'pb-wallie', ACCOUNT, OWNER],
      ['0x' + '22'.repeat(32), 'second-app', '0x' + '33'.repeat(32), '0x' + '44'.repeat(32)],
    ]);
  });
});

describe('verifySeal', () => {
  const sealTx = () => loadFixture('sui/synthetic-tx-seal.json');
  const blobObject = loadFixture('sui/grpc-getObject-blob.json');
  const base = { expectedAccountId: ACCOUNT, expectedOwner: OWNER };

  it('accepts an untampered seal committed before market close', () => {
    const r = verifySeal({ ...base, forecast: sampleBlind(), commitTx: sealTx(), blobObject, currentWalrusEpoch: 43 });
    expect(r.status).toBe('valid');
    expect(r.commit).toEqual({ digest: DIGEST, timestampMs: 1792596631922, checkpoint: '336525848', blobObjectId: BLOB });
    expect(r.checks.every((c) => c.ok === true)).toBe(true);
  });

  it('rejects a revealed forecast that was edited after sealing', () => {
    const r = verifySeal({ ...base, forecast: { ...sampleBlind(), probabilityBps: 7000 }, commitTx: sealTx() });
    expect(r.status).toBe('invalid');
    expect(r.checks.find((c) => c.id === 'label_in_tx')?.ok).toBe(false);
  });

  it('marks a seal committed after the market closed as late', () => {
    const r = verifySeal({ ...base, forecast: sampleBlind(), commitTx: sealTx(), closeTime: '2026-10-21T15:00:00.000Z' });
    expect(r.status).toBe('late');
  });

  it('rejects a seal written through somebody else’s Walrus Memory account', () => {
    const r = verifySeal({ ...base, expectedAccountId: '0x' + '99'.repeat(32), forecast: sampleBlind(), commitTx: sealTx() });
    expect(r.status).toBe('invalid');
    expect(r.checks.find((c) => c.id === 'account')?.ok).toBe(false);
  });

  it('rejects a failed transaction', () => {
    const tx = clone(sealTx()) as { Transaction: { status: { success: boolean } } };
    tx.Transaction.status.success = false;
    expect(verifySeal({ ...base, forecast: sampleBlind(), commitTx: tx }).status).toBe('invalid');
  });

  it('only adds a note (not a failure) when the blob was touched after the commit', () => {
    const touched = clone(blobObject) as { object: { previousTransaction: string } };
    touched.object.previousTransaction = 'SomeLaterTransactionDigest1111111111111111111';
    const r = verifySeal({ ...base, forecast: sampleBlind(), commitTx: sealTx(), blobObject: touched });
    expect(r.status).toBe('valid_with_notes');
    expect(r.checks.find((c) => c.id === 'untouched')?.ok).toBe(false);
  });

  it('notes when the blob storage has expired', () => {
    const r = verifySeal({ ...base, forecast: sampleBlind(), commitTx: sealTx(), blobObject, currentWalrusEpoch: 60 });
    expect(r.status).toBe('valid_with_notes');
    expect(r.checks.find((c) => c.id === 'alive')?.ok).toBe(false);
  });
});
