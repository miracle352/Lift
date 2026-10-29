import { connection } from 'next/server';
import { takesHandler } from '@/arena/pay/takes-server';
import { USDC, USDC_TESTNET } from '@suimpp/mpp/server';
import { getDb } from '@/db/client';

export const runtime = 'nodejs';

/**
 * Paid advice over MPP (HTTP 402 → pay USDC on Sui → retry). Any agent with a Sui wallet can buy
 * the arena advisors' takes for the open round: GET /api/arena/takes?round=15m:<close ISO>&picks=btc:quant,eth:crowd
 */
export async function GET(req: Request) {
  await connection();
  // The web app only needs the clearinghouse ADDRESS (never the wallet seed).
  const recipient = process.env.ARENA_CLEARINGHOUSE_ADDRESS;
  if (!recipient || !process.env.MPP_SECRET_KEY) return Response.json({ error: 'payments not configured' }, { status: 503 });
  const network = process.env.PAY_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';
  return takesHandler(getDb(), { network, currency: network === 'mainnet' ? USDC : USDC_TESTNET, recipient }, { secretKey: process.env.MPP_SECRET_KEY })(req);
}
