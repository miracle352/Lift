# Receipts — product spec

> **Receipts remembers what you believed, whose advice changed your mind, and whether that change helped.**

## 1. The problem

People pay for and follow tipsters, pundits, group-chat "experts" and onchain whales. Everyone remembers the calls that
landed and forgets the ones that didn't, including the person giving the advice. Public win rates don't answer the
question that matters to *you*: **does reading this person make my own forecasts better or worse?** Some advisors
are right but tell you nothing you didn't know. Others are persuasive and wrong, and you overreact to them.

## 2. The product in one loop

For one binary market (example: "Will Arsenal beat Tottenham?"):

1. **Blind lock.** You set your probability *before* seeing any advice or the market price. Sealed.
2. **One piece of advice.** Receipts shows exactly one advisor's view (the market price, a whale's position, a tipster's
   take, a crew member's take, or a pundit take you paste in). In **fair-test** mode the app picks the advisor at random.
3. **Informed lock.** You set your probability again (or tap "Unchanged"). Sealed, and cryptographically chained to step 1.
4. **Settlement.** When the market resolves (via Tatum's Prediction API), both locks are scored with the Brier score.
   The difference is how much that advice helped or hurt you on this question.
5. **Memory.** The episode is written to Walrus Memory. Over time Receipts learns, per advisor, whether reading them
   improves your forecasts. It changes which advisors it puts first, what it warns you about before you read them, and
   (M7) which paid takes your agent is willing to buy for you.

Every lock is a **seal**: a hash of the full forecast committed through Walrus Memory on Sui mainnet before the market
closes. After close it is revealed, and anyone can re-check it against Sui through Tatum's RPC (docs/PROOF.md).

## 3. Who it is for (pitch: tipster buyer protection + a social layer)

- **Followers / buyers:** people who read tipsters, pundits, Polymarket whales or friends before forecasting. Key question: "who is worth my attention or money?"
- **Tipsters:** people who want a record nobody can quietly edit. Their takes are sealed before kickoff, unrevealed takes count as losses, and followers can see who actually helps them.
- **Crews:** friend groups. "Who in the group chat actually makes the rest of us better?"

Launch scope: **football (soccer)**, binary Polymarket markets ("Will X win?"), curated by admins: one market per match.
The design is sport- and market-agnostic. Keep copy global.

## 4. Scope

### MVP (must ship — milestones M1–M6)
- Accounts: handle + password; optional crew membership.
- Admin market curation from Tatum's Prediction API (search, add, sync).
- Matchday list → blind lock → advice → informed lock, with seals on Walrus Memory mainnet.
- Advisors: **Market** (Polymarket price via Tatum), **Pundit** (pasted take with handle + optional URL),
  **Tipster/Crew** (takes published in-app, themselves sealed), **Whale** (top holders' positions via Tatum, M4).
- Fair-test mode (random advisor) on by default.
- Background worker: seal confirmation and evidence capture, market sync, settlement, scoring, memory writes.
- Receipt pages with live verification checks and Suiscan links; public reveal after close.
- "Who helps you" dashboard with sample sizes, 95% intervals and plain-language verdicts; day-1 vs now.
- Memory loop: episode + lesson memories in Walrus Memory; recall cards before advice; advisor ordering driven by stats.
- Public verifier page (paste revealed JSON or open a receipt) including a "try tampering" demo.
- Rebuild-from-Walrus script (restore demo).

### Stretch (M7–M8, in this order)
1. **Agent payments** (targets the $500 "Best Use of Agent Payments" prize): paid takes over MPP with USDC settled on Sui;
   a per-user agent rule "only buy takes from advisors whose interval for me is above zero", with a weekly budget.
2. Practice mode on resolved markets (clearly labelled, never counted, never sealed).
3. Polymarket vs Kalshi disagreement flag on the matchday card.

### Non-goals
No placing bets, no odds boosts, no custody of user funds (the M7 demo agent wallet is funded by the developer and labelled as such),
no LLM-generated scores, no bookmaker odds, no native mobile app.

## 5. Screens

All screens must work at 375px wide. The design is light-first (paper + ink + gold, one explicit dark section); see
**docs/DESIGN.md** and the live style guide at **`/design`**: build screens from those components. Numbers always show their sample size.

| Route | Purpose | Key elements |
|---|---|---|
| `/signup`, `/login` | accounts | handle (3–20, `[a-z0-9_]`), display name, password (≥ 10 chars) |
| `/` | **Landing** | already built (src/app/page.tsx, docs/DESIGN.md). Static marketing page; swap `EXAMPLE_SEALS` for real verified seals later |
| `/matchday` | **Matchday** | upcoming curated markets grouped by day; countdown to lock cutoff (close − 10 min); your state per market (not started / blind locked / complete / settled ± delta). **Never show the market price on this list.** |
| `/m/[marketId]` | **Forecast flow** | step 1 blind slider 1–99% + "Lock my call" · step 2 advisor picker (ordered by your stats, verdict badges, fair-test toggle, memory card) then reveal advice · step 3 informed slider prefilled with blind + "Unchanged" + "Lock". Sealing status chips per seal (queued → on Sui → verified). Lock disabled after cutoff. |
| `/r/[hash]` | **Receipt** | seal kind, market, chain time, checks list (✓/✗/notes), Suiscan link `https://suiscan.xyz/mainnet/tx/<digest>`, forecast JSON once revealed (before close: "Sealed. Reveals after the market closes."), result and scores after settlement |
| `/me` | **Who helps you** | table per advisor: settled episodes n (fair-test n), average change (with 95% interval bar), typical move, verdict; "vs the market" column; lessons (from Walrus Memory) with timestamps; toggle "Day 1 / Now" from snapshots |
| `/u/[handle]` | public profile | tipster record: takes n, mean Brier, unrevealed count (shown in red), recent receipts; "helps followers" aggregate once n ≥ 8 |
| `/crew/[id]` | crew | members, invite link, "who makes this crew better" (per crew advisor: aggregate change across members) |
| `/verify` | public verifier | paste revealed JSON or a hash → server runs `verifySeal` via Tatum gRPC → checks; "Try tampering" edits one field client-side and re-verifies (fails) |
| `/admin/markets` | curation | Tatum search → candidate markets (question, close time, prices) → add with league label; one market per event; manual sync |
| `/agent` (M7) | payments | enable agent, weekly budget, min interval, purchase log with the reasons |

### Advisor reveal content
- **Market:** Polymarket mid price (fallback last trade) from `GET /v4/data/prediction/markets/{id}/price`, shown as "The market says 62%".
- **Whale:** top 3 holders per side from `GET /v4/data/prediction/markets/{id}/positions?sortBy=TOTAL_PNL&status=OPEN&limit=3`, shown as side, size and (if available) name. Advisor id = the wallet of the top holder shown first.
- **Tipster / crew take:** the take's text + its probability, with its own receipt link.
- **Pundit:** what the user pastes (text ≤ 1000 chars, handle, optional URL). Advisor id = `pundit:@handle` (lowercased).

The exact JSON shown is stored (`episodes.advice_json`) and its hash goes into the informed seal (`advice.contentHash`).

### Verdict language (docs/SCORING.md)
| verdict | badge | copy |
|---|---|---|
| `not_enough_evidence` | grey | "Not enough evidence yet (n of 8)" |
| `helps_you` | green | "Reading them has improved your forecasts" |
| `makes_you_worse` | red | "Reading them has made your forecasts worse" |
| `rarely_moves_you` | amber | "Rarely changes your mind: probably redundant for you" |
| `no_clear_effect` | grey | "No clear effect yet" |

## 6. Copy and integrity rules
- Say "tamper-evident", "sealed", "observed change". Never "tamper-proof", "proven", "guaranteed", "sure thing".
- Show uncertainty (n, intervals). Show "not enough evidence" instead of a confident claim.
- Information tool, not a betting product. Footer: "18+. Receipts does not take bets or give financial advice."
- Global audience: no country-specific references, currency in USDC only for M7.
- Before close, nobody (including other users) can see anyone's probability. Only the hash is public.

## 7. Success criteria for the hackathon demo
1. A forecast is sealed live and its receipt verifies against Sui mainnet through Tatum in under ~2 minutes.
2. Editing a revealed forecast makes verification fail; an unrevealed seal stays visible.
3. Real settled episodes from at least two weekends of matches across several users.
4. The advisor order and the memory card visibly differ between day 1 and the demo day, with the Walrus Memory entries that caused it.
5. (M7) The agent buys one take and declines another, explaining why from your own stats.
