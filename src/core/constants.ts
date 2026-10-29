/**
 * Network constants verified on Sui mainnet on 2026-10-21/22.
 * Sources: MystenLabs/MemWal docs/contract/overview.md, and live transactions read through
 * Tatum's Sui gRPC gateway (see tests/fixtures/sui/README.md).
 */

/** Walrus Memory (MemWal) production deployment on Sui mainnet. */
export const MEMWAL_MAINNET = {
  packageId: '0xe7c16fbea0560e7057e2bf7422feaa4fb313749fc69c9e9092fac7a33b81d7f5',
  registryId: '0x8bf82c9e09e36b8d1c38298f68b7cb68e7b8762887e7592add9986d5e9cf199f',
  relayerUrl: 'https://relayer.memory.walrus.xyz',
} as const;

/** Walrus system package as seen in live Blob types and metadata calls. */
export const WALRUS_MAINNET = {
  packageId: '0xfdc88f7d7cf30afab2f82e8380d11ee8f70efb90e863d1de8616fae1bb09ea77',
  blobType: '0xfdc88f7d7cf30afab2f82e8380d11ee8f70efb90e863d1de8616fae1bb09ea77::blob::Blob',
} as const;

/** Tatum endpoints. Sui JSON-RPC is deprecated network-wide; use gRPC. */
export const TATUM = {
  apiBaseUrl: 'https://api.tatum.io',
  suiGrpcHost: 'sui-mainnet-grpc.gateway.tatum.io:443',
} as const;

/** Metadata keys the Walrus Memory relayer writes onto every Blob object. */
export const MEMWAL_LABEL = {
  namespace: 'memwal_namespace',
  owner: 'memwal_owner',
  packageId: 'memwal_package_id',
  agentId: 'memwal_agent_id',
  jobId: 'memwal_job_id',
} as const;

/** Receipts protocol constants. Changing any of these changes every hash: bump the version instead. */
export const RECEIPTS = {
  forecastSchema: 'receipts.forecast.v1',
  sealNamespacePrefix: 'rcpt1',
  /** hex chars kept from sha256 for user/market tags in namespaces */
  tagHexLength: 12,
  /** Walrus Memory namespaces are capped at 255 UTF-8 bytes. */
  maxNamespaceBytes: 255,
} as const;
