import { connection } from 'next/server';
import { openMatches, openRound } from '@/arena/humans';
import { handle } from '@/arena/web';
import { getDb } from '@/db/client';


/** What you can play now: the open crypto round and upcoming football matches (no prices: call blind first). */
export async function GET() {
  await connection();
  return handle(async () => ({ round: await openRound(getDb(), Date.now()), matches: await openMatches(getDb(), Date.now()) }));
}
