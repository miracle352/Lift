import type { Candle, WindowFeatures } from './brain/features';
import { computeFeatures } from './brain/features';
import { advisorStats, blendBps, decide, type AdvisorStats, type Episode, type RecalledLesson } from './brain/learner';
import { seededRng, toBps } from './brain/math';
import { ADVISORS, FORECASTERS, twapUpProbability as twapUpProb, type AdvisorContext } from './brain/models';
import { lessonsFromStats } from './lessons';

/**
 * Offline simulator: synthetic random-walk windows run through the exact same brain the live arena uses.
 * Used by tests (does the learning actually work?) and by `pnpm arena:sim` for sanity numbers.
 * Nothing here touches the network or the chain.
 */

function gaussian(rng: () => number): number {
  const u = Math.max(rng(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

export interface SimWindow {
  features: WindowFeatures;
  marketUp: number;
  book: AdvisorContext['book'];
  outcome: 0 | 1;
}

export function simulateWindow(seed: string, sigma = 0.0008, lockMinute = 6, windowMinutes = 15): SimWindow {
  const rng = seededRng(seed);
  const t0 = 1_800_000_000; // arbitrary unix seconds, minute aligned
  const start = t0 + 30 * 60;
  const candles: Candle[] = [];
  let price = 100;
  for (let i = 0; i < 30 + windowMinutes; i++) {
    const open = price;
    price = price * Math.exp(sigma * gaussian(rng));
    candles.push({ t: t0 + i * 60, open, high: Math.max(open, price), low: Math.min(open, price), close: price, volume: 1 });
  }
  const lockSec = start + lockMinute * 60;
  const known = candles.filter((c) => c.t + 60 <= lockSec);
  const features = computeFeatures({
    asset: 'sim',
    candles: known,
    windowStart: new Date(start * 1000).toISOString(),
    closeTime: new Date((start + windowMinutes * 60) * 1000).toISOString(),
    asOf: new Date(lockSec * 1000).toISOString(),
  })!;
  const inWindow = candles.filter((c) => c.t >= start);
  const twap = inWindow.reduce((s, c) => s + c.close, 0) / inWindow.length;
  const outcome: 0 | 1 = twap >= inWindow[0].open ? 1 : 0;
  // The market is decent but noisy; the book carries a weak real signal.
  const informedSide = outcome === 1 ? 1 : -1;
  const marketUp = Math.min(0.98, Math.max(0.02, twapUpProb(features) + 0.06 * gaussian(rng)));
  const imbalance = Math.max(-1, Math.min(1, 0.25 * informedSide + 0.5 * gaussian(rng)));
  const book = { bidDepth: 500 * (1 + imbalance), askDepth: 500 * (1 - imbalance), mid: marketUp };
  return { features, marketUp, book, outcome };
}


export interface SimResult {
  episodes: Map<string, Episode[]>;
  stats: Map<string, Map<string, AdvisorStats>>;
  lessons: Map<string, Map<string, RecalledLesson>>;
  spentMicros: Map<string, number>;
  paidMicros: Map<string, number>;
  declines: number;
}

export function runSimulation(rounds: number, marketsPerRound = 6, seed = 'sim'): SimResult {
  const episodes = new Map(FORECASTERS.map((f) => [f.id, [] as Episode[]]));
  const lessons = new Map(FORECASTERS.map((f) => [f.id, new Map<string, RecalledLesson>()]));
  const stats = new Map<string, Map<string, AdvisorStats>>();
  const spentMicros = new Map<string, number>();
  const paidMicros = new Map<string, number>();
  let declines = 0;
  const advisorIds = ADVISORS.map((a) => a.id);
  for (let r = 0; r < rounds; r++) {
    const roundId = `${seed}:${r}`;
    for (let m = 0; m < marketsPerRound; m++) {
      const w = simulateWindow(`${roundId}:${m}`);
      const ctx: AdvisorContext = { roundId: `${roundId}:${m}`, marketUp: w.marketUp, features: { ...w.features, asset: `a${m}` }, book: w.book };
      for (const f of FORECASTERS) {
        const eps = episodes.get(f.id)!;
        const st = new Map(advisorIds.map((id) => [id, advisorStats(id, eps)]));
        const d = decide({ seed: `${roundId}:${m}:${f.id}`, advisorIds, stats: st, lessons: lessons.get(f.id)!, totalEpisodes: eps.length });
        if (d.action === 'decline') {
          declines++;
          continue;
        }
        const adv = ADVISORS.find((a) => a.id === d.advisorId)!;
        const take = adv.take(ctx);
        const pBlind = f.blind(ctx.features);
        const trust = st.get(adv.id)!.trust;
        const informedBps = blendBps(toBps(pBlind), toBps(take.p), trust);
        eps.push({ roundId, asset: ctx.features.asset, advisorId: adv.id, fairTest: d.fairTest, pBlind, pAdvice: take.p, pInformed: informedBps / 10000, outcome: w.outcome });
        spentMicros.set(f.id, (spentMicros.get(f.id) ?? 0) + adv.priceMicros);
        const helped = toBps(pBlind) !== informedBps && (w.outcome - pBlind) ** 2 > (w.outcome - informedBps / 10000) ** 2;
        if (helped) paidMicros.set(adv.id, (paidMicros.get(adv.id) ?? 0) + adv.priceMicros);
      }
    }
    // end of round: lessons update (in production these are written to and recalled from Walrus Memory)
    for (const f of FORECASTERS) {
      const st = new Map(advisorIds.map((id) => [id, advisorStats(id, episodes.get(f.id)!)]));
      stats.set(f.id, st);
      for (const l of lessonsFromStats(f, st, lessons.get(f.id)!)) lessons.get(f.id)!.set(l.advisorId, { advisorId: l.advisorId, verdict: l.verdict, blobId: null, text: l.text });
    }
  }
  return { episodes, stats, lessons, spentMicros, paidMicros, declines };
}
