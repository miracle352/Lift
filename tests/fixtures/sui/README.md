# Recorded Sui mainnet fixtures (gRPC core API)

Recorded 2026-10-22T12:29:59.962Z from `sui-mainnet-grpc.gateway.tatum.io:443` (Tatum, native gRPC, anonymous)
with `SuiGrpcClient` from @mysten/sui 2.35.0 over `@protobuf-ts/grpc-transport`.

Public on-chain data written by another Walrus Memory app (namespace `pb-wallie`); used only for offline tests.
Serialisation: bigint -> string, Uint8Array -> `{ "$bytes": "<base64>" }` (see `tests/helpers/fixtures.ts`).

| file | call |
|---|---|
| grpc-getTransaction.json | `core.getTransaction({ digest: '4xK2gvv6Gv3BYcbpDFP15pqMxLNxt3zuKsuamiUq9JBJ', include: { transaction, effects, objectTypes } })` |
| grpc-getObject-blob.json | `core.getObject({ objectId: '0x37bd39b0ba11aa73fb27f383671b39aff23a114d0666759929e8fb661f2db80e', include: { json, previousTransaction } })` |
| grpc-getObject-blob-metadata.json | metadata dynamic field of that blob, id = `deriveDynamicFieldID(blob, 'vector<u8>', bcs(b"metadata"))` = `0xbade5098e19e997b5dfa4d32e0549a601be15eae178696c9b934b3ee506b5390` |
| grpc-listOwnedObjects-blobs.json | `core.listOwnedObjects({ owner: '0x7643a4bf08bb984e9c7cf7a2157c7b87d206dccfd9c899f0205e5d77ff8fd451', type: Blob, limit: 5, include: { json, previousTransaction } })` |
| synthetic-tx-seal.json | **synthetic**: grpc-getTransaction with the namespace input replaced by the sample forecast's `rcpt1:` namespace (tests/helpers/sample-forecast.ts) |
| synthetic-tx-two-blobs.json | **synthetic**: grpc-getTransaction plus a second blob fenced for a second account, to test per-blob grouping (relayer batching) |

Regenerate the synthetic files with `pnpm fixtures:synthetic` (tests/fixtures/sui/make-synthetic.ts). Never hand-edit them.
