import { and, eq } from 'drizzle-orm';
import { Mppx } from 'mppx/server';
import { sui, type DigestStore } from '@suimpp/mpp/server';
import type { Db } from '@/db/client';
import { arenaMarkets, arenaPayDigests, arenaRounds, arenaTakes } from '@/db/schema';
import { ADVISOR_BY_ID } from '../brain/models';
import { clearinghouse, microsToAmount, type PayConfig } from './wallets';

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
  if (picks.some((p) => !/^[a-z]{2,6}$/.test(p.asset ?? '') || !ADVISOR_BY_ID.has(p.advisorId ?? ''))) return { error: 'bad pick' };
  if (new Set(picks.map((p) => p.asset)).size !== picks.length) return { error: 'one pick per market' };
  return { roundId, picks };
}

export function priceOf(req: TakesRequest): number {
  return req.picks.reduce((s, p) => s + ADVISOR_BY_ID.get(p.advisorId)!.priceMicros, 0);
}

export function takesHandler(db: Db, cfg: PayConfig, opts: { secretKey: string; now?: () => number; onPaid?: (info: { digest: string; sender?: string; req: TakesRequest }) => Promise<void> }) {
  const store = new DbDigestStore(db);
  const recipient = clearinghouse(cfg).toSuiAddress();
  return async (request: Request): Promise<Response> => {
    const parsed = parseTakesRequest(new URL(request.url));
    if ('error' in parsed) return Response.json({ error: parsed.error }, { status: 400 });
    const [round] = await db.select().from(arenaRounds).where(eq(arenaRounds.id, parsed.roundId));
    if (!round || round.status !== 'locked') return Response.json({ error: 'round not open' }, { status: 404 });
    if ((opts.now ?? Date.now)() >= round.closeTime.getTime()) return Response.json({ error: 'market closed' }, { status: 409 });

    let report: { digest: string; sender?: string } | null = null;
    const mppx = Mppx.create({
      methods: [sui({ currency: cfg.currency, recipient, network: cfg.network, store, onPayment: (r) => void (report = r) })],
      secretKey: opts.secretKey,
      realm: 'receipts-arena',
    });
    const result = await mppx.charge({ amount: microsToAmount(priceOf(parsed), cfg.currency.decimals), description: `${parsed.picks.length} take(s) for ${parsed.roundId}` })(request);
    if (result.status === 402) return result.challenge;

    const takes = [];
    for (const p of parsed.picks) {
      const [row] = await db
        .select()
        .from(arenaTakes)
        .innerJoin(arenaMarkets, eq(arenaMarkets.id, arenaTakes.marketId))
        .where(and(eq(arenaMarkets.roundId, parsed.roundId), eq(arenaMarkets.asset, p.asset), eq(arenaTakes.advisorId, p.advisorId)));
      if (!row) continue;
      const adv = ADVISOR_BY_ID.get(p.advisorId)!;
      // exactly the object whose hash goes into the buyer's informed forecast (advice.contentHash)
      takes.push({
        asset: p.asset,
        shown: { advisorId: adv.id, advisor: adv.name, market: row.arena_markets.conditionId, says: row.arena_takes.says, probabilityBps: row.arena_takes.probabilityBps, inputs: JSON.parse(row.arena_takes.inputsJson) },
        takeHash: row.arena_takes.hash,
      });
    }
    const r = report as { digest: string; sender?: string } | null;
    if (r && opts.onPaid) await opts.onPaid({ digest: r.digest, sender: r.sender, req: parsed });
    return result.withReceipt(Response.json({ roundId: parsed.roundId, paymentDigest: r?.digest ?? null, takes }));
  };
}
