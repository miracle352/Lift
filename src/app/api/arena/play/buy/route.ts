import { connection } from 'next/server';
import { Mppx } from 'mppx/server';
import { sui, USDC, USDC_TESTNET } from '@suimpp/mpp/server';
import { authPlayer, paidTakeQuote, PlayError, recordPaidTake } from '@/arena/humans';
import { DbDigestStore } from '@/arena/pay/takes-server';
import { microsToAmount } from '@/arena/pay/wallets';
import { webDeps } from '@/arena/web';

/**
 * A player buys ONE take from their own Sui wallet over MPP (HTTP 402 → pay USDC → retry with the credential).
 * GET /api/arena/play/buy?roundId=…&asset=btc&advisorId=quant[&fair=1]   header x-player-token: <token>
 * The payment is escrowed: paid to the advisor if the take improves the player's call, refunded otherwise.
 */
export async function GET(req: Request) {
  await connection();
  try {
    const recipient = process.env.ARENA_CLEARINGHOUSE_ADDRESS;
    if (!recipient || !process.env.MPP_SECRET_KEY) return Response.json({ error: 'payments not configured' }, { status: 503 });
    const network = process.env.PAY_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';
    const currency = network === 'mainnet' ? USDC : USDC_TESTNET;
    const url = new URL(req.url);
    const deps = await webDeps();
    const token = req.headers.get('x-player-token');
    const player = await authPlayer(deps.db, token ? `Bearer ${token}` : null);
    const q = await paidTakeQuote(deps, player.id, { roundId: url.searchParams.get('roundId') ?? '', asset: url.searchParams.get('asset') ?? '', advisorId: url.searchParams.get('advisorId') ?? '' });
    let report: { digest: string; sender?: string } | null = null;
    const mppx = Mppx.create({
      methods: [sui({ currency, recipient, network, store: new DbDigestStore(deps.db), onPayment: (r: { digest: string; sender?: string }) => void (report = r) })],
      secretKey: process.env.MPP_SECRET_KEY,
      realm: 'lift-arena',
    });
    const result = await mppx.charge({ amount: microsToAmount(q.priceMicros, currency.decimals), description: `${q.take.advisorName}'s take on ${q.market.asset.toUpperCase()}` })(req);
    if (result.status === 402) return result.challenge;
    const r = report as { digest: string; sender?: string } | null;
    if (!r) return Response.json({ error: 'payment not confirmed' }, { status: 402 });
    const out = await recordPaidTake(deps, q, { digest: r.digest, sender: r.sender ?? null, network: `sui:${network}`, fairTest: url.searchParams.get('fair') === '1' });
    return result.withReceipt(Response.json(out));
  } catch (err) {
    if (err instanceof PlayError) return Response.json({ error: err.message }, { status: err.status });
    console.error('arena api error', err);
    return Response.json({ error: 'internal error' }, { status: 500 });
  }
}
