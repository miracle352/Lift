import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { assertPublicUrl, isPrivate, registerAdvisor, slugOf } from '@/arena/external';
import { fetchLive15m } from '@/arena/fast-markets';
import { lockRound } from '@/arena/lock';
import { planTransfers } from '@/arena/pay/payouts';
import { leaderboard } from '@/arena/queries';
import { advisorDirectory } from '@/arena/registry';
import { settleDue } from '@/arena/settle';
import { arenaAdvisors, arenaPurchases, arenaTakes } from '@/db/schema';
import { fakeArena } from '../helpers/fake-arena';

const PAYOUT = '0x' + 'ab'.repeat(32);

/** A fake external advisor that is always 90% UP. */
const advisorFetch = (calls: string[] = []) =>
  (async (url: string, init?: RequestInit) => {
    calls.push(String(url));
    const body = JSON.parse(String(init?.body ?? '{}'));
    return new Response(JSON.stringify({ takes: body.markets.map((m: { asset: string }) => ({ asset: m.asset, probabilityBps: 9000, says: 'UP, 90%.' })) }), { status: 200 });
  }) as unknown as typeof fetch;

describe('open advisor marketplace', () => {
  it('rejects private endpoints and bad registrations', async () => {
    expect(isPrivate('10.0.0.1')).toBe(true);
    expect(isPrivate('192.168.1.5')).toBe(true);
    expect(isPrivate('8.8.8.8')).toBe(false);
    await expect(assertPublicUrl('http://example.com/x', false)).rejects.toThrow(/https/);
    await expect(assertPublicUrl('https://127.0.0.1/x', false)).rejects.toThrow(/private/);
    const a = await fakeArena('2026-10-29T10:51:10.000Z');
    await expect(registerAdvisor(a.db, { name: 'The Quant', pitch: 'copycat', endpointUrl: 'https://1.1.1.1/t', payoutAddress: PAYOUT }, advisorFetch())).rejects.toThrow(/not available/);
    await expect(registerAdvisor(a.db, { name: 'X', pitch: 'p', endpointUrl: 'nope', payoutAddress: '0x1' })).rejects.toThrow();
    expect(slugOf('Moon Boy 3000!')).toBe('x-moon-boy-3000');
  });

  it('a registered advisor is probed, gets its takes sealed, sold and paid to its own address on lift', async () => {
    const a = await fakeArena('2026-10-29T10:51:10.000Z');
    const calls: string[] = [];
    const reg = await registerAdvisor(a.db, { name: 'Always Up', pitch: 'Ninety percent up, every time.', endpointUrl: 'https://1.1.1.1/takes', payoutAddress: PAYOUT, priceUsd: 0.02 }, advisorFetch(calls));
    expect(reg).toEqual({ id: 'x-always-up', status: 'active', priceMicros: 20_000 });
    expect(calls).toHaveLength(1); // probe

    a.deps.externalFetch = advisorFetch(calls);
    await lockRound(a.deps, Date.parse('2026-10-29T11:00:00.000Z'));
    expect(calls).toHaveLength(2); // one request for the whole round
    const takes = await a.db.select().from(arenaTakes).where(eq(arenaTakes.advisorId, 'x-always-up'));
    expect(takes).toHaveLength(8);
    expect(takes[0]).toMatchObject({ advisorName: 'Always Up', priceMicros: 20_000, probabilityBps: 9000 });

    const bought = (await a.db.select().from(arenaPurchases)).filter((p) => p.advisorId === 'x-always-up');
    expect(bought.length).toBeGreaterThan(0); // fair tests include the newcomer
    expect(bought.every((p) => p.priceMicros === 20_000)).toBe(true);

    // every market goes UP → buying "Always Up" helped → its escrow is released to ITS payout address
    a.setNow('2026-10-29T11:08:00.000Z');
    const live = await fetchLive15m(a.deps.tatum);
    await settleDue(a.deps, { resolved: live.filter((m) => m.closeTime === '2026-10-29T11:00:00.000Z').map((m) => ({ ...m, resolution: 'UP' as const, resolvedSource: 'chainlink' })) });
    const rows = await a.db.select().from(arenaPurchases);
    const dir = await advisorDirectory(a.db);
    const transfers = planTransfers(rows, { advisor: (id) => dir.get(id)?.payoutAddress ?? `builtin:${id}`, agent: (id) => `agent:${id}` });
    const ext = transfers.find((t) => t.id === 'x-always-up')!;
    expect(ext.to).toBe(PAYOUT);
    expect(ext.micros).toBe(20_000 * rows.filter((p) => p.advisorId === 'x-always-up' && p.payStatus === 'released').length);

    const lb = await leaderboard(a.db);
    expect(lb.advisors.find((x) => x.id === 'x-always-up')).toMatchObject({ kind: 'external', payoutAddress: PAYOUT });
  });

  it('an advisor that keeps failing is switched off after 5 rounds', async () => {
    const a = await fakeArena('2026-10-29T10:51:10.000Z');
    await registerAdvisor(a.db, { name: 'Flaky', pitch: 'Sometimes here.', endpointUrl: 'https://1.1.1.1/t', payoutAddress: PAYOUT }, advisorFetch());
    a.deps.externalFetch = (async () => new Response('boom', { status: 500 })) as unknown as typeof fetch;
    const { collectExternalTakes } = await import('@/arena/external');
    for (let i = 0; i < 5; i++) await collectExternalTakes(a.db, { roundId: `r${i}`, closeTime: '2026-10-29T11:00:00.000Z', markets: [], fetch: a.deps.externalFetch });
    const [row] = await a.db.select().from(arenaAdvisors);
    expect(row.status).toBe('failing');
    expect(row.lastError).toMatch(/500/);
  });
});
