ALTER TABLE `companies` ADD `sort_order` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `companies` ADD `is_pinned` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `credits` ADD `partial_credit_accumulator` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `deadlines` ADD `auto_completed_task_ids` text;