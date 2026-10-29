import { connection } from 'next/server';
import { authPlayer, playInformed } from '@/arena/humans';
import { handle, jsonBody, webDeps } from '@/arena/web';


/** { roundId, asset, probabilityBps } with Authorization: Bearer <token>. Sealed on Walrus Memory, verified on Sui. */
export async function POST(req: Request) {
  await connection();
  return handle(async () => {
    const deps = await webDeps();
    const p = await authPlayer(deps.db, req.headers.get('authorization'));
    const b = await jsonBody(req);
    return playInformed(deps, p.id, { roundId: String(b.roundId ?? ''), asset: String(b.asset ?? ''), probabilityBps: Number(b.probabilityBps) });
  });
}
