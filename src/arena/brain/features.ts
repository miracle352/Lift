import { mean, stdev } from './math';

/**
 * Market features for one Up/Down window, computed from 1-minute spot candles (Coinbase public API).
 * Polymarket resolves on the Chainlink TWAP of the window vs the price at its start; spot candles are a
 * close, free proxy. Every number an advisor uses is in here, and the whole object is stored with the
 * round so anyone can recompute every take.
 */
export interface Candle {
  /** unix seconds, start of the minute */
  t: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface WindowFeatures {
  asset: string;
  windowStart: string;
  closeTime: string;
  asOf: string;
  /** price at the window start (open of the first minute) */
  startPrice: number;
  /** latest close */
  lastPrice: number;
  /** average close so far inside the window (TWAP proxy) */
  twapSoFar: number;
  minutesElapsed: number;
  minutesLeft: number;
  /** log return since window start */
  retSinceStart: number;
  /** log return over the last 3 minutes */
  ret3m: number;
  /** stdev of 1-minute log returns over the last 30 minutes (floored) */
  sigma1m: number;
  candlesUsed: number;
}

const MIN_SIGMA = 0.0002; // 2 bps per minute: avoids divide-by-near-zero in quiet markets

export function computeFeatures(args: { asset: string; candles: Candle[]; windowStart: string; closeTime: string; asOf: string }): WindowFeatures | null {
  const startSec = Date.parse(args.windowStart) / 1000;
  const asOfSec = Date.parse(args.asOf) / 1000;
  const sorted = [...args.candles].filter((c) => c.t + 60 <= asOfSec + 1).sort((a, b) => a.t - b.t);
  const inWindow = sorted.filter((c) => c.t >= startSec);
  const first = inWindow[0];
  if (!first || Math.abs(first.t - startSec) > 60) return null;
  const last = sorted[sorted.length - 1];
  const rets: number[] = [];
  for (let i = 1; i < sorted.length; i++) rets.push(Math.log(sorted[i].close / sorted[i - 1].close));
  const recent = rets.slice(-30);
  const threeAgo = sorted[sorted.length - 4] ?? sorted[0];
  const minutesElapsed = inWindow.length;
  const total = (Date.parse(args.closeTime) - Date.parse(args.windowStart)) / 60_000;
  return {
    asset: args.asset,
    windowStart: args.windowStart,
    closeTime: args.closeTime,
    asOf: args.asOf,
    startPrice: first.open,
    lastPrice: last.close,
    twapSoFar: mean(inWindow.map((c) => c.close)),
    minutesElapsed,
    minutesLeft: Math.max(0, total - minutesElapsed),
    retSinceStart: Math.log(last.close / first.open),
    ret3m: Math.log(last.close / threeAgo.close),
    sigma1m: Math.max(MIN_SIGMA, stdev(recent)),
    candlesUsed: sorted.length,
  };
}
