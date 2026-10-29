CREATE TABLE `advisor_stats` (
	`user_id` text NOT NULL,
	`advisor_id` text NOT NULL,
	`n` integer NOT NULL,
	`mean_delta` real,
	`ci_low` real,
	`ci_high` real,
	`mean_abs_move` real,
	`verdict` text NOT NULL,
	`fair_test_n` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	PRIMARY KEY(`user_id`, `advisor_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`advisor_id`) REFERENCES `advisors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `advisors` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`url` text,
	`user_id` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `agent_rules` (
	`user_id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`weekly_budget_usdc` text DEFAULT '1' NOT NULL,
	`min_ci_low` real DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `blob_locator` (
	`blob_id_u256` text PRIMARY KEY NOT NULL,
	`blob_object_id` text NOT NULL,
	`previous_transaction` text,
	`end_epoch` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `crew_members` (
	`crew_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	PRIMARY KEY(`crew_id`, `user_id`),
	FOREIGN KEY (`crew_id`) REFERENCES `crews`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `crews` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`invite_code` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crews_invite_code_unique` ON `crews` (`invite_code`);--> statement-breakpoint
CREATE TABLE `episodes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`market_id` text NOT NULL,
	`status` text NOT NULL,
	`blind_seal_id` text NOT NULL,
	`informed_seal_id` text,
	`advisor_id` text,
	`fair_test` integer DEFAULT false NOT NULL,
	`advice_json` text,
	`advice_content_hash` text,
	`blind_bps` integer NOT NULL,
	`informed_bps` integer,
	`outcome` integer,
	`blind_brier` real,
	`informed_brier` real,
	`delta` real,
	`move` real,
	`settled_at` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`market_id`) REFERENCES `markets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`blind_seal_id`) REFERENCES `seals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`informed_seal_id`) REFERENCES `seals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`advisor_id`) REFERENCES `advisors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `episodes_user_market` ON `episodes` (`user_id`,`market_id`);--> statement-breakpoint
CREATE INDEX `episodes_user_advisor` ON `episodes` (`user_id`,`advisor_id`);--> statement-breakpoint
CREATE TABLE `markets` (
	`id` text PRIMARY KEY NOT NULL,
	`platform` text NOT NULL,
	`platform_market_id` text NOT NULL,
	`event_id` text,
	`question` text NOT NULL,
	`description` text,
	`rules_hash` text NOT NULL,
	`outcome` text DEFAULT 'Yes' NOT NULL,
	`league` text,
	`source_url` text,
	`image_url` text,
	`close_time` integer NOT NULL,
	`settle_time` integer,
	`upstream_status` text,
	`resolution_outcome` text,
	`resolved_at` integer,
	`resolution_tx_hash` text,
	`last_synced_at` integer,
	`curated_by` text,
	`raw_json` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`curated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `markets_platform_id` ON `markets` (`platform`,`platform_market_id`);--> statement-breakpoint
CREATE INDEX `markets_close` ON `markets` (`close_time`);--> statement-breakpoint
CREATE TABLE `memory_writes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`namespace` text NOT NULL,
	`kind` text NOT NULL,
	`text` text NOT NULL,
	`source_id` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`memwal_job_id` text,
	`walrus_blob_id` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer,
	`last_error` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `memory_writes_source` ON `memory_writes` (`kind`,`source_id`);--> statement-breakpoint
CREATE INDEX `memory_writes_status` ON `memory_writes` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE TABLE `purchases` (
	`id` text PRIMARY KEY NOT NULL,
	`buyer_id` text NOT NULL,
	`take_id` text NOT NULL,
	`amount_usdc` text NOT NULL,
	`payment_digest` text NOT NULL,
	`mode` text NOT NULL,
	`decision_json` text,
	`verified_at` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`buyer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`take_id`) REFERENCES `takes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `purchases_payment_digest_unique` ON `purchases` (`payment_digest`);--> statement-breakpoint
CREATE UNIQUE INDEX `purchases_buyer_take` ON `purchases` (`buyer_id`,`take_id`);--> statement-breakpoint
CREATE TABLE `seals` (
	`id` text PRIMARY KEY NOT NULL,
	`hash` text NOT NULL,
	`namespace` text NOT NULL,
	`kind` text NOT NULL,
	`user_id` text NOT NULL,
	`market_id` text NOT NULL,
	`forecast_json` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`memwal_job_id` text,
	`walrus_blob_id` text,
	`blob_object_id` text,
	`commit_digest` text,
	`commit_checkpoint` text,
	`commit_timestamp` integer,
	`verification_json` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer,
	`last_error` text,
	`revealed_at` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`market_id`) REFERENCES `markets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `seals_hash_unique` ON `seals` (`hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `seals_namespace_unique` ON `seals` (`namespace`);--> statement-breakpoint
CREATE INDEX `seals_status` ON `seals` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE INDEX `seals_user_market` ON `seals` (`user_id`,`market_id`);--> statement-breakpoint
CREATE TABLE `stat_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`reason` text NOT NULL,
	`json` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `takes` (
	`id` text PRIMARY KEY NOT NULL,
	`author_id` text NOT NULL,
	`advisor_id` text NOT NULL,
	`market_id` text NOT NULL,
	`seal_id` text NOT NULL,
	`probability_bps` integer NOT NULL,
	`text` text NOT NULL,
	`price_usdc` text DEFAULT '0' NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`advisor_id`) REFERENCES `advisors`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`market_id`) REFERENCES `markets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`seal_id`) REFERENCES `seals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `takes_author_market` ON `takes` (`author_id`,`market_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`handle` text NOT NULL,
	`display_name` text NOT NULL,
	`password_hash` text NOT NULL,
	`bio` text,
	`payout_address` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_handle_unique` ON `users` (`handle`);