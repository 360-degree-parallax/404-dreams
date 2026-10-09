CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`name` text NOT NULL,
	`session_id` text NOT NULL,
	`view_id` text NOT NULL,
	`source` text NOT NULL,
	`format` text NOT NULL,
	`palette` text NOT NULL,
	`colors` text NOT NULL,
	`ratio` text NOT NULL,
	`combo_key` text NOT NULL,
	`combo_label` text NOT NULL,
	`seed` integer NOT NULL,
	`weight` real NOT NULL,
	`detail` real NOT NULL,
	`spark` real NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_events_created_at` ON `events` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_events_view_name` ON `events` (`view_id`,`name`);