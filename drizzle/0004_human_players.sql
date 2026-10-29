CREATE TABLE `arena_players` (
	`id` text PRIMARY KEY NOT NULL,
	`handle` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `arena_players_handle_unique` ON `arena_players` (`handle`);--> statement-breakpoint
ALTER TABLE `arena_forecasts` ADD `seal_namespace` text;--> statement-breakpoint
ALTER TABLE `arena_forecasts` ADD `seal_status` text;--> statement-breakpoint
ALTER TABLE `arena_forecasts` ADD `seal_job_id` text;--> statement-breakpoint
ALTER TABLE `arena_forecasts` ADD `walrus_blob_id` text;--> statement-breakpoint
ALTER TABLE `arena_forecasts` ADD `commit_digest` text;--> statement-breakpoint
ALTER TABLE `arena_forecasts` ADD `commit_timestamp_ms` integer;--> statement-breakpoint
ALTER TABLE `arena_forecasts` ADD `verification_json` text;--> statement-breakpoint
ALTER TABLE `arena_forecasts` ADD `seal_attempts` integer DEFAULT 0 NOT NULL;