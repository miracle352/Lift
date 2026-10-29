# Plan

Deadline: **Tue 2026-11-10 17:00 UTC**. Target submission: **Mon 2026-11-09**.
The only hard external constraint is data: real matches must be sealed and settled over **three football weekends**
(Oct 24–25, Oct 31–Nov 1, Nov 7–8) plus midweek fixtures. So **M2 must be live by Saturday Oct 24 morning (UTC)**.
Everything else can slip; that cannot.

Codex: work one milestone per session. Tick boxes as you finish, and write anything the human must do under **Notes**.
Status legend: `[ ]` todo · `[~]` in progress · `[x]` done.

---

## M0 — Scaffold check (Codex: 15 min · Human: ~1 h, see docs/HUMAN_CHECKLIST.md §Today)
- [x] Next.js 16 + pinned deps, Drizzle schema + first migration, CI and tick workflows
- [x] `src/core` protocol + scoring with pinned vectors; `src/lib` Tatum gRPC, Walrus Memory, evidence capture
- [ ] Codex: `pnpm install && pnpm check && pnpm build` pass on your machine; report anything that fails
- [ ] Human: `.env.local` filled; `pnpm smoke:sui`, `pnpm smoke:tatum`, `pnpm smoke:memwal -- --write` all succeed

Notes:

## M1 — Accounts, Tatum client, market curation (Thu–Fri Oct 22–23)
- [ ] `src/server/auth`: signup/login/logout (scrypt + iron-session), `getCurrentUser()`, admin check via `ADMIN_HANDLES`
- [ ] `src/server/tatum`: typed Prediction API client (zod schemas from docs/vendor; `x-api-key`; 429/5xx retry; in-DB or in-memory cache with TTLs; log credits used per call) for: search, list markets, get market, price, positions
- [ ] Fixtures: hand-write JSON fixtures that follow the documented schemas (tests/fixtures/tatum/*) and unit-test the client parsing
- [ ] `/admin/markets`: search → candidates (question, close time, prices, event id) → add with league label; enforce one curated market per event; manual "sync now"
- [ ] Seed the `market:polymarket` advisor; `markets.rules_hash = rulesHash(description)`
- [ ] `/` matchday list (no prices shown), `/signup`, `/login`
**Accept:** an admin adds a real upcoming football market; it appears on `/` with the right close time; `pnpm check` + `pnpm build` pass.

Notes:

## M2 — The lock flow and live seals (Fri Oct 23 → deployed Sat Oct 24 morning UTC)
- [ ] `/m/[marketId]`: step 1 blind slider + lock; step 2 advisor picker (Market, Pundit paste; fair-test toggle, default on); step 3 informed slider + "Unchanged" + lock. Cutoff = close − 10 min. One episode per (user, market).
- [ ] `src/server/forecasts`: build forecasts with `buildForecast`, chain informed → blind (`prev`), `adviceContentHash(shown)`; insert seals (`queued`)
- [ ] `src/server/tick`: steps 1–3 from docs/ARCHITECTURE.md (submit → confirm → evidence via `captureSealEvidence`, `blob_locator` cache), backoff, `failed` after limits; `/api/cron/tick` (Bearer CRON_SECRET, `maxDuration = 60`); `after()` hook on lock; `pnpm tick` script for local
- [ ] `/r/[hash]`: receipt page with check list, Suiscan links, sealed/revealed states
- [ ] Deploy: Vercel + Turso; run migrations; set env; GitHub Actions `APP_URL` + `CRON_SECRET` (write exact steps in Notes for the human)
**Accept:** on the deployed app, a blind + informed lock produce two seals that reach `verified` with Suiscan links within ~2 min; works at 375px.

Notes:

## M3 — Settlement, scores, "Who helps you" (Sat–Mon Oct 24–26)
- [ ] Tick steps 4–6: market sync (closing within 48 h or closed and unresolved), reveal after close, settle (`scoreEpisode`), `void` handling
- [ ] `advisor_stats` recompute per user after settlement (`summarize`, `verdict`, fair-test n); `stat_snapshots` daily + after settlement
- [ ] `/me`: table with n, mean change + 95% interval bar, typical move, verdict badge, "vs the market"; fair-tests-only toggle; Day 1 / Now toggle
- [ ] Receipt page shows result and scores after settlement
**Accept:** after the first resolved matches, episodes settle automatically and `/me` shows correct numbers (unit tests replay fixture resolutions).

Notes:

## M4 — The memory loop + more advisors (Tue–Thu Oct 27–29)
- [ ] Memory outbox (tick step 7): episode memories on settlement, lessons on verdict change (templates in docs/MEMORY.md), `rememberBulk`, statuses, 429 backoff
- [ ] Memory card before advice (recall episodes + lessons, cached 10 min, links to blob ids); advisor ordering by stats; warnings for `makes_you_worse` / `rarely_moves_you`
- [ ] Whale advisor from Tatum positions (top holders per side), with its own advisor id
- [ ] Tipster takes: `/m/[id]` "publish a take" (sealed, kind `take`, free in M4), advisors `user:<id>`; takes appear in other users' advisor picker
- [ ] Crews: create, invite link, join; crew members' takes labelled `crew`
**Accept:** with `MEMWAL_MOCK=1` tests, settling episodes writes episode memories and a verdict change writes exactly one lesson; on the live app the memory card shows real recalled episodes.

Notes:

## M5 — Profiles, crews, verifier (Fri–Sun Oct 30–Nov 1)
- [ ] `/u/[handle]`: tipster record (`tipsterRecord`), unrevealed in red, receipts list; "helps followers" aggregate (n ≥ 8)
- [ ] `/crew/[id]`: who makes this crew better
- [ ] `/verify`: paste JSON or hash → server action runs `verifySeal` via Tatum gRPC → checks; "Try tampering" demo; `/api/receipts/[hash].json`
- [ ] Completeness: profile lists every seal (revealed / sealed / late / failed); duplicate seals flagged
- [ ] Mobile and dark-mode polish across all pages
**Accept:** tampering with any field in `/verify` fails `label_in_tx`; an unrevealed seal is visible on the profile.

Notes:

## M6 — Rebuild from Walrus + hardening (Mon–Tue Nov 2–3)
- [ ] `pnpm rebuild:ledger` per docs/MEMORY.md (listNamespaces → recall → recompute → compare to snapshot); prints a report
- [ ] Error states: Tatum down, relayer 429, Sui gRPC unavailable (`withSuiRetry`), seal `failed` UI with retry
- [ ] Basic rate limits on signup/lock; audit that unrevealed probabilities never leak (test)
- [ ] `pnpm report`: exports per-user stats + day-1/now snapshots + seal counts to `report/*.md|json` (feeds the blog post)
**Accept:** wiping the local DB and running `pnpm rebuild:ledger` restores the same seals and stats.

Notes:

## M7 — Agent payments on Sui (Wed–Thu Nov 4–5) — stretch, $500 prize
- [ ] Takes can have a USDC price; `GET /api/takes/[id]/unlock` charges via MPP (`@suimpp/mpp` + `mppx` 0.4.12), durable DigestStore, then confirms the digest via Tatum gRPC and records `purchases`
- [ ] `/agent`: enable, weekly budget, min interval; server-side agent (`polyfill: false`) auto-buys only when stats justify it; stores decision JSON; shows recalled lesson as the reason
- [ ] Manual buy fallback for users without the agent
**Accept:** a real mainnet USDC payment unlocks a take, the purchase shows the Tatum-confirmed digest, and the agent declines a take from an advisor with `not_enough_evidence`.

Notes:

## M8 — Ship (Fri Nov 6 – Mon Nov 9)
- [ ] Bug bash on the deployed app; copy pass against SPEC §6
- [ ] README final (setup, architecture diagram, how Tatum + Walrus are used, how it learned over time with real numbers)
- [ ] Optional: practice mode on resolved markets (labelled, never sealed or counted)
- [ ] Freeze: tag `v1.0.0` on Nov 9
**Accept:** docs/HACKATHON.md submission checklist fully ticked.

Notes:
