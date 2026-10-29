import { sha256Hex } from '@/core/hash';

/** Standard normal CDF (Abramowitz–Stegun 7.1.26 via erf), accurate to ~1e-7. */
export function normCdf(x: number): number {
  const t = 1 / (1 + 0.3275911 * (Math.abs(x) / Math.SQRT2));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

/** Probability in [0,1] → integer basis points clamped to the sealable range 1..9999. */
export function toBps(p: number): number {
  if (!Number.isFinite(p)) return 5000;
  return Math.min(9999, Math.max(1, Math.round(p * 10000)));
}

export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Deterministic RNG (mulberry32) seeded from any string: same round + agent → same choices. */
export function seededRng(seed: string): () => number {
  let a = parseInt(sha256Hex(seed).slice(0, 8), 16) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

export function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}
