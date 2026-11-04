import { connection } from 'next/server';
import { openMatches, openRound } from '@/arena/humans';
import { handle } from '@/arena/web';
import { getDb } from '@/db/client';


/** What you can play now: the open crypto round and upcoming football matches (no prices: call blind first). */
export async function GET() {
  await connection();
  const payments = process.env.ARENA_CLEARINGHOUSE_ADDRESS && process.env.MPP_SECRET_KEY ? { network: process.env.PAY_NETWORK === 'mainnet' ? 'mainnet' : 'testnet', priceMicros: 10_000 } : null;
  return handle(async () => ({ round: await openRound(getDb(), Date.now()), matches: await openMatches(getDb(), Date.now()), payments }));
}
