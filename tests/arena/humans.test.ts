import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { fetchLive15m } from '@/arena/fast-markets';
import { advanceHumanSeals, authPlayer, createPlayer, humanAgentId, openRound, playBlind, playerSummary, playInformed, playReveal, PlayError } from '@/arena/humans';
import { lockRound } from '@/arena/lock';
import { receipt } from '@/arena/queries';
import { settleDue } from '@/arena/settle';
import { ForecastV1 } from '@/core';
import { arenaEpisodes, arenaForecasts } from '@/db/schema';
import { fakeArena } from '../helpers/fake-arena';

const CLOSE = Date.parse('2026-10-29T11:00:00.000Z');
const ROUND = '15m:2026-10-29T11:00:00.000Z';

describe('humans in the arena', () => {
  it('blind → reveal one take → informed, sealed one by one, settled with the agents', async () => {
    const a = await fakeArena('2026-10-29T10:51:10.000Z');
    await lockRound(a.deps, CLOSE);
    const p = await createPlayer(a.db, 'Ada_1');
    expect(p.token).toMatch(/^rcpt_/);
    expect((await authPlayer(a.db, `Bearer ${p.token}`)).handle).toBe('ada_1');
    await expect(authPlayer(a.db, 'Bearer nope')).rejects.toBeInstanceOf(PlayError);
    await expect(createPlayer(a.db, 'ada_1')).rejects.toThrow(/taken/);

    const open = await openRound(a.db, a.deps.now());
    expect(open?.roundId).toBe(ROUND);
    expect(open?.markets).toHaveLength(8);
    expect(JSON.stringify(open)).not.toMatch(/marketUp|probabilityBps/); // no prices before the blind call

    await expect(playReveal(a.deps, p.playerId, { roundId: ROUND, asset: 'btc' })).rejects.toThrow(/blind call first/);
    const blind = await playBlind(a.deps, p.playerId, { roundId: ROUND, asset: 'btc', probabilityBps: 4000 });
    await expect(playBlind(a.deps, p.playerId, { roundId: ROUND, asset: 'btc', probabilityBps: 4100 })).rejects.toThrow(/already/);
    const rev = await playReveal(a.deps, p.playerId, { roundId: ROUND, asset: 'btc' });
    expect(rev.fairTest).toBe(true);
    expect(rev.shown.probabilityBps).toBeGreaterThan(0);
    const again = await playReveal(a.deps, p.playerId, { roundId: ROUND, asset: 'btc', advisorId: 'hype' });
    expect(again.advisorId).toBe(rev.advisorId); // one take per market, no shopping around
    const inf = await playInformed(a.deps, p.playerId, { roundId: ROUND, asset: 'btc', probabilityBps: 7000 });

    const f = ForecastV1.parse(JSON.parse((await a.db.select().from(arenaForecasts).where(eq(arenaForecasts.hash, inf.hash)))[0].forecastJson));
    expect(f.prev).toBe(blind.hash);
    expect(f.advice?.advisorId).toBe(rev.advisorId);

    // seals: stored → verified on the fake chain (single rcpt1 seals)
    await advanceHumanSeals(a.deps);
    await advanceHumanSeals(a.deps);
    const rows = await a.db.select().from(arenaForecasts).where(eq(arenaForecasts.agentId, humanAgentId(p.playerId)));
    expect(rows.map((r) => r.sealStatus)).toEqual(['verified', 'verified']);
    const r = await receipt(a.db, inf.hash, a.deps.now());
    expect(r?.seal.type).toBe('single');
    expect(r?.forecast).toBeNull(); // not revealed before close

    // too late after the cutoff
    a.setNow('2026-10-29T10:59:30.000Z');
    await expect(playBlind(a.deps, p.playerId, { roundId: ROUND, asset: 'eth', probabilityBps: 5000 })).rejects.toThrow(/too late/);

    // settle with the agents
    a.setNow('2026-10-29T11:08:00.000Z');
    const live = await fetchLive15m(a.deps.tatum);
    await settleDue(a.deps, { resolved: live.filter((m) => m.closeTime === '2026-10-29T11:00:00.000Z').map((m) => ({ ...m, resolution: 'UP' as const, resolvedSource: 'chainlink' })) });
    const [ep] = await a.db.select().from(arenaEpisodes).where(eq(arenaEpisodes.agentId, humanAgentId(p.playerId)));
    expect(ep).toMatchObject({ blindBps: 4000, informedBps: 7000, outcome: 1 });
    expect(ep.deltaMicro).toBeGreaterThan(0);
    const me = await playerSummary(a.db, p.playerId);
    expect(me.episodes).toBe(1);
    expect(me.advisors[0]).toMatchObject({ advisorId: rev.advisorId, n: 1, verdict: 'not_enough_evidence' });
    expect((await receipt(a.db, inf.hash, a.deps.now()))?.forecast).not.toBeNull();
  });
});
