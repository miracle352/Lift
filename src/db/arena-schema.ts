import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/**
 * Arena tables (docs/ARENA.md). The database is a cache + work queue: forecasts are sealed in Merkle
 * batches on Walrus Memory (Sui mainnet), and agent episodes/lessons live in Walrus Memory too.
 * Times are integer ms. Probabilities are basis points (1..9999). Money is USDC micro-units (6 decimals).
 */
const createdAt = () => integer('created_at', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch('subsec') * 1000)`);
const updatedAt = () => integer('updated_at', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch('subsec') * 1000)`);

/** One round = one 15-minute window close time; every live asset market closing then. */
export const arenaRounds = sqliteTable(
  'arena_rounds',
  {
    id: text('id').primaryKey(), // "15m:<closeTime ISO>"
    windowStart: integer('window_start', { mode: 'timestamp_ms' }).notNull(),
    closeTime: integer('close_time', { mode: 'timestamp_ms' }).notNull(),
    lockAt: integer('lock_at', { mode: 'timestamp_ms' }).notNull(),
    status: text('status', { enum: ['locked', 'sealed', 'settled', 'void', 'failed'] }).notNull(),
    marketsSource: text('markets_source', { enum: ['tatum', 'fixture'] }).notNull().default('tatum'),
    error: text('error'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('arena_rounds_status_idx').on(t.status, t.closeTime)],
);

export const arenaMarkets = sqliteTable(
  'arena_markets',
  {
    id: text('id').primaryKey(), // `${roundId}:${asset}`
    roundId: text('round_id').notNull().references(() => arenaRounds.id),
    asset: text('asset').notNull(),
    conditionId: text('condition_id').notNull(),
    eventId: text('event_id').notNull(),
    question: text('question').notNull(),
    description: text('description').notNull(),
    rulesHash: text('rules_hash').notNull(),
    url: text('url').notNull(),
    upTokenId: text('up_token_id'),
    windowStart: integer('window_start', { mode: 'timestamp_ms' }).notNull(),
    closeTime: integer('close_time', { mode: 'timestamp_ms' }).notNull(),
    /** Polymarket UP price from Tatum at lock time (bps) */
    marketUpBps: integer('market_up_bps').notNull(),
    liquidity: integer('liquidity'),
    featuresJson: text('features_json').notNull(),
    bookJson: text('book_json'),
    resolution: text('resolution', { enum: ['UP', 'DOWN'] }),
    resolvedAt: integer('resolved_at', { mode: 'timestamp_ms' }),
    resolutionSource: text('resolution_source'),
  },
  (t) => [uniqueIndex('arena_markets_condition_idx').on(t.conditionId), index('arena_markets_round_idx').on(t.roundId)],
);

/** What each advisor said about each market (sealed as kind "take" in the round's take batch). */
export const arenaTakes = sqliteTable(
  'arena_takes',
  {
    marketId: text('market_id').notNull().references(() => arenaMarkets.id),
    advisorId: text('advisor_id').notNull(),
    advisorName: text('advisor_name').notNull().default(''),
    /** price a buyer pays for this take (USDC micro-units) */
    priceMicros: integer('price_micros').notNull().default(10000),
    probabilityBps: integer('probability_bps').notNull(),
    says: text('says').notNull(),
    inputsJson: text('inputs_json').notNull(),
    /** forecastHash of the sealed take */
    hash: text('hash').notNull(),
    forecastJson: text('forecast_json').notNull(),
    contentHash: text('content_hash').notNull(),
  },
  (t) => [primaryKey({ columns: [t.marketId, t.advisorId] })],
);

/** Sealed agent forecasts (blind + informed). id = forecastHash. */
export const arenaForecasts = sqliteTable(
  'arena_forecasts',
  {
    hash: text('hash').primaryKey(),
    roundId: text('round_id').notNull().references(() => arenaRounds.id),
    marketId: text('market_id').notNull().references(() => arenaMarkets.id),
    agentId: text('agent_id').notNull(),
    kind: text('kind', { enum: ['blind', 'informed'] }).notNull(),
    probabilityBps: integer('probability_bps').notNull(),
    forecastJson: text('forecast_json').notNull(),
    batchId: text('batch_id').references(() => arenaBatches.id),
    /** Human calls are sealed one by one (rcpt1 single seals, docs/PROOF.md) instead of in a round batch. */
    sealNamespace: text('seal_namespace'),
    sealStatus: text('seal_status', { enum: ['queued', 'submitted', 'stored', 'verified', 'failed'] }),
    sealJobId: text('seal_job_id'),
    walrusBlobId: text('walrus_blob_id'),
    commitDigest: text('commit_digest'),
    commitTimestampMs: integer('commit_timestamp_ms'),
    verificationJson: text('verification_json'),
    sealAttempts: integer('seal_attempts').notNull().default(0),
  },
  (t) => [uniqueIndex('arena_forecasts_unique_idx').on(t.marketId, t.agentId, t.kind), index('arena_forecasts_batch_idx').on(t.batchId)],
);

/** One Walrus Memory write per (round, phase): the Merkle root of all hashes in that phase. */
export const arenaBatches = sqliteTable(
  'arena_batches',
  {
    id: text('id').primaryKey(), // namespace rcptb1:<roundTag>:<b|i|t>:<root>
    roundId: text('round_id').notNull().references(() => arenaRounds.id),
    phase: text('phase', { enum: ['blind', 'informed', 'take'] }).notNull(),
    root: text('root').notNull(),
    leafCount: integer('leaf_count').notNull(),
    manifestJson: text('manifest_json').notNull(),
    status: text('status', { enum: ['queued', 'submitted', 'stored', 'on_chain', 'verified', 'failed'] }).notNull(),
    jobId: text('job_id'),
    walrusBlobId: text('walrus_blob_id'),
    blobObjectId: text('blob_object_id'),
    commitDigest: text('commit_digest'),
    commitTimestampMs: integer('commit_timestamp_ms'),
    checkpoint: text('checkpoint'),
    verificationJson: text('verification_json'),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: integer('next_attempt_at', { mode: 'timestamp_ms' }),
    error: text('error'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('arena_batches_round_phase_idx').on(t.roundId, t.phase), index('arena_batches_status_idx').on(t.status)],
);

/** Each agent's decision per market: what it bought (or why it declined) and how it settled. */
export const arenaPurchases = sqliteTable(
  'arena_purchases',
  {
    id: text('id').primaryKey(), // `${marketId}:${agentId}`
    roundId: text('round_id').notNull().references(() => arenaRounds.id),
    marketId: text('market_id').notNull().references(() => arenaMarkets.id),
    agentId: text('agent_id').notNull(),
    advisorId: text('advisor_id'),
    action: text('action', { enum: ['buy', 'decline'] }).notNull(),
    fairTest: integer('fair_test', { mode: 'boolean' }).notNull().default(false),
    reason: text('reason').notNull(),
    /** Walrus blob ids of recalled lessons that drove this decision (JSON array) */
    lessonBlobIdsJson: text('lesson_blob_ids_json').notNull().default('[]'),
    priceMicros: integer('price_micros').notNull().default(0),
    trustUsed: integer('trust_used_bps'),
    /** escrow lifecycle (pay-for-lift) */
    payStatus: text('pay_status', { enum: ['none', 'escrowed', 'released', 'refunded', 'failed'] }).notNull().default('none'),
    payNetwork: text('pay_network', { enum: ['sui:testnet', 'sui:mainnet', 'ledger'] }),
    /** MPP payment (buyer → clearinghouse) that escrowed this purchase */
    escrowDigest: text('escrow_digest'),
    settleDigest: text('settle_digest'),
    createdAt: createdAt(),
  },
  (t) => [index('arena_purchases_round_idx').on(t.roundId), index('arena_purchases_pay_idx').on(t.payStatus)],
);

/** Settled (agent, market) episodes — also written to the agent's Walrus Memory namespace. */
export const arenaEpisodes = sqliteTable(
  'arena_episodes',
  {
    id: text('id').primaryKey(), // `${marketId}:${agentId}`
    roundId: text('round_id').notNull().references(() => arenaRounds.id),
    marketId: text('market_id').notNull().references(() => arenaMarkets.id),
    agentId: text('agent_id').notNull(),
    asset: text('asset').notNull(),
    advisorId: text('advisor_id').notNull(),
    fairTest: integer('fair_test', { mode: 'boolean' }).notNull(),
    blindBps: integer('blind_bps').notNull(),
    adviceBps: integer('advice_bps').notNull(),
    informedBps: integer('informed_bps').notNull(),
    outcome: integer('outcome').notNull(), // 1 = UP
    /** realized Brier change (blind − informed), x1e6 integer */
    deltaMicro: integer('delta_micro').notNull(),
    memoryStatus: text('memory_status', { enum: ['pending', 'submitted', 'stored', 'failed', 'skipped'] }).notNull().default('pending'),
    memoryJobId: text('memory_job_id'),
    walrusBlobId: text('walrus_blob_id'),
    settledAt: createdAt(),
  },
  (t) => [index('arena_episodes_agent_idx').on(t.agentId, t.advisorId), index('arena_episodes_memory_idx').on(t.memoryStatus)],
);

/** Lessons (verdict changes) per agent × advisor, written to Walrus Memory and recalled before buying. */
export const arenaLessons = sqliteTable(
  'arena_lessons',
  {
    id: text('id').primaryKey(),
    agentId: text('agent_id').notNull(),
    advisorId: text('advisor_id').notNull(),
    verdict: text('verdict').notNull(),
    text: text('text').notNull(),
    roundId: text('round_id').notNull(),
    memoryStatus: text('memory_status', { enum: ['pending', 'submitted', 'stored', 'failed'] }).notNull().default('pending'),
    memoryJobId: text('memory_job_id'),
    walrusBlobId: text('walrus_blob_id'),
    createdAt: createdAt(),
  },
  (t) => [index('arena_lessons_agent_idx').on(t.agentId, t.advisorId, t.createdAt)],
);

/** Every Tatum Prediction API call with its documented credit cost (budget enforcement + blog numbers). */
export const tatumCalls = sqliteTable(
  'tatum_calls',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    at: createdAt(),
    endpoint: text('endpoint').notNull(),
    path: text('path').notNull(),
    credits: integer('credits').notNull(),
    status: integer('status').notNull(),
    ms: integer('ms').notNull(),
  },
  (t) => [index('tatum_calls_at_idx').on(t.at)],
);

/** Append-only public feed (SSE) of everything the arena does. */
export const arenaEvents = sqliteTable(
  'arena_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    at: createdAt(),
    roundId: text('round_id'),
    type: text('type').notNull(),
    agentId: text('agent_id'),
    advisorId: text('advisor_id'),
    payloadJson: text('payload_json').notNull(),
  },
  (t) => [index('arena_events_round_idx').on(t.roundId)],
);

/** Replay protection for MPP payments (each Sui payment digest pays for exactly one request). */
export const arenaPayDigests = sqliteTable('arena_pay_digests', {
  digest: text('digest').primaryKey(),
  at: createdAt(),
});

/** On-chain pay-for-lift settlement transactions (one PTB per round from the clearinghouse). */
export const arenaPayouts = sqliteTable('arena_payouts', {
  roundId: text('round_id').primaryKey(),
  network: text('network').notNull(),
  status: text('status', { enum: ['pending', 'sent', 'failed', 'empty'] }).notNull(),
  releasedMicros: integer('released_micros').notNull().default(0),
  refundedMicros: integer('refunded_micros').notNull().default(0),
  transfersJson: text('transfers_json').notNull().default('[]'),
  digest: text('digest'),
  error: text('error'),
  createdAt: createdAt(),
});

/**
 * Open advisor marketplace: anyone can register an HTTP endpoint that returns takes. Takes are sealed like the
 * built-in advisors'; buyers pay over MPP; the advisor's payout address is paid only when its take helped.
 */
export const arenaAdvisors = sqliteTable('arena_advisors', {
  id: text('id').primaryKey(), // "x-<slug>"
  name: text('name').notNull(),
  pitch: text('pitch').notNull(),
  endpointUrl: text('endpoint_url').notNull(),
  payoutAddress: text('payout_address').notNull(),
  priceMicros: integer('price_micros').notNull(),
  contact: text('contact'),
  status: text('status', { enum: ['active', 'paused', 'failing'] }).notNull().default('active'),
  consecutiveFailures: integer('consecutive_failures').notNull().default(0),
  lastError: text('last_error'),
  lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }),
  createdAt: createdAt(),
});

/** People playing the arena. Auth = bearer token (only its sha256 is stored). */
export const arenaPlayers = sqliteTable('arena_players', {
  id: text('id').primaryKey(), // uuid; forecasts use user = "human:<id>"
  handle: text('handle').notNull().unique(),
  tokenHash: text('token_hash').notNull(),
  createdAt: createdAt(),
});
