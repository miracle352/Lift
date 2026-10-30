import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { homeWinMarket, syncMatchday } from '@/arena/football';
import { createPlayer, openMatches, playBlind, playInformed, playReveal } from '@/arena/humans';
import { settleDue } from '@/arena/settle';
import { EventsPage } from '@/arena/tatum';
import { arenaBatches, arenaEpisodes, arenaMarkets, arenaTakes } from '@/db/schema';
import { fakeArena } from '../helpers/fake-arena';
import { loadFixture } from '../helpers/fixtures';

const epl = EventsPage.parse(loadFixture('tatum/events-epl-matches.json')).data;

describe('matchday (football)', () => {
  it('picks the home-win market from a match event', () => {
    const m = homeWinMarket(epl[0], 'Premier League')!;
    expect(m.title).toBe('Chelsea FC vs. Manchester United FC');
    expect(m.market.question).toMatch(/^Will Chelsea FC win/);
    expect(m.kickoff).toBe('2026-10-31T12:30:00.000Z');
    expect(m.yes).toBeGreaterThan(0);
  });

  it('opens rounds ≤30 h ahead with sealed takes (incl. the Whale), people play them, Tatum resolution settles them', async () => {
    const a = await fakeArena('2026-10-30T10:00:00.000Z');
    const r = await syncMatchday(a.deps, { events: { EPL: epl } });
    expect(r.opened).toBe(3); // all three kick off within 30 h
    const matches = await openMatches(a.db, a.deps.now());
    expect(matches[0]).toMatchObject({ roundId: 'fb:1209076', league: 'Premier League', title: 'Chelsea FC vs. Manchester United FC' });
    const takes = await a.db.select().from(arenaTakes).where(eq(arenaTakes.marketId, 'fb:1209076:match'));
    expect(takes.map((t) => t.advisorId).sort()).toEqual(['crowd', 'fence', 'hype', 'whale']);
    expect(takes.find((t) => t.advisorId === 'whale')!.probabilityBps).toBe(7000); // $9k YES vs $3k NO
    expect((await a.db.select().from(arenaBatches).where(eq(arenaBatches.roundId, 'fb:1209076')))[0].phase).toBe('take');
    expect(await syncMatchday(a.deps, { events: { EPL: epl } })).toEqual({ opened: 0 }); // idempotent

    const p = await createPlayer(a.db, 'kickoff_fan');
    await playBlind(a.deps, p.playerId, { roundId: 'fb:1209076', asset: 'match', probabilityBps: 4000 });
    const rev = await playReveal(a.deps, p.playerId, { roundId: 'fb:1209076', asset: 'match', advisorId: 'crowd' });
    expect(rev.shown.advisor).toBe('The Crowd');
    await playInformed(a.deps, p.playerId, { roundId: 'fb:1209076', asset: 'match', probabilityBps: 5200 });

    a.setNow('2026-10-31T15:00:00.000Z'); // kickoff + 2.5 h → targeted Tatum lookup
    const s = await settleDue(a.deps);
    expect(s.resolvedMarkets).toBe(1);
    const [m] = await a.db.select().from(arenaMarkets).where(eq(arenaMarkets.id, 'fb:1209076:match'));
    expect(m.resolution).toBe('UP'); // YES stored as UP
    const [ep] = await a.db.select().from(arenaEpisodes);
    expect(ep).toMatchObject({ blindBps: 4000, informedBps: 5200, outcome: 1 });
    expect(a.tatumCalls.filter((u) => u.includes('status=resolved'))).toHaveLength(0); // no crypto feed call for football
  });
});
