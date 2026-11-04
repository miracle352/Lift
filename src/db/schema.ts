import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/**
 * Data model. SQLite/libSQL: a local file in dev and on the arena server.
 * The database is a working cache + queue. The durable record of every forecast is its seal on
 * Walrus + Sui, and `pnpm arena rebuild` restores agent memory from Walrus Memory.
 *
 * Times are integer milliseconds (drizzle `timestamp_ms` mode gives you Date objects).
 */
const id = () => text('id').primaryKey();
const createdAt = () => integer('created_at', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch('subsec') * 1000)`);
const updatedAt = () => integer('updated_at', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch('subsec') * 1000)`);

export const users = sqliteTable('users', {
  id: id(), // uuid; also the `user` field inside sealed forecasts — never change it
  handle: text('handle').notNull().unique(), // lowercase, [a-z0-9_]{3,20}
  displayName: text('display_name').notNull(),
  passwordHash: text('password_hash').notNull(), // scrypt (node:crypto), "scrypt$N$r$p$salt$hash"
  bio: text('bio'),
  /** Sui address that receives USDC when this user sells takes . */
  payoutAddress: text('payout_address'),
  createdAt: createdAt(),
});

export const crews = sqliteTable('crews', {
  id: id(),
  name: text('name').notNull(),
  inviteCode: text('invite_code').notNull().unique(),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
});

export const crewMembers = sqliteTable(
  'crew_members',
  {
    crewId: text('crew_id').notNull().references(() => crews.id),
    userId: text('user_id').notNull().references(() => users.id),
    joinedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.crewId, t.userId] })],
);

/** Curated binary markets from Tatum's Prediction API. id = `${platform}:${platformMarketId}`. */
export const markets = sqliteTable(
  'markets',
  {
    id: id(),
    platform: text('platform', { enum: ['polymarket', 'kalshi'] }).notNull(),
    platformMarketId: text('platform_market_id').notNull(),
    eventId: text('event_id'),
    question: text('question').notNull(),
    description: text('description'),
    rulesHash: text('rules_hash').notNull(),
    /** Outcome name the app asks about (e.g. "Yes"); forecasts are P(outcome). */
    outcome: text('outcome').notNull().default('Yes'),
    league: text('league'), // free text from curation, e.g. "EPL", "UCL"
    sourceUrl: text('source_url'),
    imageUrl: text('image_url'),
    closeTime: integer('close_time', { mode: 'timestamp_ms' }).notNull(),
    settleTime: integer('settle_time', { mode: 'timestamp_ms' }),
    upstreamStatus: text('upstream_status'),
    resolutionOutcome: text('resolution_outcome'), // winning outcome name once resolved
    resolvedAt: integer('resolved_at', { mode: 'timestamp_ms' }),
    resolutionTxHash: text('resolution_tx_hash'),
    lastSyncedAt: integer('last_synced_at', { mode: 'timestamp_ms' }),
    curatedBy: text('curated_by').references(() => users.id),
    rawJson: text('raw_json'), // last Tatum payload, for debugging
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('markets_platform_id').on(t.platform, t.platformMarketId), index('markets_close').on(t.closeTime)],
);

/**
 * Anyone or anything whose advice can be shown between the blind and informed locks.
 * id examples: "market:polymarket", "whale:0xabc…", "user:<userId>" (tipster/crew), "pundit:@handle".
 */
export const advisors = sqliteTable('advisors', {
  id: id(),
  kind: text('kind', { enum: ['market', 'whale', 'tipster', 'pundit', 'crew'] }).notNull(),
  label: text('label').notNull(),
  url: text('url'),
  userId: text('user_id').references(() => users.id),
  createdAt: createdAt(),
});

/**
 * Every hash ever committed to Walrus Memory. `forecastJson` contains the salt: it is secret until
 * `revealedAt` (after the market closes, or immediately to buyers for paid takes).
 */
export const seals = sqliteTable(
  'seals',
  {
    id: id(),
    hash: text('hash').notNull().unique(),
    namespace: text('namespace').notNull().unique(),
    kind: text('kind', { enum: ['blind', 'informed', 'take'] }).notNull(),
    userId: text('user_id').notNull().references(() => users.id),
    marketId: text('market_id').notNull().references(() => markets.id),
    forecastJson: text('forecast_json').notNull(), // canonical JSON (JCS) of ForecastV1
    status: text('status', { enum: ['queued', 'accepted', 'stored', 'onchain', 'verified', 'late', 'failed'] }).notNull().default('queued'),
    memwalJobId: text('memwal_job_id'),
    walrusBlobId: text('walrus_blob_id'), // base64url, from the relayer
    blobObjectId: text('blob_object_id'),
    commitDigest: text('commit_digest'),
    commitCheckpoint: text('commit_checkpoint'),
    commitTimestamp: integer('commit_timestamp', { mode: 'timestamp_ms' }),
    verificationJson: text('verification_json'), // SealVerification from src/core/evidence.ts
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: integer('next_attempt_at', { mode: 'timestamp_ms' }),
    lastError: text('last_error'),
    revealedAt: integer('revealed_at', { mode: 'timestamp_ms' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('seals_status').on(t.status, t.nextAttemptAt), index('seals_user_market').on(t.userId, t.marketId)],
);

/** One per user per market: blind lock -> one piece of advice -> informed lock -> settlement. */
export const episodes = sqliteTable(
  'episodes',
  {
    id: id(),
    userId: text('user_id').notNull().references(() => users.id),
    marketId: text('market_id').notNull().references(() => markets.id),
    status: text('status', { enum: ['blind_locked', 'advice_shown', 'complete', 'settled', 'void'] }).notNull(),
    blindSealId: text('blind_seal_id').notNull().references(() => seals.id),
    informedSealId: text('informed_seal_id').references(() => seals.id),
    advisorId: text('advisor_id').references(() => advisors.id),
    fairTest: integer('fair_test', { mode: 'boolean' }).notNull().default(false),
    /** Exactly what was shown (its canonical-JSON hash is AdviceRef.contentHash in the informed seal). */
    adviceJson: text('advice_json'),
    adviceContentHash: text('advice_content_hash'),
    blindBps: integer('blind_bps').notNull(),
    informedBps: integer('informed_bps'),
    outcome: integer('outcome'), // 0 | 1 once settled
    blindBrier: real('blind_brier'),
    informedBrier: real('informed_brier'),
    delta: real('delta'),
    move: real('move'),
    settledAt: integer('settled_at', { mode: 'timestamp_ms' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('episodes_user_market').on(t.userId, t.marketId), index('episodes_user_advisor').on(t.userId, t.advisorId)],
);

/** Tipster takes: sealed advice that others can read (free) or buy. */
export const takes = sqliteTable(
  'takes',
  {
    id: id(),
    authorId: text('author_id').notNull().references(() => users.id),
    advisorId: text('advisor_id').notNull().references(() => advisors.id),
    marketId: text('market_id').notNull().references(() => markets.id),
    sealId: text('seal_id').notNull().references(() => seals.id),
    probabilityBps: integer('probability_bps').notNull(),
    text: text('text').notNull(),
    priceUsdc: text('price_usdc').notNull().default('0'), // decimal string, "0" = free
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('takes_author_market').on(t.authorId, t.marketId)],
);

/** Outbox for learning memories (episodes, lessons) written to Walrus Memory by the tick worker. */
export const memoryWrites = sqliteTable(
  'memory_writes',
  {
    id: id(),
    userId: text('user_id').notNull().references(() => users.id),
    namespace: text('namespace').notNull(),
    kind: text('kind', { enum: ['episode', 'lesson'] }).notNull(),
    text: text('text').notNull(),
    sourceId: text('source_id'), // episode id or lesson key, for idempotency
    status: text('status', { enum: ['queued', 'accepted', 'stored', 'failed'] }).notNull().default('queued'),
    memwalJobId: text('memwal_job_id'),
    walrusBlobId: text('walrus_blob_id'),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: integer('next_attempt_at', { mode: 'timestamp_ms' }),
    lastError: text('last_error'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('memory_writes_source').on(t.kind, t.sourceId), index('memory_writes_status').on(t.status, t.nextAttemptAt)],
);

/** Deterministic per-user advisor stats (recomputed from settled episodes). */
export const advisorStats = sqliteTable(
  'advisor_stats',
  {
    userId: text('user_id').notNull().references(() => users.id),
    advisorId: text('advisor_id').notNull().references(() => advisors.id),
    n: integer('n').notNull(),
    meanDelta: real('mean_delta'),
    ciLow: real('ci_low'),
    ciHigh: real('ci_high'),
    meanAbsMove: real('mean_abs_move'),
    verdict: text('verdict').notNull(),
    fairTestN: integer('fair_test_n').notNull().default(0),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.advisorId] })],
);

/** Point-in-time copies of a user's advisor ranking, for the day-1 vs day-N demo. */
export const statSnapshots = sqliteTable('stat_snapshots', {
  id: id(),
  userId: text('user_id').notNull().references(() => users.id),
  reason: text('reason').notNull(), // e.g. "daily", "after-settlement"
  json: text('json').notNull(),
  createdAt: createdAt(),
});

/** Cache for src/lib/seal-evidence.ts locateBlobObject (u256 blob id -> Sui Blob object). */
export const blobLocator = sqliteTable('blob_locator', {
  blobIdU256: text('blob_id_u256').primaryKey(),
  blobObjectId: text('blob_object_id').notNull(),
  previousTransaction: text('previous_transaction'),
  endEpoch: integer('end_epoch'),
  seenAt: createdAt(),
});

// ---------- agent payments ----------

export const agentRules = sqliteTable('agent_rules', {
  userId: text('user_id').primaryKey().references(() => users.id),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
  weeklyBudgetUsdc: text('weekly_budget_usdc').notNull().default('1'),
  /** Buy a paid take only if this advisor's CI lower bound for this user is above this value. */
  minCiLow: real('min_ci_low').notNull().default(0),
  updatedAt: updatedAt(),
});

export const purchases = sqliteTable(
  'purchases',
  {
    id: id(),
    buyerId: text('buyer_id').notNull().references(() => users.id),
    takeId: text('take_id').notNull().references(() => takes.id),
    amountUsdc: text('amount_usdc').notNull(),
    paymentDigest: text('payment_digest').notNull().unique(),
    /** "auto" when the agent bought it under agent_rules, "manual" otherwise. */
    mode: text('mode', { enum: ['auto', 'manual'] }).notNull(),
    decisionJson: text('decision_json'), // the stats that justified an auto-buy
    verifiedAt: integer('verified_at', { mode: 'timestamp_ms' }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('purchases_buyer_take').on(t.buyerId, t.takeId)],
);
export * from './arena-schema';
