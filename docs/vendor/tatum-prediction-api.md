# Tatum Prediction Market API — offline reference

Generated from https://docs.tatum.io/reference/prediction-api (pages fetched 2026-10-21/22).
Raw OpenAPI for each endpoint is in `docs/vendor/tatum-openapi/`. Base URL: `https://api.tatum.io`.
Auth: header `x-api-key: $TATUM_API_KEY` (unauthenticated calls return 401 `subscription.invalid`).

## GET `/v4/data/prediction/events`

Source: https://docs.tatum.io/reference/getpredictionevents

/v4/data/prediction/events
100 credits per API call
List prediction-market events across supported platforms. An event is a top-level
grouping of one or more markets that share a common question or outcome set
(e.g. "2028 US Presidential Election"). Each event row includes a roll-up of nested
market counts, total volume, and total liquidity, with an opt-in to embed the full
list of nested markets via includeMarkets=true.
Supported platforms (filter via platform or omit for a cross-platform
feed):
 - Polymarket — polymarket
 - Kalshi — kalshi
Filtering, sorting and pagination
 - The status, category, tag and
search filters are only honoured by Polymarket. To use any of them
you must also pin platform=polymarket — calling them without that
pin returns 400 so the response is honest about what was filtered.
 - sort accepts volume_desc, liquidity_desc,
endingSoon, newest. When omitted on a cross-platform feed,
results are interleaved so neither platform dominates the first page.
 - Pagination is cursor-based. The first call returns a
pagination.cursor; pass that value verbatim as ?cursor=…
on the next call. Cursors are opaque, fingerprint-bound to the filter set, and
expire when filters change — never construct or modify them by hand. The cursor
field is omitted from pagination on the last page.
Other notes
 - volumeUnit is usd on Polymarket events
(dollar-denominated volume) and contracts on Kalshi events (number of
contracts traded, not USD).
 - totalLiquidity is null on Kalshi — quoted liquidity
is not exposed at the event level on Kalshi; compute from per-market orderbook
depth if you need it.
 - status in the response is the verbatim upstream status string
(richer than the status filter enum) — values can include
paused, archived, settled, etc.
 - markets is populated only when includeMarkets=true is
passed; otherwise it is null. When populated, every nested market is
returned (no internal cap).

**Parameters**

- `platform` (query, PredictionPlatform; enum: polymarket, kalshi) — Filter to a single platform. Omit for a cross-platform feed.
- `status` (query, PredictionMarketStatusFilter; enum: active, closed, resolved) — Filter by lifecycle status. Polymarket-only — must be combined with `platform=polymarket`.
- `category` (query, string) — Filter by event category. Polymarket-only — must be combined with `platform=polymarket`. Free-form string, max 64 characters.
- `tag` (query, string) — Filter by event tag slug. Polymarket-only — must be combined with `platform=polymarket`. Free-form string, max 64 characters.
- `search` (query, string) — Free-text search across event titles. Polymarket-only — must be combined with `platform=polymarket`. Max 256 characters.
- `sort` (query, PredictionMarketSort; enum: volume_desc, liquidity_desc, endingSoon, newest) — Sort order. When omitted on a cross-platform feed, results are interleaved to balance the two platforms; otherwise sorted within the merged set.
- `cursor` (query, PredictionCursor) — Opaque cursor returned by the previous response's `pagination.cursor`. Omit on the first call. Fingerprint-bound to the filter set — changing filters invalidates the cursor.
- `limit` (query, integer; default: 20; minimum: 1; maximum: 100) — Page size. Defaults to 20 when omitted.
- `includeMarkets` (query, boolean; default: False) — When `true`, each event includes its full nested `markets[]` array. Defaults to `false` to keep list payloads light — opt in when you need per-event market depth.

**200 response**

- `data`: array<PredictionEvent> (required)
  - `id`: string (required) — Platform-native event identifier (Polymarket numeric id or Kalshi event ticker).
  - `platform`: PredictionPlatform (required; enum: polymarket, kalshi) — Prediction-market platform identifier.
  - `title`: string (required; nullable) — Event title.
  - `description`: string (required; nullable) — Long-form event description, when available.
  - `category`: string (required; nullable) — Event category label, when available.
  - `tags`: array<string> (required) — Free-form tag slugs. May be empty on Kalshi.
  - `imageUrl`: string (required; nullable) — Image / icon URL for the event, when available.
  - `status`: string (required) — Verbatim upstream status string. Richer than the `?status=` filter enum.
  - `openTime`: string (required; nullable)
  - `closeTime`: string (required; nullable)
  - `marketCount`: integer (required) — Number of markets attached to this event.
  - `totalVolume`: number (required) — Sum of nested-market volume, in `volumeUnit` units.
  - `volumeUnit`: PredictionVolumeUnit (required; enum: usd, contracts) — Unit for `volume` and `totalVolume` fields. `usd` on Polymarket (dollar-denominated notional); `contracts` on Kalshi (contract count — not USD).
  - `totalLiquidity`: number (required; nullable) — Sum of nested-market quoted liquidity. `null` on Kalshi events because the underlying market liquidity is not exposed there.
  - `markets`: array<string | PredictionEventMarket> (required) — The event's markets. **Never null.** - When the request passes `includeMarkets=true`, each entry is a full market object. - Otherwise (default, `includeMarkets=false`), each entry is a **market ID string**.  The id is ex
    - `id`: string (required) — Platform-native market identifier (Polymarket condition id or Kalshi market ticker).
    - `platform`: PredictionPlatform (required; enum: polymarket, kalshi) — Prediction-market platform identifier.
    - `eventId`: string (required; nullable) — Parent event id. Polymarket numeric event id, or Kalshi event ticker. `null` when the upstream does not group this market under an event.
    - `question`: string (required) — Human-readable market question.
    - `description`: string (required; nullable) — Long-form description or resolution rules.
    - `category`: string (required; nullable) — Category label, when available.
    - `tags`: array<string> (required) — Free-form tag slugs. May be empty on Kalshi.
    - `imageUrl`: string (required; nullable) — Image / icon URL for the market, when available.
    - `status`: string (required) — Verbatim upstream status string. Richer than the `?status=` filter enum — values can include `paused`, `archived`, `settled`, `determined`, etc.
    - `openTime`: string (required; nullable) — ISO-8601 timestamp the market opened for trading.
    - `closeTime`: string (required; nullable) — ISO-8601 timestamp the market closes / closed for trading.
    - `settleTime`: string (required; nullable) — ISO-8601 timestamp the market is expected to settle.
    - `outcomes`: array<PredictionMarketOutcome> (required) — All outcomes of the market.
      - `name`: string (required) — Outcome label.
      - `price`: number (required) — Current probability in [0, 1].
      - `tokenId`: string (required; nullable) — Polymarket CTF token id for this outcome (numeric string). `null` on Kalshi — Kalshi outcomes are not tokenised.
    - `volume`: number (required) — Total volume in `volumeUnit` units.
    - `volumeUnit`: PredictionVolumeUnit (required; enum: usd, contracts) — Unit for `volume` and `totalVolume` fields. `usd` on Polymarket (dollar-denominated notional); `contracts` on Kalshi (contract count — not USD).
    - `liquidity`: number (required; nullable) — Quoted-resting-orders depth. `null` on Kalshi — the upstream markets feed does not populate this; aggregate orderbook depth client-side if you need it.
    - `resolution`: PredictionMarketResolution (required) — Resolution payload populated only after a market has settled. `null` on every active or paused market.
      - `outcome`: string (required) — Winning outcome name (matches one of the market's `outcomes[].name`).
      - `resolvedAt`: string (required) — ISO-8601 timestamp the market was resolved at.
      - `txHash`: string (required; nullable) — On-chain resolution transaction hash when available. `null` on Kalshi (the resolution is recorded off-chain on Kalshi's side).
      - `source`: string (required; nullable) — Resolution source attribution (e.g. `uma`, `kalshi`). `null` when the upstream does not expose it.
    - `createdAt`: string (required; nullable) — ISO-8601 timestamp the market was created upstream.
    - `source`: PredictionMarketSource (required) — Upstream platform attribution for a market or event row.
      - `platform`: PredictionPlatform (required; enum: polymarket, kalshi) — Prediction-market platform identifier.
      - `platformId`: string (required) — Platform-native identifier. Polymarket condition id (0x + 64 hex) or numeric event id; Kalshi market or event ticker.
      - `url`: string (required) — Canonical public URL on the source platform.
  - `source`: PredictionMarketSource (required) — Upstream platform attribution for a market or event row.
    - `platform`: PredictionPlatform (required; enum: polymarket, kalshi) — Prediction-market platform identifier.
    - `platformId`: string (required) — Platform-native identifier. Polymarket condition id (0x + 64 hex) or numeric event id; Kalshi market or event ticker.
    - `url`: string (required) — Canonical public URL on the source platform.
- `pagination`: PredictionCursorPagination (required) — Cursor-based pagination wrapper. The `cursor` field is omitted on the last page; `pageSize` reflects the page size of the call that produced this response.
  - `cursor`: PredictionCursor — Opaque base64-encoded pagination token. Returned in `pagination.cursor` on responses that have more pages. Pass back verbatim as `?cursor=…` to fetch the next page. Cursors are fingerprint-bound to the filter set — modif
  - `pageSize`: integer (required) — Page size of the page that produced this response.

Other documented statuses: 400, 401, 403, 500

## GET `/v4/data/prediction/events/{id}`

Source: https://docs.tatum.io/reference/getpredictioneventbyid

/v4/data/prediction/events/{id}
100 credits per API call
Retrieve a single prediction-market event by its platform-native identifier.
Useful for hydrating event detail pages or following links from a listing.
Accepted id formats:
 - Polymarket — numeric event id (e.g. 12345).
 - Kalshi — event ticker (e.g. KXELONMARS). Tickers are
uppercase alphanumeric with optional - and _
separators.
Other notes
 - Returns 404 when the event does not exist on either platform.
 - Returns 400 when the id does not match either
accepted format.
 - markets is populated only when includeMarkets=true
is passed; otherwise it is null.
 - volumeUnit and totalLiquidity follow the same
per-platform rules as the listing endpoint.

**Parameters**

- `id` (path, string; required) — Platform-native event identifier. Polymarket numeric id or Kalshi event ticker.
- `includeMarkets` (query, boolean; default: False) — When `true`, the event includes its full nested `markets[]` array. Defaults to `false`.

**200 response**

- `data`: PredictionEvent (required) — Top-level event row — a grouping of one or more markets sharing a question or outcome set. Aggregate fields (`marketCount`, `totalVolume`, `totalLiquidity`) are server-computed roll-ups over the event's markets.
  - `id`: string (required) — Platform-native event identifier (Polymarket numeric id or Kalshi event ticker).
  - `platform`: PredictionPlatform (required; enum: polymarket, kalshi) — Prediction-market platform identifier.
  - `title`: string (required; nullable) — Event title.
  - `description`: string (required; nullable) — Long-form event description, when available.
  - `category`: string (required; nullable) — Event category label, when available.
  - `tags`: array<string> (required) — Free-form tag slugs. May be empty on Kalshi.
  - `imageUrl`: string (required; nullable) — Image / icon URL for the event, when available.
  - `status`: string (required) — Verbatim upstream status string. Richer than the `?status=` filter enum.
  - `openTime`: string (required; nullable)
  - `closeTime`: string (required; nullable)
  - `marketCount`: integer (required) — Number of markets attached to this event.
  - `totalVolume`: number (required) — Sum of nested-market volume, in `volumeUnit` units.
  - `volumeUnit`: PredictionVolumeUnit (required; enum: usd, contracts) — Unit for `volume` and `totalVolume` fields. `usd` on Polymarket (dollar-denominated notional); `contracts` on Kalshi (contract count — not USD).
  - `totalLiquidity`: number (required; nullable) — Sum of nested-market quoted liquidity. `null` on Kalshi events because the underlying market liquidity is not exposed there.
  - `markets`: array<string | PredictionEventMarket> (required) — The event's markets. **Never null.** - When the request passes `includeMarkets=true`, each entry is a full market object. - Otherwise (default, `includeMarkets=false`), each entry is a **market ID string**.  The id is ex
    - `id`: string (required) — Platform-native market identifier (Polymarket condition id or Kalshi market ticker).
    - `platform`: PredictionPlatform (required; enum: polymarket, kalshi) — Prediction-market platform identifier.
    - `eventId`: string (required; nullable) — Parent event id. Polymarket numeric event id, or Kalshi event ticker. `null` when the upstream does not group this market under an event.
    - `question`: string (required) — Human-readable market question.
    - `description`: string (required; nullable) — Long-form description or resolution rules.
    - `category`: string (required; nullable) — Category label, when available.
    - `tags`: array<string> (required) — Free-form tag slugs. May be empty on Kalshi.
    - `imageUrl`: string (required; nullable) — Image / icon URL for the market, when available.
    - `status`: string (required) — Verbatim upstream status string. Richer than the `?status=` filter enum — values can include `paused`, `archived`, `settled`, `determined`, etc.
    - `openTime`: string (required; nullable) — ISO-8601 timestamp the market opened for trading.
    - `closeTime`: string (required; nullable) — ISO-8601 timestamp the market closes / closed for trading.
    - `settleTime`: string (required; nullable) — ISO-8601 timestamp the market is expected to settle.
    - `outcomes`: array<PredictionMarketOutcome> (required) — All outcomes of the market.
      - `name`: string (required) — Outcome label.
      - `price`: number (required) — Current probability in [0, 1].
      - `tokenId`: string (required; nullable) — Polymarket CTF token id for this outcome (numeric string). `null` on Kalshi — Kalshi outcomes are not tokenised.
    - `volume`: number (required) — Total volume in `volumeUnit` units.
    - `volumeUnit`: PredictionVolumeUnit (required; enum: usd, contracts) — Unit for `volume` and `totalVolume` fields. `usd` on Polymarket (dollar-denominated notional); `contracts` on Kalshi (contract count — not USD).
    - `liquidity`: number (required; nullable) — Quoted-resting-orders depth. `null` on Kalshi — the upstream markets feed does not populate this; aggregate orderbook depth client-side if you need it.
    - `resolution`: PredictionMarketResolution (required) — Resolution payload populated only after a market has settled. `null` on every active or paused market.
      - `outcome`: string (required) — Winning outcome name (matches one of the market's `outcomes[].name`).
      - `resolvedAt`: string (required) — ISO-8601 timestamp the market was resolved at.
      - `txHash`: string (required; nullable) — On-chain resolution transaction hash when available. `null` on Kalshi (the resolution is recorded off-chain on Kalshi's side).
      - `source`: string (required; nullable) — Resolution source attribution (e.g. `uma`, `kalshi`). `null` when the upstream does not expose it.
    - `createdAt`: string (required; nullable) — ISO-8601 timestamp the market was created upstream.
    - `source`: PredictionMarketSource (required) — Upstream platform attribution for a market or event row.
      - `platform`: PredictionPlatform (required; enum: polymarket, kalshi) — Prediction-market platform identifier.
      - `platformId`: string (required) — Platform-native identifier. Polymarket condition id (0x + 64 hex) or numeric event id; Kalshi market or event ticker.
      - `url`: string (required) — Canonical public URL on the source platform.
  - `source`: PredictionMarketSource (required) — Upstream platform attribution for a market or event row.
    - `platform`: PredictionPlatform (required; enum: polymarket, kalshi) — Prediction-market platform identifier.
    - `platformId`: string (required) — Platform-native identifier. Polymarket condition id (0x + 64 hex) or numeric event id; Kalshi market or event ticker.
    - `url`: string (required) — Canonical public URL on the source platform.

Other documented statuses: 400, 401, 403, 404, 500

## GET `/v4/data/prediction/search`

Source: https://docs.tatum.io/reference/getpredictionsearch

/v4/data/prediction/search
50 credits per API call
Unified search across events, tags and trader profiles. One query returns
all three result types in a single response — pick the branches you care
about with searchTags and searchProfiles.
Designed for discovery surfaces (autocomplete, top-of-page search) where a
single query needs to surface the most relevant entities of any kind.
Platform support
 - Polymarket only.
Filtering and pagination
 - q is the required search string — 2..128 characters.
Single-character queries are rejected with 400 because they
match an unhelpfully wide slice of the dataset.
 - limitPerType caps the number of results returned per
branch (events, tags, profiles) — defaults to 10.
 - searchTags toggles the tags branch — defaults
to true. searchProfiles toggles the
profiles branch — defaults to false because most
callers don't need it.
 - eventsStatus narrows the events branch by a free-text
status (e.g. active); eventsTag is a
comma-separated list of tag slugs (up to 50 entries).
keepClosedMarkets overrides the default behaviour of hiding
closed markets from the events branch.
 - sort is a free-text sort key forwarded to the upstream;
ascending sets sort direction.
 - Pagination is page-based (not cursor-based) — advance via
?page=N+1. The response body carries
data.pagination.hasMore and data.pagination.totalResults
for paging decisions.
Other notes
 - Branches are populated independently — an empty tags array
means no tag matches were found, not that the search failed.
 - events share the same shape as the /events
listing endpoint, so the same client-side rendering can be reused.
 - profiles rows include only proxyWallet,
name and pseudonym — additional profile fields
(image, bio) are not exposed here.

**Parameters**

- `q` (query, string; required) — Search string (required). 2..128 characters. Single-character queries are rejected with `400`.
- `page` (query, integer; default: 1; minimum: 1; maximum: 1000) — 1-indexed page number for paging through results. Defaults to 1.
- `limitPerType` (query, integer; default: 10; minimum: 1; maximum: 50) — Maximum number of results per branch (events / tags / profiles). Defaults to 10.
- `searchTags` (query, boolean; default: True) — Toggle the `tags` branch. Defaults to `true`.
- `searchProfiles` (query, boolean; default: False) — Toggle the `profiles` branch. Defaults to `false` — most callers don't need profile results.
- `eventsStatus` (query, string) — Narrow the events branch by status (free-text — accepts any value the upstream supports, e.g. `active`).
- `eventsTag` (query, string) — Narrow the events branch to a comma-separated list of tag slugs. Up to 50 entries.
- `keepClosedMarkets` (query, boolean) — Include closed markets in the events branch. Defaults to the upstream's behaviour (closed markets are hidden).
- `sort` (query, string) — Sort key forwarded to the upstream (free-text — accepts comma-separated field names).
- `ascending` (query, boolean) — Sort direction.

**200 response**

- `data`: PredictionSearchResult (required) — Unified-search payload — events, tags and trader profiles for a single query, with native page-based pagination.
  - `events`: array<PredictionEvent> (required) — Matching events. Same shape as the rows returned by `/events`. Empty when no event matches are found.
    - `id`: string (required) — Platform-native event identifier (Polymarket numeric id or Kalshi event ticker).
    - `platform`: PredictionPlatform (required; enum: polymarket, kalshi) — Prediction-market platform identifier.
    - `title`: string (required; nullable) — Event title.
    - `description`: string (required; nullable) — Long-form event description, when available.
    - `category`: string (required; nullable) — Event category label, when available.
    - `tags`: array<string> (required) — Free-form tag slugs. May be empty on Kalshi.
    - `imageUrl`: string (required; nullable) — Image / icon URL for the event, when available.
    - `status`: string (required) — Verbatim upstream status string. Richer than the `?status=` filter enum.
    - `openTime`: string (required; nullable)
    - `closeTime`: string (required; nullable)
    - `marketCount`: integer (required) — Number of markets attached to this event.
    - `totalVolume`: number (required) — Sum of nested-market volume, in `volumeUnit` units.
    - `volumeUnit`: PredictionVolumeUnit (required; enum: usd, contracts) — Unit for `volume` and `totalVolume` fields. `usd` on Polymarket (dollar-denominated notional); `contracts` on Kalshi (contract count — not USD).
    - `totalLiquidity`: number (required; nullable) — Sum of nested-market quoted liquidity. `null` on Kalshi events because the underlying market liquidity is not exposed there.
    - `markets`: array<string | PredictionEventMarket> (required) — The event's markets. **Never null.** - When the request passes `includeMarkets=true`, each entry is a full market object. - Otherwise (default, `includeMarkets=false`), each entry is a **market ID string**.  The id is ex
      - `id`: string (required) — Platform-native market identifier (Polymarket condition id or Kalshi market ticker).
      - `platform`: PredictionPlatform (required; enum: polymarket, kalshi) — Prediction-market platform identifier.
      - `eventId`: string (required; nullable) — Parent event id. Polymarket numeric event id, or Kalshi event ticker. `null` when the upstream does not group this market under an event.
      - `question`: string (required) — Human-readable market question.
      - `description`: string (required; nullable) — Long-form description or resolution rules.
      - `category`: string (required; nullable) — Category label, when available.
      - `tags`: array<string> (required) — Free-form tag slugs. May be empty on Kalshi.
      - `imageUrl`: string (required; nullable) — Image / icon URL for the market, when available.
      - `status`: string (required) — Verbatim upstream status string. Richer than the `?status=` filter enum — values can include `paused`, `archived`, `settled`, `determined`, etc.
      - `openTime`: string (required; nullable) — ISO-8601 timestamp the market opened for trading.
      - `closeTime`: string (required; nullable) — ISO-8601 timestamp the market closes / closed for trading.
      - `settleTime`: string (required; nullable) — ISO-8601 timestamp the market is expected to settle.
      - `outcomes`: array<PredictionMarketOutcome> (required) — All outcomes of the market.
        - `name`: string (required) — Outcome label.
        - `price`: number (required) — Current probability in [0, 1].
        - `tokenId`: string (required; nullable) — Polymarket CTF token id for this outcome (numeric string). `null` on Kalshi — Kalshi outcomes are not tokenised.
      - `volume`: number (required) — Total volume in `volumeUnit` units.
      - `volumeUnit`: PredictionVolumeUnit (required; enum: usd, contracts) — Unit for `volume` and `totalVolume` fields. `usd` on Polymarket (dollar-denominated notional); `contracts` on Kalshi (contract count — not USD).
      - `liquidity`: number (required; nullable) — Quoted-resting-orders depth. `null` on Kalshi — the upstream markets feed does not populate this; aggregate orderbook depth client-side if you need it.
      - `resolution`: PredictionMarketResolution (required) — Resolution payload populated only after a market has settled. `null` on every active or paused market.
        - `outcome`: string (required) — Winning outcome name (matches one of the market's `outcomes[].name`).
        - `resolvedAt`: string (required) — ISO-8601 timestamp the market was resolved at.
        - `txHash`: string (required; nullable) — On-chain resolution transaction hash when available. `null` on Kalshi (the resolution is recorded off-chain on Kalshi's side).
        - `source`: string (required; nullable) — Resolution source attribution (e.g. `uma`, `kalshi`). `null` when the upstream does not expose it.
      - `createdAt`: string (required; nullable) — ISO-8601 timestamp the market was created upstream.
      - `source`: PredictionMarketSource (required) — Upstream platform attribution for a market or event row.
        - `platform`: PredictionPlatform (required; enum: polymarket, kalshi) — Prediction-market platform identifier.
        - `platformId`: string (required) — Platform-native identifier. Polymarket condition id (0x + 64 hex) or numeric event id; Kalshi market or event ticker.
        - `url`: string (required) — Canonical public URL on the source platform.
    - `source`: PredictionMarketSource (required) — Upstream platform attribution for a market or event row.
      - `platform`: PredictionPlatform (required; enum: polymarket, kalshi) — Prediction-market platform identifier.
      - `platformId`: string (required) — Platform-native identifier. Polymarket condition id (0x + 64 hex) or numeric event id; Kalshi market or event ticker.
      - `url`: string (required) — Canonical public URL on the source platform.
  - `tags`: array<PredictionSearchTag> (required) — Matching tags. Empty when `searchTags=false` or no tag matches are found.
    - `id`: string (required; nullable) — Tag identifier, when the upstream populates it.
    - `slug`: string (required; nullable) — URL-friendly tag slug.
    - `label`: string (required; nullable) — Human-readable tag label.
    - `eventCount`: integer (required) — Authoritative count of events this tag is attached to.
  - `profiles`: array<PredictionSearchProfile> (required) — Matching trader profiles. Empty when `searchProfiles=false` (default) or no profile matches are found.
    - `proxyWallet`: string (required) — Profile wallet (0x + 40 hex, lowercased).
    - `name`: string (required; nullable) — Profile display name, when set.
    - `pseudonym`: string (required; nullable) — Profile pseudonym, when set.
  - `pagination`: PredictionSearchPagination (required) — Page-based pagination metadata used by the search endpoint. Caller advances with `?page=N+1` and stops when `hasMore` is `false`.
    - `hasMore`: boolean (required) — Whether a subsequent page exists.
    - `totalResults`: integer (required) — Total number of results across all pages.

Other documented statuses: 400, 401, 403, 500

## GET `/v4/data/prediction/markets`

Source: https://docs.tatum.io/reference/getpredictionmarkets

/v4/data/prediction/markets
100 credits per API call
List prediction markets across supported platforms. A market is a single
binary or multi-outcome question (e.g. "Will candidate X win?"); it belongs to
a parent event when one is defined upstream. Each row carries pricing-friendly
roll-ups (volume, liquidity), the current outcome set, and on-chain references
on platforms where they exist.
Supported platforms (filter via platform or omit for a cross-platform
feed):
 - Polymarket — polymarket
 - Kalshi — kalshi
Filtering, sorting and pagination
 - The status, category, tag,
search and minVolume filters are only honoured by
Polymarket. To use any of them you must also pin
platform=polymarket — calling them without that pin returns
400.
 - eventId accepts either a Polymarket numeric event id or a
Kalshi event ticker. When omitted, results span all events on the targeted
platform(s).
 - endingBefore is an ISO-8601 timestamp; markets closing on or
after that timestamp are excluded.
 - sort accepts volume_desc, liquidity_desc,
endingSoon, newest. When omitted on a cross-platform
feed, results are interleaved between the two platforms.
 - Pagination is cursor-based. The first call returns a
pagination.cursor; pass it back verbatim as ?cursor=…
on the next call. Cursors are opaque, fingerprint-bound, and expire when filters
change — never construct or modify them by hand.
Other notes
 - volumeUnit is usd on Polymarket (dollar-denominated
notional) and contracts on Kalshi (contract count — not USD).
 - liquidity is null on Kalshi — quoted liquidity is
not exposed by the upstream markets feed; aggregate orderbook depth
client-side if you need it.
 - chain is populated for Polymarket markets (Polygon CTF) and
null on Kalshi which has no on-chain footprint.
 - status in the response is the verbatim upstream status string
(richer than the ?status= filter enum) — values can include
paused, archived, settled, etc.

**Parameters**

- `platform` (query, PredictionPlatform; enum: polymarket, kalshi) — Filter to a single platform. Omit for a cross-platform feed.
- `status` (query, PredictionMarketStatusFilter; enum: active, closed, resolved) — Filter by lifecycle status. Polymarket-only — must be combined with `platform=polymarket`.
- `category` (query, string) — Filter by category. Polymarket-only — must be combined with `platform=polymarket`.
- `tag` (query, string) — Filter by tag slug. Polymarket-only — must be combined with `platform=polymarket`.
- `eventId` (query, string) — Scope the listing to a single parent event. Polymarket numeric event id (e.g. `12345`) or Kalshi event ticker (e.g. `KXELONMARS`).
- `search` (query, string) — Free-text search across market questions. Polymarket-only — must be combined with `platform=polymarket`.
- `endingBefore` (query, string) — Exclude markets closing on or after this ISO-8601 timestamp.
- `minVolume` (query, number; minimum: 0) — Minimum volume threshold in `volumeUnit` units. Polymarket-only — must be combined with `platform=polymarket`.
- `sort` (query, PredictionMarketSort; enum: volume_desc, liquidity_desc, endingSoon, newest) — Sort order. When omitted on a cross-platform feed, results are interleaved between platforms instead.
- `cursor` (query, PredictionCursor) — Opaque cursor returned by the previous response's `pagination.cursor`. Omit on the first call.
- `limit` (query, integer; default: 20; minimum: 1; maximum: 100) — Page size. Defaults to 20 when omitted.

**200 response**

- `data`: array<PredictionMarket> (required)
  - `id`: string (required) — Platform-native market identifier (Polymarket condition id or Kalshi market ticker).
  - `platform`: PredictionPlatform (required; enum: polymarket, kalshi) — Prediction-market platform identifier.
  - `eventId`: string (required; nullable) — Parent event id. Polymarket numeric event id, or Kalshi event ticker. `null` when the upstream does not group this market under an event.
  - `question`: string (required) — Human-readable market question.
  - `description`: string (required; nullable) — Long-form description or resolution rules.
  - `category`: string (required; nullable) — Category label, when available.
  - `tags`: array<string> (required) — Free-form tag slugs. May be empty on Kalshi.
  - `imageUrl`: string (required; nullable) — Image / icon URL for the market, when available.
  - `status`: string (required) — Verbatim upstream status string. Richer than the `?status=` filter enum — values can include `paused`, `archived`, `settled`, `determined`, etc.
  - `openTime`: string (required; nullable) — ISO-8601 timestamp the market opened for trading.
  - `closeTime`: string (required; nullable) — ISO-8601 timestamp the market closes / closed for trading.
  - `settleTime`: string (required; nullable) — ISO-8601 timestamp the market is expected to settle.
  - `outcomes`: array<PredictionMarketOutcome> (required) — All outcomes of the market.
    - `name`: string (required) — Outcome label.
    - `price`: number (required) — Current probability in [0, 1].
    - `tokenId`: string (required; nullable) — Polymarket CTF token id for this outcome (numeric string). `null` on Kalshi — Kalshi outcomes are not tokenised.
  - `volume`: number (required) — Total volume in `volumeUnit` units.
  - `volumeUnit`: PredictionVolumeUnit (required; enum: usd, contracts) — Unit for `volume` and `totalVolume` fields. `usd` on Polymarket (dollar-denominated notional); `contracts` on Kalshi (contract count — not USD).
  - `liquidity`: number (required; nullable) — Quoted-resting-orders depth. `null` on Kalshi — the upstream markets feed does not populate this; aggregate orderbook depth client-side if you need it.
  - `resolution`: PredictionMarketResolution (required) — Resolution payload populated only after a market has settled. `null` on every active or paused market.
    - `outcome`: string (required) — Winning outcome name (matches one of the market's `outcomes[].name`).
    - `resolvedAt`: string (required) — ISO-8601 timestamp the market was resolved at.
    - `txHash`: string (required; nullable) — On-chain resolution transaction hash when available. `null` on Kalshi (the resolution is recorded off-chain on Kalshi's side).
    - `source`: string (required; nullable) — Resolution source attribution (e.g. `uma`, `kalshi`). `null` when the upstream does not expose it.
  - `createdAt`: string (required; nullable) — ISO-8601 timestamp the market was created upstream.
  - `source`: PredictionMarketSource (required) — Upstream platform attribution for a market or event row.
    - `platform`: PredictionPlatform (required; enum: polymarket, kalshi) — Prediction-market platform identifier.
    - `platformId`: string (required) — Platform-native identifier. Polymarket condition id (0x + 64 hex) or numeric event id; Kalshi market or event ticker.
    - `url`: string (required) — Canonical public URL on the source platform.
  - `chain`: PredictionMarketChain (required) — On-chain references for a market. Populated for Polymarket (Polygon CTF); `null` on Kalshi which has no on-chain footprint.
    - `chainId`: integer (required) — EVM chain id (Polymarket runs on Polygon — chainId 137).
    - `conditionId`: string (required; nullable) — CTF condition id (0x + 64 hex).
    - `tokenIds`: object (required; nullable) — Outcome token ids keyed by outcome name.
      - `yes`: string (nullable)
      - `no`: string (nullable)
    - `resolutionSource`: string (required; nullable) — Resolution-source URL or identifier (UMA on Polymarket).
- `pagination`: PredictionCursorPagination (required) — Cursor-based pagination wrapper. The `cursor` field is omitted on the last page; `pageSize` reflects the page size of the call that produced this response.
  - `cursor`: PredictionCursor — Opaque base64-encoded pagination token. Returned in `pagination.cursor` on responses that have more pages. Pass back verbatim as `?cursor=…` to fetch the next page. Cursors are fingerprint-bound to the filter set — modif
  - `pageSize`: integer (required) — Page size of the page that produced this response.

Other documented statuses: 400, 401, 403, 500

## GET `/v4/data/prediction/markets/{id}`

Source: https://docs.tatum.io/reference/getpredictionmarketbyid

/v4/data/prediction/markets/{id}
100 credits per API call
Retrieve a single prediction market by its platform-native identifier.
Accepted id formats:
 - Polymarket — condition id (0x + 64 hex characters).
 - Kalshi — market ticker (e.g. KXELONMARS-99). Tickers are
uppercase alphanumeric with optional - and _
separators.
Other notes
 - Returns 404 when the market does not exist on either platform.
 - Returns 400 when the id does not match either
accepted format.
 - volumeUnit, liquidity and chain follow
the same per-platform rules as the listing endpoint.

**Parameters**

- `id` (path, string; required) — Platform-native market identifier. Polymarket condition id or Kalshi market ticker.

**200 response**

- `data`: PredictionMarket (required) — A single prediction market. Same shape as `PredictionEventMarket` plus the on-chain `chain` block — surfaced only on the dedicated `/markets` endpoints so event listings stay lean.
  - `id`: string (required) — Platform-native market identifier (Polymarket condition id or Kalshi market ticker).
  - `platform`: PredictionPlatform (required; enum: polymarket, kalshi) — Prediction-market platform identifier.
  - `eventId`: string (required; nullable) — Parent event id. Polymarket numeric event id, or Kalshi event ticker. `null` when the upstream does not group this market under an event.
  - `question`: string (required) — Human-readable market question.
  - `description`: string (required; nullable) — Long-form description or resolution rules.
  - `category`: string (required; nullable) — Category label, when available.
  - `tags`: array<string> (required) — Free-form tag slugs. May be empty on Kalshi.
  - `imageUrl`: string (required; nullable) — Image / icon URL for the market, when available.
  - `status`: string (required) — Verbatim upstream status string. Richer than the `?status=` filter enum — values can include `paused`, `archived`, `settled`, `determined`, etc.
  - `openTime`: string (required; nullable) — ISO-8601 timestamp the market opened for trading.
  - `closeTime`: string (required; nullable) — ISO-8601 timestamp the market closes / closed for trading.
  - `settleTime`: string (required; nullable) — ISO-8601 timestamp the market is expected to settle.
  - `outcomes`: array<PredictionMarketOutcome> (required) — All outcomes of the market.
    - `name`: string (required) — Outcome label.
    - `price`: number (required) — Current probability in [0, 1].
    - `tokenId`: string (required; nullable) — Polymarket CTF token id for this outcome (numeric string). `null` on Kalshi — Kalshi outcomes are not tokenised.
  - `volume`: number (required) — Total volume in `volumeUnit` units.
  - `volumeUnit`: PredictionVolumeUnit (required; enum: usd, contracts) — Unit for `volume` and `totalVolume` fields. `usd` on Polymarket (dollar-denominated notional); `contracts` on Kalshi (contract count — not USD).
  - `liquidity`: number (required; nullable) — Quoted-resting-orders depth. `null` on Kalshi — the upstream markets feed does not populate this; aggregate orderbook depth client-side if you need it.
  - `resolution`: PredictionMarketResolution (required) — Resolution payload populated only after a market has settled. `null` on every active or paused market.
    - `outcome`: string (required) — Winning outcome name (matches one of the market's `outcomes[].name`).
    - `resolvedAt`: string (required) — ISO-8601 timestamp the market was resolved at.
    - `txHash`: string (required; nullable) — On-chain resolution transaction hash when available. `null` on Kalshi (the resolution is recorded off-chain on Kalshi's side).
    - `source`: string (required; nullable) — Resolution source attribution (e.g. `uma`, `kalshi`). `null` when the upstream does not expose it.
  - `createdAt`: string (required; nullable) — ISO-8601 timestamp the market was created upstream.
  - `source`: PredictionMarketSource (required) — Upstream platform attribution for a market or event row.
    - `platform`: PredictionPlatform (required; enum: polymarket, kalshi) — Prediction-market platform identifier.
    - `platformId`: string (required) — Platform-native identifier. Polymarket condition id (0x + 64 hex) or numeric event id; Kalshi market or event ticker.
    - `url`: string (required) — Canonical public URL on the source platform.
  - `chain`: PredictionMarketChain (required) — On-chain references for a market. Populated for Polymarket (Polygon CTF); `null` on Kalshi which has no on-chain footprint.
    - `chainId`: integer (required) — EVM chain id (Polymarket runs on Polygon — chainId 137).
    - `conditionId`: string (required; nullable) — CTF condition id (0x + 64 hex).
    - `tokenIds`: object (required; nullable) — Outcome token ids keyed by outcome name.
      - `yes`: string (nullable)
      - `no`: string (nullable)
    - `resolutionSource`: string (required; nullable) — Resolution-source URL or identifier (UMA on Polymarket).

Other documented statuses: 400, 401, 403, 404, 500

## GET `/v4/data/prediction/markets/{id}/price`

Source: https://docs.tatum.io/reference/getpredictionmarketprice

/v4/data/prediction/markets/{id}/price
100 credits per API call
Current price snapshot for a single market. Returns per-outcome quotes
(best bid / best ask / sizes), the implied midpoint, spread, last trade price
and rolling 24-hour volume. Useful for ticker-style dashboards and pre-trade
previews.
Other notes
 - Resolves the same id formats as GET /markets/{id}
(Polymarket condition id or Kalshi market ticker).
 - volume24h is reported in the market's volumeUnit —
usd on Polymarket, contracts on Kalshi.
 - volume24h and volumeUnit are null when
the upstream does not expose a 24-hour figure.
 - midPrice and spread are null when
either side of the book is empty.

**Parameters**

- `id` (path, string; required) — Platform-native market identifier.

**200 response**

- `data`: PredictionMarketPrice (required) — Current price snapshot for a market.
  - `marketId`: string (required) — Platform-native market identifier.
  - `platform`: PredictionPlatform (required; enum: polymarket, kalshi) — Prediction-market platform identifier.
  - `timestamp`: string (required) — ISO-8601 timestamp the snapshot was computed at.
  - `yes`: PredictionOutcomePriceQuote (required) — Per-outcome price quote inside a market-price snapshot.
    - `price`: number (required) — Current outcome probability in [0, 1].
    - `bid`: number (required; nullable) — Best bid price. `null` when the bid side of the book is empty.
    - `ask`: number (required; nullable) — Best ask price. `null` when the ask side of the book is empty.
    - `bidSize`: number (required; nullable) — Size resting at the best bid. `null` when the bid side is empty.
    - `askSize`: number (required; nullable) — Size resting at the best ask. `null` when the ask side is empty.
  - `no`: PredictionOutcomePriceQuote (required) — Per-outcome price quote inside a market-price snapshot.
    - `price`: number (required) — Current outcome probability in [0, 1].
    - `bid`: number (required; nullable) — Best bid price. `null` when the bid side of the book is empty.
    - `ask`: number (required; nullable) — Best ask price. `null` when the ask side of the book is empty.
    - `bidSize`: number (required; nullable) — Size resting at the best bid. `null` when the bid side is empty.
    - `askSize`: number (required; nullable) — Size resting at the best ask. `null` when the ask side is empty.
  - `midPrice`: number (required; nullable) — Implied midpoint between best bid and best ask. `null` when either side of the book is empty.
  - `spread`: number (required; nullable) — Difference between best ask and best bid. `null` when either side of the book is empty.
  - `lastTradePrice`: number (required; nullable) — Price of the most recent trade, when one exists.
  - `lastTradeAt`: string (required; nullable) — ISO-8601 timestamp of the most recent trade, when one exists.
  - `volume24h`: number (required; nullable) — Rolling 24-hour volume in `volumeUnit` units. `null` when the upstream does not expose a 24-hour figure.
  - `volumeUnit`: PredictionVolumeUnit (required; enum: usd, contracts) — Unit for `volume` and `totalVolume` fields. `usd` on Polymarket (dollar-denominated notional); `contracts` on Kalshi (contract count — not USD).

Other documented statuses: 400, 401, 403, 404, 500

## GET `/v4/data/prediction/markets/{id}/orderbook`

Source: https://docs.tatum.io/reference/getpredictionmarketorderbook

/v4/data/prediction/markets/{id}/orderbook
100 credits per API call
Current orderbook snapshot for one side of a market. The orderbook is
per-outcome — pass side=yes or side=no to choose which
outcome's book you want. Returns top-of-book through to depth levels
of bids and asks, with a computed quoted-liquidity figure within 1% and 5% of the
midpoint.
Other notes
 - side is required.
 - hash is a content fingerprint of the book snapshot useful for
ETag-style change detection on poll. Populated on Polymarket; null
on Kalshi (no equivalent upstream field).
 - Returns 404 when the market does not exist on either platform.

**Parameters**

- `id` (path, string; required) — Platform-native market identifier.
- `side` (query, PredictionOutcomeSide; required; enum: yes, no) — Which outcome's orderbook to return.
- `depth` (query, integer; default: 20; minimum: 1; maximum: 100) — Number of levels to return per side. Defaults to 20 when omitted.

**200 response**

- `data`: PredictionOrderbook (required) — Orderbook snapshot for one outcome side of a market. Includes computed quoted-liquidity figures within 1% and 5% of the midpoint.
  - `marketId`: string (required) — Platform-native market identifier.
  - `platform`: PredictionPlatform (required; enum: polymarket, kalshi) — Prediction-market platform identifier.
  - `side`: PredictionOutcomeSide (required; enum: yes, no) — Which outcome of a binary market a row refers to.
  - `timestamp`: string (required) — ISO-8601 timestamp the snapshot was computed at.
  - `hash`: string (required; nullable) — Content fingerprint of the book state, useful for ETag-style change detection on poll. Populated on Polymarket; `null` on Kalshi (no equivalent upstream field).
  - `bids`: array<PredictionOrderbookLevel> (required) — Bid levels ordered from best (highest price) to worst.
    - `price`: number (required) — Price for this level.
    - `size`: number (required) — Aggregate size resting at this price.
  - `asks`: array<PredictionOrderbookLevel> (required) — Ask levels ordered from best (lowest price) to worst.
    - `price`: number (required) — Price for this level.
    - `size`: number (required) — Aggregate size resting at this price.
  - `spread`: number (required; nullable) — Difference between best ask and best bid. `null` when either side of the book is empty.
  - `midPrice`: number (required; nullable) — Implied midpoint. `null` when either side of the book is empty.
  - `liquidity`: object (required) — Quoted-liquidity totals within bands of the midpoint. Computed over the full returned book (pre-trim by `depth`).
    - `within1pct`: number (required) — Total resting size within ±1% of the midpoint.
    - `within5pct`: number (required) — Total resting size within ±5% of the midpoint.

Other documented statuses: 400, 401, 403, 404, 500

## GET `/v4/data/prediction/markets/{id}/history`

Source: https://docs.tatum.io/reference/getpredictionmarketpricehistory

/v4/data/prediction/markets/{id}/history
200 credits per API call
Historical OHLC price candles for a market over a time window. Used to power
chart views — every candle includes open / high / low / close prices plus the
in-bucket trade volume.
Filtering
 - interval is required. Accepted values: 1m,
5m, 15m, 1h, 4h,
1d, 1w. Each interval has a maximum allowed range
(e.g. 1m can be queried for ~1 day at a time, 1d for
~1 year). Requests exceeding the range cap return 400.
 - start and end are required ISO-8601 timestamps.
end must be after start.
 - source selects the underlying data feed. Defaults to
candlesticks (trade-based OHLC with real volume). Pass
midpoint to switch to a midpoint-quote feed with broader range
coverage at the cost of volume = 0 on every candle.
source=midpoint is supported on Polymarket only — passing it
against a Kalshi market returns 400.
Other notes
 - partial: true indicates the requested range was truncated by an
upstream availability limit. This only happens on Polymarket with
source=candlesticks (the trade-based feed exposes a finite window
of historical fills); Kalshi candles cover the full requested range, and
source=midpoint on Polymarket also covers the full range.
 - When partial is true, availableFrom
contains the earliest timestamp the response actually covers — data before that
point is unavailable from the trade-based feed. To recover the missing range on
Polymarket, repeat the call with source=midpoint; the response
spans the full window at the cost of volume = 0 on every candle
(the midpoint feed carries quotes, not fills).
 - availableFrom is null when no trades exist in the
entire requested range.
 - Candle timestamps are bucket-aligned (e.g. an interval=1h
response has timestamps on the hour).

**Parameters**

- `id` (path, string; required) — Platform-native market identifier.
- `interval` (query, PredictionHistoryInterval; required; enum: 1m, 5m, 15m, 1h, 4h, 1d, 1w) — Candle bucket size.
- `start` (query, string; required) — Window start (ISO-8601). Must be earlier than `end`.
- `end` (query, string; required) — Window end (ISO-8601). Must be later than `start`.
- `source` (query, PredictionHistorySource; enum: candlesticks, midpoint) — Data source. Defaults to `candlesticks`. `midpoint` is Polymarket-only.

**200 response**

- `data`: PredictionPriceHistory (required) — Historical OHLC candles for a market over a time window.
  - `marketId`: string (required) — Platform-native market identifier.
  - `platform`: PredictionPlatform (required; enum: polymarket, kalshi) — Prediction-market platform identifier.
  - `interval`: PredictionHistoryInterval (required; enum: 1m, 5m, 15m, 1h, 4h, 1d, 1w) — OHLC candle bucket size. Each interval has its own maximum allowed time window; requests exceeding that window return `400`.
  - `source`: PredictionHistorySource (required; enum: candlesticks, midpoint) — Underlying data feed for OHLC candles. `candlesticks` (default) is trade-based with real in-bucket volume. `midpoint` uses a midpoint-quote feed with broader time-range coverage at the cost of `volume = 0` on every candl
  - `candles`: array<PredictionPriceCandle> (required) — Candles in chronological order, bucket-aligned to `interval`.
    - `timestamp`: string (required) — ISO-8601 bucket-aligned start time of the candle.
    - `open`: number (required) — Opening price of the bucket.
    - `high`: number (required) — Highest price within the bucket.
    - `low`: number (required) — Lowest price within the bucket.
    - `close`: number (required) — Closing price of the bucket.
    - `volume`: number (required) — In-bucket trade volume. Always `0` when `source=midpoint` (the midpoint feed carries no volume data).
  - `partial`: boolean (required) — `true` when the requested range was truncated by an upstream availability limit. When `true`, `availableFrom` indicates the earliest timestamp the response actually covers.
  - `availableFrom`: string (required; nullable) — Earliest timestamp the response covers. Equals the requested `start` when `partial` is `false`. `null` when no trades exist in the entire requested range.

Other documented statuses: 400, 401, 403, 404, 500

## GET `/v4/data/prediction/markets/{id}/trades`

Source: https://docs.tatum.io/reference/getpredictionmarkettrades

/v4/data/prediction/markets/{id}/trades
100 credits per API call
Recent trades feed for a single market. Each row is one fill — outcome side,
buy/sell direction, price, size and notional value — with the taker wallet
attribution when the upstream exposes it.
Filtering and pagination
 - after and before are ISO-8601 timestamps that
define an inclusive time window. They are honoured by Kalshi natively. On
Polymarket the upstream /trades feed has no time-window filter, so
passing after or before against a Polymarket market
returns 400 — set the platform via the path id rather than
attempting cross-platform time queries.
 - Pagination is cursor-based. The first call returns a
pagination.cursor; pass it back verbatim as ?cursor=…
on the next call. Cursors are fingerprint-bound to the time-window filter set.
Other notes
 - taker is the wallet that crossed the spread on this fill.
Populated on Polymarket; null on Kalshi (the public trades feed
does not expose per-trade wallet attribution there).
 - txHash is the on-chain settlement transaction hash where one
exists. Populated on Polymarket and null on Kalshi.
 - side is the outcome side (yes / no);
direction is the order side (buy / sell)
— both are surfaced because they answer different questions.

**Parameters**

- `id` (path, string; required) — Platform-native market identifier.
- `after` (query, string) — Inclusive lower bound on the trade timestamp (ISO-8601). Kalshi-only — passing this against a Polymarket market returns `400`.
- `before` (query, string) — Inclusive upper bound on the trade timestamp (ISO-8601). Kalshi-only — passing this against a Polymarket market returns `400`. Must be later than `after` when both are provided.
- `cursor` (query, PredictionCursor) — Opaque cursor returned by the previous response's `pagination.cursor`. Omit on the first call.
- `limit` (query, integer; default: 50; minimum: 1; maximum: 100) — Page size. Defaults to 50 when omitted.

**200 response**

- `data`: array<PredictionTrade> (required)
  - `tradeId`: string (required) — Platform-native trade identifier.
  - `marketId`: string (required) — Platform-native market identifier.
  - `platform`: PredictionPlatform (required; enum: polymarket, kalshi) — Prediction-market platform identifier.
  - `side`: PredictionOutcomeSide (required; enum: yes, no) — Which outcome of a binary market a row refers to.
  - `direction`: PredictionTradeDirection (required; enum: buy, sell) — Order side — whether the taker bought or sold the outcome.
  - `price`: number (required) — Fill price in [0, 1].
  - `size`: number (required) — Fill size (outcome tokens / contracts).
  - `notionalValue`: number (required) — Fill notional in the market's quote currency (price × size).
  - `taker`: string (required; nullable) — Wallet that crossed the spread. Populated on Polymarket; `null` on Kalshi (the public trades feed does not expose per-trade wallet attribution there).
  - `txHash`: string (required; nullable) — On-chain settlement transaction hash where one exists. Populated on Polymarket; `null` on Kalshi.
  - `timestamp`: string (required) — ISO-8601 timestamp the trade settled at.
- `pagination`: PredictionCursorPagination (required) — Cursor-based pagination wrapper. The `cursor` field is omitted on the last page; `pageSize` reflects the page size of the call that produced this response.
  - `cursor`: PredictionCursor — Opaque base64-encoded pagination token. Returned in `pagination.cursor` on responses that have more pages. Pass back verbatim as `?cursor=…` to fetch the next page. Cursors are fingerprint-bound to the filter set — modif
  - `pageSize`: integer (required) — Page size of the page that produced this response.

Other documented statuses: 400, 401, 403, 404, 500

## GET `/v4/data/prediction/markets/{id}/positions`

Source: https://docs.tatum.io/reference/getpredictionmarketpositions

/v4/data/prediction/markets/{id}/positions
100 credits per API call
Top holders of a market grouped by outcome token. Each top-level row in the
response is one outcome (e.g. YES, NO); under it sits the list of wallets
currently holding that outcome, ordered by the chosen sortBy
metric. Useful for "who's on each side of this bet" leaderboards on a
market-detail page.
Platform support
 - Polymarket only. Calling this endpoint against a Kalshi market id returns
400.
Filtering, sorting and pagination
 - user narrows the response to a single wallet — useful for
"does this user have a position in this market" checks.
 - status filters holders by their position state:
OPEN (size > 0.01), CLOSED (size ≤ 0.01),
ALL (default).
 - sortBy chooses the metric used to order holders inside each
outcome group: TOKENS, CASH_PNL,
REALIZED_PNL, TOTAL_PNL. Combine with
sortDirection (ASC or DESC).
 - Pagination is offset-based. limit and offset apply
per outcome group — e.g. on a binary market with limit=50
the response carries up to 100 holders total (50 YES + 50 NO).

**Parameters**

- `id` (path, string; required) — Platform-native market identifier. Must be a Polymarket condition id; Kalshi market ids return `400`.
- `user` (query, string) — Filter the response to a single holder wallet (0x + 40 hex).
- `status` (query, PredictionMarketPositionStatusFilter; enum: OPEN, CLOSED, ALL) — Filter holders by position lifecycle state. Defaults to `ALL`.
- `sortBy` (query, PredictionMarketPositionSortBy; enum: TOKENS, CASH_PNL, REALIZED_PNL, TOTAL_PNL) — Metric used to order holders inside each outcome group. Defaults to `TOTAL_PNL`.
- `sortDirection` (query, PredictionSortDirection; enum: ASC, DESC) — Sort direction. Defaults to `DESC`.
- `limit` (query, integer; default: 50; minimum: 1; maximum: 500) — Maximum number of holders to return *per outcome group*. Defaults to 50.
- `offset` (query, integer; default: 0; minimum: 0; maximum: 10000) — Starting offset *per outcome group*. Defaults to 0.

**200 response**

- `data`: array<PredictionMarketPositionsGroup> (required)
  - `token`: string (required) — Outcome-token asset id.
  - `positions`: array<PredictionMarketPositionHolder> (required) — Holders of this outcome, ordered by the requested `sortBy` / `sortDirection`.
    - `proxyWallet`: string (required) — Holder wallet (0x + 40 hex, lowercased).
    - `name`: string (required; nullable) — Holder display name, when set on their profile.
    - `profileImage`: string (required; nullable) — Holder profile image URL, when set.
    - `verified`: boolean (required) — Whether the holder has a verified-badge on their profile.
    - `asset`: string (required) — Polymarket outcome-token asset id this holder owns.
    - `conditionId`: string (required) — Market condition id (0x + 64 hex).
    - `avgPrice`: number (required) — Volume-weighted average entry price.
    - `size`: number (required) — Current position size (outcome tokens).
    - `currPrice`: number (required) — Current market price of the outcome.
    - `currentValue`: number (required) — Current USD mark-to-market value of the position.
    - `cashPnl`: number (required) — Unrealised PnL in USD.
    - `totalBought`: number (required) — Lifetime USD spent acquiring this position.
    - `realizedPnl`: number (required) — Realised PnL in USD.
    - `totalPnl`: number (required) — Sum of cashPnl and realizedPnl.
    - `outcome`: string (required; nullable) — Outcome label (e.g. `YES` / `NO`).
    - `outcomeIndex`: integer (required) — Outcome index (0 / 1 on binary markets).
- `pagination`: PredictionOffsetPagination (required) — Offset-based pagination metadata, returned by every wallet endpoint and by `/markets/{id}/positions`. `pageNumber` is the zero-indexed page derived from `offset / limit` on the request.
  - `pageSize`: integer (required) — Page size of the call that produced this response.
  - `pageNumber`: integer (required) — Zero-indexed page number (`offset / limit`).

Other documented statuses: 400, 401, 403, 500

## GET `/v4/data/prediction/top-traders`

Source: https://docs.tatum.io/reference/getpredictiontoptraders

/v4/data/prediction/top-traders
200 credits per API call
Ranked leaderboard of top traders, scoped by category and time period.
Each row carries the trader's wallet, display fields (username, X handle,
profile image), verified-badge status, and the metrics used for ranking
(volume and PnL within the requested window).
Platform support
 - Polymarket only.
Filtering, sorting and pagination
 - category selects the leaderboard slice — one of
OVERALL, POLITICS, SPORTS,
CRYPTO, CULTURE, MENTIONS,
WEATHER, ECONOMICS, TECH,
FINANCE. Defaults to OVERALL.
 - timePeriod sets the lookback window —
DAY, WEEK, MONTH, ALL.
Defaults to DAY.
 - orderBy chooses the ranking metric: PNL
(realised + unrealised profit) or VOL (trading volume).
Defaults to PNL.
 - user filters the leaderboard to a single wallet — useful
for "where does this trader rank" lookups. userName filters
by trader display name (substring match).
 - Pagination is offset-based — limit (1..50, default 25)
and offset (0..1000, default 0). Higher offsets are not
supported by the upstream leaderboard.
Other notes
 - rank is the continuous 1-indexed position given the
requested filters — rank = 1 is the leader for the chosen
category and time period.
 - proxyWallet is returned lowercased.
 - vol and pnl are USD figures, scoped to the
requested category and timePeriod.

**Parameters**

- `category` (query, PredictionLeaderboardCategory; enum: OVERALL, POLITICS, SPORTS, CRYPTO, CULTURE, MENTIONS, WEATHER, ECONOMICS, TECH, FINANCE) — Leaderboard category slice. Defaults to `OVERALL`.
- `timePeriod` (query, PredictionLeaderboardTimePeriod; enum: DAY, WEEK, MONTH, ALL) — Lookback window. Defaults to `DAY`.
- `orderBy` (query, PredictionLeaderboardOrder; enum: PNL, VOL) — Ranking metric. Defaults to `PNL`.
- `limit` (query, integer; default: 25; minimum: 1; maximum: 50) — Page size. Defaults to 25.
- `offset` (query, integer; default: 0; minimum: 0; maximum: 1000) — Page offset. Defaults to 0. The upstream leaderboard caps offsets at 1000.
- `user` (query, string) — Filter the leaderboard to a single wallet (0x + 40 hex). Useful for "where does this trader rank" lookups.
- `userName` (query, string) — Filter by trader display name (substring match).

**200 response**

- `data`: array<PredictionTopTrader> (required)
  - `rank`: integer (required) — Continuous 1-indexed position in the leaderboard given the requested filters.
  - `proxyWallet`: string (required) — Trader wallet (0x + 40 hex, lowercased).
  - `userName`: string (required; nullable) — Trader display name, when set.
  - `xUsername`: string (required; nullable) — Trader's X (Twitter) handle, when linked.
  - `verifiedBadge`: boolean (required) — Whether the trader has a verified-badge on their profile.
  - `vol`: number (required) — Trading volume (USD) within the requested `timePeriod` for the requested `category`.
  - `pnl`: number (required) — Realised + unrealised PnL (USD) within the requested `timePeriod` for the requested `category`.
  - `profileImage`: string (required; nullable) — Trader profile image URL, when set.
- `pagination`: PredictionPageSizePagination (required) — Minimal pagination metadata used by endpoints that paginate via `offset` + `limit` and don't surface a derived `pageNumber`.
  - `pageSize`: integer (required) — Page size of the call that produced this response.

Other documented statuses: 400, 401, 403, 500

## GET `/v4/data/prediction/wallets/{address}/portfolio`

Source: https://docs.tatum.io/reference/getpredictionwalletportfolio

/v4/data/prediction/wallets/{address}/portfolio
200 credits per API call
Aggregated portfolio summary for a single wallet. Returns position counts
(open, redeemable, closed), unrealised and realised PnL, total cost basis,
active notional, win rate and ROI — all computed over the requested
period. Useful as the headline KPI block on a wallet detail page.
Platform support
 - Polymarket only. Passing any non-EVM address returns 400.
Filtering
 - period selects the lookback window for closed-position
aggregates: 24h, 7d, 30d or
all. Defaults to all.
 - Open-position counts and activeNotional are always live (the
period only affects closed-position roll-ups).
Other notes
 - address is normalised to lowercase before being echoed back
in the response.
 - winRate is a percentage in [0, 100] (e.g.
42.5 = 42.5%). It is null when
closedPositions is zero — the ratio is undefined, not zero.
 - roi is realised ROI as a percentage (e.g. 23.45
= 23.45%). Computed from realised PnL over total cost basis of closed
positions only — unrealised PnL is excluded. null when
totalCostBasis is zero.
 - redeemablePositions is the count of positions on a resolved
market that the wallet has won but has not yet redeemed. Disjoint from both
openPositions and closedPositions — tracked
separately so the count of currently actionable positions is visible.

**Parameters**

- `address` (path, PredictionWalletAddress; required) — Wallet address. Must be a 0x-prefixed 40-hex EVM address. Kalshi wallets return `400`.
- `period` (query, PredictionPortfolioPeriod; enum: 24h, 7d, 30d, all) — Window for `totalPnl` (P&L during the window) and the settlement counts (`closedPositions`, `wins`, `losses`, `winRate`). `totalCostBasis`, `realizedPnl` and `roi` are all-time regardless of this value. Defaults to `all`.

**200 response**

- `data`: PredictionPortfolio (required) — Server-aggregated wallet summary. Synthesised from the wallet's current open positions, redeemable positions, total notional and closed-position roll-ups within the requested `period`.
  - `address`: string (required) — Wallet address, lowercased.
  - `period`: PredictionPortfolioPeriod (required; enum: 24h, 7d, 30d, all) — Window for `totalPnl` and the settlement counts (`closedPositions`/`wins`/`losses`/ `winRate`) on `/wallets/{address}/portfolio`. `totalCostBasis`/`realizedPnl`/`roi` are all-time regardless.
  - `generatedAt`: string (required) — ISO-8601 timestamp the snapshot was computed at.
  - `openPositions`: integer (required) — Count of currently open positions.
  - `redeemablePositions`: integer (required) — Count of positions on a resolved market that the wallet has won but has not yet redeemed. Disjoint from `openPositions` and `closedPositions`.
  - `activeNotional`: number (required) — Total USD notional of currently open positions (rounded to 2dp).
  - `unrealizedPnl`: number (required) — Sum of unrealised PnL across currently open positions.
  - `closedPositions`: integer (required) — Count of closed positions within the requested `period`.
  - `wins`: integer (required) — Count of winning closed positions within the requested `period`.
  - `losses`: integer (required) — Count of losing closed positions within the requested `period`.
  - `winRate`: number (required; nullable) — Win rate as a percentage in [0, 100]. `null` when `closedPositions` is 0 — the ratio is undefined, not zero.
  - `totalCostBasis`: number (required) — All-time cost basis in USDC across all closed positions (full history) — NOT windowed by `period`. Computed per position as shares bought × average buy price (`totalBought * avgPrice`); upstream `totalBought` is a share 
  - `realizedPnl`: number (required) — All-time realised PnL in USDC across all closed positions — NOT windowed by `period` (same lifetime-attribution reason as `totalCostBasis`). Does not reconcile with the windowed `totalPnl`. Upstream reports 0 for positio
  - `totalPnl`: number (required) — Profit/loss matching the public profile page (Polymarket `/user-pnl`). For `period=all` it is the wallet's current all-time P&L; for `24h`/`7d`/`30d` it is the P&L generated *during* that trailing window. NOT the arithme
  - `roi`: number (required; nullable) — All-time realised ROI as a percentage — NOT windowed by `period`. `realizedPnl` over `totalCostBasis` (both all-time); unrealised PnL is excluded. `null` when `totalCostBasis` is 0.

Other documented statuses: 400, 401, 403, 500

## GET `/v4/data/prediction/wallets/{address}/positions`

Source: https://docs.tatum.io/reference/getpredictionwalletpositions

/v4/data/prediction/wallets/{address}/positions
100 credits per API call
Current open positions held by a wallet — one row per outcome token, with
unrealised PnL, current value, lifetime cost basis, and the parent market's
question, slug and outcome metadata. Useful for "what's in my portfolio right
now" views and per-market drill-downs.
Platform support
 - Polymarket only. Kalshi wallets return 400.
Filtering, sorting and pagination
 - market scopes the response to a comma-separated list of
condition ids (0x + 64 hex), up to 50 entries.
 - eventId scopes the response to a comma-separated list of
Polymarket numeric event ids, up to 50 entries. Mutually exclusive with
market — passing both returns 400.
 - sizeThreshold filters out positions smaller than the given
size. Defaults to 1; pass 0 to include dust.
 - redeemable=true returns positions on resolved markets that
the wallet has won but has not yet redeemed. mergeable=true
returns positions eligible for merging back to USDC. Both default to
false.
 - sortBy accepts CURRENT, INITIAL,
TOKENS, CASHPNL, PERCENTPNL,
TITLE, RESOLVING, PRICE,
AVGPRICE. Defaults to TOKENS. Combine with
sortDirection (ASC / DESC, defaults to
DESC).
 - title filters by a substring of the market question.
 - Pagination is offset-based — limit (1..500, default 100) and
offset (0..10000, default 0).
Other notes
 - address is normalised to lowercase before being echoed in the
response (every row's proxyWallet).
 - negativeRisk indicates whether the parent market is part of
Polymarket's negative-risk grouping (e.g. multi-candidate winner-take-all
markets).

**Parameters**

- `address` (path, PredictionWalletAddress; required) — Wallet address (0x + 40 hex). Kalshi addresses return `400`.
- `market` (query, string) — Comma-separated list of condition ids (0x + 64 hex) to scope the response to. Up to 50 entries. Mutually exclusive with `eventId`.
- `eventId` (query, string) — Comma-separated list of Polymarket numeric event ids to scope the response to. Up to 50 entries. Mutually exclusive with `market`.
- `sizeThreshold` (query, number; default: 1; minimum: 0) — Minimum position size to include. Defaults to `1`; pass `0` to include dust positions.
- `redeemable` (query, boolean; default: False) — When `true`, returns positions on resolved markets that the wallet has won but has not yet redeemed. Defaults to `false`.
- `mergeable` (query, boolean; default: False) — When `true`, returns positions eligible for merging back to USDC. Defaults to `false`.
- `sortBy` (query, PredictionPositionSortBy; enum: CURRENT, INITIAL, TOKENS, CASHPNL, PERCENTPNL, TITLE, RESOLVING, PRICE, AVGPRICE) — Sort key. Defaults to `TOKENS`.
- `sortDirection` (query, PredictionSortDirection; enum: ASC, DESC) — Sort direction. Defaults to `DESC`.
- `title` (query, string) — Filter rows where the market question contains this substring.
- `limit` (query, integer; default: 100; minimum: 1; maximum: 500) — Page size. Defaults to 100.
- `offset` (query, integer; default: 0; minimum: 0; maximum: 10000) — Page offset. Defaults to 0.

**200 response**

- `data`: array<PredictionWalletPosition> (required)
  - `proxyWallet`: string (required) — Holder wallet (0x + 40 hex, lowercased).
  - `asset`: string (required) — Polymarket outcome-token asset id.
  - `conditionId`: string (required) — Market condition id (0x + 64 hex).
  - `size`: number (required) — Current position size (outcome tokens).
  - `avgPrice`: number (required) — Volume-weighted average entry price.
  - `initialValue`: number (required) — USD value at entry.
  - `currentValue`: number (required) — Current USD mark-to-market value of the position.
  - `cashPnl`: number (required) — Unrealised PnL in USD.
  - `percentPnl`: number (required) — Unrealised PnL as a ratio (e.g. 0.1053 = 10.53%).
  - `totalBought`: number (required) — Lifetime USD spent acquiring this position.
  - `realizedPnl`: number (required) — Realised PnL in USD.
  - `percentRealizedPnl`: number (required) — Realised PnL as a ratio.
  - `curPrice`: number (required) — Current market price of the outcome.
  - `redeemable`: boolean (required) — `true` when the position is on a resolved market and the wallet has won but has not yet redeemed.
  - `mergeable`: boolean (required) — `true` when the position can be merged back to USDC with the opposite outcome.
  - `title`: string (required; nullable) — Parent market question.
  - `slug`: string (required; nullable) — Parent market slug on Polymarket.
  - `icon`: string (required; nullable) — Parent market icon URL.
  - `eventSlug`: string (required; nullable) — Parent event slug on Polymarket.
  - `outcome`: string (required; nullable) — Outcome label (e.g. `YES` / `NO`).
  - `outcomeIndex`: integer (required) — Outcome index (0 / 1 on binary markets).
  - `oppositeOutcome`: string (required; nullable) — Label of the opposite outcome.
  - `oppositeAsset`: string (required) — Polymarket asset id of the opposite outcome.
  - `endDate`: string (required; nullable) — ISO-8601 close timestamp of the parent market.
  - `negativeRisk`: boolean (required) — Whether the parent market is part of Polymarket's negative-risk grouping (e.g. multi-candidate winner-take-all markets).
- `pagination`: PredictionOffsetPagination (required) — Offset-based pagination metadata, returned by every wallet endpoint and by `/markets/{id}/positions`. `pageNumber` is the zero-indexed page derived from `offset / limit` on the request.
  - `pageSize`: integer (required) — Page size of the call that produced this response.
  - `pageNumber`: integer (required) — Zero-indexed page number (`offset / limit`).

Other documented statuses: 400, 401, 403, 500

## GET `/v4/data/prediction/wallets/{address}/history`

Source: https://docs.tatum.io/reference/getpredictionwallethistory

/v4/data/prediction/wallets/{address}/history
100 credits per API call
Closed and resolved positions for a wallet — one row per settled position
(winning or losing), with the realised PnL, lifetime cost basis, settlement
price, and the parent market's question and outcome metadata. Useful for
backtest-style P&L drill-downs and tax exports.
Platform support
 - Polymarket only. Kalshi wallets return 400.
Filtering, sorting and pagination
 - market scopes the response to a comma-separated list of
condition ids (0x + 64 hex), up to 50 entries.
 - eventId scopes the response to a comma-separated list of
Polymarket numeric event ids, up to 50 entries. Mutually exclusive with
market — passing both returns 400.
 - title filters by a substring of the market question.
 - sortBy accepts REALIZEDPNL, TITLE,
PRICE, AVGPRICE, TIMESTAMP. Defaults
to REALIZEDPNL. Combine with sortDirection
(ASC / DESC, defaults to DESC).
 - Pagination is offset-based — limit (1..50, default 10) and
offset (0..100000, default 0).
Other notes
 - address is normalised to lowercase before being echoed in the
response (every row's proxyWallet).
 - timestamp is unix-seconds (not milliseconds) — the settlement
time of the position.
 - curPrice is the resolution price (0 or 1 for binary markets);
avgPrice is the volume-weighted entry price.

**Parameters**

- `address` (path, PredictionWalletAddress; required) — Wallet address (0x + 40 hex). Kalshi addresses return `400`.
- `market` (query, string) — Comma-separated list of condition ids (0x + 64 hex). Up to 50 entries. Mutually exclusive with `eventId`.
- `eventId` (query, string) — Comma-separated list of Polymarket numeric event ids. Up to 50 entries. Mutually exclusive with `market`.
- `title` (query, string) — Filter rows where the market question contains this substring.
- `sortBy` (query, PredictionClosedPositionSortBy; enum: REALIZEDPNL, TITLE, PRICE, AVGPRICE, TIMESTAMP) — Sort key. Defaults to `REALIZEDPNL`.
- `sortDirection` (query, PredictionSortDirection; enum: ASC, DESC) — Sort direction. Defaults to `DESC`.
- `limit` (query, integer; default: 10; minimum: 1; maximum: 50) — Page size. Defaults to 10.
- `offset` (query, integer; default: 0; minimum: 0; maximum: 100000) — Page offset. Defaults to 0.

**200 response**

- `data`: array<PredictionWalletClosedPosition> (required)
  - `proxyWallet`: string (required) — Holder wallet (0x + 40 hex, lowercased).
  - `asset`: string (required) — Polymarket outcome-token asset id.
  - `conditionId`: string (required) — Market condition id (0x + 64 hex).
  - `avgPrice`: number (required) — Volume-weighted average entry price.
  - `totalBought`: number (required) — Lifetime USD spent acquiring the position.
  - `realizedPnl`: number (required) — Realised PnL in USD on settlement.
  - `curPrice`: number (required) — Resolution price (0 or 1 on binary markets — 1 = winning outcome).
  - `timestamp`: integer (required) — Settlement time of the position (unix-seconds).
  - `title`: string (required; nullable) — Parent market question.
  - `slug`: string (required; nullable)
  - `icon`: string (required; nullable)
  - `eventSlug`: string (required; nullable)
  - `outcome`: string (required; nullable)
  - `outcomeIndex`: integer (required)
  - `oppositeOutcome`: string (required; nullable)
  - `oppositeAsset`: string (required)
  - `endDate`: string (required; nullable)
- `pagination`: PredictionOffsetPagination (required) — Offset-based pagination metadata, returned by every wallet endpoint and by `/markets/{id}/positions`. `pageNumber` is the zero-indexed page derived from `offset / limit` on the request.
  - `pageSize`: integer (required) — Page size of the call that produced this response.
  - `pageNumber`: integer (required) — Zero-indexed page number (`offset / limit`).

Other documented statuses: 400, 401, 403, 500

## GET `/v4/data/prediction/wallets/{address}/trades`

Source: https://docs.tatum.io/reference/getpredictionwallettrades

/v4/data/prediction/wallets/{address}/trades
100 credits per API call
Trade-only fills for a wallet — one row per trade, with the buy/sell side,
outcome metadata, size, price, transaction hash, and the trader's profile
fields (display name, profile image). Trade-only — does not include
non-trade events like splits, merges, redemptions or rewards (use
/wallets/{address}/activity for the full feed).
Platform support
 - Polymarket only. Kalshi wallets return 400.
Filtering and pagination
 - market / eventId scope the response (mutually
exclusive, up to 50 entries each).
 - side filters to BUY or SELL trades.
 - takerOnly defaults to true — set to
false to include maker-side fills.
 - filterType and filterAmount set a minimum trade
size threshold. filterType=CASH filters by USDC notional;
filterType=TOKENS filters by outcome-token count. Both must be
provided together — passing one without the other returns 400.
 - Pagination is offset-based — limit (1..10000, default 100) and
offset (0..10000, default 0). The upstream feed enforces a hard
cap at offset = 3000; calls past that point return an empty page
rather than an error.
Other notes
 - address is normalised to lowercase before being echoed in the
response (every row's proxyWallet).
 - timestamp is unix-seconds (not milliseconds).
 - side uses the trade-direction vocabulary
(BUY / SELL) — distinct from the outcome-side
vocabulary (yes / no) used by
/markets/{id}/trades.

**Parameters**

- `address` (path, PredictionWalletAddress; required) — Wallet address (0x + 40 hex). Kalshi addresses return `400`.
- `market` (query, string) — Comma-separated list of condition ids (0x + 64 hex). Up to 50 entries. Mutually exclusive with `eventId`.
- `eventId` (query, string) — Comma-separated list of Polymarket numeric event ids. Up to 50 entries. Mutually exclusive with `market`.
- `side` (query, PredictionTradeSide; enum: BUY, SELL) — Filter by trade direction.
- `takerOnly` (query, boolean; default: True) — Include only taker-side fills. Defaults to `true`; set to `false` to include maker-side fills.
- `filterType` (query, PredictionTradeFilterType; enum: CASH, TOKENS) — Minimum-trade-size unit. Must be combined with `filterAmount` — passing one without the other returns `400`.
- `filterAmount` (query, number; minimum: 0) — Minimum trade size, interpreted via `filterType`. Must be combined with `filterType`.
- `limit` (query, integer; default: 100; minimum: 1; maximum: 10000) — Page size. Defaults to 100. Note the upstream offset cap of 3000 — calls past that point return an empty page.
- `offset` (query, integer; default: 0; minimum: 0; maximum: 10000) — Page offset. Defaults to 0. The upstream feed enforces a hard cap at offset 3000; calls past that point return an empty page.

**200 response**

- `data`: array<PredictionWalletTrade> (required)
  - `proxyWallet`: string (required) — Trader wallet (0x + 40 hex, lowercased).
  - `side`: PredictionTradeSide (required; enum: BUY, SELL) — Order direction (buy / sell). Distinct from the outcome-side enum.
  - `asset`: string (required) — Polymarket outcome-token asset id.
  - `conditionId`: string (required) — Market condition id (0x + 64 hex).
  - `size`: number (required) — Trade size (outcome tokens).
  - `price`: number (required) — Trade price in [0, 1].
  - `timestamp`: integer (required) — Trade time (unix-seconds).
  - `title`: string (required; nullable)
  - `slug`: string (required; nullable)
  - `icon`: string (required; nullable)
  - `eventSlug`: string (required; nullable)
  - `outcome`: string (required; nullable)
  - `outcomeIndex`: integer (required)
  - `name`: string (required; nullable) — Trader display name, when set on their profile.
  - `pseudonym`: string (required; nullable) — Trader pseudonym, when set.
  - `bio`: string (required; nullable) — Trader profile bio, when set.
  - `profileImage`: string (required; nullable)
  - `profileImageOptimized`: string (required; nullable) — CDN-optimised variant of `profileImage`, when available.
  - `transactionHash`: string (required; nullable) — On-chain transaction hash of the trade settlement.
- `pagination`: PredictionOffsetPagination (required) — Offset-based pagination metadata, returned by every wallet endpoint and by `/markets/{id}/positions`. `pageNumber` is the zero-indexed page derived from `offset / limit` on the request.
  - `pageSize`: integer (required) — Page size of the call that produced this response.
  - `pageNumber`: integer (required) — Zero-indexed page number (`offset / limit`).

Other documented statuses: 400, 401, 403, 500

## GET `/v4/data/prediction/wallets/{address}/activity`

Source: https://docs.tatum.io/reference/getpredictionwalletactivity

/v4/data/prediction/wallets/{address}/activity
100 credits per API call
Full wallet event feed — covers every event type the upstream emits:
TRADE, SPLIT, MERGE, REDEEM,
REWARD, CONVERSION, MAKER_REBATE and
REFERRAL_REWARD. Unlike /wallets/{address}/trades,
this endpoint includes non-trade events and supports a native time-range
filter — useful for activity logs, audit trails and tax exports.
Platform support
 - Polymarket only. Kalshi wallets return 400.
Filtering, sorting and pagination
 - market / eventId scope the response (mutually
exclusive, up to 50 entries each).
 - type is a comma-separated list of event types — up to 8
entries from the enum.
 - side filters to BUY or SELL
(relevant for trade-type rows; null on non-trade rows).
 - start / end are unix-seconds
(not milliseconds) — values that look like millisecond timestamps
(~13 digits) are rejected with 400. end must be
greater than or equal to start.
 - sortBy accepts TIMESTAMP, TOKENS,
CASH. Defaults to TIMESTAMP. Combine with
sortDirection (defaults to DESC).
 - Pagination is offset-based — limit (1..500, default 100) and
offset (0..10000, default 0).
Other notes
 - side is null on non-trade rows (e.g.
REWARD, SPLIT, MERGE,
REDEEM) — direction is undefined there.
 - outcomeIndex can be null for rows that don't map
to a position side. A sentinel value of 999 is occasionally
emitted by the upstream for the same case.
 - conditionId and asset can be null on
rows that aren't market-scoped (e.g. some reward / referral rows).
 - address is normalised to lowercase before being echoed in the
response.

**Parameters**

- `address` (path, PredictionWalletAddress; required) — Wallet address (0x + 40 hex). Kalshi addresses return `400`.
- `market` (query, string) — Comma-separated list of condition ids (0x + 64 hex). Up to 50 entries. Mutually exclusive with `eventId`.
- `eventId` (query, string) — Comma-separated list of Polymarket numeric event ids. Up to 50 entries. Mutually exclusive with `market`.
- `type` (query, string) — Comma-separated list of event types to include. Up to 8 entries from the `PredictionActivityType` enum.
- `side` (query, PredictionTradeSide; enum: BUY, SELL) — Filter trade-type rows by direction. Non-trade rows always have `side = null` and are unaffected.
- `start` (query, integer; minimum: 0; maximum: 4102444800) — Inclusive lower bound on event timestamp, in unix-**seconds**. Values that look like milliseconds (~13 digits) are rejected with `400`.
- `end` (query, integer; minimum: 0; maximum: 4102444800) — Inclusive upper bound on event timestamp, in unix-**seconds**. Must be ≥ `start` when both are provided.
- `sortBy` (query, PredictionActivitySortBy; enum: TIMESTAMP, TOKENS, CASH) — Sort key. Defaults to `TIMESTAMP`.
- `sortDirection` (query, PredictionSortDirection; enum: ASC, DESC) — Sort direction. Defaults to `DESC`.
- `limit` (query, integer; default: 100; minimum: 1; maximum: 500) — Page size. Defaults to 100.
- `offset` (query, integer; default: 0; minimum: 0; maximum: 10000) — Page offset. Defaults to 0.

**200 response**

- `data`: array<PredictionWalletActivity> (required)
  - `proxyWallet`: string (required) — Wallet address (0x + 40 hex, lowercased).
  - `timestamp`: integer (required) — Event time (unix-seconds).
  - `conditionId`: string (required; nullable) — Market condition id (0x + 64 hex). `null` on rows that aren't market-scoped (e.g. some reward / referral rows).
  - `type`: PredictionActivityType (required; enum: TRADE, SPLIT, MERGE, REDEEM, REWARD, CONVERSION, MAKER_REBATE, REFERRAL_REWARD) — Event type emitted in the wallet activity feed. Covers every category the upstream surfaces — not just trades.
  - `size`: number (required) — Token-count delta — outcome tokens moved by this event.
  - `usdcSize`: number (required) — USDC notional delta — USDC moved by this event.
  - `transactionHash`: string (required; nullable) — On-chain transaction hash, when one exists.
  - `price`: number (required) — Price associated with the event. `0` on non-trade events (e.g. `REWARD`, `REDEEM`) where price is undefined.
  - `asset`: string (required; nullable) — Outcome-token asset id. `null` on rows that aren't market-scoped.
  - `side`: PredictionTradeSide (required; enum: BUY, SELL) — Order direction on trade-type rows. `null` on non-trade events (e.g. `REWARD`, `SPLIT`, `MERGE`, `REDEEM`, `CONVERSION`).
  - `outcomeIndex`: integer (required; nullable) — Outcome index (0 / 1 on binary markets). `null` when the upstream omits it; the upstream occasionally emits a sentinel value of `999` for rows that don't map to a position side.
  - `title`: string (required; nullable)
  - `slug`: string (required; nullable)
  - `icon`: string (required; nullable)
  - `eventSlug`: string (required; nullable)
  - `outcome`: string (required; nullable)
  - `name`: string (required; nullable)
  - `pseudonym`: string (required; nullable)
  - `bio`: string (required; nullable)
  - `profileImage`: string (required; nullable)
  - `profileImageOptimized`: string (required; nullable)
- `pagination`: PredictionOffsetPagination (required) — Offset-based pagination metadata, returned by every wallet endpoint and by `/markets/{id}/positions`. `pageNumber` is the zero-indexed page derived from `offset / limit` on the request.
  - `pageSize`: integer (required) — Page size of the call that produced this response.
  - `pageNumber`: integer (required) — Zero-indexed page number (`offset / limit`).

Other documented statuses: 400, 401, 403, 500

## GET `/v4/data/prediction/wallets/{address}/value`

Source: https://docs.tatum.io/reference/getpredictionwalletvalue

/v4/data/prediction/wallets/{address}/value
50 credits per API call
Total USD notional of a wallet's currently open positions. A single-number
endpoint — useful for sparkline-style summaries and headline KPIs without
paying the cost of pulling the full positions list.
Platform support
 - Polymarket only. Kalshi wallets return 400.
Filtering
 - market scopes the total to a comma-separated list of condition
ids (0x + 64 hex), up to 50 entries. Omit for the wallet-wide
total.
Other notes
 - value is rounded to 2 decimal places.
 - user is the lowercased address.

**Parameters**

- `address` (path, PredictionWalletAddress; required) — Wallet address (0x + 40 hex). Kalshi addresses return `400`.
- `market` (query, string) — Comma-separated list of condition ids (0x + 64 hex) to scope the total to. Up to 50 entries. Omit for the wallet-wide total.

**200 response**

- `data`: PredictionWalletValue (required) — Total USD notional of a wallet's currently open positions.
  - `user`: string (required) — Wallet address (0x + 40 hex, lowercased).
  - `value`: number (required) — Total USD notional, rounded to 2 decimal places.

Other documented statuses: 400, 401, 403, 500

## GET `/v4/data/prediction/wallets/{address}/markets-traded`

Source: https://docs.tatum.io/reference/getpredictionwalletmarketstraded

/v4/data/prediction/wallets/{address}/markets-traded
50 credits per API call
Count of distinct markets a wallet has ever traded. Lifetime metric —
useful as a quick activity signal alongside /wallets/{address}/value
without paying the cost of pulling the full trade history.
Platform support
 - Polymarket only. Kalshi wallets return 400.
Other notes
 - traded is an integer count — the number of distinct markets,
not the number of trades.
 - user is the lowercased address.

**Parameters**

- `address` (path, PredictionWalletAddress; required) — Wallet address (0x + 40 hex). Kalshi addresses return `400`.

**200 response**

- `data`: PredictionWalletMarketsTraded (required) — Count of distinct markets a wallet has ever traded. Lifetime metric — counts markets, not individual trades.
  - `user`: string (required) — Wallet address (0x + 40 hex, lowercased).
  - `traded`: integer (required) — Number of distinct markets traded.

Other documented statuses: 400, 401, 403, 500
