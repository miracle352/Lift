import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { sha256 } from '@noble/hashes/sha2.js';
import { hexToBytes } from '@noble/hashes/utils.js';
import { USDC, USDC_TESTNET } from '@suimpp/mpp/client';
import { ADVISORS, FORECASTERS } from '../brain/models';

/**
 * Arena wallets. Every agent, every advisor and the clearinghouse (escrow) has its own Sui keypair, all
 * derived from ONE secret (ARENA_WALLET_SEED, 32 bytes hex) so there is a single thing to protect:
 *   secret(name) = sha256(seed || ":" || name)
 * Network: PAY_NETWORK=testnet (default, free faucet money) or mainnet (real USDC, demo only).
 */
export type PayNetwork = 'testnet' | 'mainnet';

export interface PayConfig {
  network: PayNetwork;
  currency: { type: string; decimals: number };
  seedHex: string;
}

export function payConfigFromEnv(env: NodeJS.ProcessEnv = process.env): PayConfig | null {
  const seedHex = env.ARENA_WALLET_SEED;
  if (!seedHex) return null;
  if (!/^[0-9a-f]{64}$/i.test(seedHex)) throw new Error('ARENA_WALLET_SEED must be 64 hex chars');
  const network: PayNetwork = env.PAY_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';
  return { network, currency: network === 'mainnet' ? USDC : USDC_TESTNET, seedHex: seedHex.toLowerCase() };
}

export function walletFor(cfg: Pick<PayConfig, 'seedHex'>, name: string): Ed25519Keypair {
  const seed = hexToBytes(cfg.seedHex);
  const label = new TextEncoder().encode(`:${name}`);
  const buf = new Uint8Array(seed.length + label.length);
  buf.set(seed);
  buf.set(label, seed.length);
  return Ed25519Keypair.fromSecretKey(sha256(buf));
}

export const clearinghouse = (cfg: PayConfig) => walletFor(cfg, 'clearinghouse');
export const agentWallet = (cfg: Pick<PayConfig, 'seedHex'>, agentId: string) => walletFor(cfg, `agent:${agentId}`);
export const advisorWallet = (cfg: PayConfig, advisorId: string) => walletFor(cfg, `advisor:${advisorId}`);

export function walletDirectory(cfg: PayConfig) {
  return {
    clearinghouse: clearinghouse(cfg).toSuiAddress(),
    agents: Object.fromEntries(FORECASTERS.map((f) => [f.id, agentWallet(cfg, f.id).toSuiAddress()])),
    advisors: Object.fromEntries(ADVISORS.map((a) => [a.id, advisorWallet(cfg, a.id).toSuiAddress()])),
  };
}

let clients: Partial<Record<PayNetwork, SuiGrpcClient>> = {};
/** Payments run on the public fullnode for the chosen network (gRPC-web), separate from Tatum's mainnet gateway. */
export function payClient(network: PayNetwork): SuiGrpcClient {
  return (clients[network] ??= new SuiGrpcClient({ network, baseUrl: `https://fullnode.${network}.sui.io:443` }));
}
export const resetPayClients = () => void (clients = {});

export const microsToAmount = (micros: number, decimals = 6) => (micros / 10 ** decimals).toFixed(decimals);
