# Sui via Tatum: what works (tested 2026-10-21/22)

## Use native gRPC through `src/lib/sui.ts`

| Approach | Result |
|---|---|
| Sui JSON-RPC on public fullnodes | `Method not found. JSON-RPC on public fullnodes has been deprecated. Please migrate to gRPC or GraphQL` |
| Tatum JSON-RPC `https://sui-mainnet.gateway.tatum.io` | worked on 10-21, then `-16503 No healthy upstream available` for **every** method on 10-22 |
| `SuiGrpcClient({ baseUrl: 'https://sui-mainnet-grpc.gateway.tatum.io' })` (default gRPC-web fetch transport) | fails: `unexpected response content type: application/grpc` |
| `SuiGrpcClient({ transport: new GrpcTransport({ host: 'sui-mainnet-grpc.gateway.tatum.io:443', channelCredentials: ChannelCredentials.createSsl(), meta: { 'x-api-key': KEY } }) })` | **works**: getTransaction ~0.4–0.6 s, getObject ~75 ms |

- Auth: `x-api-key` gRPC metadata. Without a key, Tatum allows ~5 calls/min and returns HTTP 429 (`RpcError UNAVAILABLE`).
  The free plan with a key is 3 req/s, 100k credits/month.
- `withSuiRetry` retries UNAVAILABLE / RESOURCE_EXHAUSTED / 429 / "No healthy upstream" with exponential backoff.
- Server/Node only (`@grpc/grpc-js`); listed in `serverExternalPackages`.

## Retention (how far back you can read transactions)
Tatum's docs say only ~3 days of Sui history. Measured on 2026-10-22: gRPC `getTransaction` served transactions 7, 30 and
90 days old; JSON-RPC (10-21) served 180 days, not 365. Capture seal evidence at write time and store it.

## Core API shapes we rely on (recorded in `tests/fixtures/sui/`)
- `client.core.getTransaction({ digest, include: { transaction: true, effects: true } })` →
  `{ $kind: 'Transaction', Transaction: { digest, timestampMs: number, checkpoint: string, status: { success, error }, transaction: { inputs, commands } } }`.
  Pure inputs are `{ $kind: 'Pure', Pure: { bytes: '<base64 BCS>' } }`. Strings decode with `bcs.string().parse(fromBase64(bytes))`.
- `client.core.getObject({ objectId, include: { json: true, previousTransaction: true } })` → `{ object: { objectId, version, owner, type, previousTransaction, json } }`.
  A Walrus Blob's `json`: `{ blob_id: '<u256 decimal>', size, registered_epoch, certified_epoch, storage: { start_epoch, end_epoch, storage_size }, deletable }`.
- `client.core.listOwnedObjects({ owner, type, limit, cursor, include })` → `{ objects, cursor, hasNextPage }`, **ordered by object id, not time**.
- Walrus Blob type on mainnet: `0xfdc88f7d7cf30afab2f82e8380d11ee8f70efb90e863d1de8616fae1bb09ea77::blob::Blob`.
- Blob metadata lives in a dynamic field keyed by `b"metadata"`: id = `deriveDynamicFieldID(blobId, 'vector<u8>', bcs.vector(bcs.u8()).serialize([...'metadata' bytes]).toBytes())`.
  Its `json.value.metadata.contents` is `[{ key, value }]` (current state, not proof).

## What one Walrus Memory write looks like on Sui
The relayer uploads the blob, then sends one PTB that, per blob:
`account::seal_encrypt_fence(<bytes>, <registry>, <account>)` → `blob::insert_or_update_metadata_pair(blob, key, value)` ×N
(`memwal_namespace`, `memwal_owner`, `memwal_package_id`, `memwal_agent_id`) → `TransferObjects([blob], owner)`.
The relayer may batch several blobs into one PTB. `memwal_job_id` is set in an earlier transaction.

## Links
- Explorer: `https://suiscan.xyz/mainnet/tx/<digest>`, `https://suiscan.xyz/mainnet/object/<id>`
- Tatum Sui gRPC docs: https://docs.tatum.io/reference/sui-grpc · JSON-RPC migration guide: https://docs.tatum.io/docs/sui-migration-guide-from-json-rpc-to-grpc
