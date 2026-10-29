import { describe, expect, it } from 'vitest';
import { brier, scoreEpisode, summarize, tCritical95, tipsterRecord, verdict } from '@/core';

// Vectors cross-checked in Python (statistics.stdev, 95% t with df = n - 1).
describe('Brier and episode deltas', () => {
  it('scores single forecasts', () => {
    expect(brier(5500, 0)).toBeCloseTo(0.3025, 10);
    expect(brier(8000, 0)).toBeCloseTo(0.64, 10);
    expect(brier(10000, 1)).toBe(0);
    expect(() => brier(55.5, 1)).toThrow();
  });

  it('advice that pushed you the wrong way has a negative delta', () => {
    const e = scoreEpisode(5500, 8000, 0); // 55% -> 80%, it did not happen
    expect(e.delta).toBeCloseTo(-0.3375, 10);
    expect(e.move).toBeCloseTo(0.25, 10);
  });

  it('advice that pushed you the right way has a positive delta', () => {
    expect(scoreEpisode(4000, 6500, 1).delta).toBeCloseTo(0.2375, 10);
  });
});

describe('advisor summaries and verdicts', () => {
  const deltas = [0.1, -0.05, 0.2, 0.0, 0.15, -0.1, 0.05, 0.12];
  const episodes = deltas.map((delta) => ({ delta, move: 0.1 }));

  it('computes mean, sd and a t-based 95% interval', () => {
    const s = summarize(episodes);
    expect(s.n).toBe(8);
    expect(s.meanDelta).toBeCloseTo(0.05875, 10);
    expect(s.sd).toBeCloseTo(0.103017, 5);
    expect(s.se).toBeCloseTo(0.036422, 5);
    expect(s.ciLow).toBeCloseTo(-0.027388, 5);
    expect(s.ciHigh).toBeCloseTo(0.144888, 5);
    expect(tCritical95(7)).toBe(2.365);
    expect(tCritical95(100)).toBe(1.96);
  });

  it('says "not enough evidence" until there are enough settled episodes', () => {
    expect(verdict(summarize(episodes.slice(0, 7)))).toBe('not_enough_evidence');
    expect(verdict(summarize([]))).toBe('not_enough_evidence');
  });

  it('only calls a direction when the whole interval is on one side of zero', () => {
    expect(verdict(summarize(episodes))).toBe('no_clear_effect'); // positive mean, interval crosses 0
    expect(verdict(summarize(episodes.map((e) => ({ ...e, delta: e.delta + 0.1 }))))).toBe('helps_you');
    expect(verdict(summarize(episodes.map((e) => ({ ...e, delta: -e.delta - 0.1 }))))).toBe('makes_you_worse');
  });

  it('flags advisors that barely change your mind', () => {
    expect(verdict(summarize(episodes.map((e) => ({ ...e, move: 0.01 }))))).toBe('rarely_moves_you');
  });
});

describe('tipster records', () => {
  it('counts unrevealed takes on settled markets as the worst possible score', () => {
    const r = tipsterRecord([
      { probabilityBps: 7000, outcome: 1, revealed: true },
      { probabilityBps: null, outcome: 0, revealed: false },
    ]);
    expect(r.n).toBe(2);
    expect(r.unrevealed).toBe(1);
    expect(r.meanBrier).toBeCloseTo((0.09 + 1) / 2, 10);
  });
});
