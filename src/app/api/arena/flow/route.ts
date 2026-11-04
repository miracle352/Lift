import { connection } from 'next/server';
import { roundFlow } from '@/arena/queries';
import { getDb } from '@/db/client';

export async function GET() {
  await connection();
  return Response.json(await roundFlow(getDb()));
}
