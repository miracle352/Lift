# Walrus Memory notes (SDK @mysten-incubation/memwal 0.1.8, managed mainnet relayer)

Full SDK guide: `memwal-SKILL.md` (copied from MystenLabs/MemWal). Types: `node_modules/@mysten-incubation/memwal/dist/types.d.ts`.

## Identity
- `MEMWAL_PRIVATE_KEY`: Ed25519 **delegate** private key (hex, `0x…` or `suiprivkey1…`). Server only.
- `MEMWAL_ACCOUNT_ID`: the `MemWalAccount` object id on Sui (**not** a wallet address).
- `MEMWAL_OWNER_ADDRESS`: wallet that owns the account. Every memory's Blob object is transferred to it.
- `MEMWAL_AGENT_ID` (submission form) = the delegate **public** key hex = the `memwal_agent_id` label on chain.
  `pnpm smoke:memwal` prints it (`delegateKeyToPublicKey`).
- Mainnet ids: package `0xe7c16fbea0560e7057e2bf7422feaa4fb313749fc69c9e9092fac7a33b81d7f5`,
  registry `0x8bf82c9e09e36b8d1c38298f68b7cb68e7b8762887e7592add9986d5e9cf199f`, relayer `https://relayer.memory.walrus.xyz`.
  Do not mix staging (testnet) credentials with the mainnet relayer.

## Methods we use
| method | notes |
|---|---|
| `remember(text, namespace, { idempotencyKey })` | accepts a job immediately → `{ job_id, status }`. **Always append**, never upsert. |
| `getRememberStatus(jobId)` | `pending → running → uploaded → done` (has `blob_id`) or `failed` |
| `rememberAndWait(text, ns, { timeoutMs })` | scripts only; can take 10–60 s |
| `rememberBulk(items[{ text, namespace }])` / `getRememberBulkStatus(jobIds)` | outbox writes; weight 10 for the whole batch |
| `recall({ query, namespace, topK, maxDistance, scoringWeights, sort })` | top-K by cosine distance. No default threshold, so filter with `maxDistance` (start 0.6–0.8). `< 0.25` near-duplicate, `0.25–0.55` related, `> 0.8` unrelated |
| `listNamespaces({ cursor, limit })` | read API (200/min); paginate on `has_more`, never on page length |
| `restore(namespace, limit = 10)` | rebuilds missing index rows from Walrus, newest first, ≤ 100 per call, no cursor |
| `health()` | unauthenticated liveness |

`MemWalMock` (same import) implements remember/recall/bulk/restore/listNamespaces in memory, for tests.

## Namespace rules
Non-empty UTF-8 ≤ 255 bytes, exact match, case-sensitive, no hierarchy, no prefix queries. Omitted = `"default"`.

## Limits (relayer defaults, from services/server/src/rate_limit.rs)
- Per delegate key 30 weighted req/min. Per account 60/min burst and 500/hour sustained. Storage 1 GB per account.
- Weights: analyze 5 (+ per fact), remember 5, remember/bulk 10, remember/manual 3, restore 3, ask 2, embed 2, recall 1.
- 429 body includes `retry_after_seconds`; restore also has 10 calls/min per owner.

## Storage facts
- The relayer embeds (text-embedding-3-small, 1536-d), Seal-encrypts, uploads to Walrus and pays WAL + SUI.
- Mainnet blobs are bought for **15 epochs** (≈ 7 months; 1 epoch ≈ 2 weeks). Expired blobs disappear from recall.
- The relayer sees plaintext during encryption and embedding (trust assumption; disclose it).
- `forget` removes index rows only; blobs persist until expiry.
