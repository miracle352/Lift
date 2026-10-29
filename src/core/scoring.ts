/**
 * Deterministic scoring (docs/SCORING.md). No LLM ever produces a number shown as a score.
 *
 * Brier score for one binary forecast: (p - y)^2, p in [0,1], y in {0,1}. Lower is better.
 * Advice delta for one episode: brier(blind) - brier(informed). Positive = the advice helped.
 */

export type Outcome = 0 | 1;

export function brier(probabilityBps: number, outcome: Outcome): number {
  if (!Number.isInteger(probabilityBps) || probabilityBps < 0 || probabilityBps > 10000) throw new Error('probabilityBps must be an integer in [0, 10000]');
  const p = probabilityBps / 10000;
  return (p - outcome) ** 2;
}

export interface EpisodeScore {
  blindBrier: number;
  informedBrier: number;
  /** blind - informed; > 0 means the advice improved the forecast */
  delta: number;
  /** informed - blind probability, in probability units (-1..1) */
  move: number;
}

export function scoreEpisode(blindBps: number, informedBps: number, outcome: Outcome): EpisodeScore {
  const blindBrier = brier(blindBps, outcome);
  const informedBrier = brier(informedBps, outcome);
  return { blindBrier, informedBrier, delta: blindBrier - informedBrier, move: (informedBps - blindBps) / 10000 };
}

/** Two-sided 95% Student-t critical values for df = 1..30; df > 30 uses 1.96. */
const T95 = [
  12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093,
  2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042,
];
export function tCritical95(df: number): number {
  if (df < 1) return Number.POSITIVE_INFINITY;
  return df <= 30 ? T95[df - 1] : 1.96;
}

export interface AdvisorSummary {
  n: number;
  meanDelta: number | null;
  /** sample standard deviation of deltas (n-1) */
  sd: number | null;
  se: number | null;
  ciLow: number | null;
  ciHigh: number | null;
  /** mean |move|: how far this advisor typically moves you */
  meanAbsMove: number | null;
}

export function summarize(episodes: Pick<EpisodeScore, 'delta' | 'move'>[]): AdvisorSummary {
  const n = episodes.length;
  if (n === 0) return { n, meanDelta: null, sd: null, se: null, ciLow: null, ciHigh: null, meanAbsMove: null };
  const mean = episodes.reduce((s, e) => s + e.delta, 0) / n;
  const meanAbsMove = episodes.reduce((s, e) => s + Math.abs(e.move), 0) / n;
  if (n === 1) return { n, meanDelta: mean, sd: null, se: null, ciLow: null, ciHigh: null, meanAbsMove };
  const sd = Math.sqrt(episodes.reduce((s, e) => s + (e.delta - mean) ** 2, 0) / (n - 1));
  const se = sd / Math.sqrt(n);
  const half = tCritical95(n - 1) * se;
  return { n, meanDelta: mean, sd, se, ciLow: mean - half, ciHigh: mean + half, meanAbsMove };
}

export type Verdict = 'not_enough_evidence' | 'helps_you' | 'makes_you_worse' | 'rarely_moves_you' | 'no_clear_effect';

export interface VerdictOptions {
  /** minimum settled paired episodes before any verdict (default 8) */
  minEpisodes?: number;
  /** mean |move| below this (probability units) counts as "rarely moves you" (default 0.03 = 3 points) */
  rarelyMovesThreshold?: number;
}

export function verdict(s: AdvisorSummary, opts: VerdictOptions = {}): Verdict {
  const minEpisodes = opts.minEpisodes ?? 8;
  const rarely = opts.rarelyMovesThreshold ?? 0.03;
  if (s.n < minEpisodes || s.ciLow === null || s.ciHigh === null || s.meanAbsMove === null) return 'not_enough_evidence';
  if (s.ciLow > 0) return 'helps_you';
  if (s.ciHigh < 0) return 'makes_you_worse';
  if (s.meanAbsMove < rarely) return 'rarely_moves_you';
  return 'no_clear_effect';
}

/** Public tipster record: mean Brier of their takes. Unrevealed takes on settled markets count as 1.0 (worst). */
export function tipsterRecord(takes: { probabilityBps: number | null; outcome: Outcome; revealed: boolean }[]) {
  const scores = takes.map((t) => (t.revealed && t.probabilityBps !== null ? brier(t.probabilityBps, t.outcome) : 1));
  const n = scores.length;
  return { n, unrevealed: takes.filter((t) => !t.revealed).length, meanBrier: n ? scores.reduce((a, b) => a + b, 0) / n : null };
}
