import { connection } from 'next/server';
import { receipt } from '@/arena/queries';
import { getDb } from '@/db/client';


/** Receipt for one sealed forecast or take: Merkle proof + Sui commit; the forecast JSON only after the market closes. */
export async function GET(_req: Request, ctx: RouteContext<'/api/arena/receipts/[hash]'>) {
  await connection();
  const { hash } = await ctx.params;
  if (!/^[0-9a-fA-F]{64}$/.test(hash)) return Response.json({ error: 'bad hash' }, { status: 400 });
  const r = await receipt(getDb(), hash);
  return r ? Response.json(r) : Response.json({ error: 'not found' }, { status: 404 });
}
