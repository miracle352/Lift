# Agent payments notes (milestone M7) — MPP with USDC on Sui

Prize: "Best Use of Agent Payments — best app across tracks using x402 or MPP, settled on Sui" ($500).
Packages pinned: `@suimpp/mpp@0.9.0` (bundles the Sui method) and `mppx@0.4.12` (**must stay on 0.4.x**: @suimpp/mpp depends on `mppx ^0.4.9`).
README copy: `suimpp-README.md`. Source of truth for signatures: `node_modules/mppx/dist/server/Mppx.d.ts`, `node_modules/mppx/dist/client/Mppx.d.ts`,
`node_modules/@suimpp/mpp/dist/server.d.ts`, `.../client.d.ts`.

## Flow
1. Buyer's agent requests `GET /api/takes/:id/unlock`.
2. Server returns `402 Payment Required` with `WWW-Authenticate: Payment … method="sui"` (amount, currency = USDC, recipient = tipster payout address).
3. Agent pays: builds `0x2::coin::send_funds` for the exact USDC amount, signs with its keypair, broadcasts (needs a little SUI for gas),
   signs a proof message, retries with `Authorization: Payment …`.
4. Server verifies on-chain (success, recipient, amount, signer = sender, digest unused) and returns 200 + `Payment-Receipt` + the take.
5. **Our extra step:** fetch the payment digest through Tatum gRPC (`src/lib/sui.ts`) before inserting `purchases`, so the Tatum
   integration covers payments too. (`@suimpp/mpp`'s own server verification builds a gRPC-web client from `rpcUrl`, which cannot
   point at Tatum's native-gRPC gateway, so leave `rpcUrl` unset: it defaults to Sui's public fullnode.)

## Server shape (mppx 0.4.12)
```ts
import { Mppx } from 'mppx/server';            // the suimpp README imports from 'mppx' — both exist; prefer 'mppx/server'
import { sui, USDC } from '@suimpp/mpp/server';

const mppx = Mppx.create({
  methods: [sui({ currency: USDC, recipient: tipsterPayoutAddress, network: 'mainnet', store: dbDigestStore })],
  secretKey: process.env.MPP_SECRET_KEY,        // binds challenges to their contents
});

export async function GET(request: Request) {
  const result = await mppx.charge({ amount: take.priceUsdc })(request);
  if (result.status === 402) return result.challenge;
  // …confirm via Tatum, record purchase…
  return result.withReceipt(Response.json({ take }));
}
```
- `store` must be durable (implement `DigestStore { has(digest): Promise<boolean>; set(digest): Promise<void> }` on a DB table; `purchases.payment_digest` is unique).
- One `Mppx` per recipient, or create per request (cheap). Verify the exact `charge` call shape against the installed `.d.ts` before relying on this snippet.

## Client shape (server-side agent)
```ts
import { Mppx } from 'mppx/client';
import { sui, USDC } from '@suimpp/mpp/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { getSuiClient } from '@/lib/sui';

const agent = Mppx.create({
  methods: [sui({ client: getSuiClient(), signer: Ed25519Keypair.fromSecretKey(process.env.AGENT_WALLET_PRIVATE_KEY!), currency: USDC })],
  polyfill: false,   // REQUIRED on the server: otherwise it replaces globalThis.fetch for the whole Next.js process
});
const res = await agent.fetch(`${APP_URL}/api/takes/${id}/unlock`);
```
USDC on Sui mainnet: `0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC` (6 decimals).
`@suimpp/mpp/x402` also exposes an x402 "exact" scheme on `sui:mainnet` if we want to show both protocols.

## Agent decision rule (the part judges should notice)
Buy a paid take from advisor A for user U only if: `agent_rules.enabled` and
`advisor_stats(U, A).verdict === 'helps_you'` and `ci_low > agent_rules.min_ci_low` and the week's spend + price ≤ budget.
Otherwise skip and say why ("Not enough evidence that A helps you: n = 5 of 8"). Store the decision JSON with the purchase,
and show the recalled lesson that justified it.
