# Codex prompts (paste one per session, in order)

## How to run Codex on this repo
- **Local (recommended):** open the repo folder in the Codex app, the IDE extension, or a terminal running `codex`. Codex loads `AGENTS.md`
  automatically at the start of each session (restart the session after editing it). Let it run `pnpm` commands.
  Keep `.env.local` on your machine only.
- **Codex cloud:** connect the GitHub repo and create an environment with setup script
  `corepack enable && pnpm install --frozen-lockfile` and Node 22. Internet can stay **off** for the agent: all tests are offline.
  Do not put real secrets in cloud environments. Live checks (`pnpm smoke:*`, deploys) are yours to run locally.
- One milestone per session. Review the diff, run the app, then commit before starting the next prompt.
  If a session goes sideways, `git restore .` and re-run the prompt with a note about what went wrong.

---

## Prompt D: adopt the design pack (run this once, right after copying the pack in)
```
I copied a design pack over the repo: landing page at /, a living style guide at /design, self-hosted fonts, design tokens,
and app-screen components in src/components (ForecastFlow, ReceiptView, MatchCard, AdvisorTable, MemoryCard, AuthCard...).
Read docs/DESIGN.md and AGENTS.md. Then:
1) Run `git status` and `git diff`. If the pack overwrote work you did earlier (for example a matchday list in src/app/page.tsx,
   or changes to layout.tsx/globals.css), move that logic to the right place: matchday now lives at /matchday; keep the pack's
   layout.tsx, globals.css and landing page.
2) Add to package.json: "browserslist": ["chrome >= 111", "edge >= 111", "firefox >= 128", "safari >= 16.4", "ios_saf >= 16.4"].
3) Rebuild every screen you already made with the components from src/components (no one-off styling).
4) Update docs/PLAN.md: matchday route is /matchday; UI items in M1–M5 use the design components.
Finish with pnpm check and pnpm build passing.
```

## Prompt 0: orientation (once)
```
Read AGENTS.md, docs/SPEC.md, docs/PLAN.md, docs/ARCHITECTURE.md, docs/PROOF.md, docs/SCORING.md and docs/MEMORY.md.
Then run `pnpm install`, `pnpm check` and `pnpm build` and fix only environment-specific problems (do not change src/core behaviour).
Do not write features yet. Reply with: (1) a 10-line summary of the product and the seal protocol in your own words,
(2) anything in the docs that is contradictory or unclear, (3) the results of check and build.
Tick the Codex item in M0 in docs/PLAN.md.
```

## Prompt M1: accounts, Tatum client, curation
```
Implement milestone M1 from docs/PLAN.md.
Constraints: follow AGENTS.md golden rules. Put feature logic in src/server/{auth,tatum,markets}/ with `import 'server-only'`.
Tatum Prediction API shapes: docs/vendor/tatum-prediction-api.md (raw OpenAPI in docs/vendor/tatum-openapi/). Write zod schemas
for just the fields we use, hand-write fixtures that match the documented schemas under tests/fixtures/tatum/, and unit-test parsing,
retries (429/5xx) and caching. Polymarket-only filters (status, search, tag, category) need platform=polymarket.
Auth: handle + password with node:crypto scrypt and iron-session (SESSION_SECRET); read the cache-components auth guide in
node_modules/next/dist/docs/01-app/02-guides/authentication-with-cache-components.md first.
Admin curation at /admin/markets: search, add (one market per event id), league label, manual sync.
Matchday list at /matchday (the landing owns /) must never show market prices. Build /login, /signup and /matchday with AuthCard, Field, AppHeader, PageTitle and MatchCard from src/components/receipts (docs/DESIGN.md).
Finish with pnpm check + pnpm build passing, PLAN.md updated, and a list of anything I must do by hand.
```

## Prompt M2: the lock flow and live seals (deadline: deployed before Saturday morning UTC)
```
Implement milestone M2 from docs/PLAN.md. This is the most important milestone: real matches start Saturday.
Read docs/PROOF.md fully first. Use src/core (buildForecast, forecastHash, sealNamespaceFor, adviceContentHash, verifySeal)
and src/lib (getMemWal, getSuiClient, withSuiRetry, captureSealEvidence) as-is; do not modify src/core.
Render the 3-step flow at /m/[marketId] with the existing ForecastFlow component (src/components/receipts/forecast-flow.tsx), passing server actions for lockBlind, reveal, lockInformed and sealStatus; it already handles the Market advisor, pasted Pundit takes and
fair-test mode. On the server, store exactly what was shown and hash it.
Implement tick steps 1–3 with backoff and a `failed` state, the /api/cron/tick route (Bearer CRON_SECRET, maxDuration 60),
an after() hook on each lock, and a `pnpm tick` script. Render /r/[hash] with ReceiptView (it takes verification_json.checks directly).
Unit-test the state machine with MemWalMock, the fake Sui client pattern in tests/lib/seal-evidence.test.ts and an in-memory DB.
Then write step-by-step deploy instructions for Vercel + Turso + GitHub Actions in PLAN.md Notes (I will do the clicks).
```

## Prompt M3: settlement and "Who helps you"
```
Implement milestone M3 from docs/PLAN.md using src/core/scoring.ts exactly as documented in docs/SCORING.md.
Add tick steps 4–6 (market sync with credit budget, reveal after close, settlement incl. void markets),
advisor_stats recomputation, stat_snapshots, and the /me dashboard rendered with AdvisorTable (add the vs-the-market column,
fair-tests-only toggle and Day 1 / Now toggle around it). Replay settlement from fixtures in tests.
Show results on /r/[hash] after settlement. Copy must follow docs/SPEC.md §5 verdict language and §6 rules.
```

## Prompt M4: the memory loop
```
Implement milestone M4 from docs/PLAN.md. Read docs/MEMORY.md and docs/vendor/memwal-notes.md first.
Build the memory outbox (episode memories on settlement, lessons on verdict change, rememberBulk, 429 backoff), the memory card
before advice (recall from Walrus Memory with the documented parameters, cached 10 minutes, each item linking to its blob id),
advisor ordering and warnings driven by advisor_stats, the Whale advisor from Tatum market positions, tipster takes
(sealed with kind "take"), and crews (create, invite, join). Test the loop end-to-end with MemWalMock: settling N episodes
writes N episode memories, and a verdict change writes exactly one lesson.
```

## Prompt M5: profiles, crews, verifier
```
Implement milestone M5 from docs/PLAN.md. /u/[handle] with tipsterRecord (unrevealed takes in red and scored as 1.0),
/crew/[id] "who makes this crew better", /verify (paste JSON or hash → server action → verifySeal via Tatum gRPC, plus a
"Try tampering" demo that edits one field client-side and re-verifies), /api/receipts/[hash].json, completeness lists on profiles,
duplicate-seal flags. Then do a mobile (375px) and dark-mode pass across every page.
```

## Prompt M6: rebuild and hardening
```
Implement milestone M6 from docs/PLAN.md: `pnpm rebuild:ledger` exactly as described in docs/MEMORY.md (listNamespaces with
has_more pagination → recall per rcpt1 namespace → recompute hash → re-insert → re-capture evidence → re-settle → compare with
the latest snapshot), error states for Tatum/relayer/Sui outages, simple rate limits, a test proving unrevealed probabilities
never appear in any public response, and `pnpm report` that writes report/stats.json and report/summary.md for the blog post.
```

## Prompt M7: agent payments (stretch)
```
Implement milestone M7 from docs/PLAN.md. Read docs/vendor/payments-notes.md and the installed .d.ts files it lists before coding.
Keep mppx at 0.4.12. Server: MPP charge on GET /api/takes/[id]/unlock with a DB-backed DigestStore and MPP_SECRET_KEY;
after verification, confirm the payment digest through src/lib/sui.ts and record purchases. Agent: server-side Mppx client
with polyfill:false, our Tatum SuiGrpcClient and AGENT_WALLET_PRIVATE_KEY; buy only when agent_rules and advisor_stats allow it;
store and display the decision and the recalled lesson. Unit-test the decision rule and the DigestStore; the real payment is a
manual test I will run.
```

## Prompt M8: ship
```
Run a full bug bash for milestone M8: click through every route on desktop and 375px, fix bugs, align copy with docs/SPEC.md §6,
make sure the README explains setup, architecture, how Tatum and Walrus Memory are used and (from `pnpm report`) how the app
learned over time. Do not add features. List anything still broken that I should know before recording the demo.
```

## Utility prompts
- **Fix CI:** `pnpm check is failing. Find the root cause and fix it without weakening tests or changing src/core behaviour. Explain the cause.`
- **Review:** `Review the uncommitted diff against AGENTS.md and the current milestone's acceptance criteria. List problems by severity; fix only clear bugs.`
- **Blog draft:** `Using report/summary.md and docs/SPEC.md, draft the hackathon blog post per docs/HACKATHON.md §Blog outline. Use only real numbers from the report.`
