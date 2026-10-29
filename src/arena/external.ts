import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '@/db/client';
import { arenaAdvisors } from '@/db/schema';
import type { WindowFeatures } from './brain/features';
import { BUILTIN_INFO } from './registry';

/**
 * Open advisor marketplace — protocol `receipts-arena-advisor/1`.
 *
 * At lock time the arena POSTs every active external advisor ONE request for the whole round:
 *   { protocol, roundId, closeTime, markets: [{ asset, conditionId, question, windowStart, closeTime, marketUpBps, features }] }
 * and expects within 4 s:
 *   { takes: [{ asset, probabilityBps: 1..9999, says?: string (≤ 200 chars) }] }
 * Missing assets simply get no take from that advisor. Takes are sealed (kind "take") in the round's take batch
 * BEFORE any buyer sees them; buyers pay over MPP; the advisor's payout address is paid only for takes that helped.
 * 5 failed rounds in a row → status "failing" (skipped until it re-registers).
 */

export const PROTOCOL = 'receipts-arena-advisor/1';
const MAX_ACTIVE = 25;
const MAX_FAILURES = 5;

export const TakesResponse = z.object({
  takes: z
    .array(z.object({ asset: z.string().max(10), probabilityBps: z.number().int().min(1).max(9999), says: z.string().max(200).optional() }))
    .max(20),
});

export interface MarketForAdvisor {
  asset: string;
  conditionId: string;
  question: string;
  windowStart: string;
  closeTime: string;
  marketUpBps: number;
  features: Pick<WindowFeatures, 'startPrice' | 'lastPrice' | 'twapSoFar' | 'minutesElapsed' | 'minutesLeft' | 'retSinceStart' | 'ret3m' | 'sigma1m'>;
}

export const Registration = z.object({
  name: z.string().trim().min(3).max(40),
  pitch: z.string().trim().min(3).max(160),
  endpointUrl: z.string().url().max(300),
  payoutAddress: z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'a Sui address (0x + 64 hex)'),
  /** price per take in USD, 0.001 .. 0.05 */
  priceUsd: z.number().min(0.001).max(0.05).default(0.01),
  contact: z.string().trim().max(80).optional(),
});
export type Registration = z.infer<typeof Registration>;

export const slugOf = (name: string) =>
  'x-' +
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24);

/** Blocks requests to private/loopback/link-local addresses unless local advisors are explicitly allowed (dev/demo). */
export async function assertPublicUrl(raw: string, allowLocal = process.env.ARENA_ALLOW_LOCAL_ADVISORS === '1'): Promise<void> {
  const u = new URL(raw);
  if (allowLocal && (u.protocol === 'http:' || u.protocol === 'https:')) return;
  if (u.protocol !== 'https:') throw new Error('endpoint must use https');
  const host = u.hostname;
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  for (const { address } of addrs) if (isPrivate(address)) throw new Error('endpoint resolves to a private address');
}

export function isPrivate(ip: string): boolean {
  if (ip.includes(':')) {
    const l = ip.toLowerCase();
    return l === '::1' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80') || l === '::' || l.startsWith('::ffff:127.') || l.startsWith('::ffff:10.') || l.startsWith('::ffff:192.168.');
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

export async function callAdvisor(endpointUrl: string, payload: unknown, f: typeof fetch = fetch, timeoutMs = 4000) {
  await assertPublicUrl(endpointUrl);
  const res = await f(endpointUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'receipts-arena/1.0' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
    redirect: 'error',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (text.length > 20_000) throw new Error('response too large');
  return TakesResponse.parse(JSON.parse(text));
}

export const samplePayload = () => ({
  protocol: PROTOCOL,
  roundId: 'probe',
  closeTime: new Date(Date.now() + 9 * 60_000).toISOString(),
  markets: [
    {
      asset: 'btc',
      conditionId: '0x' + '0'.repeat(64),
      question: 'Bitcoin Up or Down (registration probe)',
      windowStart: new Date(Date.now() - 6 * 60_000).toISOString(),
      closeTime: new Date(Date.now() + 9 * 60_000).toISOString(),
      marketUpBps: 5500,
      features: { startPrice: 100, lastPrice: 100.1, twapSoFar: 100.05, minutesElapsed: 6, minutesLeft: 9, retSinceStart: 0.001, ret3m: 0.0004, sigma1m: 0.0008 },
    },
  ] satisfies MarketForAdvisor[],
});

export async function registerAdvisor(db: Db, input: unknown, f: typeof fetch = fetch) {
  const r = Registration.parse(input);
  const id = slugOf(r.name);
  if (id.length < 4 || BUILTIN_INFO.some((b) => b.id === id || b.name.toLowerCase() === r.name.toLowerCase())) throw new Error('name not available');
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(arenaAdvisors).where(eq(arenaAdvisors.status, 'active'));
  const [existing] = await db.select().from(arenaAdvisors).where(eq(arenaAdvisors.id, id));
  if (!existing && Number(n) >= MAX_ACTIVE) throw new Error('marketplace is full for now');
  if (existing && existing.payoutAddress.toLowerCase() !== r.payoutAddress.toLowerCase()) throw new Error('name already registered by another payout address');
  // the endpoint must answer a probe correctly before it can join
  const probe = await callAdvisor(r.endpointUrl, samplePayload(), f);
  if (!probe.takes.some((t) => t.asset === 'btc')) throw new Error('probe: no take for "btc"');
  const row = {
    id,
    name: r.name,
    pitch: r.pitch,
    endpointUrl: r.endpointUrl,
    payoutAddress: r.payoutAddress.toLowerCase(),
    priceMicros: Math.round(r.priceUsd * 1e6),
    contact: r.contact ?? null,
    status: 'active' as const,
    consecutiveFailures: 0,
    lastError: null,
    lastSeenAt: new Date(),
  };
  await db.insert(arenaAdvisors).values(row).onConflictDoUpdate({ target: arenaAdvisors.id, set: row });
  return { id, status: 'active' as const, priceMicros: row.priceMicros };
}

/** Collects takes from every active external advisor for one round (parallel, each failure isolated). */
export async function collectExternalTakes(db: Db, args: { roundId: string; closeTime: string; markets: MarketForAdvisor[]; fetch?: typeof fetch; log?: (m: string, e?: Record<string, unknown>) => void }) {
  const advisors = await db.select().from(arenaAdvisors).where(eq(arenaAdvisors.status, 'active'));
  const out = new Map<string, Map<string, { probabilityBps: number; says: string }>>();
  await Promise.all(
    advisors.map(async (a) => {
      try {
        const res = await callAdvisor(a.endpointUrl, { protocol: PROTOCOL, roundId: args.roundId, closeTime: args.closeTime, markets: args.markets }, args.fetch);
        const byAsset = new Map<string, { probabilityBps: number; says: string }>();
        for (const t of res.takes) if (args.markets.some((m) => m.asset === t.asset) && !byAsset.has(t.asset)) byAsset.set(t.asset, { probabilityBps: t.probabilityBps, says: (t.says ?? `${Math.round(t.probabilityBps / 100)}% UP.`).slice(0, 200) });
        out.set(a.id, byAsset);
        await db.update(arenaAdvisors).set({ consecutiveFailures: 0, lastError: null, lastSeenAt: new Date() }).where(eq(arenaAdvisors.id, a.id));
      } catch (err) {
        const failures = a.consecutiveFailures + 1;
        await db
          .update(arenaAdvisors)
          .set({ consecutiveFailures: failures, lastError: String((err as Error).message ?? err).slice(0, 200), status: failures >= MAX_FAILURES ? 'failing' : 'active' })
          .where(eq(arenaAdvisors.id, a.id));
        args.log?.('external advisor failed', { advisorId: a.id, err: String((err as Error).message ?? err) });
      }
    }),
  );
  return { advisors, takes: out };
}
