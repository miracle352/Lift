# Design system

Look: editorial "ledger at dawn", inspired by the layout language of elitr.xyz (white paper, ink headlines in three tones,
gold accents, hairline grids, mono labels, one dark section, landscape hero and footer). All artwork is original: the
landscape is generated SVG (`scripts/gen-landscape.ts`), not an image.

**Living style guide: `/design`** renders every app component with sample data. Build real routes by rendering those
components with DB data. Don't restyle them per page; change the component.

## Tokens (`src/app/globals.css`)
| token | value | use |
|---|---|---|
| `paper` / `paper-2` | `#ffffff` / `#faf8f3` | page / quiet panels |
| `ink` / `ink-2` | `#0b0b0c` / `#2a2b2e` | text, primary buttons |
| `muted` / `faint` | `#5d6067` / `#6e7178` | secondary text (both pass WCAG AA on all light backgrounds) |
| `line` / `line-strong` | `#e8e5dd` / `#d6d1c4` | 1px hairlines |
| `gold` / `gold-ink` / `gold-wash` / `gold-line` | `#f0b414` / `#7b5b00` / `#fdf9ec` / `#f1dc9c` | squares, buttons / accent text / highlight fills / highlight borders |
| `night` / `night-2` / `night-line` | `#0b0d10` / `#14171c` / `#262a31` | the one dark section, terminals |
| `good`, `bad`, `warn` (+ `-wash`) | green / red / amber | verdicts, check results |

Fonts: Inter (variable) for UI, Geist Mono for numbers, hashes and labels, both self-hosted in `src/app/fonts` (SIL OFL).
Radius is **0 everywhere**. Shadows only on floating things (receipts, auth card).

## Type
- Headlines: `.display` (hero) and `H2`. Three-tone pattern: ink, then `<Muted>`, then `<Accent>` (gold-ink). One accent phrase per headline.
- Labels: `.mono-label` (11px, uppercase, tracked). Section eyebrow: `<Eyebrow index="03">How it works</Eyebrow>`.
- Numbers: `tabular-nums`, mono for hashes/digests (`<Hash>` middle-truncates and links to Suiscan with a gold underline).

## Components
`src/components/ui/primitives.tsx` (server, zero JS): `Container`, `Section` (`night` variant), `Eyebrow`, `Tag`, `H2`, `Lede`,
`SectionHead`, `Button` / `ButtonLink` (`primary | glass | dark | gold | outline`, optional gold arrow box), `CardGrid` + `Card`
(hairline grid via 1px gaps), `Stat`, `Badge` (tones), `Hash`, `Terminal`, `Faq` (native `<details>`), `IntervalBar`, `Rule`.
`src/components/ui/probability-slider.tsx` (client): 1–99% slider in basis points, with an optional ghost marker for the blind call.

`src/components/receipts/*` (app screens):
| component | route | data it needs |
|---|---|---|
| `AppHeader`, `PageTitle` | all app pages | current user handle, active tab |
| `MatchCard` | `/matchday` | market + the user's episode state (`MatchState`) |
| `ForecastFlow` (client) | `/m/[marketId]` | market, advisors ordered by stats, recalled memories per advisor, **server actions** `lockBlind`, `reveal`, `lockInformed`, `sealStatus` |
| `ReceiptView` | `/r/[hash]` | seal row + `verification_json.checks` (shape = `src/core/evidence.ts` `Check`), reveal state, result |
| `AdvisorTable` | `/me`, profiles, crews | rows from `advisor_stats` (`verdict` strings match `src/core/scoring.ts`) |
| `MemoryCard` | inside `ForecastFlow` | recall results from Walrus Memory (text, blob id, kind, time) |
| `AuthCard`, `Field` | `/login`, `/signup` | form actions |
| `SealChip`, `VerdictBadge`, `VERDICT_UI` | anywhere | seal status / verdict enums from the DB |

## Motion
- Load-in: `.enter` (fade + rise) for small things, `.enter-solid` (rise only) for **large text**, which must never start
  transparent or Chrome won't record its LCP. Stagger with `style={d(i)}`.
- Scroll reveal: put `data-reveal` on an element; the inline script in `layout.tsx` reveals it on intersection
  (also for client-navigated content). `data-reveal="line"` grows a hairline.
- Hero/footer landscape: one-shot draw-ins everywhere; loops (sun, haze, river glint, receipt float) only on large
  fine-pointer screens; scroll parallax desktop only; everything pauses off-screen (`data-paused`) and stops under
  `prefers-reduced-motion`.
- Animate only `transform`, `opacity`, `clip-path`, `stroke-dashoffset`. No SVG filters (blur) on animated layers.

## Performance budget (measured with Lighthouse 12.8, local production build, 2026-10-22)
| page | mobile perf | desktop perf | a11y | SEO | CLS |
|---|---|---|---|---|---|
| `/` landing | 91–93 | 100 | 100 | 100 | 0 |
| `/design` | 95 | n/a | 97 | (noindex) | 0 |
Keep it that way: no new client components on the landing, no images in the hero, no third-party scripts, no Google Fonts.
The only "best practices" deduction is the console 404 from prefetching app routes that don't exist yet.

## Copy rules
docs/SPEC.md §6 still applies: tamper-evident, observed change, not enough evidence yet. Example data on marketing pages is
always labelled "example". Replace `EXAMPLE_SEALS` on the landing with real verified seals once they exist.
