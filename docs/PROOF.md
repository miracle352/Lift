# Seals and receipts — protocol v1

Implementation: `src/core/forecast.ts`, `src/core/namespace.ts`, `src/core/evidence.ts`, `src/lib/seal-evidence.ts`.
Tests with pinned vectors: `tests/core/*.test.ts`. Everything below is already implemented unless marked **(app)**.

## What a seal proves (and what it does not)

A valid seal shows that **this exact forecast existed before the market closed**, that it was written through **our** Walrus
Memory account, and that it has not been edited since. It is *tamper-evident*: tampering is detectable, not impossible.
It does **not** prove skill, and a single receipt says nothing about a track record. Track records come from the
completeness rules below.

## 1. The forecast object (`ForecastV1`)

```jsonc
{
  "schema": "receipts.forecast.v1",
  "kind": "blind" | "informed" | "take",
  "user": "<app user id>",                    // opaque, stable (UUID)
  "market": {
    "platform": "polymarket" | "kalshi",
    "id": "<platform market id from Tatum>",
    "question": "<market question>",
    "rulesHash": "<sha256 of Tatum market.description>",   // pins the resolution rules
    "closeTime": "<ISO, from Tatum at seal time>"
  },
  "outcome": "Yes",                           // the outcome the probability is about
  "probabilityBps": 5500,                     // integer 1..9999 (55.00%)
  "prev": null | "<hash of the blind seal>",  // informed only
  "advice": null | {                          // informed only: the ONE thing shown between locks
    "advisorId": "pundit:@someone", "advisorKind": "market|whale|tipster|pundit|crew",
    "contentHash": "<sha256 of canonical JSON of exactly what was shown>", "fairTest": true
  },
  "createdAt": "<ISO>",                       // informational; chain time is authoritative
  "salt": "<32 random bytes, hex>"            // prevents guessing the probability from the hash
}
```

Rules: blind seals and takes have `prev = null` and `advice = null`. Informed seals must have both. Unknown keys are rejected.

## 2. Hash and namespace

- `hash = sha256( JCS(forecast) )`, where JCS is RFC 8785 canonical JSON (`canonicalize` package). Hex, lowercase.
- Seal namespace (public on Sui):
  `rcpt1:<userTag>:<marketTag>:<b|i|t>:<hash>`
  - `userTag = sha256("receipts:user:" + userId)[0:12]`
  - `marketTag = sha256("receipts:market:" + platform + ":" + marketId)[0:12]`
- Learning memories use `ep1:<userTag>` and `lesson1:<userTag>` (docs/MEMORY.md). They are never seals.

Pinned vector (tests): the sample blind forecast hashes to `69110a5b…a46f`, namespace
`rcpt1:ff8f5be99f5f:01f700c5f165:b:69110a5b19b0eaf3268be64593159e1a62445f6d853b4fdb4246856f3ce4a46f`.

## 3. Writing a seal **(app)**

1. Build the forecast with `buildForecast(...)`, compute `hash` and `namespace`, insert a `seals` row (`status = queued`,
   `forecast_json = canonicalJson(forecast)`). The row is the only copy of the salt until Walrus has it.
2. Tick worker: `memwal.remember(forecastCanonicalJson, namespace, { idempotencyKey: hash })` → `status = accepted`, store `job_id`.
3. Poll `getRememberStatus(job_id)` until `done` → store `walrus_blob_id` → `status = stored`.
4. **Capture evidence immediately**: `captureSealEvidence(sui, { forecast, walrusBlobId, owner: MEMWAL_OWNER_ADDRESS, accountId: MEMWAL_ACCOUNT_ID })`.
   It finds the Blob object owned by the account owner, takes its `previousTransaction` (the relayer's
   "set metadata + transfer" transaction = the **commit tx**), fetches that tx and runs `verifySeal`.
   Store `blob_object_id`, `commit_digest`, `commit_checkpoint`, `commit_timestamp`, `verification_json`.
   DB status → `verified` when `verifySeal` returns `valid` or `valid_with_notes` (the notes stay in `verification_json`),
   `late` when it returns `late`. If it returns `invalid`, or the blob is not found yet, keep retrying with backoff
   (`next_attempt_at`) for ~15 minutes. Then `failed`, shown to the user, never hidden.
5. Lock cutoff: the UI refuses locks after `closeTime − 10 minutes`, so normal relayer latency still lands before close.

The relayer pays WAL storage and SUI gas. Blobs are stored for ~15 Walrus epochs (about 7 months) on mainnet.

## 4. Verifying a seal (`verifySeal`)

Inputs: the revealed forecast, the commit transaction, optionally the Blob object and the current Walrus epoch.

| check | severity | passes when |
|---|---|---|
| `hash` | hard | recomputed hash equals the hash inside the namespace |
| `tags` | hard | user/market tags in the namespace match the revealed forecast |
| `label_in_tx` | hard | the commit tx's **inputs** contain `insert_or_update_metadata_pair(blob, "memwal_namespace", <namespace>)` |
| `tx_success` | hard | the transaction succeeded |
| `account` | hard | the `seal_encrypt_fence` call for that blob references our Walrus Memory account |
| `owner` | hard | `memwal_owner` label and the transfer recipient equal our account owner |
| `before_close` | timing | checkpoint time < market close (Tatum's close time when available) |
| `after_blind` | note | informed seals: the blind seal's chain time ≤ this one |
| `untouched` | note | the Blob's `previousTransaction` is still the commit tx |
| `alive` | note | the blob's storage end epoch is in the future |

Status: any hard failure → `invalid`; else a failed `before_close` → `late`; else any failed or unknown note → `valid_with_notes`; else `valid`.

### Why the namespace is read from transaction history
Walrus Blob attributes (metadata) can be updated or removed later by the blob's owner. Reading the namespace from the
object's *current* state would prove nothing about the past. `extractMemoryWrites` decodes the BCS-encoded pure inputs of
the commit transaction, which never change. It also handles relayer batching: several blobs (even several accounts)
labelled in one transaction, grouped by the blob argument, with each `seal_encrypt_fence` applying to the blob that follows it.

## 5. Reveal and completeness **(app)**

- Before the market closes, only the namespace (tags + hash) is public. After close the app sets `revealed_at` and
  serves the canonical JSON at `/r/<hash>` and `/api/receipts/<hash>.json`. Paid takes are revealed to buyers on purchase.
- **Every seal is listed.** Profiles show all seals for the user tag: revealed, unrevealed and late. The app owns the
  Walrus Memory account and reveals automatically, so a missing reveal is an app failure. It is shown in red and, for
  tipster records, scored as the worst possible Brier (1.0).
- **One seal per (user, market, kind).** Duplicates are flagged and only the earliest valid one counts.
- Anyone can cross-check completeness: every seal is a Blob object owned by `MEMWAL_OWNER_ADDRESS` with a
  `memwal_namespace` attribute starting with `rcpt1:`.

## 6. Limits we state openly

- **History retention:** Sui full nodes prune old transactions. Tatum's docs promise ~3 days of Sui history. In our tests
  Tatum's gRPC served transactions 7, 30 and 90 days old (2026-10-22), and its JSON-RPC served 180 days but not 365.
  Evidence is captured at seal time and re-checked at settlement, and the evidence bundle (digest, checkpoint, timestamp)
  is stored so anyone can re-verify later on any full-history Sui source.
- **Trust in the relayer:** the managed Walrus Memory relayer sees plaintext during encryption and embedding.
  Seals reveal after close anyway, but this is disclosed.
- **Operator trust:** we operate the account. Completeness rules plus public chain state make omissions detectable, not impossible.
- **Restore is not forever:** `restore()` rebuilds the search index from blobs that still exist. Expired blobs are gone.
