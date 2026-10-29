import { rulesHash } from '@/core/forecast';
import type { MarketRef } from '@/core/forecast';
import type { PredictionEvent, PredictionMarket, TatumPrediction } from './tatum';

/**
 * Polymarket "Up or Down" markets, read through Tatum.
 *
 * Every 15 minutes Polymarket opens a market per asset: "Bitcoin Up or Down - October 29, 7:00AM-7:15AM ET".
 * It resolves UP if the Chainlink TWAP over that window ends >= its start, else DOWN, and Tatum shows the
 * resolution a few minutes after close. One Tatum call (tag=15M, status=active, sort=endingSoon,
 * includeMarkets=true) returns the live window plus the next ones for all ~10 assets — so the arena pays
 * ~100 credits per round, not per market.
 *
 * Quirks found in live data (2026-10-29), handled here:
 * - nested market.closeTime is rounded to midnight; the event's closeTime and the slug are the truth.
 * - "active" listings start with a few stale events from months ago; filter by close time.
 * - the slug encodes the window start: btc-updown-15m-<unixSeconds>.
 */

export const ASSETS = {
  btc: { symbol: 'BTC', name: 'Bitcoin', spot: 'BTC-USD' },
  eth: { symbol: 'ETH', name: 'Ethereum', spot: 'ETH-USD' },
  sol: { symbol: 'SOL', name: 'Solana', spot: 'SOL-USD' },
  xrp: { symbol: 'XRP', name: 'XRP', spot: 'XRP-USD' },
  doge: { symbol: 'DOGE', name: 'Dogecoin', spot: 'DOGE-USD' },
  bnb: { symbol: 'BNB', name: 'BNB', spot: 'BNB-USD' },
  hype: { symbol: 'HYPE', name: 'Hyperliquid', spot: 'HYPE-USD' },
  zec: { symbol: 'ZEC', name: 'ZCash', spot: 'ZEC-USD' },
} as const;
export type AssetKey = keyof typeof ASSETS;
export const isAssetKey = (k: string): k is AssetKey => k in ASSETS;

export interface FastMarket {
  platform: 'polymarket';
  /** Polymarket condition id (what Tatum's /markets/{id} accepts). */
  conditionId: string;
  eventId: string;
  asset: AssetKey;
  windowMinutes: number;
  windowStart: string;
  closeTime: string;
  question: string;
  description: string;
  rulesHash: string;
  /** Polymarket's UP probability at fetch time (Tatum outcome price). */
  upPrice: number;
  liquidity: number | null;
  volume: number;
  upTokenId: string | null;
  downTokenId: string | null;
  url: string;
  /** 'UP' | 'DOWN' once resolved, else null. */
  resolution: 'UP' | 'DOWN' | null;
  resolvedSource: string | null;
}

const SLUG = /\/event\/([a-z0-9]+)-updown-(\d+)m-(\d{9,11})(?:$|[/?#])/;

export function parseFastEvent(ev: PredictionEvent): FastMarket | null {
  if (ev.platform !== 'polymarket') return null;
  const m = SLUG.exec(ev.source.url + '/');
  if (!m) return null;
  const [, assetSlug, minutes, startSec] = m;
  if (!isAssetKey(assetSlug)) return null;
  const market = ev.markets.find((x): x is PredictionMarket => typeof x !== 'string');
  if (!market || !ev.closeTime) return null;
  const up = market.outcomes.find((o) => o.name.toUpperCase() === 'UP');
  const down = market.outcomes.find((o) => o.name.toUpperCase() === 'DOWN');
  if (!up || !down) return null;
  const windowMinutes = Number(minutes);
  const windowStart = new Date(Number(startSec) * 1000).toISOString();
  const closeTime = new Date(ev.closeTime).toISOString();
  // Sanity: close = start + window. If the feed disagrees, trust neither.
  if (Date.parse(closeTime) - Date.parse(windowStart) !== windowMinutes * 60_000) return null;
  const res = market.resolution?.outcome?.toUpperCase();
  return {
    platform: 'polymarket',
    conditionId: market.id,
    eventId: ev.id,
    asset: assetSlug,
    windowMinutes,
    windowStart,
    closeTime,
    question: market.question,
    description: market.description ?? '',
    rulesHash: rulesHash(market.description),
    upPrice: up.price,
    liquidity: market.liquidity,
    volume: market.volume,
    upTokenId: up.tokenId,
    downTokenId: down.tokenId,
    url: ev.source.url,
    resolution: res === 'UP' || res === 'DOWN' ? res : null,
    resolvedSource: market.resolution?.source ?? null,
  };
}

export function parseFastEvents(events: PredictionEvent[]): FastMarket[] {
  const out: FastMarket[] = [];
  const seen = new Set<string>();
  for (const ev of events) {
    const f = parseFastEvent(ev);
    if (f && !seen.has(f.conditionId)) {
      seen.add(f.conditionId);
      out.push(f);
    }
  }
  return out;
}

/** The MarketRef sealed inside every forecast about this market. */
export function marketRefOf(f: FastMarket): MarketRef {
  return { platform: 'polymarket', id: f.conditionId, question: f.question, rulesHash: f.rulesHash, closeTime: f.closeTime };
}

/** Start of the 15-minute window that closes at `closeMs`. */
export const windowStartOf = (closeMs: number, minutes = 15) => closeMs - minutes * 60_000;

/** Next window close strictly after `nowMs` on a `cadenceMin` grid (15 → :00/:15/:30/:45). */
export function nextCloseAfter(nowMs: number, cadenceMin: number): number {
  const step = cadenceMin * 60_000;
  return Math.floor(nowMs / step) * step + step;
}

/** One credit-efficient call: live + upcoming 15-minute windows for every asset. */
export async function fetchLive15m(tatum: TatumPrediction): Promise<FastMarket[]> {
  const page = await tatum.events({ platform: 'polymarket', tag: '15M', status: 'active', sort: 'endingSoon', limit: 100, includeMarkets: true });
  return parseFastEvents(page.data);
}

/** One call: the ~100 most recently created resolved 15-minute markets (covers the last ~2.5 hours). */
export async function fetchResolved15m(tatum: TatumPrediction): Promise<FastMarket[]> {
  const page = await tatum.events({ platform: 'polymarket', tag: '15M', status: 'resolved', sort: 'newest', limit: 100, includeMarkets: true });
  return parseFastEvents(page.data);
}
