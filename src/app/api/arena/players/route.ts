import { connection } from 'next/server';
import { createPlayer } from '@/arena/humans';
import { handle, jsonBody } from '@/arena/web';
import { getDb } from '@/db/client';


/** Join the arena: { handle } → { playerId, handle, token }. Keep the token; it is shown once. */
export async function POST(req: Request) {
  await connection();
  return handle(async () => createPlayer(getDb(), String((await jsonBody(req)).handle ?? '')));
}
