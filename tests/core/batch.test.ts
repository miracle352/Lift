import { bcs } from '@mysten/sui/bcs';
import { toBase64 } from '@mysten/sui/utils';
import { describe, expect, it } from 'vitest';
import { batchNamespace, buildBatch, buildForecast, forecastHash, parseBatchNamespace, verifyBatchSeal, type ForecastV1 } from '@/core';
import { clone, loadFixture } from '../helpers/fixtures';
import { SAMPLE_MARKET } from '../helpers/sample-forecast';

const ACCOUNT = '0x49cb5c5550e8f69445a4af7ec37f2088b54ed8ce10667dc0fa03c2f503ca2cb5';
const OWNER = '0x7643a4bf08bb984e9c7cf7a2157c7b87d206dccfd9c899f0205e5d77ff8fd451';
const ROUND = '15m:2026-10-21T19:00:00.000Z';

function blind(user: string, bps: number): ForecastV1 {
  return buildForecast({ kind: 'blind', user, market: SAMPLE_MARKET, outcome: 'Yes', probabilityBps: bps, createdAt: '2026-10-21T15:30:00.000Z', salt: 'ab'.repeat(32) });
}

/** The real recorded relayer tx, with its namespace label (input 5) replaced by `ns`. */
function txWithNamespace(ns: string) {
  const tx = clone(loadFixture<{ Transaction: { transaction: { inputs: unknown[] } } }>('sui/grpc-getTransaction.json'));
  tx.Transaction.transaction.inputs[5] = { $kind: 'Pure', Pure: { bytes: toBase64(bcs.string().serialize(ns).toBytes()) } };
  return tx;
}

describe('batch seals', () => {
  const forecasts = ['agent:a', 'agent:b', 'agent:c', 'agent:d', 'agent:e'].map((u, i) => blind(u, 4000 + i * 500));
  const batch = buildBatch({ roundId: ROUND, phase: 'blind', forecasts, createdAt: '2026-10-21T15:30:01.000Z' });

  it('namespace fits the 255-byte limit and round-trips', () => {
    expect(new TextEncoder().encode(batch.namespace).length).toBeLessThan(120);
    expect(parseBatchNamespace(batch.namespace)).toEqual({ roundTag: expect.any(String), phase: 'blind', root: batch.root });
    expect(batch.namespace).toBe(batchNamespace(ROUND, 'blind', batch.root));
  });

  it('verifies every forecast in the batch against the commit tx', () => {
    const commitTx = txWithNamespace(batch.namespace);
    for (const f of forecasts) {
      const proof = batch.proofs.get(forecastHash(f))!;
      const r = verifyBatchSeal({ forecast: f, roundId: ROUND, phase: 'blind', steps: proof.steps, root: batch.root, commitTx, expectedAccountId: ACCOUNT, expectedOwner: OWNER });
      expect(r.status, JSON.stringify(r.checks)).toBe('valid');
    }
  });

  it('rejects an edited forecast (inclusion fails)', () => {
    const proof = batch.proofs.get(forecastHash(forecasts[0]))!;
    const edited = { ...forecasts[0], probabilityBps: 9900 };
    const r = verifyBatchSeal({ forecast: edited, roundId: ROUND, phase: 'blind', steps: proof.steps, root: batch.root, commitTx: txWithNamespace(batch.namespace) });
    expect(r.status).toBe('invalid');
    expect(r.checks.find((c) => c.id === 'inclusion')?.ok).toBe(false);
  });

  it('rejects a root that was never written on chain', () => {
    const other = buildBatch({ roundId: ROUND, phase: 'blind', forecasts: forecasts.slice(0, 2) });
    const f = forecasts[0];
    const proof = other.proofs.get(forecastHash(f))!;
    const r = verifyBatchSeal({ forecast: f, roundId: ROUND, phase: 'blind', steps: proof.steps, root: other.root, commitTx: txWithNamespace(batch.namespace) });
    expect(r.checks.find((c) => c.id === 'label_in_tx')?.ok).toBe(false);
    expect(r.status).toBe('invalid');
  });

  it('rejects a blind forecast presented as part of an informed batch', () => {
    const proof = batch.proofs.get(forecastHash(forecasts[0]))!;
    const r = verifyBatchSeal({ forecast: forecasts[0], roundId: ROUND, phase: 'informed', steps: proof.steps, root: batch.root, commitTx: txWithNamespace(batch.namespace) });
    expect(r.status).toBe('invalid');
  });

  it('flags a batch committed after the market closed as late', () => {
    const f = forecasts[0];
    const proof = batch.proofs.get(forecastHash(f))!;
    const r = verifyBatchSeal({ forecast: f, roundId: ROUND, phase: 'blind', steps: proof.steps, root: batch.root, commitTx: txWithNamespace(batch.namespace), closeTime: '2026-10-21T15:00:00.000Z' });
    expect(r.status).toBe('late');
  });
});
