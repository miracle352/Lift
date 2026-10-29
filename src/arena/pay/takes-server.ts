import { and, eq } from 'drizzle-orm';
import { Mppx } from 'mppx/server';
import { sui, type DigestStore } from '@suimpp/mpp/server';
import type { Db } from '@/db/client';
import { arenaMarkets, arenaPayDigests, arenaRounds, arenaTakes } from '@/db/schema';
import { clearinghouse, microsToAmount, type PayConfig } from './wallets';

export interface TakesSeller {
  network: PayConfig['network'];
  currency: PayConfig['currency'];
  /** clearinghouse (escrow) address that receives every payment */
  recipient: string;
}

export const sellerFromPayConfig = (cfg: PayConfig): TakesSeller => ({ network: cfg.network, currency: cfg.currency, recipient: clearinghouse(cfg).toSuiAddress() });

/**
 * The paid advice endpoint (MPP over HTTP, settled in USDC on Sui):
 *
 *   GET /api/arena/takes?round=<roundId>&picks=btc:crowd,eth:quant
 *
 * 1st request → 402 Payment Required with an MPP challenge (amount = sum of the advisors' prices,
 *               recipient = the arena clearinghouse, which escrows it).
 * 2nd request (Authorization: Payment …) → the server checks the Sui transaction (success, amount,
 *               recipient, signer = sender, digest never used before) and returns the takes.
 *
 * Escrow is released to each advisor only if its take improved the buyer's forecast on that market
 * (pay-for-lift), otherwise refunded to the buyer — see payouts.ts. Any agent with a Sui wallet can buy.
 */

export class DbDigestStore implements DigestStore {
  constructor(private readonly db: Db) {}
  async has(digest: string) {
    const [r] = await this.db.select().from(arenaPayDigests).where(eq(arenaPayDigests.digest, digest));
    return !!r;
  }
  async set(digest: string) {
    await this.db.insert(arenaPayDigests).values({ digest }).onConflictDoNothing();
  }
}

export interface TakesRequest {
  roundId: string;
  picks: { asset: string; advisorId: string }[];
}

export function parseTakesRequest(url: URL): TakesRequest | { error: string } {
  const roundId = url.searchParams.get('round') ?? '';
  const raw = url.searchParams.get('picks') ?? '';
  if (!/^15m:\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/.test(roundId)) return { error: 'bad round' };
  const picks = raw.split(',').filter(Boolean).map((p) => {
    const [asset, advisorId] = p.split(':');
    return { asset, advisorId };
  });
  if (!picks.length || picks.length > 16) return { error: 'between 1 and 16 picks' };
  if (picks.some((p) => !/^[a-z]{2,6}$/.test(p.asset ?? '') || !/^[a-z0-9-]{2,30}$/.test(p.advisorId ?? ''))) return { error: 'bad pick' };
  if (new Set(picks.map((p) => p.asset)).size !== picks.length) return { error: 'one pick per market' };
  return { roundId, picks };
}

/** The sealed takes a request asks for (null if any pick has no take this round) and their total price. */
export async function pickedTakes(db: Db, req: TakesRequest) {
  const rows = [];
  for (const p of req.picks) {
    const [row] = await db
      .select()
      .from(arenaTakes)
      .innerJoin(arenaMarkets, eq(arenaMarkets.id, arenaTakes.marketId))
      .where(and(eq(arenaMarkets.roundId, req.roundId), eq(arenaMarkets.asset, p.asset), eq(arenaTakes.advisorId, p.advisorId)));
    if (!row) return null;
    rows.push({ asset: p.asset, take: row.arena_takes, market: row.arena_markets });
  }
  return { rows, priceMicros: rows.reduce((s, r) => s + r.take.priceMicros, 0) };
}

export function takesHandler(db: Db, cfg: TakesSeller, opts: { secretKey: string; now?: () => number; onPaid?: (info: { digest: string; sender?: string; req: TakesRequest }) => Promise<void> }) {
  const store = new DbDigestStore(db);
  const recipient = cfg.recipient;
  return async (request: Request): Promise<Response> => {
    const parsed = parseTakesRequest(new URL(request.url));
    if ('error' in parsed) return Response.json({ error: parsed.error }, { status: 400 });
    const [round] = await db.select().from(arenaRounds).where(eq(arenaRounds.id, parsed.roundId));
    if (!round || round.status !== 'locked') return Response.json({ error: 'round not open' }, { status: 404 });
    if ((opts.now ?? Date.now)() >= round.closeTime.getTime()) return Response.json({ error: 'market closed' }, { status: 409 });

    const picked = await pickedTakes(db, parsed);
    if (!picked) return Response.json({ error: 'no such take this round' }, { status: 404 });

    let report: { digest: string; sender?: string } | null = null;
    const mppx = Mppx.create({
      methods: [sui({ currency: cfg.currency, recipient, network: cfg.network, store, onPayment: (r) => void (report = r) })],
      secretKey: opts.secretKey,
      realm: 'receipts-arena',
    });
    const result = await mppx.charge({ amount: microsToAmount(picked.priceMicros, cfg.currency.decimals), description: `${parsed.picks.length} take(s) for ${parsed.roundId}` })(request);
    if (result.status === 402) return result.challenge;

    // exactly the object whose hash goes into the buyer's informed forecast (advice.contentHash)
    const takes = picked.rows.map((r) => ({
      asset: r.asset,
      shown: { advisorId: r.take.advisorId, advisor: r.take.advisorName, market: r.market.conditionId, says: r.take.says, probabilityBps: r.take.probabilityBps, inputs: JSON.parse(r.take.inputsJson) },
      takeHash: r.take.hash,
    }));
    const r = report as { digest: string; sender?: string } | null;
    if (r && opts.onPaid) await opts.onPaid({ digest: r.digest, sender: r.sender, req: parsed });
    return result.withReceipt(Response.json({ roundId: parsed.roundId, paymentDigest: r?.digest ?? null, takes }));
  };
}
