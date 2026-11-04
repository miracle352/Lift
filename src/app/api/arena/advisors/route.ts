import { connection } from 'next/server';
import { ZodError } from 'zod';
import { PROTOCOL, registerAdvisor } from '@/arena/external';
import { leaderboard } from '@/arena/queries';
import { getDb } from '@/db/client';


/** The advisor marketplace: every advisor (built-in + registered), its price and what it has earned under pay-for-lift. */
export async function GET() {
  await connection();
  const lb = await leaderboard(getDb());
  return Response.json({ protocol: PROTOCOL, docs: 'https://github.com/miracle352/Lift/blob/main/docs/how-it-works.md#selling-advice', advisors: lb.advisors });
}

/**
 * Register (or update) an advisor: { name, pitch, endpointUrl, payoutAddress, priceUsd?, contact? }.
 * The arena probes the endpoint once before accepting it. Payouts go to payoutAddress on Sui, only for takes that helped.
 */
export async function POST(req: Request) {
  await connection();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'JSON body required' }, { status: 400 });
  }
  try {
    return Response.json(await registerAdvisor(getDb(), body), { status: 201 });
  } catch (err) {
    if (err instanceof ZodError) return Response.json({ error: 'invalid registration', issues: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }, { status: 400 });
    return Response.json({ error: String((err as Error).message ?? err).slice(0, 200) }, { status: 422 });
  }
}
