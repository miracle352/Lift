CREATE TABLE `arena_pay_digests` (
	`digest` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `arena_payouts` (
	`round_id` text PRIMARY KEY NOT NULL,
	`network` text NOT NULL,
	`status` text NOT NULL,
	`released_micros` integer DEFAULT 0 NOT NULL,
	`refunded_micros` integer DEFAULT 0 NOT NULL,
	`transfers_json` text DEFAULT '[]' NOT NULL,
	`digest` text,
	`error` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
