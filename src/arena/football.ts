import { and, eq, gte, like } from 'drizzle-orm';
import { buildBatch } from '@/core/batch';
import { canonicalJson } from '@/core/hash';
import { adviceContentHash, buildForecast, forecastHash, rulesHash } from '@/core/forecast';
import { arenaBatches, arenaMarkets, arenaRounds, arenaTakes, tatumCalls } from '@/db/schema';
import { seededRng, toBps } from './brain/math';
import { advisorUser, type ArenaDeps } from './deps';
import { event, submitBatch } from './sealer';
import type { PredictionEvent, PredictionMarket } from './tatum';
import { z } from 'zod';

/**
 * Matchday: people play the arena on real football matches too (Polymarket via Tatum).
 * One round per match ("fb:<eventId>"), one binary market per match: "Will <home team> win?".
 * Rounds open when the match is ≤ 30 h away; blind calls close 2 min before kickoff.
 * Advisors on football are code too:
 *   - The Crowd: Polymarket's YES price (via Tatum)
 *   - The Whale: which side the biggest open positions sit on (Tatum market positions)
 *   - Loud Tipster, Fence Sitter (controls)
 * Their takes are sealed in one Walrus batch per match before anyone can read them.
 * Settlement uses Tatum's market resolution (UMA), looked up at most every 30 min per match.
 */

export const LEAGUES = [
  { tag: 'EPL', name: 'Premier League' },
  { tag: 'la-liga', name: 'LaLiga' },
  { tag: 'ucl', name: 'Champions League' },
  { tag: 'bundesliga', name: 'Bundesliga' },
] as const;

const OPEN_AHEAD_MS = 30 * 3600_000;
const SYNC_EVERY_MS = 12 * 3600_000;

export interface MatchMarket {
  eventId: string;
  league: string;
  title: string;
  kickoff: string;
  market: PredictionMarket;
  yes: number;
}

/** Picks the "Will <home> win?" market from a match event ("Home vs. Away"). */
export function homeWinMarket(ev: PredictionEvent, league: string): MatchMarket | null {
  if (!ev.title || !/ vs\. /.test(ev.title) || / - /.test(ev.title) || !ev.closeTime) return null;
  const home = ev.title.split(' vs. ')[0].trim();
  const markets = ev.markets.filter((m): m is PredictionMarket => typeof m !== 'string');
  const m = markets.find((x) => x.question.startsWith(`Will ${home} win`));
  const yes = m?.outcomes.find((o) => o.name.toUpperCase() === 'YES');
  if (!m || !yes) return null;
  return { eventId: ev.id, league, title: ev.title, kickoff: new Date(ev.closeTime).toISOString(), market: m, yes: yes.price };
}

const Positions = z.object({
  data: z.array(z.object({ positions: z.array(z.object({ outcome: z.string().nullable(), currentValue: z.number(), size: z.number(), name: z.string().nullable() }).passthrough()) }).passthrough()),
});

/** The Whale: USD value of the 5 biggest open YES vs NO positions. */
export async function whaleTake(deps: ArenaDeps, conditionId: string) {
  const r = await deps.tatum.get('positions', `/markets/${conditionId}/positions?status=OPEN&sortBy=TOKENS&sortDirection=DESC&limit=5`, Positions);
  let yes = 0;
  let no = 0;
  for (const g of r.data) for (const p of g.positions) (p.outcome?.toUpperCase() === 'YES' ? (yes += p.currentValue) : (no += p.currentValue));
  const p = yes + no > 0 ? 0.5 + 0.4 * ((yes - no) / (yes + no)) : 0.5;
  return { p, says: `Top holders: $${Math.round(yes).toLocaleString('en-US')} on YES vs $${Math.round(no).toLocaleString('en-US')} on NO.`, inputs: { yesUsd: Math.round(yes), noUsd: Math.round(no) } };
}

/** Worker step: every 12 h, open rounds for matches kicking off within 30 h. */
export async function syncMatchday(deps: ArenaDeps, opts: { events?: Record<string, PredictionEvent[]> } = {}) {
  const now = deps.now();
  if (!opts.events) {
    const [recent] = await deps.db.select({ at: tatumCalls.at }).from(tatumCalls).where(and(like(tatumCalls.path, '%tag=EPL%'), gte(tatumCalls.at, new Date(now - SYNC_EVERY_MS)))).limit(1);
    if (recent) return { opened: 0 };
  }
  let opened = 0;
  for (const lg of LEAGUES) {
    let evs: PredictionEvent[];
    try {
      evs = opts.events?.[lg.tag] ?? (await deps.tatum.events({ platform: 'polymarket', tag: lg.tag, status: 'active', sort: 'endingSoon', limit: 100, includeMarkets: true })).data;
    } catch (err) {
      deps.log('matchday sync failed', { league: lg.tag, err: String(err) });
      continue;
    }
    for (const ev of evs) {
      const mm = homeWinMarket(ev, lg.name);
      if (!mm) continue;
      const ko = Date.parse(mm.kickoff);
      if (ko <= now + 15 * 60_000 || ko > now + OPEN_AHEAD_MS) continue;
      if (await openMatchRound(deps, mm)) opened++;
    }
  }
  if (opened) deps.log('matchday rounds opened', { opened });
  return { opened };
}

export async function openMatchRound(deps: ArenaDeps, mm: MatchMarket): Promise<boolean> {
  const roundId = `fb:${mm.eventId}`;
  const [exists] = await deps.db.select({ id: arenaRounds.id }).from(arenaRounds).where(eq(arenaRounds.id, roundId));
  if (exists) return false;
  const now = deps.now();
  const createdAt = new Date(now).toISOString();
  const marketRef = { platform: 'polymarket' as const, id: mm.market.id, question: mm.market.question, rulesHash: rulesHash(mm.market.description), closeTime: mm.kickoff };
  const marketId = `${roundId}:match`;
  const takes: { advisorId: string; name: string; p: number; says: string; inputs: Record<string, unknown> }[] = [
    { advisorId: 'crowd', name: 'The Crowd', p: mm.yes, says: `Polymarket prices a home win at ${Math.round(mm.yes * 100)}%.`, inputs: { yesPrice: mm.yes } },
    { advisorId: 'fence', name: 'Fence Sitter', p: 0.5, says: 'Could go either way: 50%.', inputs: {} },
  ];
  const up = seededRng(`hype:${roundId}`)() < 0.5;
  takes.push({ advisorId: 'hype', name: 'Loud Tipster', p: up ? 0.88 : 0.12, says: up ? 'HOME WIN. Lock it. 88%.' : 'They lose. Trust me. 12%.', inputs: {} });
  try {
    const w = await whaleTake(deps, mm.market.id);
    takes.push({ advisorId: 'whale', name: 'The Whale', ...w });
  } catch (err) {
    deps.log('whale take failed', { eventId: mm.eventId, err: String(err) });
  }
  const sealed = takes.map((t) => {
    const probabilityBps = toBps(t.p);
    const shown = { advisorId: t.advisorId, advisor: t.name, market: mm.market.id, says: t.says, probabilityBps, inputs: t.inputs };
    const forecast = buildForecast({ kind: 'take', user: advisorUser(t.advisorId), market: marketRef, outcome: 'YES', probabilityBps, createdAt });
    return { t, probabilityBps, shown, forecast };
  });
  const batch = buildBatch({ roundId, phase: 'take', forecasts: sealed.map((s) => s.forecast), createdAt });
  await deps.db.transaction(async (tx) => {
    await tx.insert(arenaRounds).values({ id: roundId, windowStart: new Date(now), closeTime: new Date(mm.kickoff), lockAt: new Date(now), status: 'locked' });
    await tx.insert(arenaMarkets).values({
      id: marketId,
      roundId,
      asset: 'match',
      conditionId: mm.market.id,
      eventId: mm.eventId,
      question: mm.market.question,
      description: mm.market.description ?? '',
      rulesHash: marketRef.rulesHash,
      url: mm.market.source.url,
      upTokenId: null,
      windowStart: new Date(now),
      closeTime: new Date(mm.kickoff),
      marketUpBps: toBps(mm.yes),
      liquidity: mm.market.liquidity === null ? null : Math.round(mm.market.liquidity),
      featuresJson: JSON.stringify({ league: mm.league, title: mm.title, kickoff: mm.kickoff }),
    });
    for (const s of sealed) {
      await tx.insert(arenaTakes).values({
        marketId,
        advisorId: s.t.advisorId,
        advisorName: s.t.name,
        priceMicros: 0,
        probabilityBps: s.probabilityBps,
        says: s.t.says,
        inputsJson: JSON.stringify(s.t.inputs),
        hash: forecastHash(s.forecast),
        forecastJson: canonicalJson(s.forecast),
        contentHash: adviceContentHash(s.shown),
      });
    }
    await tx.insert(arenaBatches).values({ id: batch.namespace, roundId, phase: 'take', root: batch.root, leafCount: batch.manifest.leaves.length, manifestJson: canonicalJson(batch.manifest), status: 'queued' });
  });
  await submitBatch(deps, batch.namespace);
  await event(deps, roundId, 'match_opened', { league: mm.league, title: mm.title, kickoff: mm.kickoff, homeWinBps: toBps(mm.yes), advisors: sealed.map((s) => s.t.advisorId) });
  return true;
}
