import { SuiGrpcClient } from '@mysten/sui/grpc';
import { GrpcTransport } from '@protobuf-ts/grpc-transport';
import { ChannelCredentials } from '@grpc/grpc-js';
import { TATUM } from '@/core/constants';

/**
 * Sui mainnet client over Tatum's NATIVE gRPC gateway (server/Node only).
 *
 * Why this exact setup (verified 2026-10-22):
 * - Sui has deprecated JSON-RPC; public fullnodes return "Method not found" and Tatum's JSON-RPC
 *   gateway returned "No healthy upstream" for every method while gRPC kept working.
 * - Tatum's gRPC endpoint speaks native gRPC (HTTP/2), not gRPC-web, so SuiGrpcClient's default
 *   fetch transport fails with "unexpected response content type: application/grpc".
 *   We pass a @protobuf-ts/grpc-transport (backed by @grpc/grpc-js) instead.
 * - Auth is the `x-api-key` metadata header. Without a key it works but is limited to ~5 calls/min.
 */
let client: SuiGrpcClient | null = null;
let transport: GrpcTransport | null = null;

export function getSuiClient(opts: { apiKey?: string; host?: string } = {}): SuiGrpcClient {
  if (typeof window !== 'undefined') throw new Error('getSuiClient() is server-only');
  if (client) return client;
  const apiKey = opts.apiKey ?? process.env.TATUM_API_KEY;
  transport = new GrpcTransport({
    host: opts.host ?? process.env.TATUM_SUI_GRPC_HOST ?? TATUM.suiGrpcHost,
    channelCredentials: ChannelCredentials.createSsl(),
    meta: apiKey ? { 'x-api-key': apiKey } : {},
  });
  client = new SuiGrpcClient({ network: 'mainnet', transport });
  return client;
}

/** Close the underlying HTTP/2 channel (scripts should call this so Node can exit). */
export function closeSuiClient(): void {
  transport?.close();
  transport = null;
  client = null;
}

const RETRYABLE = /UNAVAILABLE|RESOURCE_EXHAUSTED|DEADLINE_EXCEEDED|429|No healthy upstream/i;

/** Retries transient gateway errors (rate limits, "No healthy upstream") with exponential backoff. */
export async function withSuiRetry<T>(fn: () => Promise<T>, { retries = 4, baseMs = 1500 } = {}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const msg = `${(err as { code?: string }).code ?? ''} ${(err as Error).message ?? ''}`;
      if (attempt >= retries || !RETRYABLE.test(msg)) throw err;
      await new Promise((r) => setTimeout(r, baseMs * 2 ** attempt));
    }
  }
}
