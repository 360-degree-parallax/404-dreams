ALTER TABLE `guestbook` ADD `name` text DEFAULT 'ANON' NOT NULL;--> statement-breakpoint
ALTER TABLE `guestbook` ADD `password_hash` text;--> statement-breakpoint
ALTER TABLE `guestbook` ADD `password_salt` text;--> statement-breakpoint
ALTER TABLE `guestbook` ADD `failures` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `guestbook` ADD `locked_until` integer DEFAULT 0 NOT NULL;