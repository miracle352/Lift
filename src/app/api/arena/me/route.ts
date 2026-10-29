import { connection } from 'next/server';
import { authPlayer, playerSummary } from '@/arena/humans';
import { handle } from '@/arena/web';
import { getDb } from '@/db/client';


/** Who helps YOU: your settled episodes, per-advisor verdicts, and your sealed calls. */
export async function GET(req: Request) {
  await connection();
  return handle(async () => {
    const p = await authPlayer(getDb(), req.headers.get('authorization'));
    return { handle: p.handle, ...(await playerSummary(getDb(), p.id)) };
  });
}
