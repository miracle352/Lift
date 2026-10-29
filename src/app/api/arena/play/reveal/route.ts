import { connection } from 'next/server';
import { authPlayer, playReveal } from '@/arena/humans';
import { handle, jsonBody, webDeps } from '@/arena/web';


/** { roundId, asset, advisorId? } → the ONE take you get to read (random advisor if you don't pick). Blind call first. */
export async function POST(req: Request) {
  await connection();
  return handle(async () => {
    const deps = await webDeps();
    const p = await authPlayer(deps.db, req.headers.get('authorization'));
    const b = await jsonBody(req);
    return playReveal(deps, p.id, { roundId: String(b.roundId ?? ''), asset: String(b.asset ?? ''), advisorId: b.advisorId ? String(b.advisorId) : undefined });
  });
}
