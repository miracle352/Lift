import { and, asc, eq, inArray, isNotNull } from 'drizzle-orm';
import { arenaEpisodes, arenaLessons } from '@/db/schema';
import type { Verdict } from '@/core/scoring';
import { parseLesson, type Episode, type RecalledLesson } from './brain/learner';
import { ADVISOR_BY_ID, FORECASTER_BY_ID } from './brain/models';
import { agentNamespaces, type ArenaDeps } from './deps';

/**
 * Agent memory on Walrus Memory (docs/ARENA.md, "Memory").
 *
 * - episodes namespace: one memory per agent per settled round (what it believed, whose take it bought,
 *   what happened). Enough to rebuild the agent's trust and stats from Walrus alone (`pnpm arena:rebuild`).
 * - lessons namespace: one memory each time the agent's verdict on an advisor changes.
 *   Before every purchase the agent RECALLS its lessons from Walrus Memory; a lesson saying an advisor
 *   "makes you worse" or "rarely moves you" blocks that purchase, and the receipt cites the lesson's blob id.
 */

export async function recallLessons(deps: ArenaDeps, agentId: string): Promise<{ lessons: Map<string, RecalledLesson>; source: 'walrus' | 'db' }> {
  const ns = agentNamespaces(agentId).lessons;
  try {
    const res = await deps.mem.recall({ query: `lesson verdict for advisors: ${[...ADVISOR_BY_ID.values()].map((a) => a.name).join(', ')}`, namespace: ns, topK: 40, sort: 'recent' });
    const out = new Map<string, RecalledLesson>();
    // sort: 'recent' → newest first; keep the newest lesson per advisor
    const sorted = [...res.results].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
    for (const r of sorted) {
      const p = parseLesson(r.text);
      if (p && !out.has(p.advisorId)) out.set(p.advisorId, { advisorId: p.advisorId, verdict: p.verdict, blobId: r.blob_id, text: r.text });
    }
    return { lessons: out, source: 'walrus' };
  } catch (err) {
    deps.log('recall failed, falling back to DB lessons', { agentId, err: String(err) });
    const rows = await deps.db.select().from(arenaLessons).where(eq(arenaLessons.agentId, agentId)).orderBy(asc(arenaLessons.createdAt));
    const out = new Map<string, RecalledLesson>();
    for (const r of rows) out.set(r.advisorId, { advisorId: r.advisorId, verdict: r.verdict as Verdict, blobId: r.walrusBlobId, text: r.text });
    return { lessons: out, source: 'db' };
  }
}

export async function loadEpisodes(deps: ArenaDeps, agentId: string): Promise<Episode[]> {
  const rows = await deps.db.select().from(arenaEpisodes).where(eq(arenaEpisodes.agentId, agentId)).orderBy(asc(arenaEpisodes.settledAt));
  return rows.map((r) => ({
    roundId: r.roundId,
    asset: r.asset,
    advisorId: r.advisorId,
    fairTest: r.fairTest,
    pBlind: r.blindBps / 10000,
    pAdvice: r.adviceBps / 10000,
    pInformed: r.informedBps / 10000,
    outcome: r.outcome as 0 | 1,
  }));
}

/** The text of one agent's episode memory for a round. Human-readable first, machine tag last. */
export function episodeMemoryText(agentId: string, roundId: string, rows: (typeof arenaEpisodes.$inferSelect)[]): string {
  const agent = FORECASTER_BY_ID.get(agentId)?.name ?? agentId;
  const parts = rows.map((r) => {
    const adv = ADVISOR_BY_ID.get(r.advisorId)?.name ?? r.advisorId;
    const res = r.outcome === 1 ? 'UP' : 'DOWN';
    const d = r.deltaMicro / 1000;
    return `${r.asset.toUpperCase()}: bought ${adv}${r.fairTest ? ' (fair test)' : ''}, ${Math.round(r.blindBps / 100)}% → ${Math.round(r.informedBps / 100)}% UP, went ${res}, ${d >= 0 ? '+' : ''}${d.toFixed(1)} mBrier`;
  });
  const tag = rows.map((r) => [r.asset, r.advisorId, r.fairTest ? 1 : 0, r.blindBps, r.adviceBps, r.informedBps, r.outcome].join(',')).join(';');
  return `Episode memory of ${agent}, round ${roundId}. ${parts.join('. ')}. [[ep1 round=${roundId} rows=${tag}]]`;
}

export function parseEpisodeMemory(text: string): Episode[] {
  const m = /\[\[ep1 round=(\S+) rows=([^\]]*)\]\]/.exec(text);
  if (!m) return [];
  return m[2]
    .split(';')
    .filter(Boolean)
    .map((row) => {
      const [asset, advisorId, fair, b, a, i, o] = row.split(',');
      return { roundId: m[1], asset, advisorId, fairTest: fair === '1', pBlind: Number(b) / 10000, pAdvice: Number(a) / 10000, pInformed: Number(i) / 10000, outcome: Number(o) as 0 | 1 };
    });
}

/**
 * Memory outbox: writes pending episode + lesson memories with ONE rememberBulk (weight 10 on the relayer's
 * rate limiter) and polls submitted ones. Call it from the worker loop.
 */
export async function flushMemoryOutbox(deps: ArenaDeps, opts: { maxItems?: number } = {}): Promise<{ submitted: number; stored: number }> {
  const db = deps.db;
  let stored = 0;

  // 1) poll submitted jobs
  const submittedEp = await db.select().from(arenaEpisodes).where(and(eq(arenaEpisodes.memoryStatus, 'submitted'), isNotNull(arenaEpisodes.memoryJobId)));
  const submittedLs = await db.select().from(arenaLessons).where(and(eq(arenaLessons.memoryStatus, 'submitted'), isNotNull(arenaLessons.memoryJobId)));
  const jobIds = [...new Set([...submittedEp.map((r) => r.memoryJobId!), ...submittedLs.map((r) => r.memoryJobId!)])];
  for (const jobId of jobIds) {
    const st = await deps.mem.getRememberStatus(jobId).catch(() => null);
    if (!st) continue;
    if (st.status === 'done' && st.blob_id) {
      await db.update(arenaEpisodes).set({ memoryStatus: 'stored', walrusBlobId: st.blob_id }).where(eq(arenaEpisodes.memoryJobId, jobId));
      await db.update(arenaLessons).set({ memoryStatus: 'stored', walrusBlobId: st.blob_id }).where(eq(arenaLessons.memoryJobId, jobId));
      stored++;
    } else if (st.status === 'failed' || st.status === 'not_found') {
      await db.update(arenaEpisodes).set({ memoryStatus: 'pending', memoryJobId: null }).where(eq(arenaEpisodes.memoryJobId, jobId));
      await db.update(arenaLessons).set({ memoryStatus: 'pending', memoryJobId: null }).where(eq(arenaLessons.memoryJobId, jobId));
    }
  }

  // 2) submit pending: lessons first (they change behaviour), then one episode memory per (agent, round)
  const pendingLessons = await db.select().from(arenaLessons).where(eq(arenaLessons.memoryStatus, 'pending')).orderBy(asc(arenaLessons.createdAt)).limit(opts.maxItems ?? 20);
  const pendingEp = await db.select().from(arenaEpisodes).where(eq(arenaEpisodes.memoryStatus, 'pending')).orderBy(asc(arenaEpisodes.settledAt)).limit(400);
  const groups = new Map<string, (typeof arenaEpisodes.$inferSelect)[]>();
  for (const r of pendingEp) {
    const k = `${r.agentId}|${r.roundId}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const items: { text: string; namespace: string; lessonId?: string; episodeIds?: string[] }[] = [];
  for (const l of pendingLessons) items.push({ text: l.text, namespace: agentNamespaces(l.agentId).lessons, lessonId: l.id });
  for (const [k, rows] of groups) {
    if (items.length >= (opts.maxItems ?? 20)) break;
    const [agentId, roundId] = k.split('|');
    items.push({ text: episodeMemoryText(agentId, roundId, rows), namespace: agentNamespaces(agentId).episodes, episodeIds: rows.map((r) => r.id) });
  }
  if (!items.length) return { submitted: 0, stored };
  const res = await deps.mem.rememberBulk(items.map(({ text, namespace }) => ({ text, namespace })));
  for (let i = 0; i < items.length; i++) {
    const jobId = res.job_ids[i];
    if (!jobId) continue;
    const it = items[i];
    if (it.lessonId) await db.update(arenaLessons).set({ memoryStatus: 'submitted', memoryJobId: jobId }).where(eq(arenaLessons.id, it.lessonId));
    if (it.episodeIds) await db.update(arenaEpisodes).set({ memoryStatus: 'submitted', memoryJobId: jobId }).where(inArray(arenaEpisodes.id, it.episodeIds));
  }
  deps.log('memory outbox submitted', { items: items.length });
  return { submitted: items.length, stored };
}
