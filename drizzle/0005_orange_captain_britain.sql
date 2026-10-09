CREATE TABLE `guestbook_likes` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`voter_hash` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_guestbook_like_voter` ON `guestbook_likes` (`post_id`,`voter_hash`);