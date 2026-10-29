import { connection } from 'next/server';
import { stats } from '@/arena/queries';
import { getDb } from '@/db/client';

export const runtime = 'nodejs';

export async function GET() {
  await connection();
  return Response.json(await stats(getDb()));
}
