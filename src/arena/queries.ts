import { and, desc, eq, gt, inArray, lte, sql } from 'drizzle-orm';
import { buildProofs } from '@/core/merkle';
import type { Db } from '@/db/client';
import { arenaBatches, arenaEpisodes, arenaEvents, arenaForecasts, arenaLessons, arenaMarkets, arenaPayouts, arenaPurchases, arenaRounds, arenaTakes, tatumCalls } from '@/db/schema';
import { advisorStats, type Episode } from './brain/learner';
import { FORECASTERS } from './brain/models';
import { advisorDirectory } from './registry';

/**
 * Read models for the public API (and later the UI). Rule: nothing that reveals a probability is
 * returned before its market closes — only hashes and Merkle roots are public until then.
 */

export async function listRounds(db: Db, limit = 12) {
  const rounds = await db.select().from(arenaRounds).orderBy(desc(arenaRounds.closeTime)).limit(limit);
  if (!rounds.length) return [];
  const ids = rounds.map((r) => r.id);
  const markets = await db.select().from(arenaMarkets).where(inArray(arenaMarkets.roundId, ids));
  const batches = await db.select().from(arenaBatches).where(inArray(arenaBatches.roundId, ids));
  const purchases = await db.select().from(arenaPurchases).where(inArray(arenaPurchases.roundId, ids));
  const payouts = await db.select().from(arenaPayouts).where(inArray(arenaPayouts.roundId, ids));
  return rounds.map((r) => ({
    id: r.id,
    status: r.status,
    windowStart: r.windowStart.toISOString(),
    closeTime: r.closeTime.toISOString(),
    markets: markets
      .filter((m) => m.roundId === r.id)
      .map((m) => ({ id: m.id, asset: m.asset, question: m.question, url: m.url, marketUpBps: m.marketUpBps, resolution: m.resolution })),
    seals: batches
      .filter((b) => b.roundId === r.id)
      .map((b) => ({ phase: b.phase, namespace: b.id, root: b.root, leaves: b.leafCount, status: b.status, digest: b.commitDigest, checkpoint: b.checkpoint, committedAt: b.commitTimestampMs ? new Date(b.commitTimestampMs).toISOString() : null, walrusBlobId: b.walrusBlobId })),
    purchases: {
      buys: purchases.filter((p) => p.roundId === r.id && p.action === 'buy').length,
      declines: purchases.filter((p) => p.roundId === r.id && p.action === 'decline').length,
      released: purchases.filter((p) => p.roundId === r.id && p.payStatus === 'released').length,
      refunded: purchases.filter((p) => p.roundId === r.id && p.payStatus === 'refunded').length,
      network: purchases.find((p) => p.roundId === r.id && p.payNetwork)?.payNetwork ?? null,
    },
    payout: payouts.find((p) => p.roundId === r.id) ?? null,
  }));
}

/** Who helps whom: per agent × advisor stats from settled episodes, plus what each advisor earned. */
export async function leaderboard(db: Db) {
  const rows = await db.select().from(arenaEpisodes);
  const byAgent = new Map<string, Episode[]>();
  for (const r of rows) {
    byAgent.set(r.agentId, [
      ...(byAgent.get(r.agentId) ?? []),
      { roundId: r.roundId, asset: r.asset, advisorId: r.advisorId, fairTest: r.fairTest, pBlind: r.blindBps / 10000, pAdvice: r.adviceBps / 10000, pInformed: r.informedBps / 10000, outcome: r.outcome as 0 | 1 },
    ]);
  }
  const earnings = await db
    .select({ advisorId: arenaPurchases.advisorId, status: arenaPurchases.payStatus, micros: sql<number>`sum(${arenaPurchases.priceMicros})`, n: sql<number>`count(*)` })
    .from(arenaPurchases)
    .where(eq(arenaPurchases.action, 'buy'))
    .groupBy(arenaPurchases.advisorId, arenaPurchases.payStatus);
  const lessons = await db.select().from(arenaLessons).orderBy(desc(arenaLessons.createdAt)).limit(50);
  const dir = [...(await advisorDirectory(db)).values()];
  return {
    agents: FORECASTERS.map((f) => {
      const eps = byAgent.get(f.id) ?? [];
      return {
        id: f.id,
        name: f.name,
        style: f.style,
        episodes: eps.length,
        advisors: dir.map((a) => {
          const s = advisorStats(a.id, eps);
          return { advisorId: a.id, n: s.n, nFair: s.nFair, trust: round3(s.trust), verdict: s.verdict, meanDelta: s.summary.meanDelta === null ? null : round5(s.summary.meanDelta), ciLow: nullableRound(s.summary.ciLow), ciHigh: nullableRound(s.summary.ciHigh) };
        }),
      };
    }),
    advisors: dir.map((a) => {
      const e = earnings.filter((x) => x.advisorId === a.id);
      const get = (st: string) => e.find((x) => x.status === st);
      return {
        id: a.id,
        name: a.name,
        pitch: a.pitch,
        priceMicros: a.priceMicros,
        kind: a.kind,
        status: a.status,
        payoutAddress: a.kind === 'external' ? a.payoutAddress : null,
        sold: e.reduce((s, x) => s + Number(x.n), 0),
        releasedMicros: Number(get('released')?.micros ?? 0),
        refundedMicros: Number(get('refunded')?.micros ?? 0),
        escrowedMicros: Number(get('escrowed')?.micros ?? 0),
      };
    }),
    lessons: lessons.map((l) => ({ agentId: l.agentId, advisorId: l.advisorId, verdict: l.verdict, text: l.text, walrusBlobId: l.walrusBlobId, at: l.createdAt.toISOString() })),
  };
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;
const round5 = (x: number) => Math.round(x * 1e5) / 1e5;
const nullableRound = (x: number | null) => (x === null ? null : round5(x));

/** One forecast's receipt: hash, Merkle proof, commit tx and (after close) the revealed JSON. */
export async function receipt(db: Db, hash: string, nowMs = Date.now()) {
  const h = hash.toLowerCase();
  const [f] = await db.select().from(arenaForecasts).where(eq(arenaForecasts.hash, h));
  let kind: 'blind' | 'informed' | 'take';
  let marketId: string;
  let roundId: string;
  let forecastJson: string;
  let who: { agentId?: string; advisorId?: string };
  if (f) {
    kind = f.kind;
    marketId = f.marketId;
    roundId = f.roundId;
    forecastJson = f.forecastJson;
    who = { agentId: f.agentId };
  } else {
    const [t] = await db.select().from(arenaTakes).where(eq(arenaTakes.hash, h));
    if (!t) return null;
    const [m] = await db.select().from(arenaMarkets).where(eq(arenaMarkets.id, t.marketId));
    kind = 'take';
    marketId = t.marketId;
    roundId = m.roundId;
    forecastJson = t.forecastJson;
    who = { advisorId: t.advisorId };
  }
  const [m] = await db.select().from(arenaMarkets).where(eq(arenaMarkets.id, marketId));
  const revealedSingle = nowMs >= m.closeTime.getTime();
  if (f?.sealNamespace) {
    // a person's call: sealed on its own (rcpt1 single seal)
    return {
      hash: h,
      kind,
      ...who,
      roundId,
      market: { id: m.id, asset: m.asset, question: m.question, url: m.url, closeTime: m.closeTime.toISOString(), resolution: m.resolution },
      seal: { type: 'single' as const, namespace: f.sealNamespace, status: f.sealStatus, digest: f.commitDigest, walrusBlobId: f.walrusBlobId, verification: f.verificationJson ? JSON.parse(f.verificationJson) : null },
      batch: null,
      proof: null,
      revealed: revealedSingle,
      forecast: revealedSingle ? JSON.parse(forecastJson) : null,
    };
  }
  const [b] = await db.select().from(arenaBatches).where(and(eq(arenaBatches.roundId, roundId), eq(arenaBatches.phase, kind)));
  const proof = b ? buildProofs(JSON.parse(b.manifestJson).leaves).proofs.get(h) : undefined;
  const revealed = nowMs >= m.closeTime.getTime();
  return {
    hash: h,
    kind,
    ...who,
    roundId,
    market: { id: m.id, asset: m.asset, question: m.question, url: m.url, closeTime: m.closeTime.toISOString(), resolution: m.resolution },
    seal: { type: 'batch' as const, namespace: b?.id ?? null, status: b?.status ?? null, digest: b?.commitDigest ?? null, walrusBlobId: b?.walrusBlobId ?? null, verification: null },
    batch: b ? { namespace: b.id, phase: b.phase, root: b.root, status: b.status, digest: b.commitDigest, checkpoint: b.checkpoint, walrusBlobId: b.walrusBlobId, verification: b.verificationJson ? JSON.parse(b.verificationJson) : null } : null,
    proof: proof ? { index: proof.index, leafCount: proof.leafCount, steps: proof.steps } : null,
    revealed,
    forecast: revealed ? JSON.parse(forecastJson) : null,
  };
}

export async function eventsSince(db: Db, afterId: number, limit = 200) {
  const rows = await db.select().from(arenaEvents).where(gt(arenaEvents.id, afterId)).orderBy(arenaEvents.id).limit(limit);
  return rows.map((e) => ({ id: e.id, at: e.at.toISOString(), roundId: e.roundId, type: e.type, agentId: e.agentId, advisorId: e.advisorId, payload: JSON.parse(e.payloadJson) }));
}

export async function stats(db: Db, nowMs = Date.now()) {
  const [c] = await db.select({ n: sql<number>`count(*)`, credits: sql<number>`coalesce(sum(${tatumCalls.credits}),0)` }).from(tatumCalls);
  const [seals] = await db.select({ n: sql<number>`count(*)`, leaves: sql<number>`coalesce(sum(${arenaBatches.leafCount}),0)` }).from(arenaBatches).where(eq(arenaBatches.status, 'verified'));
  const [eps] = await db.select({ n: sql<number>`count(*)` }).from(arenaEpisodes);
  const [mem] = await db.select({ n: sql<number>`count(*)` }).from(arenaLessons).where(eq(arenaLessons.memoryStatus, 'stored'));
  const [settled] = await db.select({ n: sql<number>`count(*)` }).from(arenaRounds).where(and(eq(arenaRounds.status, 'settled'), lte(arenaRounds.closeTime, new Date(nowMs))));
  const [epMem] = await db.select({ n: sql<number>`count(distinct ${arenaEpisodes.walrusBlobId})` }).from(arenaEpisodes).where(eq(arenaEpisodes.memoryStatus, 'stored'));
  const [sealMem] = await db.select({ n: sql<number>`count(*)` }).from(arenaBatches).where(sql`${arenaBatches.walrusBlobId} is not null`);
  const [paid] = await db.select({ released: sql<number>`coalesce(sum(case when ${arenaPurchases.payStatus} = 'released' then ${arenaPurchases.priceMicros} end),0)`, refunded: sql<number>`coalesce(sum(case when ${arenaPurchases.payStatus} = 'refunded' then ${arenaPurchases.priceMicros} end),0)`, payments: sql<number>`count(distinct ${arenaPurchases.escrowDigest})` }).from(arenaPurchases);
  return {
    tatumCalls: Number(c.n),
    tatumCredits: Number(c.credits),
    verifiedSeals: Number(seals.n),
    sealedForecasts: Number(seals.leaves),
    settledEpisodes: Number(eps.n),
    lessonsOnWalrus: Number(mem.n),
    settledRounds: Number(settled.n),
    memoriesOnWalrus: Number(epMem.n) + Number(sealMem.n) + Number(mem.n),
    releasedMicros: Number(paid.released),
    refundedMicros: Number(paid.refunded),
    mppPayments: Number(paid.payments),
  };
}

/**
 * The memory experiment: Rookie and the Goldfish make the same blind call (50%) on the same markets and see the
 * same takes. Rookie remembers (Walrus Memory: past episodes + lessons); the Goldfish remembers nothing. Any gap
 * in their informed Brier score is what memory is worth.
 */
export async function memoryTest(db: Db, withMemory = 'rookie', control = 'goldfish') {
  const rows = await db.select().from(arenaEpisodes).where(inArray(arenaEpisodes.agentId, [withMemory, control]));
  const byMarket = new Map<string, { m?: (typeof rows)[number]; c?: (typeof rows)[number] }>();
  for (const r of rows) {
    const e = byMarket.get(r.marketId) ?? {};
    if (r.agentId === withMemory) e.m = r;
    else e.c = r;
    byMarket.set(r.marketId, e);
  }
  const pairs = [...byMarket.values()].filter((p): p is { m: (typeof rows)[number]; c: (typeof rows)[number] } => !!p.m && !!p.c).sort((a, b) => (a.m.settledAt?.getTime() ?? 0) - (b.m.settledAt?.getTime() ?? 0));
  const b = (bps: number, y: number) => (bps / 10000 - y) ** 2;
  let sm = 0;
  let sc = 0;
  const series: { at: string; memory: number; goldfish: number }[] = [];
  pairs.forEach((p, i) => {
    sm += p.m.deltaMicro / 1e6;
    sc += p.c.deltaMicro / 1e6;
    if (i % Math.max(1, Math.floor(pairs.length / 60)) === 0 || i === pairs.length - 1) series.push({ at: (p.m.settledAt ?? new Date()).toISOString(), memory: Math.round(sm * 1000) / 1000, goldfish: Math.round(sc * 1000) / 1000 });
  });
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : null);
  const paid = await db
    .select({ agentId: arenaPurchases.agentId, status: arenaPurchases.payStatus, micros: sql<number>`coalesce(sum(${arenaPurchases.priceMicros}),0)` })
    .from(arenaPurchases)
    .where(inArray(arenaPurchases.agentId, [withMemory, control]))
    .groupBy(arenaPurchases.agentId, arenaPurchases.payStatus);
  const spend = (id: string) => ({
    releasedMicros: Number(paid.find((p) => p.agentId === id && p.status === 'released')?.micros ?? 0),
    refundedMicros: Number(paid.find((p) => p.agentId === id && p.status === 'refunded')?.micros ?? 0),
  });
  return {
    pairs: pairs.length,
    memory: { agentId: withMemory, brier: mean(pairs.map((p) => b(p.m.informedBps, p.m.outcome))), liftPerCall: mean(pairs.map((p) => p.m.deltaMicro / 1e6)), helped: pairs.filter((p) => p.m.deltaMicro > 0).length, ...spend(withMemory) },
    goldfish: { agentId: control, brier: mean(pairs.map((p) => b(p.c.informedBps, p.c.outcome))), liftPerCall: mean(pairs.map((p) => p.c.deltaMicro / 1e6)), helped: pairs.filter((p) => p.c.deltaMicro > 0).length, ...spend(control) },
    series,
  };
}

/** Everything the arena has written to Walrus Memory, newest first (seals, episode memories, lessons). */
export async function memoryLog(db: Db, limit = 60) {
  const seals = await db.select({ id: arenaBatches.id, phase: arenaBatches.phase, leaves: arenaBatches.leafCount, blob: arenaBatches.walrusBlobId, at: arenaBatches.createdAt, digest: arenaBatches.commitDigest }).from(arenaBatches).where(sql`${arenaBatches.walrusBlobId} is not null`).orderBy(desc(arenaBatches.createdAt)).limit(limit);
  const eps = await db
    .select({ agentId: arenaEpisodes.agentId, roundId: arenaEpisodes.roundId, blob: arenaEpisodes.walrusBlobId, at: sql<number>`max(${arenaEpisodes.settledAt})`, n: sql<number>`count(*)` })
    .from(arenaEpisodes)
    .where(eq(arenaEpisodes.memoryStatus, 'stored'))
    .groupBy(arenaEpisodes.walrusBlobId, arenaEpisodes.agentId, arenaEpisodes.roundId)
    .orderBy(desc(sql`max(${arenaEpisodes.settledAt})`))
    .limit(limit);
  const lessons = await db.select().from(arenaLessons).where(eq(arenaLessons.memoryStatus, 'stored')).orderBy(desc(arenaLessons.createdAt)).limit(limit);
  const toIso = (v: unknown) => (v instanceof Date ? v.toISOString() : typeof v === 'number' ? new Date(v > 1e12 ? v : v * 1000).toISOString() : String(v));
  const items = [
    ...seals.map((s) => ({ kind: 'seal' as const, namespace: s.id, text: `${s.leaves} ${s.phase} calls sealed as one Merkle root`, blobId: s.blob, at: toIso(s.at), digest: s.digest })),
    ...eps.map((e) => ({ kind: 'episode' as const, namespace: `arena1:${e.agentId}:episodes`, text: `${e.agentId}: ${e.n} settled calls from round ${e.roundId.replace(/^15m:/, '')}`, blobId: e.blob, at: toIso(e.at), digest: null })),
    ...lessons.map((l) => ({ kind: 'lesson' as const, namespace: `arena1:${l.agentId}:lessons`, text: l.text.split(' [[')[0], blobId: l.walrusBlobId, at: l.createdAt.toISOString(), digest: null })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  return items.slice(0, limit * 2);
}

/** Event id to resume from so that the next page holds the last `n` headline events (purchases excluded). */
export async function tailStart(db: Db, n: number): Promise<number> {
  const rows = await db
    .select({ id: arenaEvents.id })
    .from(arenaEvents)
    .where(sql`${arenaEvents.type} not in ('take_bought','take_declined','lessons_recalled','batch_submitted')`)
    .orderBy(desc(arenaEvents.id))
    .limit(n);
  return rows.length ? rows[rows.length - 1].id - 1 : 0;
}
