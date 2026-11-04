# How Lift works

This is the reference for the arena (`src/arena`), the seal format (`src/core`) and the scoring. The README has the short version.

- [A round](#a-round)
- [Who plays](#who-plays)
- [How an agent learns](#how-an-agent-learns)
- [Seals](#seals)
- [Verifying a call](#verifying-a-call)
- [Memory](#memory)
- [Scoring](#scoring)
- [Payments](#payments)
- [Selling advice](#selling-advice)
- [People](#people)
- [Tatum budget](#tatum-budget)
- [API](#api)
- [Limits](#limits)

## A round

Polymarket opens an "Up or Down" market every 15 minutes for BTC, ETH, SOL, XRP, DOGE, BNB, HYPE and ZEC. Lift plays one of
those windows every hour (`ARENA_CADENCE_MIN=60`). Times are relative to a window that opens at T and closes at T+15.

| when | what happens | code |
|---|---|---|
| T+6 | One Tatum call returns the eight live markets and Polymarket's UP price. Coinbase candles and the CLOB book give the price features. | `fast-markets.ts`, `feeds.ts` |
| | Every advisor publishes a take per market. | `brain/models.ts`, `external.ts` |
| | Every agent makes a **blind** call from the features alone. It never sees a price or a take. | `lock.ts` |
| | Both phases are sealed on Walrus Memory: one Merkle root for the blind calls, one for the takes. | `sealer.ts` |
| | Each agent recalls its lessons from Walrus Memory, picks one take per market (or declines) and pays for the bundle in one MPP request. | `memory.ts`, `brain/learner.ts`, `pay/` |
| | It makes an **informed** call: `blind + trust × (take − blind)`. Sealed as the third root. | `lock.ts` |
| T+15 | The market closes. | |
| ≈T+25 | Tatum's resolved feed gives the outcome. Both calls get a Brier score. | `settle.ts` |
| | Pay-for-lift: each escrowed cent goes to the advisor if its take made that call better, otherwise back to the buyer. One Sui transaction per round. | `pay/payouts.ts` |
| | One episode memory per agent, plus a lesson whenever a verdict changes, written to Walrus Memory. | `memory.ts` |

The worker (`pnpm arena worker`) ticks every 20 seconds. Every step is idempotent and retried. A lock that would start more than
two minutes late is skipped, never back-filled, so the timing claims stay true. On matchdays the arena also plays Premier League,
LaLiga, Champions League and Bundesliga matches ("Will the home team win?").

## Who plays

No language model produces any number. Advisors, agents and scoring are plain, deterministic code.

**Advisors**, each selling a take for $0.01:

| id | name | logic | what we expected |
|---|---|---|---|
| `crowd` | The Crowd | Polymarket's UP price through Tatum | helps |
| `quant` | The Quant | random-walk model of the window's TWAP against the open | helps |
| `trend` | Trend Rider | extrapolates the last three minutes | mixed |
| `fader` | The Fader | 1 − The Quant | hurts |
| `book` | Book Reader | depth imbalance on the UP token's order book | weak |
| `hype` | Loud Tipster | 88% or 12%, at random, every time | hurts |
| `fence` | Fence Sitter | always 50% | rarely moves you |

Outside advisors join through the [marketplace](#selling-advice). Crowd Plus is one of them.

**Agents** (the buyers): Rookie (always 50% blind), Chartist (last three candles), Cautious Quant (the right model with 2.5×
too much volatility) and Gambler (overconfident on the move since the open).

**Goldfish** is Rookie's twin: the same blind call, the same advisors and the same markets, but it never reads or writes memory.
It buys at random every round. The gap between Rookie and Goldfish on the same markets is what memory is worth
(`/api/arena/memory-test`).

## How an agent learns

- **Trust** in each advisor: a least-squares fit of how far moving toward that advisor's takes would have improved the agent's
  own past calls, clipped to [0, 1] and shrunk toward 0.5 with a four-episode prior.
- **Verdict** for each advisor (`helps_you`, `makes_you_worse`, `rarely_moves_you`, `no_clear_effect`, `not_enough_evidence`),
  computed at a fixed reference trust of 0.5 so that writing an advisor off doesn't make it look harmless afterwards. A verdict
  needs at least 8 paired calls and a 95% interval that excludes zero ([Scoring](#scoring)).
- **Buying**: ε-greedy with ε = max(0.2, 1 − n/80). A fair test picks uniformly at random; otherwise the agent buys from the
  advisor with the best measured lift, or declines when nothing has helped. An advisor written off by a lesson recalled from
  Walrus Memory is skipped, and re-tested 5% of the time ("re-test: my lesson says makes_you_worse, checking it still holds").
  Every decision stores its reason and the blob ids of the lessons it relied on.

`pnpm arena:sim` runs the same code on synthetic markets, and `tests/arena/brain.test.ts` checks that it learns.

## Seals

A call is a `ForecastV1` object: the market (platform id, question, a hash of the resolution rules, close time), the
probability in basis points, the kind (`blind`, `informed` or `take`), what it was based on, and a random salt. Its hash is
sha256 over the RFC 8785 canonical JSON (`src/core/forecast.ts`).

Each phase of a round is one Walrus Memory write. Its namespace is `rcptb1:<roundTag>:<b|i|t>:<merkleRoot>` and its text is the
manifest of every leaf hash. The tree follows RFC 6962 (0x00 leaf and 0x01 node prefixes, sorted unique leaves, odd node
promoted). So a round costs three writes, however many agents play.

A person's call is sealed on its own: `rcpt1:<userTag>:<marketTag>:<kind>:<hash>` (`src/core/namespace.ts`).

A receipt is the revealed forecast plus its Merkle path plus the commit transaction digest (`/api/arena/receipts/:hash`).
Before the market closes only the hash is public.

## Verifying a call

`/verify` and `GET /api/arena/verify?hash=` re-check a call against Sui mainnet through Tatum's gRPC gateway
(`src/core/evidence.ts`, `src/core/batch.ts`).

| check | kind | passes when |
|---|---|---|
| `hash` | hard | the recomputed hash matches |
| `inclusion` | hard | the Merkle path leads to the sealed root (batch seals) |
| `tags` | hard | the namespace tags match the revealed forecast |
| `label_in_tx` | hard | the commit transaction's inputs set `memwal_namespace` to that namespace |
| `tx_success` | hard | the transaction succeeded |
| `account` | hard | the write went through Lift's Walrus Memory account |
| `owner` | hard | the blob went to Lift's account owner |
| `before_close` | timing | the transaction's checkpoint time is before the market closed |
| `after_blind` | note | for informed calls, the blind seal landed first |
| `untouched` | note | the blob's last transaction is still the commit |
| `alive` | note | the blob's storage hasn't expired |

Any hard failure means `invalid`; a failed `before_close` means `late`; a failed note means `valid_with_notes`; otherwise `valid`.
`?tamper=probabilityBps:2000` changes one number before checking, and the `hash` check fails.

The namespace is read from the commit transaction's inputs, not from the blob's current attributes, because an owner can edit
attributes later but can't edit a transaction.

## Memory

| namespace | written | read |
|---|---|---|
| `rcptb1:…` / `rcpt1:…` | three per round, one per human call | verifiers |
| `arena1:<agent>:episodes` | one per agent per settled round | `pnpm arena rebuild` |
| `arena1:<agent>:lessons` | whenever a verdict changes | **before every purchase** |
| `arena1:human:<id>:lessons` | the same, for people | the play page |

Each memory has a sentence for people and a tag for code, for example
`Lesson for Rookie: reading The Fader has made my forecasts worse — stop buying (n=8, …) [[advisor=fader verdict=makes_you_worse …]]`.
`pnpm arena rebuild` wipes nothing: it rebuilds every agent's trust and verdicts from Walrus Memory alone and compares them with
the database. `/memory` lists everything the arena has written.

## Scoring

All in `src/core/scoring.ts`, with pinned test vectors in `tests/core/scoring.test.ts`.

```
brier = (p − y)²                        0 is perfect, 0.25 is always saying 50%, 1 is worst
lift  = brier(blind) − brier(informed)  > 0 the advice made the call better
```

For one agent and one advisor, `summarize` gives n, the mean lift, its standard error and a 95% Student-t interval. Then:
fewer than 8 calls → `not_enough_evidence`; interval above zero → `helps_you`; below zero → `makes_you_worse`; mean move under
3 points → `rarely_moves_you`; otherwise `no_clear_effect`.

"Advice removed X% of the error" is `(Σ brier(blind) − Σ brier(informed)) / Σ brier(blind)` over a quarter of an agent's calls.
Void or cancelled markets are never scored.

## Payments

- MPP with `mppx` and `@suimpp/mpp`. The paid resource is `GET /api/arena/takes?round=…&picks=btc:quant,eth:crowd`; the price is
  the sum of the picks and the recipient is the clearinghouse, which holds it in escrow. Replays are refused (`arena_pay_digests`).
- One secret, `ARENA_WALLET_SEED`, derives the clearinghouse, agent and built-in advisor wallets.
- `PAY_NETWORK=testnet` (default, faucet SUI and Circle testnet USDC) or `mainnet`. On mainnet, `pnpm arena recycle` sweeps
  advisor earnings back to the clearinghouse and tops the agents up, so a few dollars keep the loop running.
- If a payment fails, the round still runs on a ledger escrow and says so.

## Selling advice

Anyone can sell advice to the agents. Register an HTTPS endpoint and a Sui payout address:

```bash
curl -X POST https://<arena>/api/arena/advisors -H 'content-type: application/json' -d '{
  "name": "Crowd Plus", "pitch": "Leans harder into whatever the market already thinks.",
  "endpointUrl": "https://you.example/takes", "payoutAddress": "0x…", "priceUsd": 0.01 }'
```

At lock, the arena POSTs one request per round, `{ protocol: "receipts-arena-advisor/1", roundId, closeTime, markets: [...] }`, and
expects `{ takes: [{ asset, probabilityBps, says? }] }` within 4 seconds. The takes are sealed with the built-ins', agents find the
advisor through fair tests, and the payout address is paid only for takes that made a buyer's call better. Five failed rounds in
a row mark it `failing`. Guards: HTTPS only, no private addresses, no redirects, a 20 KB response cap, prices from $0.001 to $0.05.
A complete advisor in 30 lines: `examples/advisor/server.mjs`.

## People

People play the same rounds on `/play`, between the lock and the last minutes before the close (blind calls until T+13, second calls until T+14). A blind call is sealed first; then
they read one take (a random advisor by default, so the test is fair) and call again. Reading a random take is free. They can
also pay for a take from their own Sui wallet over MPP, and the cent is refunded to that wallet if the take didn't help.
Every sealed call has a share page at `/c/<hash>`.

## Tatum budget

The free plan is 100k credits for the key's lifetime. At one round an hour the arena uses about 5–6k credits a day; a daily cap
(`TATUM_DAILY_CREDIT_CAP`) refuses anything beyond it, and every call is logged with its cost in `tatum_calls`.

## API

| route | what |
|---|---|
| `GET /api/arena/rounds` | rounds, markets, seal digests, purchase and payout counts (no probabilities before the close) |
| `GET /api/arena/leaderboard` | verdicts, trust and n for every agent and advisor, advisor earnings, recent lessons |
| `GET /api/arena/memory-test` | Rookie against Goldfish on the same markets, and the learning curve |
| `GET /api/arena/receipts/:hash` | Merkle proof and commit; the forecast after the close |
| `GET /api/arena/verify?hash=` | live re-check against Sui |
| `GET /api/arena/memories` | everything written to Walrus Memory |
| `GET /api/arena/feed` | a live stream (SSE) of everything the arena does |
| `GET /api/arena/takes` | the MPP-paid advice |
| `GET/POST /api/arena/advisors` | the marketplace |
| `GET /api/arena/stats` | totals |

## Limits

- Agent payments run on Sui testnet USDC; seals and memory are on mainnet.
- A seal proves when a call was made and that it hasn't changed since. It doesn't prove the caller didn't look somewhere else.
- Sui full nodes prune old transactions. The evidence (digest, checkpoint, time) is stored at seal time so a call can be
  re-checked later against any full-history source.
- The managed Walrus Memory relayer sees memory text while it encrypts and indexes it. Calls are public after the close anyway.
- One server runs the arena and holds the database. Walrus Memory is the durable copy of what the agents learned.
