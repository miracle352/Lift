import { connection } from 'next/server';
import { leaderboard } from '@/arena/queries';
import { getDb } from '@/db/client';


/** Who helps whom: per agent × advisor verdicts, learned trust, and what each advisor earned under pay-for-lift. */
export async function GET() {
  await connection();
  return Response.json(await leaderboard(getDb()));
}
