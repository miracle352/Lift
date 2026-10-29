import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { lockRound } from '@/arena/lock';
import { advanceBatches } from '@/arena/sealer';
import { settleDue } from '@/arena/settle';
import { flushMemoryOutbox, parseEpisodeMemory } from '@/arena/memory';
import { tick } from '@/arena/worker';
import { fetchLive15m } from '@/arena/fast-markets';
import { verifyBatchSeal, buildProofs, ForecastV1 } from '@/core';
import { arenaBatches, arenaEpisodes, arenaEvents, arenaForecasts, arenaLessons, arenaMarkets, arenaPurchases, arenaRounds, arenaTakes, tatumCalls } from '@/db/schema';
import { fakeArena, FIX_ACCOUNT, FIX_OWNER } from '../helpers/fake-arena';

const CLOSE = Date.parse('2026-10-29T11:00:00.000Z');

describe('arena round, end to end (offline fakes)', () => {
  it('locks, seals three batches, verifies them on the fake chain, settles, pays for lift and writes memories', async () => {
    const a = await fakeArena('2026-10-29T10:51:10.000Z');
    const r = await lockRound(a.deps, CLOSE);
    expect(r.status).toBe('locked');
    expect(r.markets).toBe(8);

    const takes = await a.db.select().from(arenaTakes);
    expect(takes).toHaveLength(8 * 7);
    const forecasts = await a.db.select().from(arenaForecasts);
    expect(forecasts.filter((f) => f.kind === 'blind')).toHaveLength(8 * 4);
    const purchases = await a.db.select().from(arenaPurchases);
    expect(purchases).toHaveLength(8 * 4);
    // with no history every agent explores (fair tests)
    expect(purchases.every((p) => p.action === 'buy' && p.fairTest)).toBe(true);

    // informed forecasts link to their blind forecast and record the advice they paid for
    const inf = forecasts.find((f) => f.kind === 'informed')!;
    const parsed = ForecastV1.parse(JSON.parse(inf.forecastJson));
    const blind = forecasts.find((f) => f.agentId === inf.agentId && f.marketId === inf.marketId && f.kind === 'blind')!;
    expect(parsed.prev).toBe(blind.hash);
    expect(parsed.advice?.advisorKind).toBe('agent');

    // batches: submitted on lock, then stored → verified against Sui
    let batches = await a.db.select().from(arenaBatches);
    expect(batches.map((b) => b.phase).sort()).toEqual(['blind', 'informed', 'take']);
    expect(batches.every((b) => b.status === 'submitted')).toBe(true);
    await advanceBatches(a.deps); // submitted → stored → verified
    batches = await a.db.select().from(arenaBatches);
    expect(batches.map((b) => b.status)).toEqual(['verified', 'verified', 'verified']);
    const v = JSON.parse(batches.find((b) => b.phase === 'informed')!.verificationJson!);
    expect(v.status).toMatch(/^valid/);
    expect(v.checks.find((c: { id: string }) => c.id === 'inclusion').ok).toBe(true);
    expect(v.checks.find((c: { id: string }) => c.id === 'after_blind').ok).toBe(true);

    // anyone can verify any single forecast from the stored manifest + chain
    const b = batches.find((x) => x.phase === 'blind')!;
    const proof = buildProofs(JSON.parse(b.manifestJson).leaves).proofs.get(blind.hash)!;
    const vv = verifyBatchSeal({
      forecast: ForecastV1.parse(JSON.parse(blind.forecastJson)),
      roundId: r.roundId,
      phase: 'blind',
      steps: proof.steps,
      root: b.root,
      commitTx: await a.deps.sui.core.getTransaction({ digest: b.commitDigest! }),
      expectedAccountId: FIX_ACCOUNT,
      expectedOwner: FIX_OWNER,
    });
    expect(vv.status).toBe('valid');

    // settle: resolve every market UP
    a.setNow('2026-10-29T11:08:00.000Z');
    const live = await fetchLive15m(a.deps.tatum);
    const resolved = live.filter((m) => m.closeTime === '2026-10-29T11:00:00.000Z').map((m) => ({ ...m, resolution: 'UP' as const, resolvedSource: 'chainlink' }));
    const s = await settleDue(a.deps, { resolved });
    expect(s.resolvedMarkets).toBe(8);
    expect(s.episodes).toBe(32);
    const [round] = await a.db.select().from(arenaRounds);
    expect(round.status).toBe('settled');
    const pays = await a.db.select().from(arenaPurchases);
    expect(pays.every((p) => p.payStatus === 'released' || p.payStatus === 'refunded')).toBe(true);
    // pay-for-lift: released exactly when the informed call beat the blind call
    const eps = await a.db.select().from(arenaEpisodes);
    for (const p of pays) {
      const ep = eps.find((e) => e.id === p.id)!;
      expect(p.payStatus === 'released').toBe(ep.deltaMicro > 0);
    }

    // memory: one episode memory per agent for the round, readable back into episodes
    const m = await flushMemoryOutbox(a.deps);
    expect(m.submitted).toBe(4);
    await flushMemoryOutbox(a.deps);
    const epMem = a.chain.memories.filter((x) => x.namespace === 'arena1:rookie:episodes');
    expect(epMem).toHaveLength(1);
    expect(parseEpisodeMemory(epMem[0].text)).toHaveLength(8);
    const stored = await a.db.select().from(arenaEpisodes).where(eq(arenaEpisodes.memoryStatus, 'stored'));
    expect(stored).toHaveLength(32);

    // ledger of Tatum credits
    const calls = await a.db.select().from(tatumCalls);
    void calls; // fake Tatum client here has no ledger hook; budgeted client is covered in budget.test
    const events = await a.db.select().from(arenaEvents);
    expect(events.map((e) => e.type)).toEqual(expect.arrayContaining(['round_locked', 'take_bought', 'batch_submitted', 'batch_on_sui', 'market_resolved', 'round_settled']));
  });

  it('locking twice is a no-op, and tick only locks inside the lock window', async () => {
    const a = await fakeArena('2026-10-29T10:51:10.000Z');
    await tick(a.deps);
    expect(await a.db.select().from(arenaRounds)).toHaveLength(1);
    expect((await lockRound(a.deps, CLOSE)).status).toBe('exists');
    const b = await fakeArena('2026-10-29T10:55:00.000Z'); // 4 min late → skip
    await tick(b.deps);
    expect(await b.db.select().from(arenaRounds)).toHaveLength(0);
  });

  it('lessons recalled from memory change what agents buy', async () => {
    const a = await fakeArena('2026-10-29T10:51:10.000Z');
    // Seed a lesson for every agent: the Loud Tipster makes them worse
    for (const agent of ['rookie', 'chartist', 'cautious', 'gambler']) {
      await a.deps.mem.remember(
        `Lesson for ${agent}: reading Loud Tipster has made my forecasts worse — stop buying (n=30). [[advisor=hype verdict=makes_you_worse n=30 trust=0.020]]`,
        `arena1:${agent}:lessons`,
      );
    }
    await lockRound(a.deps, CLOSE);
    const p = await a.db.select().from(arenaPurchases);
    const hype = p.filter((x) => x.advisorId === 'hype');
    expect(hype.every((x) => /re-test/.test(x.reason))).toBe(true);
    expect(hype.length).toBeLessThan(4);
    const ev = await a.db.select().from(arenaEvents).where(eq(arenaEvents.type, 'lessons_recalled'));
    expect(ev).toHaveLength(4);
    void arenaLessons;
    void arenaMarkets;
  });
});

describe('portable memory', () => {
  it('an agent rebuilt from Walrus Memory alone matches the database', async () => {
    const { rebuildAgentFromWalrus } = await import('@/arena/rebuild');
    const a = await fakeArena('2026-10-29T10:51:10.000Z');
    await lockRound(a.deps, CLOSE);
    a.setNow('2026-10-29T11:08:00.000Z');
    const live = await fetchLive15m(a.deps.tatum);
    const resolved = live.filter((m) => m.closeTime === '2026-10-29T11:00:00.000Z').map((m, i) => ({ ...m, resolution: (i % 2 ? 'UP' : 'DOWN') as 'UP' | 'DOWN', resolvedSource: 'chainlink' }));
    await settleDue(a.deps, { resolved });
    await flushMemoryOutbox(a.deps);
    const r = await rebuildAgentFromWalrus(a.deps, 'rookie');
    expect(r.episodes).toBe(8);
    expect(r.dbEpisodes).toBe(8);
    expect(r.advisors.every((x) => x.match)).toBe(true);
  });
});
