CREATE TABLE `admin_credentials` (
	`id` integer PRIMARY KEY NOT NULL,
	`hash` text NOT NULL,
	`salt` text NOT NULL,
	`version` integer NOT NULL,
	`must_change` integer NOT NULL,
	`failures` integer NOT NULL,
	`locked_until` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `admin_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_admin_sessions_expires_at` ON `admin_sessions` (`expires_at`);