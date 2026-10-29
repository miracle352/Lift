import { eq } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { arenaAdvisors } from '@/db/schema';
import { ADVISORS } from './brain/models';

/**
 * Every advisor the arena knows: the 7 built-in code advisors plus the ones registered in the open
 * marketplace (src/arena/external.ts). Built-ins are paid to wallets derived from ARENA_WALLET_SEED;
 * external advisors are paid to the payout address they registered.
 */
export interface AdvisorInfo {
  id: string;
  name: string;
  pitch: string;
  priceMicros: number;
  kind: 'builtin' | 'external';
  status: 'active' | 'paused' | 'failing';
  payoutAddress: string | null;
  endpointUrl: string | null;
}

export const BUILTIN_INFO: AdvisorInfo[] = ADVISORS.map((a) => ({ id: a.id, name: a.name, pitch: a.pitch, priceMicros: a.priceMicros, kind: 'builtin', status: 'active', payoutAddress: null, endpointUrl: null }));

export async function advisorDirectory(db: Db): Promise<Map<string, AdvisorInfo>> {
  const ext = await db.select().from(arenaAdvisors);
  const out = new Map(BUILTIN_INFO.map((a) => [a.id, a]));
  for (const e of ext) out.set(e.id, { id: e.id, name: e.name, pitch: e.pitch, priceMicros: e.priceMicros, kind: 'external', status: e.status, payoutAddress: e.payoutAddress, endpointUrl: e.endpointUrl });
  return out;
}

export async function activeExternalAdvisors(db: Db) {
  return db.select().from(arenaAdvisors).where(eq(arenaAdvisors.status, 'active'));
}

export const advisorName = (dir: Map<string, AdvisorInfo>, id: string) => dir.get(id)?.name ?? id;
