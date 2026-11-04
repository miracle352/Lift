import { MemWal, MemWalMock } from '@mysten-incubation/memwal';
import { MEMWAL_MAINNET } from '@/core/constants';

/**
 * Walrus Memory client (server/Node only — the delegate key must never reach the browser).
 *
 * - Production relayer (mainnet): https://relayer.memory.walrus.xyz — it pays WAL storage and SUI gas.
 * - MEMWAL_MOCK=1 swaps in MemWalMock (in-memory, no network) for tests and offline work.
 * - Namespaces are exact-match strings (<= 255 bytes); see src/core/namespace.ts for the ones we use.
 * - Write budget on the shared relayer: ~30 weighted req/min per delegate key, 500/hour per account;
 *   remember = 5, remember/bulk = 10, recall = 1 (relayer limits). Queue writes; never fire them in loops.
 */
export type MemoryClient = Pick<MemWal, 'remember' | 'rememberAndWait' | 'getRememberStatus' | 'rememberBulk' | 'recall' | 'restore' | 'listNamespaces' | 'health' | 'getPublicKeyHex'>;

let client: MemoryClient | null = null;

export function getMemWal(): MemoryClient {
  if (typeof window !== 'undefined') throw new Error('getMemWal() is server-only');
  if (client) return client;
  if (process.env.MEMWAL_MOCK === '1') {
    client = MemWalMock.create({ namespace: 'default' }) as unknown as MemoryClient;
    return client;
  }
  const key = process.env.MEMWAL_PRIVATE_KEY;
  const accountId = process.env.MEMWAL_ACCOUNT_ID;
  if (!key || !accountId) throw new Error('MEMWAL_PRIVATE_KEY and MEMWAL_ACCOUNT_ID are required (or set MEMWAL_MOCK=1)');
  client = MemWal.create({
    key,
    accountId,
    serverUrl: process.env.MEMWAL_SERVER_URL ?? MEMWAL_MAINNET.relayerUrl,
    namespace: 'default',
  });
  return client;
}

/** Test hook: inject a fake. */
export function setMemWalForTests(fake: MemoryClient | null): void {
  client = fake;
}
