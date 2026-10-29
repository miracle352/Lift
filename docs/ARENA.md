# Receipts Arena — advice that has to earn its fee

> Agents and people make sealed calls on Polymarket's 15-minute crypto markets, buy one piece of advice per
> market over MPP (USDC on Sui), and the advisor only gets paid if the advice actually made the buyer's
> forecast better. Every call is sealed on Walrus Memory (Sui mainnet) before the market closes and verified
> through Tatum. Agents remember, in Walrus Memory, whose advice helps them — and stop paying the rest.

This document is the source of truth for the arena backend (`src/arena`). The original single-user flow
(`docs/SPEC.md`) uses the same seal protocol and scoring.

## Why fast markets
A verdict needs ≥ 8 paired episodes per (buyer, advisor). Football gives a few per weekend. Polymarket opens an
"Up or Down" market every 15 minutes for BTC, ETH, SOL, XRP, DOGE, BNB, HYPE and ZEC (Chainlink TWAP over the
window vs its start). One round = 8 markets × 4 agents = 32 episodes; at one round per hour that is ~770
episodes a day, so verdicts appear within hours and change visibly over days.

## Round lifecycle (`src/arena/lock.ts`, `settle.ts`, `worker.ts`)
Times relative to a window [T, T+15 min]. Default cadence: one window per hour (`ARENA_CADENCE_MIN=60`).

| when | what | where |
|---|---|---|
| T+6 min | **Tatum** `GET /v4/data/prediction/events?platform=polymarket&tag=15M&status=active&sort=endingSoon&includeMarkets=true` → the 8 live markets + Polymarket's UP price (one call, 100 credits) | `fast-markets.ts` |
| | Coinbase 1-minute candles + Polymarket CLOB book (free) → features per market | `feeds.ts`, `brain/features.ts` |
| | 7 advisors publish a take per market | `brain/models.ts` |
| | 4 agents make a **blind** call per market (features only, never prices or takes) | |
| | each agent **recalls its lessons from Walrus Memory** and decides whom to buy from (or declines) | `memory.ts`, `brain/learner.ts` |
| | **seal #1 blind** and **seal #2 takes** → Walrus Memory (Merkle roots) | `sealer.ts` |
| | each agent pays for its picks in **one MPP request** (402 → USDC on Sui → retry) and receives exactly the sealed takes | `pay/` |
| | informed call = blind + trust × (take − blind); **seal #3 informed** | |
| T+15 | market closes | |
| ≈T+25 | **Tatum** resolved feed (one call covers ~2.5 h of windows) → outcomes → episodes, Brier deltas | `settle.ts` |
| | **pay-for-lift**: escrow released to the advisor if the take improved that agent's Brier score, else refunded — one PTB per round from the clearinghouse | `pay/payouts.ts` |
| | episode memories (1 per agent per round) and lessons (when a verdict changes) → Walrus Memory | `memory.ts` |

The worker (`pnpm arena worker`) ticks every 20 s; every step is idempotent and retried. A lock that is more than
2 minutes late is skipped (never back-filled), so timing claims stay honest.

## The cast (all plain code — no LLM produces any number)
**Advisors** (each sells a take for $0.01):

| id | name | logic | expected |
|---|---|---|---|
| crowd | The Crowd | Polymarket's UP price via Tatum | helps |
| quant | The Quant | random-walk model of the window TWAP vs the open | helps |
| trend | Trend Rider | extrapolates the last 3 minutes | mixed |
| fader | The Fader | 1 − Quant | hurts |
| book | Book Reader | CLOB depth imbalance on the UP token | weak |
| hype | Loud Tipster | 88% or 12%, at random, every time | hurts |
| fence | Fence Sitter | always 50% | rarely moves you |

**Forecaster agents** (buyers): Rookie (always 50% blind), Chartist (last 3 candles), Cautious Quant (right model,
2.5× too much volatility), Gambler (overconfident on the move since the open).

## Learning (`brain/learner.ts`)
- **Trust** per advisor: least-squares fit of how far moving toward that advisor's takes would have improved the
  agent's own past calls, clipped to [0, 1], shrunk toward 0.5 with a 4-episode prior. Informed = blind + trust·(take − blind).
- **Verdict** per advisor (`helps_you`, `makes_you_worse`, `rarely_moves_you`, `no_clear_effect`, `not_enough_evidence`)
  from `src/core/scoring.ts`, computed at a fixed reference trust of 0.5 so writing an advisor off does not make it
  look harmless afterwards. Needs n ≥ 8 and a 95% t-interval excluding 0.
- **Buying**: ε-greedy with ε = max(0.2, 1 − n/80) fair tests (uniform random), otherwise the advisor with the best
  measured lift; declines when nothing has helped. Advisors written off by a **lesson recalled from Walrus Memory**
  are skipped (re-tested 5% of the time). Every decision stores its reason and the lesson blob ids it relied on.
- `pnpm arena:sim` runs the same brain on synthetic markets; `tests/arena/brain.test.ts` asserts it learns.

## Seals (`src/core/merkle.ts`, `src/core/batch.ts`, docs/PROOF.md)
Each phase of a round is one Walrus Memory write whose namespace is `rcptb1:<roundTag>:<b|i|t>:<merkleRoot>`;
the memory text is the manifest (all leaf hashes). Leaves are `forecastHash(ForecastV1)` (JCS + sha256, same as
single seals); the tree is RFC 6962-style (0x00 leaf / 0x01 node prefixes, sorted unique leaves, odd node promoted).
A receipt = revealed forecast + Merkle path + commit digest. `verifyBatchSeal` checks: hash, inclusion, tags,
label_in_tx, tx_success, account, owner, before_close, after_blind (informed), untouched, alive.
3 writes per round regardless of how many agents play, so the shared relayer's limits are never close.

## Memory (`src/arena/memory.ts`, `rebuild.ts`)
| namespace | written | read |
|---|---|---|
| `rcptb1:…` | 3 per round (seals) | verifiers |
| `arena1:<agent>:episodes` | 1 per agent per settled round (human text + `[[ep1 …]]` machine tag) | `pnpm arena rebuild` (portable memory) |
| `arena1:<agent>:lessons` | when a verdict changes (`[[advisor=… verdict=… n=… trust=…]]`) | **before every purchase** (`recall`, sort recent) |

`pnpm arena rebuild` reconstructs every agent's trust and verdicts from Walrus Memory alone and checks them against the DB.

## Open advisor marketplace (`src/arena/external.ts`, `registry.ts`)
Anyone can sell advice to the agents. Register an HTTPS endpoint and a Sui payout address:
```bash
curl -X POST https://<arena>/api/arena/advisors -H 'content-type: application/json' -d '{
  "name": "Crowd Plus", "pitch": "Leans harder into whatever the market already thinks.",
  "endpointUrl": "https://you.example/takes", "payoutAddress": "0x…", "priceUsd": 0.01 }'
```
Protocol `receipts-arena-advisor/1`: at lock the arena POSTs ONE request per round
`{ protocol, roundId, closeTime, markets: [{ asset, conditionId, question, windowStart, closeTime, marketUpBps, features }] }`
and expects within 4 s `{ takes: [{ asset, probabilityBps: 1..9999, says? }] }`. The endpoint is probed once at registration.
Its takes are sealed in the round's take batch like the built-ins', agents discover it through fair tests, and the
clearinghouse pays its payout address only for takes that improved a buyer's forecast. 5 failed rounds in a row → `failing`.
Guards: https only, no private/loopback addresses (`ARENA_ALLOW_LOCAL_ADVISORS=1` for local demos), no redirects,
20 KB response cap, price $0.001–$0.05, max 25 active advisors, a name is bound to its first payout address.
A complete advisor in 30 lines: `examples/advisor/server.mjs`.

## Humans (`src/arena/humans.ts`)
People play the same rounds as the agents, between lock (T+6) and the cutoffs (blind T+13, informed T+14):
`POST /api/arena/players {handle}` → bearer token · `GET /api/arena/play` (markets, no prices) ·
`POST /api/arena/play/blind {roundId, asset, probabilityBps}` · `POST /api/arena/play/reveal {roundId, asset, advisorId?}`
(ONE take per market; random advisor = fair test; only after the blind call is stored on Walrus) ·
`POST /api/arena/play/informed {…}` · `GET /api/arena/me` (who helps you).
Each human call is its own rcpt1 single seal (docs/PROOF.md), verified with `verifySeal`; episodes, verdicts and lessons
(`arena1:human:<id>:lessons`) are shared code with the agents. Humans read takes for free; agents pay over MPP.

## Payments (`src/arena/pay`)
- MPP (`mppx` 0.4.12 + `@suimpp/mpp` 0.9.0). Paid resource: `GET /api/arena/takes?round=15m:<close ISO>&picks=btc:quant,eth:crowd`.
  Price = sum of the picks. Recipient = the **clearinghouse** (escrow). Replay protection: `arena_pay_digests`.
- Wallets: one secret `ARENA_WALLET_SEED` derives clearinghouse, agent and advisor keypairs (`sha256(seed‖":"‖name)`).
- `PAY_NETWORK=testnet` (default; free faucet SUI + Circle testnet USDC) or `mainnet` (real USDC, for the demo).
- If a payment fails the round still runs with a ledger escrow (`pay_network = 'ledger'`), and says so.
- `pnpm arena wallets` (addresses + balances), `pnpm arena fund [suiEach] [usdcEach]` (clearinghouse → agents).
- Anyone can buy takes over MPP from the web app's `/api/arena/takes` (it only needs `ARENA_CLEARINGHOUSE_ADDRESS`).

## Tatum budget
Free plan = 100k credits for the key's lifetime. Per day at the default cadence: 24 lock calls + ~24–36 resolved-feed
calls ≈ 5–6k credits. `TATUM_DAILY_CREDIT_CAP` (default 7000) refuses calls beyond it; every call is logged in
`tatum_calls` with its documented cost. Sui reads (verification, evidence) go through Tatum's gRPC gateway.

## Public API (`src/app/api/arena`)
| route | what |
|---|---|
| `GET /api/arena/rounds?limit=` | rounds, markets, seals (digests), purchase/payout counts — never probabilities before close |
| `GET /api/arena/leaderboard` | agent × advisor verdicts, trust, n; advisor earnings (released/refunded); recent lessons |
| `GET /api/arena/receipts/:hash` | Merkle proof + commit; forecast JSON after close |
| `GET /api/arena/verify?hash=&tamper=probabilityBps:9000` | live re-check against Sui via Tatum (tamper demo fails) |
| `GET /api/arena/feed` | SSE stream of everything the arena does |
| `GET /api/arena/takes` | the MPP-paid advice endpoint |
| `GET/POST /api/arena/advisors` | the advisor marketplace: list (with earnings) / register |
| `GET /api/arena/stats` | totals for the blog post |

## Running it
```bash
pnpm arena lock-now   # lock the current window immediately (manual test)
pnpm arena tick       # one worker step
pnpm arena worker     # forever (deploy this on the always-on server)
pnpm arena status     # rounds, seals, credits used today
pnpm arena rebuild    # rebuild agents from Walrus Memory and compare
```
