import { brier, scoreEpisode, summarize, verdict, type AdvisorSummary, type Verdict } from '@/core/scoring';
import { clamp, seededRng, toBps } from './math';

/**
 * How an agent learns, in plain arithmetic:
 *
 * 1. TRUST. After reading an advisor, the agent moves from its blind call p_b toward the take p_a:
 *      p_informed = p_b + t · (p_a − p_b)
 *    t is the least-squares fit on the agent's own settled episodes with that advisor
 *    (t* = Σ(y−p_b)(p_a−p_b) / Σ(p_a−p_b)²), clipped to [0, 1] and shrunk toward 0.5 with a prior of 4 episodes.
 *    Bad advisors drift to t≈0 (ignored); good ones toward 1 (followed).
 *
 * 2. BUYING. Each round the agent buys at most one take per market:
 *    - fair test (explore): with probability ε = max(0.2, 1 − n/80) it picks uniformly among advisors it
 *      has not written off — these episodes are what the public "who helps" table is built from;
 *    - otherwise it buys from the advisor with the best measured lift at its current trust;
 *    - advisors whose LESSON recalled from Walrus Memory says "makes you worse" or "rarely moves you" are
 *      skipped (and only re-tested 5% of the time), so the memory directly changes who gets paid;
 *    - if nobody has a positive measured lift, it declines and saves the money.
 *
 * 3. PAYING. Payment is pay-for-lift: the price is escrowed; when the market settles the advisor is paid
 *    only if the advice improved this agent's Brier score on that market, otherwise the agent is refunded.
 */

export interface Episode {
  roundId: string;
  asset: string;
  advisorId: string;
  fairTest: boolean;
  /** probabilities in [0,1] */
  pBlind: number;
  pAdvice: number;
  pInformed: number;
  outcome: 0 | 1;
}

export interface AdvisorStats {
  advisorId: string;
  n: number;
  nFair: number;
  trust: number;
  /**
   * Verdict basis: Brier change if the agent had moved HALFWAY to the take (reference trust 0.5) on every
   * settled episode. Independent of the trust the agent has learned, so writing an advisor off does not
   * make it look harmless afterwards.
   */
  summary: AdvisorSummary;
  /** What actually happened at the trust the agent used (what pay-for-lift settled on). */
  realized: AdvisorSummary;
  verdict: Verdict;
  /** mean counterfactual lift if the agent applied its CURRENT trust to every past episode */
  liftAtTrust: number | null;
}

export const REFERENCE_TRUST = 0.5;
const PRIOR_N = 4;
const PRIOR_T = 0.5;

export function fitTrust(eps: Pick<Episode, 'pBlind' | 'pAdvice' | 'outcome'>[]): number {
  let num = 0;
  let den = 0;
  for (const e of eps) {
    const d = e.pAdvice - e.pBlind;
    num += (e.outcome - e.pBlind) * d;
    den += d * d;
  }
  const n = eps.length;
  const raw = den > 1e-9 ? clamp(num / den, 0, 1) : PRIOR_T;
  return (n * raw + PRIOR_N * PRIOR_T) / (n + PRIOR_N);
}

export const blendBps = (blindBps: number, adviceBps: number, trust: number) => toBps((blindBps + trust * (adviceBps - blindBps)) / 10000);

export function advisorStats(advisorId: string, eps: Episode[]): AdvisorStats {
  const mine = eps.filter((e) => e.advisorId === advisorId);
  const trust = fitTrust(mine);
  const summary = summarize(mine.map((e) => scoreEpisode(toBps(e.pBlind), blendBps(toBps(e.pBlind), toBps(e.pAdvice), REFERENCE_TRUST), e.outcome)));
  const realized = summarize(mine.map((e) => scoreEpisode(toBps(e.pBlind), toBps(e.pInformed), e.outcome)));
  const cf = mine.map((e) => brier(toBps(e.pBlind), e.outcome) - brier(blendBps(toBps(e.pBlind), toBps(e.pAdvice), trust), e.outcome));
  return {
    advisorId,
    n: mine.length,
    nFair: mine.filter((e) => e.fairTest).length,
    trust,
    summary,
    realized,
    verdict: verdict(summary),
    liftAtTrust: cf.length ? cf.reduce((a, b) => a + b, 0) / cf.length : null,
  };
}

export interface RecalledLesson {
  advisorId: string;
  verdict: Verdict;
  blobId: string | null;
  text: string;
}

export type Decision =
  | { action: 'buy'; advisorId: string; fairTest: boolean; reason: string; lessonBlobId: string | null }
  | { action: 'decline'; reason: string; lessonBlobIds: string[] };

const WRITTEN_OFF: Verdict[] = ['makes_you_worse', 'rarely_moves_you'];

export function decide(args: {
  seed: string;
  advisorIds: string[];
  stats: Map<string, AdvisorStats>;
  lessons: Map<string, RecalledLesson>;
  totalEpisodes: number;
}): Decision {
  const rng = seededRng(args.seed);
  const writtenOff = new Set(args.advisorIds.filter((id) => WRITTEN_OFF.includes(args.lessons.get(id)?.verdict ?? 'not_enough_evidence')));
  const open = args.advisorIds.filter((id) => !writtenOff.has(id));
  const epsilon = Math.max(0.2, 1 - args.totalEpisodes / 80);

  if (writtenOff.size && rng() < 0.05) {
    const pick = [...writtenOff][Math.floor(rng() * writtenOff.size)];
    const l = args.lessons.get(pick)!;
    return { action: 'buy', advisorId: pick, fairTest: false, reason: `re-test: my lesson says "${l.verdict}", checking it still holds`, lessonBlobId: l.blobId };
  }
  if (open.length && rng() < epsilon) {
    const pick = open[Math.floor(rng() * open.length)];
    return { action: 'buy', advisorId: pick, fairTest: true, reason: `fair test (random pick, ε=${epsilon.toFixed(2)})`, lessonBlobId: args.lessons.get(pick)?.blobId ?? null };
  }
  let best: { id: string; lift: number } | null = null;
  for (const id of open) {
    const s = args.stats.get(id);
    if (!s || s.n < 3 || s.liftAtTrust === null) continue;
    if (!best || s.liftAtTrust > best.lift) best = { id, lift: s.liftAtTrust };
  }
  if (best && best.lift > 0) {
    const s = args.stats.get(best.id)!;
    return { action: 'buy', advisorId: best.id, fairTest: false, reason: `best measured lift for me: +${(best.lift * 1000).toFixed(1)} mBrier per call over ${s.n} calls, trust ${s.trust.toFixed(2)}`, lessonBlobId: args.lessons.get(best.id)?.blobId ?? null };
  }
  return {
    action: 'decline',
    reason: writtenOff.size ? `no advisor has helped me yet; written off by my lessons: ${[...writtenOff].join(', ')}` : 'no advisor has a positive measured lift for me yet',
    lessonBlobIds: [...writtenOff].map((id) => args.lessons.get(id)?.blobId).filter((x): x is string => !!x),
  };
}

/** Pay-for-lift: true → release escrow to the advisor; false → refund the buyer. */
export const paysAdvisor = (blindBps: number, informedBps: number, outcome: 0 | 1) => brier(blindBps, outcome) - brier(informedBps, outcome) > 1e-12;

/** The lesson sentence written to Walrus Memory when an agent's verdict on an advisor changes. */
export function lessonText(agentName: string, advisorName: string, advisorId: string, s: AdvisorStats): string {
  const ci = s.summary.ciLow !== null && s.summary.ciHigh !== null ? `95% interval ${(s.summary.ciLow * 1000).toFixed(1)} to ${(s.summary.ciHigh * 1000).toFixed(1)} mBrier` : 'no interval yet';
  const what: Record<Verdict, string> = {
    helps_you: `reading ${advisorName} has made my forecasts better — keep buying`,
    makes_you_worse: `reading ${advisorName} has made my forecasts worse — stop buying`,
    rarely_moves_you: `${advisorName} rarely changes my mind — not worth paying for`,
    no_clear_effect: `${advisorName} has no clear effect on my forecasts yet`,
    not_enough_evidence: `not enough evidence on ${advisorName} yet`,
  };
  return `Lesson for ${agentName}: ${what[s.verdict]} (n=${s.n}, mean ${((s.summary.meanDelta ?? 0) * 1000).toFixed(1)} mBrier, ${ci}, trust ${s.trust.toFixed(2)}). [[advisor=${advisorId} verdict=${s.verdict} n=${s.n} trust=${s.trust.toFixed(3)}]]`;
}

const TAG = /\[\[advisor=([a-z0-9_-]+) verdict=([a-z_]+) n=(\d+) trust=([0-9.]+)\]\]/;
export function parseLesson(text: string): { advisorId: string; verdict: Verdict; n: number; trust: number } | null {
  const m = TAG.exec(text);
  return m ? { advisorId: m[1], verdict: m[2] as Verdict, n: Number(m[3]), trust: Number(m[4]) } : null;
}
