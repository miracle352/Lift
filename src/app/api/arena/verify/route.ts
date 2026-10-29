import { connection } from 'next/server';
import { liveVerify } from '@/arena/verify';
import { getDb } from '@/db/client';
import { getSuiClient } from '@/lib/sui';

export const runtime = 'nodejs';

/**
 * GET /api/arena/verify?hash=<forecast hash>[&tamper=<field>:<value>]
 * Re-checks a revealed forecast against Sui mainnet via Tatum. `tamper` edits one field before checking
 * (e.g. tamper=probabilityBps:9000) to show the check failing.
 */
export async function GET(req: Request) {
  await connection();
  const url = new URL(req.url);
  const hash = url.searchParams.get('hash') ?? '';
  if (!/^[0-9a-fA-F]{64}$/.test(hash)) return Response.json({ error: 'bad hash' }, { status: 400 });
  const t = url.searchParams.get('tamper');
  let tamper: Record<string, unknown> | undefined;
  if (t) {
    const [field, value] = t.split(':');
    if (field !== 'probabilityBps' && field !== 'createdAt') return Response.json({ error: 'tamper supports probabilityBps or createdAt' }, { status: 400 });
    tamper = { [field]: field === 'probabilityBps' ? Math.max(1, Math.min(9999, Number(value) || 5000)) : value };
  }
  const accountId = process.env.MEMWAL_ACCOUNT_ID;
  const owner = process.env.MEMWAL_OWNER_ADDRESS;
  if (!accountId || !owner) return Response.json({ error: 'not configured' }, { status: 503 });
  const out = await liveVerify(getDb(), getSuiClient(), hash, { accountId, owner, tamper });
  return Response.json(out, { status: 'error' in out ? 404 : 200 });
}
