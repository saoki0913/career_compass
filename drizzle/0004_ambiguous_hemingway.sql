CREATE TABLE `motivation_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`guest_id` text,
	`company_id` text NOT NULL,
	`messages` text NOT NULL,
	`question_count` integer DEFAULT 0,
	`status` text DEFAULT 'in_progress',
	`motivation_scores` text,
	`generated_draft` text,
	`char_limit_type` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`guest_id`) REFERENCES `guest_users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
DROP INDEX "calendar_settings_user_id_unique";--> statement-breakpoint
DROP INDEX "credits_user_id_unique";--> statement-breakpoint
DROP INDEX "guest_users_device_token_unique";--> statement-breakpoint
DROP INDEX "notification_settings_user_id_unique";--> statement-breakpoint
DROP INDEX "sessions_token_unique";--> statement-breakpoint
DROP INDEX "users_email_unique";--> statement-breakpoint
DROP INDEX "user_profiles_user_id_unique";--> statement-breakpoint
ALTER TABLE `companies` ALTER COLUMN "status" TO "status" text DEFAULT 'inbox';--> statement-breakpoint
CREATE UNIQUE INDEX `calendar_settings_user_id_unique` ON `calendar_settings` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `credits_user_id_unique` ON `credits` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `guest_users_device_token_unique` ON `guest_users` (`device_token`);--> statement-breakpoint
CREATE UNIQUE INDEX `notification_settings_user_id_unique` ON `notification_settings` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_unique` ON `sessions` (`token`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_profiles_user_id_unique` ON `user_profiles` (`user_id`);--> statement-breakpoint
ALTER TABLE `gakuchika_conversations` ADD `star_scores` text;