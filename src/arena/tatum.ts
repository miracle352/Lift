import { z } from 'zod';
import { TATUM } from '@/core/constants';

/**
 * Tatum Prediction API client (docs/vendor/tatum-prediction-api.md). Node only (worker + routes).
 *
 * Credits are the scarce resource: the free plan is 100k credits for the LIFETIME of the key and
 * most prediction endpoints cost 100 credits. Every call goes through `tatumGet`, which reports the
 * documented cost to a ledger (DB table `tatum_calls`) so the worker can enforce a daily budget.
 */

/** Documented cost per endpoint (credits). Keep in sync with the vendor doc. */
export const TATUM_CREDITS = {
  events: 100,
  event: 100,
  search: 50,
  markets: 100,
  market: 100,
  price: 100,
  orderbook: 100,
  history: 200,
  positions: 100,
} as const;
export type TatumEndpoint = keyof typeof TATUM_CREDITS;

export interface TatumCallRecord {
  endpoint: TatumEndpoint;
  path: string;
  credits: number;
  status: number;
  ms: number;
}

export interface TatumClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  /** Called after every request (success or not). Persist it to enforce budgets. */
  onCall?: (rec: TatumCallRecord) => void | Promise<void>;
  /** Called before every request; throw to refuse (e.g. daily budget exhausted). */
  beforeCall?: (endpoint: TatumEndpoint, credits: number) => void | Promise<void>;
  retries?: number;
  sleep?: (ms: number) => Promise<void>;
}

export class TatumError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
  }
}

export class TatumBudgetError extends Error {}

// ---------- response schemas (only the fields we use; .passthrough() keeps the rest for fixtures) ----------

export const Outcome = z.object({ name: z.string(), price: z.number(), tokenId: z.string().nullable() }).passthrough();
export const Resolution = z.object({ outcome: z.string(), resolvedAt: z.string(), txHash: z.string().nullable(), source: z.string().nullable() }).passthrough();
export const Source = z.object({ platform: z.string(), platformId: z.string(), url: z.string() }).passthrough();

export const PredictionMarket = z
  .object({
    id: z.string(),
    platform: z.enum(['polymarket', 'kalshi']),
    eventId: z.string().nullable(),
    question: z.string(),
    description: z.string().nullable(),
    tags: z.array(z.string()),
    status: z.string(),
    closeTime: z.string().nullable(),
    outcomes: z.array(Outcome),
    volume: z.number(),
    liquidity: z.number().nullable(),
    resolution: Resolution.nullable(),
    source: Source,
  })
  .passthrough();
export type PredictionMarket = z.infer<typeof PredictionMarket>;

export const PredictionEvent = z
  .object({
    id: z.string(),
    platform: z.enum(['polymarket', 'kalshi']),
    title: z.string().nullable(),
    description: z.string().nullable(),
    tags: z.array(z.string()),
    status: z.string(),
    openTime: z.string().nullable(),
    closeTime: z.string().nullable(),
    totalVolume: z.number(),
    totalLiquidity: z.number().nullable(),
    markets: z.array(z.union([z.string(), PredictionMarket])),
    source: Source,
  })
  .passthrough();
export type PredictionEvent = z.infer<typeof PredictionEvent>;

export const EventsPage = z.object({
  data: z.array(PredictionEvent),
  pagination: z.object({ cursor: z.string().optional(), pageSize: z.number() }).passthrough(),
});
export type EventsPage = z.infer<typeof EventsPage>;

export const MarketPrice = z
  .object({
    marketId: z.string(),
    timestamp: z.string(),
    yes: z.object({ price: z.number(), bid: z.number().nullable(), ask: z.number().nullable() }).passthrough(),
    no: z.object({ price: z.number(), bid: z.number().nullable(), ask: z.number().nullable() }).passthrough(),
    midPrice: z.number().nullable(),
    spread: z.number().nullable(),
    lastTradePrice: z.number().nullable(),
  })
  .passthrough();
export type MarketPrice = z.infer<typeof MarketPrice>;

// ---------- client ----------

export interface EventsQuery {
  platform?: 'polymarket' | 'kalshi';
  status?: 'active' | 'closed' | 'resolved';
  tag?: string;
  category?: string;
  search?: string;
  sort?: 'volume_desc' | 'liquidity_desc' | 'endingSoon' | 'newest';
  limit?: number;
  cursor?: string;
  includeMarkets?: boolean;
}

export class TatumPrediction {
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly opts: TatumClientOptions) {
    this.base = (opts.baseUrl ?? TATUM.apiBaseUrl) + '/v4/data/prediction';
    this.fetchImpl = opts.fetch ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async get<T>(endpoint: TatumEndpoint, path: string, schema: z.ZodType<T>): Promise<T> {
    const credits = TATUM_CREDITS[endpoint];
    await this.opts.beforeCall?.(endpoint, credits);
    const retries = this.opts.retries ?? 3;
    for (let attempt = 0; ; attempt++) {
      const t0 = Date.now();
      let status = 0;
      let body = '';
      try {
        const res = await this.fetchImpl(this.base + path, { headers: { 'x-api-key': this.opts.apiKey, accept: 'application/json' } });
        status = res.status;
        body = await res.text();
      } catch (err) {
        body = String((err as Error).message ?? err);
      }
      // Tatum charges for answered requests; record what the docs say it costs (network errors cost nothing).
      await this.opts.onCall?.({ endpoint, path, credits: status ? credits : 0, status, ms: Date.now() - t0 });
      if (status >= 200 && status < 300) return schema.parse(JSON.parse(body));
      const retryable = status === 0 || status === 429 || status >= 500;
      if (!retryable || attempt >= retries) throw new TatumError(`Tatum ${endpoint} ${status}: ${body.slice(0, 300)}`, status, body);
      await this.sleep(1000 * 2 ** attempt);
    }
  }

  events(q: EventsQuery): Promise<EventsPage> {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v !== undefined) params.set(k, String(v));
    return this.get('events', `/events?${params}`, EventsPage);
  }

  marketPrice(id: string): Promise<MarketPrice> {
    return this.get('price', `/markets/${encodeURIComponent(id)}/price`, z.object({ data: MarketPrice })).then((r) => r.data);
  }

  market(id: string): Promise<PredictionMarket> {
    return this.get('market', `/markets/${encodeURIComponent(id)}`, z.object({ data: PredictionMarket })).then((r) => r.data);
  }
}
