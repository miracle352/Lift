import { bcs } from '@mysten/sui/bcs';
import { toBase64 } from '@mysten/sui/utils';
import { blobIdFromU256 } from '@/core/walrus-ids';
import type { ArenaDeps } from '@/arena/deps';
import { DEFAULT_ASSETS } from '@/arena/deps';
import { TatumPrediction } from '@/arena/tatum';
import type { MemoryClient } from '@/lib/memwal';
import type { SuiCoreLike } from '@/lib/seal-evidence';
import { clone, loadFixture } from './fixtures';
import { migratedTestDb } from './db';

/** Accounts that the recorded relayer tx (tests/fixtures/sui) was written for. */
export const FIX_ACCOUNT = '0x49cb5c5550e8f69445a4af7ec37f2088b54ed8ce10667dc0fa03c2f503ca2cb5';
export const FIX_OWNER = '0x7643a4bf08bb984e9c7cf7a2157c7b87d206dccfd9c899f0205e5d77ff8fd451';

interface StoredMemory {
  jobId: string;
  blobId: string;
  u256: string;
  digest: string;
  text: string;
  namespace: string;
  createdAt: string;
}

/** In-memory Walrus Memory + matching fake Sui chain: every remembered item becomes a Blob whose commit tx labels its namespace. */
export function fakeWalrusAndSui(now: () => number) {
  const memories: StoredMemory[] = [];
  let seq = 0;
  const store = (text: string, namespace: string) => {
    seq++;
    const u256 = (BigInt(1) << BigInt(200)) + BigInt(seq);
    const m: StoredMemory = { jobId: `job-${seq}`, blobId: blobIdFromU256(u256), u256: u256.toString(), digest: `FakeDigest${seq}`, text, namespace, createdAt: new Date(now() + seq).toISOString() };
    memories.push(m);
    return m;
  };
  const mem = {
    async remember(text: string, namespace?: string) {
      const m = store(text, namespace ?? 'default');
      return { job_id: m.jobId, status: 'pending' };
    },
    async rememberBulk(items: { text: string; namespace?: string }[]) {
      const ids = items.map((i) => store(i.text, i.namespace ?? 'default').jobId);
      return { job_ids: ids, total: ids.length, status: 'pending' };
    },
    async getRememberStatus(jobId: string) {
      const m = memories.find((x) => x.jobId === jobId);
      return m ? { job_id: jobId, status: 'done' as const, blob_id: m.blobId, namespace: m.namespace } : { job_id: jobId, status: 'not_found' as const };
    },
    async recall(p: { query: string; namespace?: string; topK?: number }) {
      const hits = memories.filter((m) => m.namespace === p.namespace).reverse().slice(0, p.topK ?? 10);
      return { results: hits.map((m) => ({ blob_id: m.blobId, text: m.text, distance: 0.3, created_at: m.createdAt })), total: hits.length };
    },
  } as unknown as MemoryClient;

  const realTx = loadFixture<{ Transaction: { digest: string; transaction: { inputs: unknown[] } } }>('sui/grpc-getTransaction.json');
  const realObj = loadFixture<{ object: { objectId: string; previousTransaction: string } }>('sui/grpc-getObject-blob.json');
  const sui: SuiCoreLike = {
    core: {
      async listOwnedObjects() {
        return { objects: memories.map((m) => ({ objectId: '0x' + m.u256.padStart(64, '0').slice(-64).replace(/[^0-9a-f]/g, '0'), previousTransaction: m.digest, json: { blob_id: m.u256, storage: { end_epoch: 99 } } })), cursor: null, hasNextPage: false };
      },
      async getTransaction({ digest }) {
        const m = memories.find((x) => x.digest === digest)!;
        const tx = clone(realTx);
        tx.Transaction.digest = digest;
        tx.Transaction.transaction.inputs[5] = { $kind: 'Pure', Pure: { bytes: toBase64(bcs.string().serialize(m.namespace).toBytes()) } };
        return tx;
      },
      async getObject({ objectId }) {
        const o = clone(realObj);
        const m = memories.find((x) => objectId.endsWith(x.u256.slice(-6)));
        o.object.previousTransaction = m?.digest ?? 'unknown';
        return o;
      },
    },
  };
  return { mem, sui, memories };
}

/** Deterministic 1-minute candles: a gentle drift so features are non-trivial. */
export function fakeFetch(opts: { drift?: number } = {}): typeof fetch {
  const drift = opts.drift ?? 0.0003;
  return (async (input: string | URL) => {
    const url = String(input);
    if (url.includes('api.exchange.coinbase.com')) {
      const u = new URL(url);
      const start = Math.floor(Date.parse(u.searchParams.get('start')!) / 60_000) * 60;
      const end = Math.floor(Date.parse(u.searchParams.get('end')!) / 60_000) * 60;
      const rows: number[][] = [];
      let p = 100;
      for (let t = start; t < end; t += 60) {
        const open = p;
        p = p * (1 + drift * Math.sin(t / 300) + drift / 2);
        rows.push([t, Math.min(open, p), Math.max(open, p), open, p, 10]);
      }
      return new Response(JSON.stringify(rows.reverse()), { status: 200 });
    }
    if (url.includes('clob.polymarket.com/book')) {
      return new Response(JSON.stringify({ bids: [{ price: '0.62', size: '400' }, { price: '0.60', size: '300' }], asks: [{ price: '0.66', size: '200' }] }), { status: 200 });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
}

export async function fakeArena(startIso: string) {
  let t = Date.parse(startIso);
  const now = () => t;
  const { db } = await migratedTestDb();
  const chain = fakeWalrusAndSui(now);
  const tatumCalls: string[] = [];
  const tatum = new TatumPrediction({
    apiKey: 'test',
    sleep: async () => {},
    fetch: (async (u: string) => {
      tatumCalls.push(String(u));
      if (String(u).includes('status=resolved')) return new Response(JSON.stringify(loadFixture('tatum/events-15m-resolved.json')), { status: 200 });
      return new Response(JSON.stringify(loadFixture('tatum/events-15m-endingSoon.json')), { status: 200 });
    }) as unknown as typeof fetch,
  });
  const logs: string[] = [];
  const deps: ArenaDeps = {
    db,
    tatum,
    mem: chain.mem,
    sui: chain.sui,
    fetch: fakeFetch(),
    now,
    config: { assets: DEFAULT_ASSETS, cadenceMin: 15, lockMinute: 6, memwalAccountId: FIX_ACCOUNT, memwalOwner: FIX_OWNER },
    log: (m, extra) => void logs.push(`${m} ${extra ? JSON.stringify(extra) : ''}`),
  };
  return { deps, db, chain, tatumCalls, logs, setNow: (iso: string) => void (t = Date.parse(iso)) };
}
