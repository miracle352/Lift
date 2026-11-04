# Lift — advice that has to earn its fee

**Live:** https://34.254.189.94.sslip.io (arena server) · Built for the [Tatum × Walrus "Total Recall" hackathon](https://tatum.io/hackathon/total-recall)
— Markets & Sports Prediction track, Best Walrus Memory, Agent Payments.

Agents and people call live Polymarket markets, buy **one** piece of advice, and call again. The advisor is paid
**only if the advice made the buyer's forecast better** (pay-for-lift); otherwise the buyer gets the money back.
Every call is sealed on **Walrus Memory** (Sui mainnet) before the market closes, every payment is an **MPP**
payment in USDC on Sui, and every price, market and result comes through **Tatum**. The agents write what they
learn about each advisor to their own Walrus Memory, recall it before they buy, and stop paying advisors who don't help.

No LLM produces any number in the arena. Advisors, agents and scoring are plain code, so every result is reproducible.

## Numbers so far (live, from `/api/arena/stats`, Nov 4 2026)
| | |
|---|---|
| Forecasts sealed on Walrus (Merkle batches) | **14,156** |
| Batch seals verified on Sui | **380** |
| Settled episodes (blind call → advice → informed call → result) | **3,443** |
| Lessons written to Walrus Memory | **82** |
| Rounds settled | **149** |

`pnpm arena report` prints the full ledger: who got paid, every lesson with its Walrus blob id, and how each agent's buying changed.

## How it learned
How much of each agent's forecasting error the advice it bought removed, first quarter of its calls vs last quarter:

| agent | first quarter | last quarter |
|---|---|---|
| Rookie | 8.0% | **21.5%** |
| Chartist | 1.5% | **19.1%** |
| Cautious Quant | advice made it 8.7% worse | **2.6% better** |
| Gambler | 16.3% | **17.8%** |

**The memory test.** Since Nov 4 a fifth agent, the **Goldfish**, plays every round: Rookie's identical twin (same blind
call, same advisors, same markets) that never reads or writes memory. The gap between Rookie and the Goldfish on the same
markets is what Walrus Memory is worth; the site shows it live (`/api/arena/memory-test`).

Each agent starts out buying from all seven advisors more or less evenly. After every settled round it updates a
per-advisor verdict from its own paired Brier scores (`helps_you`, `makes_you_worse`, `rarely_moves_you`,
`no_clear_effect`, with a 95% interval). When a verdict changes, it writes a **lesson** to Walrus Memory, and it
recalls those lessons before the next purchase. From the first third of each agent's purchases to the last third:

- **Rookie:** The Crowd 35% → 0%; The Quant 11% → **54%**; outside advisor Crowd Plus 5% → 32%. Learned "The Fader makes me worse" twice.
- **Chartist:** The Crowd 27% → **68%**, The Quant 22% → 27%; the Loud Tipster dropped from 11% to 0%.
- **Gambler:** bought the Loud Tipster 24% of the time at first, then never again; Book Reader 5% → **73%** after the lesson "reading Book Reader has made my forecasts better".
- **Cautious Quant:** moved toward The Quant and Book Reader (6% → 39%).

Wipe the database and `pnpm arena rebuild` restores every agent's trust from Walrus Memory alone.

## One round
| step | what happens | where |
|---|---|---|
| 1. Blind call | 4 agents (and any human players) give P(UP) from price features only, no prices or tips. Sealed. | `src/arena/lock.ts` |
| 2. Takes | 7 code advisors + external advisors publish a take per market. Sealed **before** anyone can read them. | `src/arena/brain/models.ts` |
| 3. Buy | Each agent recalls its lessons from Walrus Memory, picks takes (or declines) and pays in **one MPP request** (HTTP 402 → USDC on Sui → retry). The money sits in a clearinghouse escrow. | `src/arena/pay/` |
| 4. Informed call | blind + trust × (take − blind). Sealed and linked to the blind call and the exact take read. | `src/arena/lock.ts` |
| 5. Settle | Tatum reports the result; both calls get a Brier score. | `src/arena/settle.ts` |
| 6. Pay-for-lift | Escrow is released to the advisor if the take improved the buyer's Brier score, refunded otherwise: one Sui transaction per round. | `src/arena/pay/payouts.ts` |
| 7. Remember | One episode memory per agent per round, plus a lesson whenever a verdict changes, written to Walrus Memory. | `src/arena/memory.ts` |

Markets: every hour, the eight Polymarket 15-minute crypto Up/Down markets (BTC, ETH, SOL, XRP, DOGE, BNB, HYPE, ZEC).
On matchdays it adds Premier League, LaLiga, Champions League and Bundesliga matches ("Will the home team win?"),
with a Whale advisor that reads the biggest open Polymarket positions through Tatum.

## How each sponsor tech is used
**Walrus Memory (mainnet).** Each phase of a round (blind, takes, informed) is a Merkle batch (RFC 6962 style); the
root is committed as a Walrus Memory namespace `rcptb1:<round>:<phase>:<root>`. Human single calls use `rcpt1:`.
Agents keep `arena1:<agent>:episodes` and `arena1:<agent>:lessons` and recall them before buying.
`/verify` checks a call end to end: forecast hash, Merkle inclusion, namespace tags, the commit transaction's
inputs on Sui, that it succeeded, the account and owner, that it landed before the market closed (and, for informed
calls, after the blind seal), and that the blob is still alive. Details and honest limits: [docs/PROOF.md](docs/PROOF.md).

**Tatum.** Prediction API for live 15-minute markets (`tag=15M`, `sort=endingSoon`), league events, per-market
positions (the Whale advisor) and the resolved feed for settlement. Sui reads (checkpoints, transactions for
verification) go through Tatum's native Sui gRPC gateway. A daily credit cap keeps it inside the free plan.

**MPP on Sui (`mppx` + `@suimpp/mpp`).** Advisors' takes are sold behind HTTP 402. Each agent pays once per round
for its whole bundle; the arena holds the money and settles pay-for-lift in one programmable transaction.
Payments run on Sui **testnet** USDC for now.

## Sell your own advice
Any web address that answers a POST with a probability can be an advisor. Your takes are sealed before buyers read
them, and your Sui address is paid every time a take made a buyer's call better. See `/advisors` on the site and
`scripts/register-advisor.ts`; `examples/` has a working advisor.

## Run it locally (Windows PowerShell or any shell)
```powershell
# Node 22+ and pnpm 10 (run: corepack enable)
pnpm install
copy .env.example .env.local      # fill it in; MEMWAL_MOCK=1 runs without Walrus
pnpm db:migrate
pnpm dev                          # site on http://localhost:3000
pnpm arena worker                 # the arena loop (run only ONE worker at a time)
```

Other commands:
| command | does |
|---|---|
| `pnpm arena report` | the ledger: payouts, lessons, how buying changed |
| `pnpm arena rebuild` | restore agent memory from Walrus Memory |
| `pnpm arena wallets` / `faucet` / `fund` | show arena wallets, get testnet SUI, move USDC to agents |
| `pnpm arena lock-now` | play one round immediately |
| `pnpm arena:sim` | offline simulation with fake markets |
| `pnpm check` | typecheck + lint + 84 tests |

## Deploy
- **Arena server** (worker + API + example advisor): any small Linux VM. `deploy/ec2-setup.sh` sets up Node, pnpm,
  systemd services (`receipts-worker`, `receipts-web`, `receipts-advisor`) and Caddy for HTTPS.
  `deploy/deploy-code.sh` updates the code; `deploy/snapshot.sh` backs up the database.
- **Vercel (optional front end):** import the repo and set two environment variables to the arena server's address:
  `ARENA_API_ORIGIN` (all `/api/*` calls are proxied there) and `NEXT_PUBLIC_ARENA_API_ORIGIN` (the live feed
  connects straight to it). No secrets go on Vercel.

Secrets (`MEMWAL_PRIVATE_KEY`, `TATUM_API_KEY`, `ARENA_WALLET_SEED`, `AGENT_WALLET_PRIVATE_KEY`) live only in the
server's `.env.local`, never in the repo or the browser.

## Limits, honestly
- Agent payments are on Sui **testnet** USDC; seals and memory are on **mainnet**.
- The seal proves *when* a call was made and that it wasn't changed, not that the player didn't peek somewhere else.
- Verdicts need at least 8 paired episodes per agent and advisor, so early verdicts are mostly "no clear effect yet".
- One arena server holds the database; Walrus Memory is the durable copy of what the agents learned.

## Stack and credits
Next.js 16, Drizzle + libSQL, vitest, `@mysten/sui`, MemWal SDK, `mppx`, `@suimpp/mpp`.
Hero video: "Printing a receipt" from [Mixkit](https://mixkit.co) (Mixkit free license). Fonts: Big Shoulders and
IBM Plex Mono (SIL Open Font License, see `src/app/fonts/`). Docs: [ARENA](docs/ARENA.md) · [PROOF](docs/PROOF.md) ·
[SCORING](docs/SCORING.md) · [ARCHITECTURE](docs/ARCHITECTURE.md).

18+. Lift takes no bets and gives no financial advice.
