CREATE TABLE `arena_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`round_id` text NOT NULL,
	`phase` text NOT NULL,
	`root` text NOT NULL,
	`leaf_count` integer NOT NULL,
	`manifest_json` text NOT NULL,
	`status` text NOT NULL,
	`job_id` text,
	`walrus_blob_id` text,
	`blob_object_id` text,
	`commit_digest` text,
	`commit_timestamp_ms` integer,
	`checkpoint` text,
	`verification_json` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer,
	`error` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`round_id`) REFERENCES `arena_rounds`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `arena_batches_round_phase_idx` ON `arena_batches` (`round_id`,`phase`);--> statement-breakpoint
CREATE INDEX `arena_batches_status_idx` ON `arena_batches` (`status`);--> statement-breakpoint
CREATE TABLE `arena_episodes` (
	`id` text PRIMARY KEY NOT NULL,
	`round_id` text NOT NULL,
	`market_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`asset` text NOT NULL,
	`advisor_id` text NOT NULL,
	`fair_test` integer NOT NULL,
	`blind_bps` integer NOT NULL,
	`advice_bps` integer NOT NULL,
	`informed_bps` integer NOT NULL,
	`outcome` integer NOT NULL,
	`delta_micro` integer NOT NULL,
	`memory_status` text DEFAULT 'pending' NOT NULL,
	`memory_job_id` text,
	`walrus_blob_id` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`round_id`) REFERENCES `arena_rounds`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`market_id`) REFERENCES `arena_markets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `arena_episodes_agent_idx` ON `arena_episodes` (`agent_id`,`advisor_id`);--> statement-breakpoint
CREATE INDEX `arena_episodes_memory_idx` ON `arena_episodes` (`memory_status`);--> statement-breakpoint
CREATE TABLE `arena_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`round_id` text,
	`type` text NOT NULL,
	`agent_id` text,
	`advisor_id` text,
	`payload_json` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `arena_events_round_idx` ON `arena_events` (`round_id`);--> statement-breakpoint
CREATE TABLE `arena_forecasts` (
	`hash` text PRIMARY KEY NOT NULL,
	`round_id` text NOT NULL,
	`market_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`kind` text NOT NULL,
	`probability_bps` integer NOT NULL,
	`forecast_json` text NOT NULL,
	`batch_id` text,
	FOREIGN KEY (`round_id`) REFERENCES `arena_rounds`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`market_id`) REFERENCES `arena_markets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`batch_id`) REFERENCES `arena_batches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `arena_forecasts_unique_idx` ON `arena_forecasts` (`market_id`,`agent_id`,`kind`);--> statement-breakpoint
CREATE INDEX `arena_forecasts_batch_idx` ON `arena_forecasts` (`batch_id`);--> statement-breakpoint
CREATE TABLE `arena_lessons` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`advisor_id` text NOT NULL,
	`verdict` text NOT NULL,
	`text` text NOT NULL,
	`round_id` text NOT NULL,
	`memory_status` text DEFAULT 'pending' NOT NULL,
	`memory_job_id` text,
	`walrus_blob_id` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `arena_lessons_agent_idx` ON `arena_lessons` (`agent_id`,`advisor_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `arena_markets` (
	`id` text PRIMARY KEY NOT NULL,
	`round_id` text NOT NULL,
	`asset` text NOT NULL,
	`condition_id` text NOT NULL,
	`event_id` text NOT NULL,
	`question` text NOT NULL,
	`description` text NOT NULL,
	`rules_hash` text NOT NULL,
	`url` text NOT NULL,
	`up_token_id` text,
	`window_start` integer NOT NULL,
	`close_time` integer NOT NULL,
	`market_up_bps` integer NOT NULL,
	`liquidity` integer,
	`features_json` text NOT NULL,
	`book_json` text,
	`resolution` text,
	`resolved_at` integer,
	`resolution_source` text,
	FOREIGN KEY (`round_id`) REFERENCES `arena_rounds`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `arena_markets_condition_idx` ON `arena_markets` (`condition_id`);--> statement-breakpoint
CREATE INDEX `arena_markets_round_idx` ON `arena_markets` (`round_id`);--> statement-breakpoint
CREATE TABLE `arena_purchases` (
	`id` text PRIMARY KEY NOT NULL,
	`round_id` text NOT NULL,
	`market_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`advisor_id` text,
	`action` text NOT NULL,
	`fair_test` integer DEFAULT false NOT NULL,
	`reason` text NOT NULL,
	`lesson_blob_ids_json` text DEFAULT '[]' NOT NULL,
	`price_micros` integer DEFAULT 0 NOT NULL,
	`trust_used_bps` integer,
	`pay_status` text DEFAULT 'none' NOT NULL,
	`pay_network` text,
	`escrow_digest` text,
	`settle_digest` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`round_id`) REFERENCES `arena_rounds`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`market_id`) REFERENCES `arena_markets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `arena_purchases_round_idx` ON `arena_purchases` (`round_id`);--> statement-breakpoint
CREATE INDEX `arena_purchases_pay_idx` ON `arena_purchases` (`pay_status`);--> statement-breakpoint
CREATE TABLE `arena_rounds` (
	`id` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`close_time` integer NOT NULL,
	`lock_at` integer NOT NULL,
	`status` text NOT NULL,
	`markets_source` text DEFAULT 'tatum' NOT NULL,
	`error` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `arena_rounds_status_idx` ON `arena_rounds` (`status`,`close_time`);--> statement-breakpoint
CREATE TABLE `arena_takes` (
	`market_id` text NOT NULL,
	`advisor_id` text NOT NULL,
	`probability_bps` integer NOT NULL,
	`says` text NOT NULL,
	`inputs_json` text NOT NULL,
	`hash` text NOT NULL,
	`forecast_json` text NOT NULL,
	`content_hash` text NOT NULL,
	PRIMARY KEY(`market_id`, `advisor_id`),
	FOREIGN KEY (`market_id`) REFERENCES `arena_markets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tatum_calls` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`endpoint` text NOT NULL,
	`path` text NOT NULL,
	`credits` integer NOT NULL,
	`status` integer NOT NULL,
	`ms` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tatum_calls_at_idx` ON `tatum_calls` (`created_at`);