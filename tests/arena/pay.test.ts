import { describe, expect, it } from 'vitest';
import { lockRound } from '@/arena/lock';
import { planTransfers } from '@/arena/pay/payouts';
import { parseTakesRequest, sellerFromPayConfig, takesHandler } from '@/arena/pay/takes-server';
import { agentWallet, clearinghouse, payConfigFromEnv, walletDirectory } from '@/arena/pay/wallets';
import type { arenaPurchases } from '@/db/schema';
import { fakeArena } from '../helpers/fake-arena';

const SEED = '42'.repeat(32);
const cfg = payConfigFromEnv({ ARENA_WALLET_SEED: SEED } as unknown as NodeJS.ProcessEnv)!;

describe('wallets', () => {
  it('derives stable, distinct addresses from one seed', () => {
    const d = walletDirectory(cfg);
    expect(d.clearinghouse).toBe(clearinghouse(cfg).toSuiAddress());
    expect(new Set([d.clearinghouse, ...Object.values(d.agents), ...Object.values(d.advisors)]).size).toBe(1 + 5 + 7);
    expect(agentWallet(cfg, 'rookie').toSuiAddress()).toBe(agentWallet({ ...cfg, seedHex: SEED }, 'rookie').toSuiAddress());
    expect(cfg.network).toBe('testnet');
    expect(cfg.currency.type).toMatch(/::usdc::USDC$/);
  });
});

describe('paid takes endpoint', () => {
  it('validates picks and prices them', () => {
    const u = (q: string) => new URL(`http://x/api/arena/takes?${q}`);
    expect(parseTakesRequest(u('round=15m:2026-10-29T11:00:00.000Z&picks=btc:crowd,eth:quant'))).toEqual({ roundId: '15m:2026-10-29T11:00:00.000Z', picks: [{ asset: 'btc', advisorId: 'crowd' }, { asset: 'eth', advisorId: 'quant' }] });
    expect(parseTakesRequest(u('round=nope&picks=btc:crowd'))).toEqual({ error: 'bad round' });
    expect(parseTakesRequest(u('round=15m:2026-10-29T11:00:00.000Z&picks=btc:No_Body!'))).toEqual({ error: 'bad pick' });
    expect(parseTakesRequest(u('round=15m:2026-10-29T11:00:00.000Z&picks=btc:crowd,btc:quant'))).toEqual({ error: 'one pick per market' });

  });

  it('answers 402 with an MPP challenge for an open round, and refuses closed or unknown rounds', async () => {
    const a = await fakeArena('2026-10-29T10:51:10.000Z');
    await lockRound(a.deps, Date.parse('2026-10-29T11:00:00.000Z'));
    const handler = takesHandler(a.db, sellerFromPayConfig(cfg), { secretKey: 'x'.repeat(40), now: a.deps.now });
    const res = await handler(new Request('http://x/api/arena/takes?round=15m:2026-10-29T11:00:00.000Z&picks=btc:crowd,eth:quant'));
    expect(res.status).toBe(402);
    const www = res.headers.get('www-authenticate') ?? '';
    expect(www).toMatch(/Payment/);
    expect(www).toMatch(/method="sui"/);
    const req = JSON.parse(Buffer.from(/request="([^"]+)"/.exec(www)![1], 'base64url').toString());
    expect(req).toMatchObject({ amount: '0.020000', recipient: clearinghouse(cfg).toSuiAddress() });
    expect((await handler(new Request('http://x/api/arena/takes?round=15m:2026-10-29T12:00:00.000Z&picks=btc:crowd'))).status).toBe(404);
    a.setNow('2026-10-29T11:00:01.000Z');
    expect((await handler(new Request('http://x/api/arena/takes?round=15m:2026-10-29T11:00:00.000Z&picks=btc:crowd'))).status).toBe(409);
  });
});

describe('lock with MPP purchases', () => {
  it('pays per agent per round, uses exactly the served take, and records the payment digest', async () => {
    const a = await fakeArena('2026-10-29T10:51:10.000Z');
    const calls: string[] = [];
    a.deps.pay = {
      cfg,
      baseUrl: 'http://local',
      buy: async ({ agentId, roundId, picks }) => {
        calls.push(agentId);
        const { arenaTakes, arenaMarkets } = await import('@/db/schema');
        const { and, eq } = await import('drizzle-orm');
        const { ADVISOR_BY_ID } = await import('@/arena/brain/models');
        const takes = [];
        for (const p of picks) {
          const [r] = await a.db.select().from(arenaTakes).innerJoin(arenaMarkets, eq(arenaMarkets.id, arenaTakes.marketId)).where(and(eq(arenaMarkets.roundId, roundId), eq(arenaMarkets.asset, p.asset), eq(arenaTakes.advisorId, p.advisorId)));
          const adv = ADVISOR_BY_ID.get(p.advisorId)!;
          takes.push({ asset: p.asset, takeHash: r.arena_takes.hash, shown: { advisorId: adv.id, advisor: adv.name, market: r.arena_markets.conditionId, says: r.arena_takes.says, probabilityBps: r.arena_takes.probabilityBps, inputs: JSON.parse(r.arena_takes.inputsJson) } });
        }
        return { paymentDigest: `DIGEST-${agentId}`, takes, receipt: null };
      },
    };
    await lockRound(a.deps, Date.parse('2026-10-29T11:00:00.000Z'));
    expect(calls.sort()).toEqual(['cautious', 'chartist', 'gambler', 'goldfish', 'rookie']);
    const { arenaPurchases: P } = await import('@/db/schema');
    const rows = await a.db.select().from(P);
    expect(rows.every((r) => r.payNetwork === 'sui:testnet' && r.escrowDigest === `DIGEST-${r.agentId}`)).toBe(true);
  });

  it('falls back to the ledger when a payment fails, and never uses a take that differs from the sealed one', async () => {
    const a = await fakeArena('2026-10-29T10:51:10.000Z');
    a.deps.pay = { cfg, baseUrl: 'http://local', buy: async () => { throw new Error('insufficient USDC'); } };
    await lockRound(a.deps, Date.parse('2026-10-29T11:00:00.000Z'));
    const { arenaPurchases: P, arenaForecasts: F } = await import('@/db/schema');
    expect((await a.db.select().from(P)).every((r) => r.payNetwork === 'ledger')).toBe(true);
    expect((await a.db.select().from(F)).filter((f) => f.kind === 'informed')).toHaveLength(40);

    const b = await fakeArena('2026-10-29T10:51:10.000Z');
    b.deps.pay = { cfg, baseUrl: 'http://local', buy: async ({ picks }) => ({ paymentDigest: 'D', receipt: null, takes: picks.map((p) => ({ asset: p.asset, takeHash: 'x', shown: { advisorId: p.advisorId, advisor: 'X', market: 'm', says: 'tampered', probabilityBps: 9999, inputs: {} } })) }) };
    await expect(lockRound(b.deps, Date.parse('2026-10-29T11:00:00.000Z'))).rejects.toThrow(/differs from the sealed take/);
  });
});

describe('pay-for-lift payouts', () => {
  it('sums releases per advisor and refunds per agent', () => {
    const row = (agentId: string, advisorId: string, payStatus: 'released' | 'refunded', priceMicros = 10_000) => ({ action: 'buy', agentId, advisorId, payStatus, priceMicros }) as typeof arenaPurchases.$inferSelect;
    const t = planTransfers([row('rookie', 'crowd', 'released'), row('gambler', 'crowd', 'released'), row('rookie', 'hype', 'refunded'), row('rookie', 'fader', 'refunded')], { advisor: (id) => `adv-${id}`, agent: (id) => `ag-${id}` });
    expect(t).toEqual([
      { to: 'adv-crowd', role: 'advisor', id: 'crowd', micros: 20_000 },
      { to: 'ag-rookie', role: 'agent', id: 'rookie', micros: 20_000 },
    ]);
  });
});
