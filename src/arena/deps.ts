import type { Db } from '@/db/client';
import type { MemoryClient } from '@/lib/memwal';
import type { SuiCoreLike } from '@/lib/seal-evidence';
import type { AssetKey } from './fast-markets';
import type { TatumPrediction } from './tatum';
import type { PayConfig } from './pay/wallets';

/** Everything the arena touches, injected so tests run offline (fake fetch, MemWalMock, fake Sui). */
export interface ArenaDeps {
  db: Db;
  tatum: TatumPrediction;
  mem: MemoryClient;
  sui: SuiCoreLike;
  /** fetch for free public feeds (Coinbase, Polymarket CLOB) */
  fetch: typeof fetch;
  /** fetch used to call external marketplace advisors (defaults to global fetch) */
  externalFetch?: typeof fetch;
  now: () => number;
  config: ArenaConfig;
  log: (msg: string, extra?: Record<string, unknown>) => void;
  /** When set, agents buy takes over MPP (USDC on Sui) from `${baseUrl}/api/arena/takes`; otherwise a ledger is used. */
  pay?: { cfg: PayConfig; baseUrl: string; buy?: typeof import('./pay/client').buyTakes };
}

export interface ArenaConfig {
  assets: AssetKey[];
  /** minutes between rounds: 15 = every window, 30 = every other window (saves Tatum credits) */
  cadenceMin: number;
  /** lock (blind → buy → informed) this many minutes after the window opens */
  lockMinute: number;
  /** Walrus Memory account + owner, for evidence checks */
  memwalAccountId: string;
  memwalOwner: string;
}

export const DEFAULT_ASSETS: AssetKey[] = ['btc', 'eth', 'sol', 'xrp', 'doge', 'bnb', 'hype', 'zec'];

export const roundIdFor = (closeMs: number) => `15m:${new Date(closeMs).toISOString()}`;
export const agentUser = (agentId: string) => `agent:${agentId}`;
export const advisorUser = (advisorId: string) => `advisor:${advisorId}`;

/** Walrus Memory namespaces for agent memory (exact-match strings, ≤ 255 bytes). */
export const agentNamespaces = (agentId: string) => ({
  episodes: `arena1:${agentId}:episodes`,
  lessons: `arena1:${agentId}:lessons`,
});
