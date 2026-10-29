CREATE TABLE `arena_advisors` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`pitch` text NOT NULL,
	`endpoint_url` text NOT NULL,
	`payout_address` text NOT NULL,
	`price_micros` integer NOT NULL,
	`contact` text,
	`status` text DEFAULT 'active' NOT NULL,
	`consecutive_failures` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`last_seen_at` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `arena_takes` ADD `advisor_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `arena_takes` ADD `price_micros` integer DEFAULT 10000 NOT NULL;