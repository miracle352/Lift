Recorded from Tatum's Prediction API on 2026-10-29 ~10:53 UTC with a real key (no secrets inside):

- `events-15m-endingSoon.json`: `GET /v4/data/prediction/events?platform=polymarket&tag=15M&status=active&sort=endingSoon&limit=100&includeMarkets=true` (first 40 events).
  Note the first 4 rows are stale upstream "active" events from August — the parser must skip them by close time.
- `events-15m-resolved.json`: same with `status=resolved&sort=newest` (first 30 events).
- `events-epl-matches.json`: three EPL match events (tag=EPL, status=active, sort=endingSoon, includeMarkets=true), recorded 2026-10-30.
