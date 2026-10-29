import { eq } from 'drizzle-orm';
import { buildBatch, type BatchPhase } from '@/core/batch';
import { canonicalJson } from '@/core/hash';
import { adviceContentHash, buildForecast, forecastHash, type ForecastV1 } from '@/core/forecast';
import { arenaBatches, arenaForecasts, arenaMarkets, arenaPurchases, arenaRounds, arenaTakes } from '@/db/schema';
import { computeFeatures, type WindowFeatures } from './brain/features';
import { advisorStats, blendBps, decide } from './brain/learner';
import { toBps } from './brain/math';
import { ADVISORS, ADVISOR_BY_ID, FORECASTERS, type AdvisorContext, type OrderbookSnapshot, type Take } from './brain/models';
import { advisorUser, agentUser, roundIdFor, type ArenaDeps } from './deps';
import { ASSETS, fetchLive15m, marketRefOf, type FastMarket } from './fast-markets';
import { fetchCandles, fetchUpBook } from './feeds';
import { loadEpisodes, recallLessons } from './memory';
import { event, submitBatch } from './sealer';

/**
 * Locking a round (docs/ARENA.md, "Round lifecycle"), `lockMinute` minutes after a 15-minute window opens:
 *  1. one Tatum call → the live Up/Down markets closing at `closeMs` (+ Polymarket's UP price)
 *  2. free feeds → 1-minute spot candles and the UP order book, turned into features
 *  3. every advisor publishes a take per market (sealed, kind "take")
 *  4. every agent makes a blind call per market (sealed, kind "blind")
 *  5. every agent recalls its lessons from Walrus Memory and decides whom to buy from (or declines)
 *  6. it reads the take, blends it with learned trust and makes an informed call (sealed, kind "informed")
 *  7. three Merkle batch seals go to Walrus Memory in order: blind, take, informed
 */

export interface LockResult {
  roundId: string;
  status: 'locked' | 'void' | 'exists';
  markets: number;
  buys: number;
  declines: number;
}

interface MarketCtx {
  market: FastMarket;
  marketId: string;
  features: WindowFeatures;
  book: OrderbookSnapshot | null;
  takes: Map<string, { take: Take; forecast: ForecastV1; shown: Record<string, unknown> }>;
}

export async function lockRound(deps: ArenaDeps, closeMs: number, opts: { live?: FastMarket[] } = {}): Promise<LockResult> {
  const roundId = roundIdFor(closeMs);
  const [existing] = await deps.db.select().from(arenaRounds).where(eq(arenaRounds.id, roundId));
  if (existing) return { roundId, status: 'exists', markets: 0, buys: 0, declines: 0 };

  const now = deps.now();
  const windowStart = closeMs - 15 * 60_000;
  const lockAt = windowStart + deps.config.lockMinute * 60_000;

  const live = opts.live ?? (await fetchLive15m(deps.tatum));
  const markets = live.filter((m) => Date.parse(m.closeTime) === closeMs && m.windowMinutes === 15 && deps.config.assets.includes(m.asset));

  const ctxs: MarketCtx[] = [];
  const asOf = new Date(Math.floor(now / 60_000) * 60_000).toISOString();
  await Promise.all(
    markets.map(async (m) => {
      try {
        const candles = await fetchCandles(ASSETS[m.asset].spot, windowStart - 35 * 60_000, now, deps.fetch);
        const features = computeFeatures({ asset: m.asset, candles, windowStart: m.windowStart, closeTime: m.closeTime, asOf });
        if (!features) return deps.log('no features', { asset: m.asset });
        const book = m.upTokenId ? await fetchUpBook(m.upTokenId, deps.fetch).catch(() => null) : null;
        ctxs.push({ market: m, marketId: `${roundId}:${m.asset}`, features, book, takes: new Map() });
      } catch (err) {
        deps.log('feed failed', { asset: m.asset, err: String(err) });
      }
    }),
  );
  ctxs.sort((a, b) => a.market.asset.localeCompare(b.market.asset));

  if (!ctxs.length) {
    await deps.db.insert(arenaRounds).values({ id: roundId, windowStart: new Date(windowStart), closeTime: new Date(closeMs), lockAt: new Date(lockAt), status: 'void', error: `no usable markets (${markets.length} from Tatum)` });
    return { roundId, status: 'void', markets: 0, buys: 0, declines: 0 };
  }

  const createdAt = new Date(now).toISOString();
  // ---- advisor takes
  for (const c of ctxs) {
    const actx: AdvisorContext = { roundId, marketUp: c.market.upPrice, features: c.features, book: c.book };
    for (const a of ADVISORS) {
      const take = a.take(actx);
      const probabilityBps = toBps(take.p);
      const shown = { advisorId: a.id, advisor: a.name, market: c.market.conditionId, says: take.says, probabilityBps, inputs: take.inputs };
      const forecast = buildForecast({ kind: 'take', user: advisorUser(a.id), market: marketRefOf(c.market), outcome: 'UP', probabilityBps, createdAt });
      c.takes.set(a.id, { take, forecast, shown });
    }
  }

  // ---- agents: blind → recall lessons → decide → informed
  const blinds: { c: MarketCtx; agentId: string; forecast: ForecastV1 }[] = [];
  const informeds: { c: MarketCtx; agentId: string; forecast: ForecastV1 }[] = [];
  const purchases: (typeof arenaPurchases.$inferInsert)[] = [];
  for (const agent of FORECASTERS) {
    const episodes = await loadEpisodes(deps, agent.id);
    const stats = new Map(ADVISORS.map((a) => [a.id, advisorStats(a.id, episodes)]));
    const { lessons, source } = await recallLessons(deps, agent.id);
    if (lessons.size) await event(deps, roundId, 'lessons_recalled', { source, lessons: [...lessons.values()].map((l) => ({ advisorId: l.advisorId, verdict: l.verdict, blobId: l.blobId })) }, { agentId: agent.id });
    for (const c of ctxs) {
      const blindBps = toBps(agent.blind(c.features));
      const blind = buildForecast({ kind: 'blind', user: agentUser(agent.id), market: marketRefOf(c.market), outcome: 'UP', probabilityBps: blindBps, createdAt });
      blinds.push({ c, agentId: agent.id, forecast: blind });
      const d = decide({ seed: `${roundId}:${c.market.asset}:${agent.id}`, advisorIds: ADVISORS.map((a) => a.id), stats, lessons, totalEpisodes: episodes.length });
      const base = { id: `${c.marketId}:${agent.id}`, roundId, marketId: c.marketId, agentId: agent.id, reason: d.reason };
      if (d.action === 'decline') {
        purchases.push({ ...base, action: 'decline', lessonBlobIdsJson: JSON.stringify(d.lessonBlobIds) });
        continue;
      }
      const adv = ADVISOR_BY_ID.get(d.advisorId)!;
      const t = c.takes.get(adv.id)!;
      const trust = stats.get(adv.id)!.trust;
      const informedBps = blendBps(blindBps, toBps(t.take.p), trust);
      const informed = buildForecast({
        kind: 'informed',
        user: agentUser(agent.id),
        market: marketRefOf(c.market),
        outcome: 'UP',
        probabilityBps: informedBps,
        prev: forecastHash(blind),
        advice: { advisorId: adv.id, advisorKind: 'agent', contentHash: adviceContentHash(t.shown), fairTest: d.fairTest },
        createdAt,
      });
      informeds.push({ c, agentId: agent.id, forecast: informed });
      purchases.push({
        ...base,
        action: 'buy',
        advisorId: adv.id,
        fairTest: d.fairTest,
        lessonBlobIdsJson: JSON.stringify(d.lessonBlobId ? [d.lessonBlobId] : []),
        priceMicros: adv.priceMicros,
        trustUsed: Math.round(trust * 10000),
        payStatus: 'escrowed',
        payNetwork: 'ledger',
      });
    }
  }

  // ---- batches
  const takeForecasts = ctxs.flatMap((c) => [...c.takes.values()].map((t) => t.forecast));
  const built: Partial<Record<BatchPhase, ReturnType<typeof buildBatch>>> = {
    blind: buildBatch({ roundId, phase: 'blind', forecasts: blinds.map((b) => b.forecast), createdAt }),
    take: buildBatch({ roundId, phase: 'take', forecasts: takeForecasts, createdAt }),
  };
  if (informeds.length) built.informed = buildBatch({ roundId, phase: 'informed', forecasts: informeds.map((b) => b.forecast), createdAt });

  // ---- persist (one transaction)
  await deps.db.transaction(async (tx) => {
    await tx.insert(arenaRounds).values({ id: roundId, windowStart: new Date(windowStart), closeTime: new Date(closeMs), lockAt: new Date(lockAt), status: 'locked' });
    for (const c of ctxs) {
      const m = c.market;
      await tx.insert(arenaMarkets).values({
        id: c.marketId,
        roundId,
        asset: m.asset,
        conditionId: m.conditionId,
        eventId: m.eventId,
        question: m.question,
        description: m.description,
        rulesHash: m.rulesHash,
        url: m.url,
        upTokenId: m.upTokenId,
        windowStart: new Date(m.windowStart),
        closeTime: new Date(m.closeTime),
        marketUpBps: toBps(m.upPrice),
        liquidity: m.liquidity === null ? null : Math.round(m.liquidity),
        featuresJson: JSON.stringify(c.features),
        bookJson: c.book ? JSON.stringify(c.book) : null,
      });
      for (const [advisorId, t] of c.takes) {
        await tx.insert(arenaTakes).values({
          marketId: c.marketId,
          advisorId,
          probabilityBps: t.forecast.probabilityBps,
          says: t.take.says,
          inputsJson: JSON.stringify(t.take.inputs),
          hash: forecastHash(t.forecast),
          forecastJson: canonicalJson(t.forecast),
          contentHash: adviceContentHash(t.shown),
        });
      }
    }
    for (const [phase, b] of Object.entries(built) as [BatchPhase, ReturnType<typeof buildBatch>][]) {
      await tx.insert(arenaBatches).values({ id: b.namespace, roundId, phase, root: b.root, leafCount: b.manifest.leaves.length, manifestJson: canonicalJson(b.manifest), status: 'queued' });
    }
    for (const [list, phase] of [
      [blinds, 'blind'],
      [informeds, 'informed'],
    ] as const) {
      for (const f of list) {
        await tx.insert(arenaForecasts).values({
          hash: forecastHash(f.forecast),
          roundId,
          marketId: f.c.marketId,
          agentId: f.agentId,
          kind: phase,
          probabilityBps: f.forecast.probabilityBps,
          forecastJson: canonicalJson(f.forecast),
          batchId: built[phase]!.namespace,
        });
      }
    }
    for (const p of purchases) await tx.insert(arenaPurchases).values(p);
  });

  const buys = purchases.filter((p) => p.action === 'buy');
  await event(deps, roundId, 'round_locked', {
    closeTime: new Date(closeMs).toISOString(),
    markets: ctxs.map((c) => ({ asset: c.market.asset, marketUpBps: toBps(c.market.upPrice), url: c.market.url })),
    buys: buys.length,
    declines: purchases.length - buys.length,
  });
  for (const p of purchases) await event(deps, roundId, p.action === 'buy' ? 'take_bought' : 'take_declined', { marketId: p.marketId, fairTest: p.fairTest ?? false, reason: p.reason, priceMicros: p.priceMicros ?? 0 }, { agentId: p.agentId, advisorId: p.advisorId ?? undefined });

  // submit in order: blind first, then takes, then informed
  for (const phase of ['blind', 'take', 'informed'] as const) if (built[phase]) await submitBatch(deps, built[phase]!.namespace);

  deps.log('round locked', { roundId, markets: ctxs.length, buys: buys.length, declines: purchases.length - buys.length });
  return { roundId, status: 'locked', markets: ctxs.length, buys: buys.length, declines: purchases.length - buys.length };
}
