import type { WindowFeatures } from './features';
import { clamp, normCdf, seededRng } from './math';

/**
 * All advisor and forecaster logic is plain deterministic code (no LLM). Given the same inputs
 * (stored with every round), anyone can recompute every take and every blind call.
 */

/** P(window TWAP >= start price) under a driftless random walk, scaled by `sigmaMult`. */
export function twapUpProbability(f: WindowFeatures, sigmaMult = 1): number {
  const n = f.minutesElapsed + f.minutesLeft;
  if (n <= 0) return 0.5;
  const left = f.minutesLeft;
  const wPast = f.minutesElapsed / n;
  const wFuture = left / n;
  const expected = wPast * f.twapSoFar + wFuture * f.lastPrice;
  const sd = wFuture * f.lastPrice * f.sigma1m * sigmaMult * Math.sqrt(Math.max(left, 0.5) / 3);
  if (sd <= 0) return expected >= f.startPrice ? 0.99 : 0.01;
  return normCdf((expected - f.startPrice) / sd);
}

export interface OrderbookSnapshot {
  /** USDC resting on the UP token's bids within 5 cents of the mid */
  bidDepth: number;
  askDepth: number;
  mid: number | null;
}

export interface AdvisorContext {
  roundId: string;
  /** Polymarket UP price from Tatum at lock time */
  marketUp: number;
  features: WindowFeatures;
  book: OrderbookSnapshot | null;
}

export interface Take {
  /** P(UP) */
  p: number;
  /** what the buyer is shown (hashed into the informed forecast) */
  says: string;
  inputs: Record<string, number | string | null>;
}

export interface AdvisorDef {
  id: string;
  name: string;
  /** one-line pitch shown in the marketplace */
  pitch: string;
  /** price per take in USDC micro-units (6 decimals) */
  priceMicros: number;
  take(ctx: AdvisorContext): Take;
}

const pct = (p: number) => `${Math.round(p * 100)}%`;

export const ADVISORS: AdvisorDef[] = [
  {
    id: 'crowd',
    name: 'The Crowd',
    pitch: 'Whatever Polymarket is pricing right now.',
    priceMicros: 10_000,
    take: (c) => ({ p: c.marketUp, says: `Polymarket prices UP at ${pct(c.marketUp)}.`, inputs: { marketUp: c.marketUp } }),
  },
  {
    id: 'quant',
    name: 'The Quant',
    pitch: 'Random-walk model of the window TWAP vs the opening price.',
    priceMicros: 10_000,
    take: (c) => {
      const p = twapUpProbability(c.features);
      return { p, says: `TWAP model: ${pct(p)} UP with ${c.features.minutesLeft} min left.`, inputs: { twapSoFar: c.features.twapSoFar, last: c.features.lastPrice, start: c.features.startPrice, sigma1m: c.features.sigma1m } };
    },
  },
  {
    id: 'trend',
    name: 'Trend Rider',
    pitch: 'The last three minutes keep going.',
    priceMicros: 10_000,
    take: (c) => {
      const f = c.features;
      const z = (f.retSinceStart + 2 * f.ret3m) / (f.sigma1m * Math.sqrt(Math.max(f.minutesLeft, 1)));
      const p = normCdf(z);
      return { p, says: `Momentum says ${pct(p)} UP.`, inputs: { retSinceStart: f.retSinceStart, ret3m: f.ret3m } };
    },
  },
  {
    id: 'fader',
    name: 'The Fader',
    pitch: 'Fade every move. What goes up comes down.',
    priceMicros: 10_000,
    take: (c) => {
      const p = 1 - twapUpProbability(c.features);
      return { p, says: `Fade it: ${pct(p)} UP.`, inputs: { retSinceStart: c.features.retSinceStart } };
    },
  },
  {
    id: 'book',
    name: 'Book Reader',
    pitch: 'Reads resting liquidity on the UP side of the Polymarket order book.',
    priceMicros: 10_000,
    take: (c) => {
      if (!c.book || c.book.bidDepth + c.book.askDepth <= 0) return { p: 0.5, says: 'Book too thin to read: 50%.', inputs: { bidDepth: null, askDepth: null } };
      const imb = (c.book.bidDepth - c.book.askDepth) / (c.book.bidDepth + c.book.askDepth);
      const p = clamp(0.5 + 0.35 * imb, 0.05, 0.95);
      return { p, says: `Book imbalance ${imb.toFixed(2)} → ${pct(p)} UP.`, inputs: { bidDepth: c.book.bidDepth, askDepth: c.book.askDepth } };
    },
  },
  {
    id: 'hype',
    name: 'Loud Tipster',
    pitch: '“LOCK OF THE CENTURY.” Every call, maximum conviction.',
    priceMicros: 10_000,
    take: (c) => {
      const up = seededRng(`hype:${c.roundId}:${c.features.asset}`)() < 0.5;
      const p = up ? 0.88 : 0.12;
      return { p, says: up ? 'UP. Easy money. 88%.' : 'DOWN. Trust me. 12% UP.', inputs: {} };
    },
  },
  {
    id: 'fence',
    name: 'Fence Sitter',
    pitch: 'Never wrong, never useful.',
    priceMicros: 10_000,
    take: () => ({ p: 0.5, says: 'Could go either way: 50%.', inputs: {} }),
  },
];

export const ADVISOR_BY_ID = new Map(ADVISORS.map((a) => [a.id, a]));

export interface ForecasterDef {
  id: string;
  name: string;
  style: string;
  /** blind call from features only: never sees market prices or takes */
  blind(f: WindowFeatures): number;
}

export const FORECASTERS: ForecasterDef[] = [
  { id: 'rookie', name: 'Rookie', style: 'Has no model. Calls everything 50/50 until advice says otherwise.', blind: () => 0.5 },
  {
    id: 'chartist',
    name: 'Chartist',
    style: 'Looks only at the last three candles.',
    blind: (f) => clamp(0.5 + clamp(f.ret3m / f.sigma1m, -3, 3) * 0.06, 0.2, 0.8),
  },
  { id: 'cautious', name: 'Cautious Quant', style: 'Right model, but assumes markets are 2.5× wilder than they are.', blind: (f) => twapUpProbability(f, 2.5) },
  {
    id: 'gambler',
    name: 'Gambler',
    style: 'Overconfident: any move since the open is destiny.',
    blind: (f) => clamp(normCdf(f.retSinceStart / (f.sigma1m * 0.5)), 0.03, 0.97),
  },
];

export const FORECASTER_BY_ID = new Map(FORECASTERS.map((a) => [a.id, a]));
