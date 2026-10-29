# Scoring

Implementation: `src/core/scoring.ts` (tested in `tests/core/scoring.test.ts`). Every number shown as a score comes from
these functions. LLMs never produce scores.

## Per forecast: Brier score

For a binary market, with p = probability the user gave to the asked outcome and y = 1 if that outcome happened, else 0:

```
brier = (p − y)²        0 = perfect, 1 = worst, 0.25 = always saying 50%
```

`p` comes from `probabilityBps / 10000`. `y = 1` when Tatum's `market.resolution.outcome` equals `markets.outcome` (usually "Yes").
Void/cancelled markets (no resolution, or upstream status says cancelled) → episode status `void`, never scored.

## Per episode: did the advice help?

```
delta = brier(blind) − brier(informed)       > 0 the advice improved this forecast, < 0 it made it worse
move  = (informed − blind) / 10000           how far the advice pulled you (signed)
```

Examples (pinned in tests):
- Blind 55% → read a confident pundit → informed 80%, and it did **not** happen: 0.3025 → 0.64, **delta −0.3375**.
- Blind 40% → read the market → informed 65%, and it **did** happen: 0.36 → 0.1225, **delta +0.2375**.

Only `complete` episodes (both seals `verified`, or `valid_with_notes`) on resolved markets are scored. Episodes whose informed
seal is `late` or `failed` are excluded and shown as excluded.

## Per user × advisor: summary and verdict

`summarize(episodes)` → `n`, mean delta, sample sd, standard error, **95% interval** (Student t, df = n − 1, table in code; 1.96 when df > 30),
and mean |move|.

`verdict(summary)`:
1. `n < 8` → `not_enough_evidence`
2. interval entirely above 0 → `helps_you`
3. interval entirely below 0 → `makes_you_worse`
4. mean |move| < 0.03 (3 points) → `rarely_moves_you`
5. otherwise → `no_clear_effect`

Always display n and the interval. Recompute stats for a user after each settlement and store them in `advisor_stats`.
Also store `fair_test_n`. The dashboard has a "fair tests only" toggle, because advisors you *choose* to read are a biased sample.

**"vs the market"** column: show the advisor's mean delta next to the Market advisor's mean delta for the same user.
Don't declare a winner unless the intervals don't overlap. The market is the honest benchmark: most people improve by
looking at the price, so a tipster only adds value if they beat that.

## Tipster record (public)

`tipsterRecord(takes)` over takes on **resolved** markets: n, unrevealed count, mean Brier. An unrevealed take counts as 1.0
(worst). Display next to the market's own Brier for the same markets when possible (the market price at the take's seal time,
from Tatum price history). Lower is better. Never show a tipster's win rate alone.

## Aggregates

- **Helps followers** (profile, crew): for an advisor, combine every user's paired episodes with that advisor and run the same
  `summarize` + `verdict`. Requires n ≥ 8 across all users.
- Note in the UI: several markets from one match are correlated, so the app curates one market per match.

## What we never claim
"Proven skill", "beats the market" without non-overlapping intervals, causal language ("X caused you to lose"). Use
"observed change when you read X".
