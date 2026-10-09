CREATE TABLE `visits` (
	`session_id` text PRIMARY KEY NOT NULL,
	`first_at` integer NOT NULL,
	`last_at` integer NOT NULL,
	`ip` text,
	`channel` text NOT NULL,
	`medium` text NOT NULL,
	`campaign` text NOT NULL,
	`content` text NOT NULL,
	`referrer` text NOT NULL,
	`evidence` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_visits_first_at` ON `visits` (`first_at`);