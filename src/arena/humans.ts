import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { and, asc, desc, eq, gt, inArray, isNotNull, like, lt } from 'drizzle-orm';
import { verifySeal } from '@/core/evidence';
import { canonicalJson } from '@/core/hash';
import { adviceContentHash, buildForecast, forecastHash, ForecastV1 } from '@/core/forecast';
import { sealNamespaceFor } from '@/core/namespace';
import { u256FromBlobId } from '@/core/walrus-ids';
import type { Db } from '@/db/client';
import { arenaEpisodes, arenaForecasts, arenaMarkets, arenaPlayers, arenaPurchases, arenaRounds, arenaTakes } from '@/db/schema';
import { withSuiRetry } from '@/lib/sui';
import { advisorStats, type Episode } from './brain/learner';
import { seededRng } from './brain/math';
import type { ArenaDeps } from './deps';
import { advisorDirectory } from './registry';
import { event, locateBlobs } from './sealer';

/**
 * People in the arena (docs/ARENA.md, "Humans"). Same rounds and advisors as the agents:
 *   1. blind call  (sealed on its own: an rcpt1 single seal, docs/PROOF.md)
 *   2. reveal ONE take — a random advisor by default ("fair test"), or one you pick — only after your blind
 *      call is stored on Walrus, so the order is provable
 *   3. informed call (sealed, linked to the blind call and the exact take you saw)
 * Settlement, Brier deltas, verdicts and lessons are shared with the agents (agentId = "human:<playerId>").
 * Humans read takes for free; agents pay over MPP.
 */

export const humanAgentId = (playerId: string) => `human:${playerId}`;
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
/** blind calls close 2 minutes before the market; informed calls 1 minute before */
const BLIND_CUTOFF_MS = 2 * 60_000;
const INFORMED_CUTOFF_MS = 60_000;

export class PlayError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export async function createPlayer(db: Db, handleRaw: string) {
  const handle = handleRaw.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(handle)) throw new PlayError('handle: 3–20 chars, a-z 0-9 _');
  const [taken] = await db.select().from(arenaPlayers).where(eq(arenaPlayers.handle, handle));
  if (taken) throw new PlayError('handle taken', 409);
  const id = randomUUID();
  const token = `rcpt_${randomBytes(24).toString('base64url')}`;
  await db.insert(arenaPlayers).values({ id, handle, tokenHash: sha(token) });
  return { playerId: id, handle, token };
}

export async function authPlayer(db: Db, authHeader: string | null) {
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new PlayError('missing bearer token', 401);
  const [p] = await db.select().from(arenaPlayers).where(eq(arenaPlayers.tokenHash, sha(token)));
  if (!p) throw new PlayError('unknown token', 401);
  return p;
}

/** The round people can play right now: its markets, without prices (you call it blind first). */
export async function openRound(db: Db, nowMs: number) {
  const [r] = await db
    .select()
    .from(arenaRounds)
    .where(and(eq(arenaRounds.status, 'locked'), like(arenaRounds.id, '15m:%')))
    .orderBy(desc(arenaRounds.closeTime))
    .limit(1);
  if (!r || nowMs >= r.closeTime.getTime() - BLIND_CUTOFF_MS) return null;
  const markets = await db.select().from(arenaMarkets).where(eq(arenaMarkets.roundId, r.id)).orderBy(asc(arenaMarkets.asset));
  const dir = await advisorDirectory(db);
  const advisorIds = [...new Set((await db.select({ id: arenaTakes.advisorId }).from(arenaTakes).where(inArray(arenaTakes.marketId, markets.map((m) => m.id)))).map((x) => x.id))];
  return {
    roundId: r.id,
    closeTime: r.closeTime.toISOString(),
    blindUntil: new Date(r.closeTime.getTime() - BLIND_CUTOFF_MS).toISOString(),
    informedUntil: new Date(r.closeTime.getTime() - INFORMED_CUTOFF_MS).toISOString(),
    markets: markets.map((m) => ({ asset: m.asset, question: m.question, windowStart: m.windowStart.toISOString(), closeTime: m.closeTime.toISOString(), url: m.url })),
    advisors: advisorIds.map((id) => ({ id, name: dir.get(id)?.name ?? id, pitch: dir.get(id)?.pitch ?? '' })),
  };
}

/** Football matches you can play now (blind calls close 2 min before kickoff). No prices: call blind first. */
export async function openMatches(db: Db, nowMs: number) {
  const rounds = await db
    .select()
    .from(arenaRounds)
    .where(and(eq(arenaRounds.status, 'locked'), like(arenaRounds.id, 'fb:%'), gt(arenaRounds.closeTime, new Date(nowMs + BLIND_CUTOFF_MS))))
    .orderBy(asc(arenaRounds.closeTime));
  const out = [];
  for (const r of rounds) {
    const [m] = await db.select().from(arenaMarkets).where(eq(arenaMarkets.roundId, r.id));
    if (!m) continue;
    const f = JSON.parse(m.featuresJson) as { league: string; title: string };
    const advisors = await db.select({ id: arenaTakes.advisorId, name: arenaTakes.advisorName }).from(arenaTakes).where(eq(arenaTakes.marketId, m.id));
    out.push({ roundId: r.id, asset: 'match', league: f.league, title: f.title, question: m.question, kickoff: r.closeTime.toISOString(), url: m.url, advisors });
  }
  return out;
}

async function marketFor(db: Db, roundId: string, asset: string, nowMs: number, cutoffMs: number) {
  const [m] = await db.select().from(arenaMarkets).where(and(eq(arenaMarkets.roundId, roundId), eq(arenaMarkets.asset, asset)));
  if (!m) throw new PlayError('no such market in this round', 404);
  const [r] = await db.select().from(arenaRounds).where(eq(arenaRounds.id, roundId));
  if (!r || r.status !== 'locked') throw new PlayError('round is not open', 409);
  if (nowMs >= m.closeTime.getTime() - cutoffMs) throw new PlayError('too late for this market', 409);
  return m;
}

/** Crypto windows ask "UP?"; football matches ask "will the home team win?" (YES). */
const outcomeOf = (m: typeof arenaMarkets.$inferSelect) => (m.asset === 'match' ? 'YES' : 'UP');

const refOf = (m: typeof arenaMarkets.$inferSelect) => ({ platform: 'polymarket' as const, id: m.conditionId, question: m.question, rulesHash: m.rulesHash, closeTime: m.closeTime.toISOString() });

async function sealOne(deps: ArenaDeps, f: ForecastV1) {
  const hash = forecastHash(f);
  const namespace = sealNamespaceFor(f);
  try {
    const res = await deps.mem.remember(canonicalJson(f), namespace, { idempotencyKey: `seal:${hash}` });
    await deps.db.update(arenaForecasts).set({ sealStatus: 'submitted', sealJobId: res.job_id, sealAttempts: 1 }).where(eq(arenaForecasts.hash, hash));
  } catch (err) {
    deps.log('human seal submit failed (will retry)', { hash, err: String(err) });
  }
  return { hash, namespace };
}

export async function playBlind(deps: ArenaDeps, playerId: string, input: { roundId: string; asset: string; probabilityBps: number }) {
  const m = await marketFor(deps.db, input.roundId, input.asset, deps.now(), BLIND_CUTOFF_MS);
  if (!Number.isInteger(input.probabilityBps) || input.probabilityBps < 1 || input.probabilityBps > 9999) throw new PlayError('probabilityBps must be an integer 1..9999');
  const agentId = humanAgentId(playerId);
  const [dup] = await deps.db.select().from(arenaForecasts).where(and(eq(arenaForecasts.marketId, m.id), eq(arenaForecasts.agentId, agentId), eq(arenaForecasts.kind, 'blind')));
  if (dup) throw new PlayError('you already locked a blind call on this market', 409);
  const f = buildForecast({ kind: 'blind', user: agentId, market: refOf(m), outcome: outcomeOf(m), probabilityBps: input.probabilityBps, createdAt: new Date(deps.now()).toISOString() });
  await deps.db.insert(arenaForecasts).values({ hash: forecastHash(f), roundId: m.roundId, marketId: m.id, agentId, kind: 'blind', probabilityBps: f.probabilityBps, forecastJson: canonicalJson(f), sealNamespace: sealNamespaceFor(f), sealStatus: 'queued' });
  const sealed = await sealOne(deps, f);
  await event(deps, m.roundId, 'human_blind', { asset: m.asset, hash: sealed.hash }, { agentId });
  return { ...sealed, receipt: `/api/arena/receipts/${sealed.hash}` };
}

/** Reveals ONE take for this market. Requires the blind call to be stored on Walrus first. */
export async function playReveal(deps: ArenaDeps, playerId: string, input: { roundId: string; asset: string; advisorId?: string }) {
  const m = await marketFor(deps.db, input.roundId, input.asset, deps.now(), INFORMED_CUTOFF_MS);
  const agentId = humanAgentId(playerId);
  const purchaseId = `${m.id}:${agentId}`;
  const [blind] = await deps.db.select().from(arenaForecasts).where(and(eq(arenaForecasts.marketId, m.id), eq(arenaForecasts.agentId, agentId), eq(arenaForecasts.kind, 'blind')));
  if (!blind) throw new PlayError('lock a blind call first', 409);
  if (blind.sealStatus === 'submitted' && blind.sealJobId) {
    const st = await deps.mem.getRememberStatus(blind.sealJobId).catch(() => null);
    if (st?.status === 'done' && st.blob_id) {
      await deps.db.update(arenaForecasts).set({ sealStatus: 'stored', walrusBlobId: st.blob_id }).where(eq(arenaForecasts.hash, blind.hash));
      blind.sealStatus = 'stored';
    }
  }
  if (blind.sealStatus !== 'stored' && blind.sealStatus !== 'verified') throw new PlayError('your blind call is still being sealed on Walrus — try again in a few seconds', 425);

  const takes = await deps.db.select().from(arenaTakes).where(eq(arenaTakes.marketId, m.id));
  const [existing] = await deps.db.select().from(arenaPurchases).where(eq(arenaPurchases.id, purchaseId));
  let advisorId = existing?.advisorId ?? input.advisorId ?? null;
  const fairTest = existing ? existing.fairTest : !input.advisorId;
  if (!advisorId) advisorId = takes[Math.floor(seededRng(`${purchaseId}:${randomBytes(8).toString('hex')}`)() * takes.length)].advisorId;
  const t = takes.find((x) => x.advisorId === advisorId);
  if (!t) throw new PlayError('that advisor has no take on this market', 404);
  if (!existing) {
    await deps.db.insert(arenaPurchases).values({ id: purchaseId, roundId: m.roundId, marketId: m.id, agentId, advisorId, action: 'buy', fairTest, reason: fairTest ? 'fair test (random advisor)' : 'picked by the player', priceMicros: 0, payStatus: 'none' });
    await event(deps, m.roundId, 'human_reveal', { asset: m.asset, fairTest }, { agentId, advisorId });
  }
  const shown = { advisorId: t.advisorId, advisor: t.advisorName, market: m.conditionId, says: t.says, probabilityBps: t.probabilityBps, inputs: JSON.parse(t.inputsJson) };
  return { advisorId, fairTest, shown, takeReceipt: `/api/arena/receipts/${t.hash}` };
}

export async function playInformed(deps: ArenaDeps, playerId: string, input: { roundId: string; asset: string; probabilityBps: number }) {
  const m = await marketFor(deps.db, input.roundId, input.asset, deps.now(), INFORMED_CUTOFF_MS);
  if (!Number.isInteger(input.probabilityBps) || input.probabilityBps < 1 || input.probabilityBps > 9999) throw new PlayError('probabilityBps must be an integer 1..9999');
  const agentId = humanAgentId(playerId);
  const [p] = await deps.db.select().from(arenaPurchases).where(eq(arenaPurchases.id, `${m.id}:${agentId}`));
  if (!p?.advisorId) throw new PlayError('reveal a take first', 409);
  const [blind] = await deps.db.select().from(arenaForecasts).where(and(eq(arenaForecasts.marketId, m.id), eq(arenaForecasts.agentId, agentId), eq(arenaForecasts.kind, 'blind')));
  const [dup] = await deps.db.select().from(arenaForecasts).where(and(eq(arenaForecasts.marketId, m.id), eq(arenaForecasts.agentId, agentId), eq(arenaForecasts.kind, 'informed')));
  if (dup) throw new PlayError('you already locked an informed call on this market', 409);
  const [t] = await deps.db.select().from(arenaTakes).where(and(eq(arenaTakes.marketId, m.id), eq(arenaTakes.advisorId, p.advisorId)));
  const shown = { advisorId: t.advisorId, advisor: t.advisorName, market: m.conditionId, says: t.says, probabilityBps: t.probabilityBps, inputs: JSON.parse(t.inputsJson) };
  const f = buildForecast({
    kind: 'informed',
    user: agentId,
    market: refOf(m),
    outcome: outcomeOf(m),
    probabilityBps: input.probabilityBps,
    prev: blind.hash,
    advice: { advisorId: t.advisorId, advisorKind: 'agent', contentHash: adviceContentHash(shown), fairTest: p.fairTest },
    createdAt: new Date(deps.now()).toISOString(),
  });
  await deps.db.insert(arenaForecasts).values({ hash: forecastHash(f), roundId: m.roundId, marketId: m.id, agentId, kind: 'informed', probabilityBps: f.probabilityBps, forecastJson: canonicalJson(f), sealNamespace: sealNamespaceFor(f), sealStatus: 'queued' });
  const sealed = await sealOne(deps, f);
  await event(deps, m.roundId, 'human_informed', { asset: m.asset, hash: sealed.hash, moved: input.probabilityBps !== blind.probabilityBps }, { agentId, advisorId: t.advisorId });
  return { ...sealed, receipt: `/api/arena/receipts/${sealed.hash}` };
}

/** Worker step: push human single seals forward (submit → stored → verified on Sui). */
export async function advanceHumanSeals(deps: ArenaDeps): Promise<number> {
  const db = deps.db;
  let changed = 0;
  const queued = await db.select().from(arenaForecasts).where(and(eq(arenaForecasts.sealStatus, 'queued'), lt(arenaForecasts.sealAttempts, 8)));
  for (const f of queued) {
    await db.update(arenaForecasts).set({ sealAttempts: f.sealAttempts + 1 }).where(eq(arenaForecasts.hash, f.hash));
    await sealOne(deps, ForecastV1.parse(JSON.parse(f.forecastJson)));
    changed++;
  }
  const submitted = await db.select().from(arenaForecasts).where(and(eq(arenaForecasts.sealStatus, 'submitted'), isNotNull(arenaForecasts.sealJobId)));
  for (const f of submitted) {
    const st = await deps.mem.getRememberStatus(f.sealJobId!).catch(() => null);
    if (st?.status === 'done' && st.blob_id) {
      await db.update(arenaForecasts).set({ sealStatus: 'stored', walrusBlobId: st.blob_id }).where(eq(arenaForecasts.hash, f.hash));
      changed++;
    } else if (st?.status === 'failed' || st?.status === 'not_found') {
      await db.update(arenaForecasts).set({ sealStatus: 'queued', sealJobId: null }).where(eq(arenaForecasts.hash, f.hash));
    }
  }
  const stored = await db.select().from(arenaForecasts).where(eq(arenaForecasts.sealStatus, 'stored'));
  if (!stored.length) return changed;
  const located = await locateBlobs(deps, stored.map((f) => u256FromBlobId(f.walrusBlobId!)));
  for (const f of stored.sort((a, b) => (a.kind === 'blind' ? -1 : 1) - (b.kind === 'blind' ? -1 : 1))) {
    const loc = located.get(u256FromBlobId(f.walrusBlobId!));
    if (!loc?.previousTransaction) continue;
    const forecast = ForecastV1.parse(JSON.parse(f.forecastJson));
    const commitTx = await withSuiRetry(() => deps.sui.core.getTransaction({ digest: loc.previousTransaction!, include: { transaction: true, effects: true } }));
    const blobObject = await withSuiRetry(() => deps.sui.core.getObject({ objectId: loc.blobObjectId, include: { json: true, previousTransaction: true } }));
    let blindCommitTimestampMs: number | undefined;
    if (f.kind === 'informed' && forecast.prev) {
      const [b] = await db.select().from(arenaForecasts).where(eq(arenaForecasts.hash, forecast.prev));
      blindCommitTimestampMs = b?.commitTimestampMs ?? undefined;
    }
    const v = verifySeal({ forecast, commitTx, blobObject, expectedAccountId: deps.config.memwalAccountId, expectedOwner: deps.config.memwalOwner, blindCommitTimestampMs });
    await db
      .update(arenaForecasts)
      .set({ sealStatus: v.status === 'invalid' ? 'failed' : 'verified', commitDigest: v.commit.digest, commitTimestampMs: v.commit.timestampMs, verificationJson: JSON.stringify(v) })
      .where(eq(arenaForecasts.hash, f.hash));
    changed++;
  }
  return changed;
}

/** "Who helps you": a player's settled episodes and per-advisor verdicts, plus their open calls. */
export async function playerSummary(db: Db, playerId: string) {
  const agentId = humanAgentId(playerId);
  const rows = await db.select().from(arenaEpisodes).where(eq(arenaEpisodes.agentId, agentId)).orderBy(desc(arenaEpisodes.settledAt));
  const eps: Episode[] = rows.map((r) => ({ roundId: r.roundId, asset: r.asset, advisorId: r.advisorId, fairTest: r.fairTest, pBlind: r.blindBps / 10000, pAdvice: r.adviceBps / 10000, pInformed: r.informedBps / 10000, outcome: r.outcome as 0 | 1 }));
  const dir = await advisorDirectory(db);
  const ids = [...new Set(eps.map((e) => e.advisorId))];
  const calls = await db.select().from(arenaForecasts).where(eq(arenaForecasts.agentId, agentId)).orderBy(desc(arenaForecasts.roundId)).limit(40);
  return {
    episodes: rows.length,
    advisors: ids.map((id) => {
      const s = advisorStats(id, eps);
      return { advisorId: id, name: dir.get(id)?.name ?? id, n: s.n, verdict: s.verdict, meanDelta: s.summary.meanDelta, ciLow: s.summary.ciLow, ciHigh: s.summary.ciHigh };
    }),
    recent: rows.slice(0, 20).map((r) => ({ roundId: r.roundId, asset: r.asset, advisorId: r.advisorId, blindBps: r.blindBps, informedBps: r.informedBps, outcome: r.outcome ? 'UP' : 'DOWN', deltaMBrier: r.deltaMicro / 1000 })),
    calls: calls.map((c) => ({ hash: c.hash, roundId: c.roundId, kind: c.kind, sealStatus: c.sealStatus, digest: c.commitDigest })),
  };
}
