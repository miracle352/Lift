# Receipts

**Find out whose advice actually makes your forecasts better.**

Lock your call *before* you read a tip, lock it again *after*, and let the results decide who is worth listening to.
Every lock is sealed through **Walrus Memory** on Sui mainnet and verified through **Tatum**. Receipts learns, per person, which
advisors (the market, onchain whales, tipsters, friends, pundits) improve your forecasts, which make them worse, and which
never change your mind.

Built for the [Tatum × Walrus "Total Recall" hackathon](https://tatum.io/hackathon/total-recall), Markets & Sports Prediction track.

> Status: scaffold. Protocol core, integrations and schema are in place and tested; the app is being built milestone by
> milestone (docs/PLAN.md).

## How it works
1. **Blind lock.** Your probability, sealed before you see any advice or the market price.
2. **One piece of advice.** Picked at random in fair-test mode.
3. **Informed lock.** Sealed and chained to the blind lock.
4. **Settlement.** Tatum's Prediction API resolves the market; both locks get a Brier score; the difference is what that advice did for you.
5. **Memory.** Episodes and lessons go to Walrus Memory and change what Receipts shows you next: advisor order, warnings, and what your agent will pay for.

A seal is the SHA-256 of the full forecast (RFC 8785 canonical JSON, with a random salt), committed as a Walrus Memory
namespace. Verification reads the commit **transaction's inputs** from Sui (via Tatum's gRPC gateway), not the blob's current
attributes, which the owner can change. Details and honest limits: [docs/PROOF.md](docs/PROOF.md).

## Quick start (Windows PowerShell or any shell)
```powershell
# Node 22+ and pnpm 10 (corepack enable)
pnpm install
copy .env.example .env.local      # then fill it in (docs/HUMAN_CHECKLIST.md)
pnpm smoke:sui                     # Tatum Sui gRPC + our parser on a real mainnet write (works without a key)
pnpm smoke:tatum                   # Prediction API search (needs TATUM_API_KEY)
pnpm smoke:memwal -- --write       # Walrus Memory health + one mainnet memory; prints MEMWAL_AGENT_ID
pnpm db:migrate                    # creates local.db
pnpm dev                           # http://localhost:3000
pnpm check                         # lint + typecheck + tests (offline)
```

## Stack
Next.js 16 · React 19 · Tailwind 4 · Drizzle + libSQL/Turso · `@mysten/sui` gRPC over Tatum · `@mysten-incubation/memwal` ·
Tatum Prediction API · MPP on Sui (`@suimpp/mpp`) for agent payments. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Docs
| | |
|---|---|
| [docs/SPEC.md](docs/SPEC.md) | product, screens, copy rules |
| [docs/PLAN.md](docs/PLAN.md) | milestones and status |
| [docs/PROOF.md](docs/PROOF.md) | seal protocol and verification |
| [docs/SCORING.md](docs/SCORING.md) | Brier, intervals, verdicts |
| [docs/MEMORY.md](docs/MEMORY.md) | what goes into Walrus Memory and how it changes the product |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | components, worker, data model, deploy |
| [docs/CODEX_PROMPTS.md](docs/CODEX_PROMPTS.md) | build prompts, one per milestone |
| [docs/HUMAN_CHECKLIST.md](docs/HUMAN_CHECKLIST.md) | accounts, keys, deploy, data, submission |
| [docs/HACKATHON.md](docs/HACKATHON.md) | rules digest, judging map, demo script, blog outline |
| [docs/vendor/](docs/vendor) | offline API references (Tatum Prediction API, Walrus Memory, Sui/Tatum gRPC, payments) |

18+. Receipts does not take bets or give financial advice.
