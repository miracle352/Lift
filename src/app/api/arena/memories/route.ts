import { connection } from 'next/server';
import { memoryLog } from '@/arena/queries';
import { getDb } from '@/db/client';

export async function GET() {
  await connection();
  return Response.json({ items: await memoryLog(getDb(), 40) });
}
