import { asc, eq, sql } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { arenaBatches, arenaEpisodes, arenaEvents, arenaLessons, arenaPayouts, arenaPurchases, tatumCalls } from '@/db/schema';
import { advisorStats, type Episode } from './brain/learner';
import { FORECASTERS } from './brain/models';
import { leaderboard, stats } from './queries';
import { advisorDirectory } from './registry';

/**
 * Real numbers for the blog post and README ("how it learned over time"). Everything comes from the DB the
 * worker filled; nothing is estimated. `pnpm arena report` writes report/stats.json + report/summary.md.
 */
export async function buildReport(db: Db, nowMs = Date.now()) {
  const totals = await stats(db, nowMs);
  const lb = await leaderboard(db);
  const dir = await advisorDirectory(db);
  const rows = await db.select().from(arenaEpisodes).orderBy(asc(arenaEpisodes.settledAt));
  const toEp = (r: typeof arenaEpisodes.$inferSelect): Episode => ({ roundId: r.roundId, asset: r.asset, advisorId: r.advisorId, fairTest: r.fairTest, pBlind: r.blindBps / 10000, pAdvice: r.adviceBps / 10000, pInformed: r.informedBps / 10000, outcome: r.outcome as 0 | 1 });

  // learning curve: per agent, trust and verdict per advisor after each quarter of its history
  const curves = FORECASTERS.map((f) => {
    const eps = rows.filter((r) => r.agentId === f.id).map(toEp);
    const cuts = [0.25, 0.5, 0.75, 1].map((q) => Math.max(1, Math.round(eps.length * q)));
    return {
      agent: f.id,
      name: f.name,
      episodes: eps.length,
      checkpoints: cuts.map((n) => ({
        afterEpisodes: n,
        advisors: Object.fromEntries([...new Set(eps.map((e) => e.advisorId))].map((id) => {
          const s = advisorStats(id, eps.slice(0, n));
          return [id, { n: s.n, trust: Math.round(s.trust * 100) / 100, verdict: s.verdict }];
        })),
      })),
    };
  });

  // how buying changed: share of each agent's purchases per advisor in the first vs the last third of rounds
  const all = await db.select().from(arenaPurchases).orderBy(asc(arenaPurchases.createdAt));
  const purchases = all.filter((p) => p.action === 'buy');
  const shift = FORECASTERS.map((f) => {
    const mine = purchases.filter((p) => p.agentId === f.id);
    const third = Math.max(1, Math.floor(mine.length / 3));
    const share = (list: typeof mine) => Object.fromEntries([...new Set(list.map((p) => p.advisorId!))].map((id) => [id, Math.round((100 * list.filter((p) => p.advisorId === id).length) / list.length)]));
    return { agent: f.id, first: share(mine.slice(0, third)), last: share(mine.slice(-third)), declines: all.filter((p) => p.agentId === f.id && p.action === 'decline').length };
  });

  const [declines] = await db.select({ n: sql<number>`count(*)` }).from(arenaPurchases).where(eq(arenaPurchases.action, 'decline'));
  const [paidOnChain] = await db.select({ n: sql<number>`count(distinct ${arenaPurchases.escrowDigest})` }).from(arenaPurchases);
  const payouts = await db.select().from(arenaPayouts).where(eq(arenaPayouts.status, 'sent'));
  const lessons = await db.select().from(arenaLessons).orderBy(asc(arenaLessons.createdAt));
  const [credits] = await db.select({ c: sql<number>`coalesce(sum(${tatumCalls.credits}),0)`, n: sql<number>`count(*)` }).from(tatumCalls);
  const [batches] = await db.select({ n: sql<number>`count(*)` }).from(arenaBatches);
  const [events] = await db.select({ n: sql<number>`count(*)` }).from(arenaEvents);

  return {
    generatedAt: new Date(nowMs).toISOString(),
    totals: { ...totals, batches: Number(batches.n), events: Number(events.n), declines: Number(declines.n), mppPayments: Number(paidOnChain.n), payoutTransactions: payouts.length, tatumCredits: Number(credits.c), tatumCalls: Number(credits.n) },
    advisors: lb.advisors.map((a) => ({ ...a, name: dir.get(a.id)?.name ?? a.id })),
    curves,
    buyingShift: shift,
    lessons: lessons.map((l) => ({ at: l.createdAt.toISOString(), agent: l.agentId, advisor: l.advisorId, verdict: l.verdict, walrusBlobId: l.walrusBlobId, text: l.text })),
  };
}

export function reportMarkdown(r: Awaited<ReturnType<typeof buildReport>>): string {
  const usd = (m: number) => `$${(m / 1e6).toFixed(2)}`;
  const t = r.totals;
  const lines = [
    `# Receipts Arena — numbers (${r.generatedAt})`,
    '',
    `- Rounds settled: **${t.settledRounds}** · episodes: **${t.settledEpisodes}** · forecasts sealed in Merkle batches: **${t.sealedForecasts}** (${t.verifiedSeals} batch seals verified on Sui)`,
    `- Purchases declined by agents: **${t.declines}** · MPP payments on Sui: **${t.mppPayments}** · pay-for-lift payout transactions: **${t.payoutTransactions}**`,
    `- Lessons written to Walrus Memory: **${r.lessons.length}** · Tatum calls: **${t.tatumCalls}** (${t.tatumCredits} documented credits)`,
    '',
    '## Who got paid (pay-for-lift)',
    '| advisor | sold | released (helped) | refunded (didn’t) |',
    '|---|---|---|---|',
    ...r.advisors.map((a) => `| ${a.name} | ${a.sold} | ${usd(a.releasedMicros)} | ${usd(a.refundedMicros)} |`),
    '',
    '## How each agent changed whom it buys from (first third → last third of its purchases, % of buys)',
    ...r.buyingShift.map((s) => `- **${s.agent}**: ${JSON.stringify(s.first)} → ${JSON.stringify(s.last)}`),
    '',
    '## Lessons (verdict changes, stored on Walrus Memory)',
    ...r.lessons.map((l) => `- ${l.at} · ${l.agent} on ${l.advisor}: **${l.verdict}** (blob ${l.walrusBlobId ?? 'pending'})`),
  ];
  return lines.join('\n') + '\n';
}
