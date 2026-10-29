import { describe, expect, it } from 'vitest';
import { advisorStats, blendBps, decide, fitTrust, lessonText, parseLesson, paysAdvisor } from '@/arena/brain/learner';
import { normCdf, seededRng, toBps } from '@/arena/brain/math';
import { ADVISORS, twapUpProbability } from '@/arena/brain/models';
import { runSimulation, simulateWindow } from '@/arena/sim';

describe('math', () => {
  it('normCdf matches known values', () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 6);
    expect(normCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normCdf(-1)).toBeCloseTo(0.1587, 3);
  });
  it('toBps clamps to the sealable range', () => {
    expect(toBps(0)).toBe(1);
    expect(toBps(1)).toBe(9999);
    expect(toBps(Number.NaN)).toBe(5000);
  });
  it('seededRng is deterministic', () => {
    expect(seededRng('x')()).toBe(seededRng('x')());
    expect(seededRng('x')()).not.toBe(seededRng('y')());
  });
});

describe('models', () => {
  it('TWAP model is 50% at a flat start and leans with the move', () => {
    const w = simulateWindow('m1');
    const flat = { ...w.features, twapSoFar: w.features.startPrice, lastPrice: w.features.startPrice };
    expect(twapUpProbability(flat)).toBeCloseTo(0.5, 6);
    expect(twapUpProbability({ ...flat, lastPrice: flat.startPrice * 1.003, twapSoFar: flat.startPrice * 1.002 })).toBeGreaterThan(0.8);
  });
  it('every advisor returns a probability in (0,1) and is deterministic', () => {
    const w = simulateWindow('m2');
    for (const a of ADVISORS) {
      const ctx = { roundId: 'r', marketUp: w.marketUp, features: w.features, book: w.book };
      const t1 = a.take(ctx);
      expect(t1.p).toBeGreaterThan(0);
      expect(t1.p).toBeLessThan(1);
      expect(a.take(ctx)).toEqual(t1);
    }
  });
});

describe('learner', () => {
  it('trust → high for an advisor that is right, → low for one that is wrong', () => {
    const good = Array.from({ length: 40 }, (_, i) => ({ pBlind: 0.5, pAdvice: i % 2 ? 0.8 : 0.2, outcome: (i % 2) as 0 | 1 }));
    const bad = good.map((e) => ({ ...e, outcome: (1 - e.outcome) as 0 | 1 }));
    expect(fitTrust(good)).toBeGreaterThan(0.85);
    expect(fitTrust(bad)).toBeLessThan(0.1);
    expect(fitTrust([])).toBe(0.5);
  });
  it('blend and pay-for-lift', () => {
    expect(blendBps(5000, 8000, 0.5)).toBe(6500);
    expect(paysAdvisor(5000, 6500, 1)).toBe(true);
    expect(paysAdvisor(5000, 6500, 0)).toBe(false);
    expect(paysAdvisor(5000, 5000, 1)).toBe(false); // no move, no pay
  });
  it('lesson text round-trips its machine tag', () => {
    const s = advisorStats('hype', []);
    const t = lessonText('Rookie', 'Loud Tipster', 'hype', { ...s, verdict: 'makes_you_worse', n: 24, trust: 0.031 });
    expect(parseLesson(t)).toEqual({ advisorId: 'hype', verdict: 'makes_you_worse', n: 24, trust: 0.031 });
  });
  it('a lesson recalled from memory stops the purchase (except rare re-tests)', () => {
    const lessons = new Map([['hype', { advisorId: 'hype', verdict: 'makes_you_worse' as const, blobId: 'blob1', text: '' }]]);
    let hypeBuys = 0;
    for (let i = 0; i < 400; i++) {
      const d = decide({ seed: `s${i}`, advisorIds: ['hype', 'crowd'], stats: new Map(), lessons, totalEpisodes: 0 });
      if (d.action === 'buy' && d.advisorId === 'hype') {
        hypeBuys++;
        expect(d.reason).toMatch(/re-test/);
      }
    }
    expect(hypeBuys).toBeGreaterThan(5);
    expect(hypeBuys).toBeLessThan(45);
  });
});

describe('simulation: the arena actually learns', () => {
  const r = runSimulation(120);
  it('agents converge on the advisors that help and write off the ones that hurt', () => {
    const rookie = r.stats.get('rookie')!;
    expect(rookie.get('crowd')!.verdict).toBe('helps_you');
    expect(rookie.get('fader')!.verdict).toBe('makes_you_worse');
    expect(rookie.get('fader')!.trust).toBeLessThan(0.2);
    expect(rookie.get('fence')!.verdict).toBe('rarely_moves_you');
  });
  it('pay-for-lift sends most of the money to useful advisors', () => {
    const paid = (id: string) => r.paidMicros.get(id) ?? 0;
    expect(paid('crowd') + paid('quant')).toBeGreaterThan(5 * (paid('fader') + paid('hype') + paid('fence')));
  });
  it('fair tests keep running so every advisor keeps getting measured', () => {
    for (const st of r.stats.values()) for (const s of st.values()) expect(s.nFair).toBeGreaterThan(3);
  });
});
