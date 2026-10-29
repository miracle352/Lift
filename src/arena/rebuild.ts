import { advisorStats, parseLesson, type Episode } from './brain/learner';
import { advisorDirectory } from './registry';
import { agentNamespaces, type ArenaDeps } from './deps';
import { loadEpisodes, parseEpisodeMemory } from './memory';

/**
 * Rebuilds an agent from Walrus Memory only (no database): restore the namespace index from Walrus,
 * recall every episode memory, parse the machine tags, and recompute trust and verdicts.
 * This is what makes the agent's memory portable: a fresh deployment with the same Walrus Memory
 * account gets the same agent back.
 */
export async function rebuildAgentFromWalrus(deps: ArenaDeps, agentId: string) {
  const ns = agentNamespaces(agentId);
  await deps.mem.restore(ns.episodes, 100).catch(() => null);
  await deps.mem.restore(ns.lessons, 100).catch(() => null);
  const ep = await deps.mem.recall({ query: `Episode memory round bought went UP DOWN mBrier`, namespace: ns.episodes, topK: 500, sort: 'recent' });
  const seen = new Set<string>();
  const episodes: Episode[] = [];
  for (const r of ep.results) {
    for (const e of parseEpisodeMemory(r.text)) {
      const k = `${e.roundId}|${e.asset}`;
      if (seen.has(k)) continue;
      seen.add(k);
      episodes.push(e);
    }
  }
  const ls = await deps.mem.recall({ query: 'lesson verdict advisor', namespace: ns.lessons, topK: 200, sort: 'recent' });
  const lessons = ls.results.map((r) => parseLesson(r.text)).filter((x) => x !== null);
  const db = await loadEpisodes(deps, agentId);
  const ADVISORS = [...(await advisorDirectory(deps.db)).values()];
  const dbStats = new Map(ADVISORS.map((a) => [a.id, advisorStats(a.id, db)]));
  return {
    episodes: episodes.length,
    lessons: lessons.length,
    dbEpisodes: db.length,
    advisors: ADVISORS.map((a) => {
      const w = advisorStats(a.id, episodes);
      const d = dbStats.get(a.id)!;
      return { advisor: a.id, walrusN: w.n, walrusTrust: w.trust.toFixed(3), walrusVerdict: w.verdict, dbN: d.n, dbTrust: d.trust.toFixed(3), match: w.n === d.n && w.trust.toFixed(6) === d.trust.toFixed(6) };
    }),
  };
}
