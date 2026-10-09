CREATE TABLE `guestbook` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`session_id` text NOT NULL,
	`view_id` text NOT NULL,
	`text` text NOT NULL,
	`image_key` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_guestbook_created_at` ON `guestbook` (`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_guestbook_view_id` ON `guestbook` (`view_id`);