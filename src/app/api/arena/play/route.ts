import { connection } from 'next/server';
import { openRound } from '@/arena/humans';
import { handle } from '@/arena/web';
import { getDb } from '@/db/client';


/** The round you can play now (markets without prices: call blind first), or { round: null }. */
export async function GET() {
  await connection();
  return handle(async () => ({ round: await openRound(getDb(), Date.now()) }));
}
