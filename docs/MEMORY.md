# Walrus Memory: what we store, when, and how it changes the product

The hackathon's Walrus prize rewards the "deepest learning loop: memories that visibly change the product". This doc defines
that loop. SDK reference: `docs/vendor/memwal-SKILL.md`. Notes and limits: `docs/vendor/memwal-notes.md`.

## Principles
1. **Walrus Memory is the durable record.** Seals (every forecast) and learning memories live there. The SQLite DB is a cache and a queue.
2. **Numbers are deterministic** (docs/SCORING.md). Memory supplies *context*: similar past situations and the lessons
   they produced, retrieved by meaning across leagues, teams and advisors.
3. **Every visible effect of memory links to the memory that caused it** (blob id, Walrus Memory namespace, time).

## Namespaces (exact-match strings, ≤ 255 bytes, flat)

| namespace | written when | content |
|---|---|---|
| `rcpt1:<userTag>:<marketTag>:<b\|i\|t>:<hash>` | each lock / take | canonical JSON of the sealed forecast (docs/PROOF.md) |
| `ep1:<userTag>` | each settled episode | episode summary (template below) |
| `lesson1:<userTag>` | when an advisor's verdict for this user changes | lesson (template below) |
| `smoke1` | `pnpm smoke:memwal -- --write` | test memory |

Helpers: `memoryNamespace.episodes(userId)`, `memoryNamespace.lessons(userId)`, `sealNamespaceFor(forecast)`.

## Templates (keep them factual; they are embedded for semantic recall)

**Episode** (one per settled episode, written in bulk by the tick worker):
```
Episode {YYYY-MM-DD}: {league} — "{question}". Blind call {blind}%. Advice from {advisorLabel} ({advisorKind}{", fair test" if fairTest}): "{adviceSummary, ≤ 200 chars}". After advice {informed}% ({move:+d} pts). Result: {outcome name} {happened|did not happen}. Brier {blindBrier:.3f} → {informedBrier:.3f}; the advice {helped|hurt|made no difference} ({delta:+.3f}).
```

**Lesson** (only on verdict change for (user, advisor); idempotency key `lesson:<userId>:<advisorId>:<verdict>:<n>`):
```
Lesson {YYYY-MM-DD} (n={n}, fair tests {fairTestN}): when you read {advisorLabel} your forecasts {verdict copy from SPEC §5}. Average change {meanDelta:+.3f} (95% interval {ciLow:+.3f} to {ciHigh:+.3f}); they typically move you {meanAbsMove*100:.0f} points.
```

## Recall: where memory changes the product

1. **Memory card before advice** (`/m/[marketId]` step 2, shown *before* the advice is revealed):
   - `recall({ query: "{advisorLabel} {league} {question}", namespace: ep1:<userTag>, topK: 5, maxDistance: 0.6, scoringWeights: { semantic: 1, recency: 0.2, recencyHalfLifeDays: 14 } })`
   - `recall({ query: "{advisorLabel}", namespace: lesson1:<userTag>, topK: 2, maxDistance: 0.7 })`
   - Show up to 3 episodes + the latest lesson, each with a "from Walrus Memory" link (blob id). Calibrate `maxDistance` against real data in M4.
2. **Advisor ordering** in the picker: helps_you first (by interval lower bound), then not-enough-evidence, then no_clear_effect,
   rarely_moves_you, makes_you_worse last. Each badge shows the latest lesson's text on hover/tap.
3. **Warnings:** if the chosen advisor is `makes_you_worse` or `rarely_moves_you`, show the lesson before revealing the advice.
4. **Agent (M7):** auto-buy decisions read the same stats and attach the recalled lesson as the reason.
5. **Day 1 vs now:** `stat_snapshots` taken daily and after each settlement. `/me` toggles between the first snapshot and now.
   This is the before/after for the video and blog.

## Budget (shared managed relayer)
~30 weighted requests/min per delegate key, 60/min and 500/hour per account. remember = 5, remember/bulk = 10, analyze = 5 (+ per fact),
recall = 1, restore = 3. Read API (listNamespaces) has its own 200/min budget.
- Seals: one `remember` each (two per episode, plus takes).
- Episodes and lessons: `rememberBulk` in the tick worker (≤ 20 items per call).
- Recall: cache results per (user, advisor, market) for 10 minutes.
- On HTTP 429, back off using `retry_after_seconds` and leave the job queued.

## Rebuild from Walrus (M6 restore demo)
`pnpm rebuild:ledger` (to be written): wipe local seals → `listNamespaces()` (paginate with `has_more`) → for each `rcpt1:*`
namespace, `recall({ query: "forecast", namespace, topK: 1 })` → parse JSON, recompute hash, check it matches the namespace →
re-insert seals → re-capture evidence → re-run settlement → stats must match the pre-wipe snapshot. If a namespace has no
recall result, call `restore(namespace)` once and retry. Report counts.
