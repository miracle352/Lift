import { z } from 'zod';
import { MEMWAL_MAINNET, TATUM } from '@/core/constants';

/**
 * Server environment. Parsed lazily so `next build` works without secrets.
 * Never import this from a client component. Variable reference: .env.example
 */
const suiId = z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'expected a 0x-prefixed 32-byte Sui id');

const ServerEnv = z.object({
  APP_URL: z.string().url().default('http://localhost:3000'),

  // Tatum
  TATUM_API_KEY: z.string().min(1),
  TATUM_SUI_GRPC_HOST: z.string().default(TATUM.suiGrpcHost),

  // Walrus Memory (memory.walrus.xyz → your account → Delegate keys)
  MEMWAL_PRIVATE_KEY: z.string().min(1),
  MEMWAL_ACCOUNT_ID: suiId,
  /** Wallet address that owns the Walrus Memory account (Blob objects are transferred here). */
  MEMWAL_OWNER_ADDRESS: suiId,
  MEMWAL_SERVER_URL: z.string().url().default(MEMWAL_MAINNET.relayerUrl),
  /** Set to "1" to use the in-memory MemWalMock (tests, offline dev). Never in production. */
  MEMWAL_MOCK: z.enum(['0', '1']).default('0'),

  // Database (libSQL: local file in dev, Turso in production)
  DATABASE_URL: z.string().default('file:./local.db'),
  DATABASE_AUTH_TOKEN: z.string().optional(),

  // Agent payments (optional)
  MPP_SECRET_KEY: z.string().min(32).optional(),
});
export type ServerEnv = z.infer<typeof ServerEnv>;

let cached: ServerEnv | null = null;

export function serverEnv(): ServerEnv {
  if (typeof window !== 'undefined') throw new Error('serverEnv() called in the browser');
  if (cached) return cached;
  const parsed = ServerEnv.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid or missing environment variables (see .env.example):\n${problems}`);
  }
  cached = parsed.data;
  return cached;
}

/** For scripts that only need a few variables. */
export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}. Copy .env.example to .env.local and fill it in.`);
  return v;
}
