import { and, asc, eq, gte, inArray, isNull, like, lte } from 'drizzle-orm';
import { arenaEpisodes, arenaForecasts, arenaLessons, arenaMarkets, arenaPurchases, arenaPlayers, arenaRounds, arenaTakes, tatumCalls } from '@/db/schema';
import type { Verdict } from '@/core/scoring';
import { brier } from '@/core/scoring';
import { advisorStats, paysAdvisor, type RecalledLesson } from './brain/learner';
import { FORECASTER_BY_ID } from './brain/models';
import { advisorDirectory } from './registry';
import type { ArenaDeps } from './deps';
import { fetchResolved15m, type FastMarket } from './fast-markets';
import { lessonsFromStats } from './lessons';
import { loadEpisodes } from './memory';
import { event } from './sealer';

/**
 * Settlement: Tatum's resolved feed → market outcomes → per-agent episodes (Brier deltas) → pay-for-lift
 * (release escrow to the advisor if the advice improved the agent's call, else refund) → lessons when a
 * verdict changes. Polymarket 15-minute markets show up resolved on Tatum ~5–10 minutes after close.
 */

const SETTLE_DELAY_MS = 6 * 60_000;

export async function settleDue(deps: ArenaDeps, opts: { resolved?: FastMarket[] } = {}): Promise<{ resolvedMarkets: number; episodes: number; lessons: number }> {
  const now = deps.now();
  const open = await deps.db
    .select()
    .from(arenaMarkets)
    .innerJoin(arenaRounds, eq(arenaRounds.id, arenaMarkets.roundId))
    .where(and(isNull(arenaMarkets.resolution), lte(arenaMarkets.closeTime, new Date(now - SETTLE_DELAY_MS)), inArray(arenaRounds.status, ['locked', 'sealed'])));
  if (!open.length) return { resolvedMarkets: 0, episodes: 0, lessons: 0 };

  // Credit discipline: one resolved-feed call covers ~2.5 h of 15-minute windows, so call it at most every 25 min,
  // and only once the oldest pending crypto market closed 10+ min ago (Tatum shows resolutions ~5–10 min after close).
  const crypto = open.filter((o) => o.arena_markets.roundId.startsWith('15m:'));
  let feed: FastMarket[] = opts.resolved ?? [];
  if (!opts.resolved && crypto.length) {
    const oldest = Math.min(...crypto.map((o) => o.arena_markets.closeTime.getTime()));
    const [last] = await deps.db
      .select({ at: tatumCalls.at })
      .from(tatumCalls)
      .where(and(like(tatumCalls.path, '%status=resolved%'), gte(tatumCalls.at, new Date(now - 25 * 60_000))))
      .limit(1);
    if (now - oldest >= 10 * 60_000 && !last) feed = await fetchResolved15m(deps.tatum);
  }
  const byCondition = new Map(feed.filter((m) => m.resolution).map((m) => [m.conditionId, m]));
  // Targeted lookups (one call per market, at most every 30 min each): football matches from kickoff + 2 h,
  // and crypto markets that fell out of the feed window (worker was down for 3 h+).
  for (const { arena_markets: m } of open) {
    if (byCondition.has(m.conditionId)) continue;
    const football = !m.roundId.startsWith('15m:');
    if (now - m.closeTime.getTime() < (football ? 2 : 3) * 3600_000) continue;
    const [recent] = await deps.db
      .select({ at: tatumCalls.at })
      .from(tatumCalls)
      .where(and(like(tatumCalls.path, `/markets/${m.conditionId}%`), gte(tatumCalls.at, new Date(now - 30 * 60_000))))
      .limit(1);
    if (recent) continue;
    try {
      const pm = await deps.tatum.market(m.conditionId);
      const out = pm.resolution?.outcome?.toUpperCase();
      // football markets resolve YES/NO; stored as UP/DOWN (UP = the market's question came true)
      const mapped = out === 'UP' || out === 'YES' ? 'UP' : out === 'DOWN' || out === 'NO' ? 'DOWN' : null;
      if (mapped) byCondition.set(m.conditionId, { conditionId: m.conditionId, resolution: mapped, resolvedSource: pm.resolution?.source ?? null } as FastMarket);
    } catch (err) {
      deps.log('market lookup failed', { conditionId: m.conditionId, err: String(err) });
    }
  }
  if (!byCondition.size) return { resolvedMarkets: 0, episodes: 0, lessons: 0 };

  let resolvedMarkets = 0;
  let episodes = 0;
  const touchedAgents = new Set<string>();
  const touchedRounds = new Set<string>();
  for (const { arena_markets: m } of open) {
    const r = byCondition.get(m.conditionId);
    if (!r?.resolution) continue;
    const outcome: 0 | 1 = r.resolution === 'UP' ? 1 : 0;
    const forecasts = await deps.db.select().from(arenaForecasts).where(eq(arenaForecasts.marketId, m.id));
    const purchases = await deps.db.select().from(arenaPurchases).where(and(eq(arenaPurchases.marketId, m.id), eq(arenaPurchases.action, 'buy')));
    const takes = new Map((await deps.db.select().from(arenaTakes).where(eq(arenaTakes.marketId, m.id))).map((t) => [t.advisorId, t.probabilityBps]));
    await deps.db.transaction(async (tx) => {
      await tx.update(arenaMarkets).set({ resolution: r.resolution, resolvedAt: new Date(now), resolutionSource: r.resolvedSource }).where(eq(arenaMarkets.id, m.id));
      for (const p of purchases) {
        const blind = forecasts.find((f) => f.agentId === p.agentId && f.kind === 'blind');
        const informed = forecasts.find((f) => f.agentId === p.agentId && f.kind === 'informed');
        if (!blind || !informed || !p.advisorId) continue;
        const advice = JSON.parse(informed.forecastJson).advice as { advisorId: string } | null;
        const takeBps = takes.get(advice?.advisorId ?? p.advisorId) ?? 5000;
        const delta = brier(blind.probabilityBps, outcome) - brier(informed.probabilityBps, outcome);
        await tx
          .insert(arenaEpisodes)
          .values({
            id: `${m.id}:${p.agentId}`,
            roundId: m.roundId,
            marketId: m.id,
            agentId: p.agentId,
            asset: m.asset,
            advisorId: advice?.advisorId ?? p.advisorId,
            fairTest: p.fairTest,
            blindBps: blind.probabilityBps,
            adviceBps: takeBps,
            informedBps: informed.probabilityBps,
            outcome,
            deltaMicro: Math.round(delta * 1e6),
            ...(FORECASTER_BY_ID.get(p.agentId)?.memory === false ? { memoryStatus: 'skipped' as const } : {}),
          })
          .onConflictDoNothing();
        if (p.payStatus === 'escrowed') {
          const pay = paysAdvisor(blind.probabilityBps, informed.probabilityBps, outcome);
          await tx.update(arenaPurchases).set({ payStatus: pay ? 'released' : 'refunded' }).where(eq(arenaPurchases.id, p.id));
        }
        episodes++;
        touchedAgents.add(p.agentId);
      }
    });
    resolvedMarkets++;
    touchedRounds.add(m.roundId);
    await event(deps, m.roundId, 'market_resolved', { asset: m.asset, outcome: r.resolution, source: r.resolvedSource, marketId: m.id });
  }

  for (const roundId of touchedRounds) {
    const left = await deps.db.select({ id: arenaMarkets.id }).from(arenaMarkets).where(and(eq(arenaMarkets.roundId, roundId), isNull(arenaMarkets.resolution)));
    if (!left.length) {
      await deps.db.update(arenaRounds).set({ status: 'settled', updatedAt: new Date(now) }).where(eq(arenaRounds.id, roundId));
      const pays = await deps.db.select().from(arenaPurchases).where(eq(arenaPurchases.roundId, roundId));
      await event(deps, roundId, 'round_settled', {
        released: pays.filter((p) => p.payStatus === 'released').length,
        refunded: pays.filter((p) => p.payStatus === 'refunded').length,
        releasedMicros: pays.filter((p) => p.payStatus === 'released').reduce((s, p) => s + p.priceMicros, 0),
      });
    }
  }

  // lessons: compare fresh stats with the last lesson each agent wrote
  let lessons = 0;
  const roundForLessons = [...touchedRounds].sort().at(-1) ?? 'n/a';
  for (const agentId of touchedAgents) {
    let agent: { id: string; name: string } | undefined = FORECASTER_BY_ID.get(agentId);
    if (!agent && agentId.startsWith('human:')) {
      const [p] = await deps.db.select().from(arenaPlayers).where(eq(arenaPlayers.id, agentId.slice(6)));
      if (p) agent = { id: agentId, name: `@${p.handle}` };
    }
    if (!agent || FORECASTER_BY_ID.get(agentId)?.memory === false) continue;
    const eps = await loadEpisodes(deps, agentId);
    const names = await advisorDirectory(deps.db);
    const ids = new Set([...names.keys()].filter((id) => names.get(id)!.kind === 'builtin').concat(eps.map((e) => e.advisorId)));
    const stats = new Map([...ids].map((id) => [id, advisorStats(id, eps)]));
    const prior = await deps.db.select().from(arenaLessons).where(eq(arenaLessons.agentId, agentId)).orderBy(asc(arenaLessons.createdAt));
    const remembered = new Map<string, RecalledLesson>();
    for (const l of prior) remembered.set(l.advisorId, { advisorId: l.advisorId, verdict: l.verdict as Verdict, blobId: l.walrusBlobId, text: l.text });
    for (const l of lessonsFromStats(agent, stats, remembered, names)) {
      await deps.db.insert(arenaLessons).values({ id: `${agentId}:${l.advisorId}:${roundForLessons}`, agentId, advisorId: l.advisorId, verdict: l.verdict, text: l.text, roundId: roundForLessons }).onConflictDoNothing();
      await event(deps, roundForLessons, 'lesson_learned', { verdict: l.verdict, text: l.text }, { agentId, advisorId: l.advisorId });
      lessons++;
    }
  }
  if (resolvedMarkets) deps.log('settled', { resolvedMarkets, episodes, lessons });
  return { resolvedMarkets, episodes, lessons };
}
