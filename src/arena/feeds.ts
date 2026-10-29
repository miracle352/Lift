import type { Candle } from './brain/features';
import type { OrderbookSnapshot } from './brain/models';

/**
 * Free public market data used by the code advisors (no keys, no credits):
 * - Coinbase Exchange 1-minute candles (spot proxy for the Chainlink feeds Polymarket resolves on)
 * - Polymarket CLOB order book for the UP token
 * Tatum stays the source of truth for which markets exist, their prices at lock and their resolution.
 */

type FetchLike = typeof fetch;

export async function fetchCandles(spotSymbol: string, sinceMs: number, untilMs: number, f: FetchLike = fetch): Promise<Candle[]> {
  const url = `https://api.exchange.coinbase.com/products/${encodeURIComponent(spotSymbol)}/candles?granularity=60&start=${new Date(sinceMs).toISOString()}&end=${new Date(untilMs).toISOString()}`;
  const res = await f(url, { headers: { accept: 'application/json', 'user-agent': 'receipts-arena/1.0' } });
  if (!res.ok) throw new Error(`coinbase ${spotSymbol} ${res.status}`);
  const rows = (await res.json()) as number[][];
  // [time, low, high, open, close, volume]
  return rows.map(([t, low, high, open, close, volume]) => ({ t, low, high, open, close, volume })).sort((a, b) => a.t - b.t);
}

export async function fetchUpBook(tokenId: string, f: FetchLike = fetch): Promise<OrderbookSnapshot | null> {
  const res = await f(`https://clob.polymarket.com/book?token_id=${encodeURIComponent(tokenId)}`, { headers: { accept: 'application/json' } });
  if (!res.ok) return null;
  const book = (await res.json()) as { bids?: { price: string; size: string }[]; asks?: { price: string; size: string }[] };
  return summarizeBook(book);
}

export function summarizeBook(book: { bids?: { price: string; size: string }[]; asks?: { price: string; size: string }[] }, band = 0.05): OrderbookSnapshot {
  const bids = (book.bids ?? []).map((l) => ({ p: Number(l.price), s: Number(l.size) })).filter((l) => l.s > 0);
  const asks = (book.asks ?? []).map((l) => ({ p: Number(l.price), s: Number(l.size) })).filter((l) => l.s > 0);
  const bestBid = bids.length ? Math.max(...bids.map((b) => b.p)) : null;
  const bestAsk = asks.length ? Math.min(...asks.map((a) => a.p)) : null;
  const mid = bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2 : null;
  if (mid === null) return { bidDepth: 0, askDepth: 0, mid: null };
  const bidDepth = bids.filter((b) => b.p >= mid - band).reduce((s, b) => s + b.p * b.s, 0);
  const askDepth = asks.filter((a) => a.p <= mid + band).reduce((s, a) => s + a.p * a.s, 0);
  return { bidDepth: Math.round(bidDepth * 100) / 100, askDepth: Math.round(askDepth * 100) / 100, mid };
}
