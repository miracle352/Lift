# Architecture

## Stack (pinned in package.json; installs and builds as of 2026-10-22)

| Layer | Choice | Why |
|---|---|---|
| App | Next.js 16.4 (App Router, `cacheComponents`), React 19.3, Tailwind 4.3, TypeScript 5.9 | one deployable, server actions + route handlers |
| DB | SQLite via libSQL + Drizzle ORM (`file:./local.db` dev, Turso in prod, `:memory:` in tests) | zero setup on Windows, free hosting |
| Sui | `@mysten/sui` 2.35 `SuiGrpcClient` over `@protobuf-ts/grpc-transport` → **Tatum gRPC** | JSON-RPC is deprecated; Tatum gRPC is native-only |
| Memory | `@mysten-incubation/memwal` 0.1.8 → managed mainnet relayer | relayer pays WAL + gas |
| Market data | Tatum Prediction API (`https://api.tatum.io/v4/data/prediction/*`) | Polymarket + Kalshi markets, prices, positions, resolutions |
| Payments (M7) | `@suimpp/mpp` 0.9 + `mppx` 0.4.12 (MPP, USDC on Sui) | Agent Payments prize |
| Auth | handle + password (`node:crypto` scrypt), `iron-session` cookie | no email infra |
| Hosting | Vercel (Node runtime) + Turso + GitHub Actions cron (`.github/workflows/tick.yml`) | free tiers |

## Components

```
Browser ──► Next.js (Vercel, Node runtime)
              ├─ pages: matchday, forecast flow, receipts, me, profiles, crew, verify, admin, agent
              ├─ server actions / route handlers (thin) ──► src/server/* (feature logic, 'server-only')
              │      ├─ auth        users, sessions (iron-session)
              │      ├─ markets     Tatum Prediction client + curation + sync
              │      ├─ forecasts   episodes, seals (enqueue), advice assembly, fair-test assignment
              │      ├─ tick        the background worker (below)
              │      ├─ memory      outbox → Walrus Memory, recall cards
              │      ├─ stats       settlement + advisor stats + snapshots (uses src/core/scoring)
              │      └─ payments    (M7) MPP charge endpoint, agent buyer
              ├─ src/lib/sui.ts ─────► Tatum Sui gRPC (sui-mainnet-grpc.gateway.tatum.io:443)
              ├─ src/lib/memwal.ts ──► Walrus Memory relayer (relayer.memory.walrus.xyz) ──► Walrus + Sui
              └─ src/db ─────────────► libSQL / Turso
GitHub Actions (every 10 min) ──POST /api/cron/tick (Bearer CRON_SECRET)──► tick
```

## The tick worker (`POST /api/cron/tick`, also callable as `pnpm tick` locally and via `after()` right after a lock)

Each step is idempotent, bounded (`LIMIT` per step), time-boxed (stop at ~45 s) and logs counts. Order:

1. **Seals: submit.** `seals.status = queued` → `memwal.remember(json, namespace, { idempotencyKey: hash })` → `accepted` + `memwal_job_id`.
2. **Seals: confirm.** `accepted` → `getRememberStatus` → `done` ⇒ `stored` + `walrus_blob_id`; `failed` ⇒ retry with backoff (max 5) → `failed`.
3. **Seals: evidence.** `stored` → `captureSealEvidence` (src/lib/seal-evidence.ts, cache table `blob_locator`) → `verified` / `late`; not found yet ⇒ retry with backoff for ~15 min → `failed`.
4. **Markets: sync.** Curated markets that are open and close within 48 h, or closed and unresolved: `GET /v4/data/prediction/markets/{id}` → update status, close time, resolution. Respect credits (100 per call), at most N per tick.
5. **Reveal.** Seals whose market `close_time` has passed → `revealed_at = now`.
6. **Settle.** Episodes `complete` whose market resolved → scores → `settled` → enqueue episode memory → recompute `advisor_stats` for that user → on verdict change, enqueue a lesson → snapshot.
7. **Memory outbox.** `memory_writes.queued` → `rememberBulk` (≤ 20) → poll statuses next tick.

Locks call `after(() => runTickSteps(['seals']))` so a seal usually reaches Sui within a minute without waiting for cron.
Vercel: set `export const maxDuration = 60` on the tick route.

## Data model (src/db/schema.ts — already written, migration `drizzle/0000_init.sql`)

- `users`, `crews`, `crew_members`
- `markets`: curated Tatum markets (id = `platform:platformMarketId`), close time, rules hash, resolution
- `advisors`: `market:polymarket`, `whale:<wallet>`, `user:<userId>` (tipster/crew), `pundit:@handle`
- `seals`: every hash committed (status machine above), evidence columns, `revealed_at`
- `episodes`: one per (user, market). `blind_locked` → `advice_shown` → `complete` → `settled` | `void`
- `takes`: tipster takes (sealed via `seals`, optional USDC price)
- `memory_writes`: outbox for episode/lesson memories
- `advisor_stats`, `stat_snapshots`, `blob_locator` (Sui locator cache)
- `agent_rules`, `purchases` (M7)

Status values are DB enums; use them exactly. Add columns with a new migration. Never edit `0000_init.sql` after it has been applied anywhere.

## Security
- Passwords: scrypt (N=2^15, r=8, p=1, 16-byte salt) with constant-time compare. Sessions: iron-session (`SESSION_SECRET`), httpOnly, sameSite=lax, secure in prod.
- All mutations are server actions or POST routes with session checks. Admin = handle in `ADMIN_HANDLES`.
- Rate-limit lock/signup endpoints per session/IP (simple DB counter is enough).
- Never return `forecast_json` for unrevealed seals to anyone but the owner (and the owner only sees their own probability).
- `/api/cron/tick` requires `Authorization: Bearer CRON_SECRET`.

## Environments
- **Local:** `.env.local`, `DATABASE_URL=file:./local.db`, real Tatum + Walrus Memory (or `MEMWAL_MOCK=1` for UI work).
- **Production:** Vercel env vars (same names), Turso database, GitHub Actions variables `APP_URL` + secret `CRON_SECRET`.
- Migrations in prod: `DATABASE_URL=libsql://… DATABASE_AUTH_TOKEN=… pnpm db:migrate` from your machine.

## Windows notes (the human develops on Windows + PowerShell)
- Use `pnpm` scripts. Avoid bash-only syntax in package.json scripts (no `&&`-chained env assignments, no `rm -rf`).
- Paths: use `node:path` joins, never hard-coded `/`.
