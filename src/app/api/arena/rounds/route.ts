import { connection } from 'next/server';
import { listRounds } from '@/arena/queries';
import { getDb } from '@/db/client';

export const runtime = 'nodejs';

/** Recent arena rounds: markets, Merkle seals (with Sui digests) and purchase/payout counts. No probabilities. */
export async function GET(req: Request) {
  await connection();
  const limit = Math.min(48, Math.max(1, Number(new URL(req.url).searchParams.get('limit') ?? 12)));
  return Response.json({ rounds: await listRounds(getDb(), limit) });
}
