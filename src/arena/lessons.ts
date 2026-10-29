import type { Verdict } from '@/core/scoring';
import { lessonText, type AdvisorStats, type RecalledLesson } from './brain/learner';
import type { ForecasterDef } from './brain/models';
import { BUILTIN_INFO, type AdvisorInfo } from './registry';

export interface NewLesson {
  agentId: string;
  advisorId: string;
  verdict: Verdict;
  text: string;
}

/**
 * A lesson is written only when the verdict for (agent, advisor) CHANGES from what the agent last
 * remembered — so Walrus Memory holds the turning points, not noise.
 */
export function lessonsFromStats(agent: Pick<ForecasterDef, 'id' | 'name'>, stats: Map<string, AdvisorStats>, remembered: Map<string, RecalledLesson>, names: Map<string, AdvisorInfo> = new Map(BUILTIN_INFO.map((a) => [a.id, a]))): NewLesson[] {
  const out: NewLesson[] = [];
  for (const [advisorId, s] of stats) {
    if (s.verdict === 'not_enough_evidence') continue;
    const prev = remembered.get(advisorId)?.verdict ?? 'not_enough_evidence';
    if (prev === s.verdict) continue;
    const adv = names.get(advisorId);
    out.push({ agentId: agent.id, advisorId, verdict: s.verdict, text: lessonText(agent.name, adv?.name ?? advisorId, advisorId, s) });
  }
  return out;
}
