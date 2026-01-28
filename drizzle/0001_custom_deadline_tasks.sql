-- Add auto_completed_task_ids field to deadlines table
ALTER TABLE `deadlines` ADD `auto_completed_task_ids` text;

-- Add sort_order to companies with default
ALTER TABLE `companies` ADD `sort_order` integer DEFAULT 0;

-- Add is_pinned to companies with default
ALTER TABLE `companies` ADD `is_pinned` integer DEFAULT 0;

-- Add partial_credit_accumulator to credits with default
ALTER TABLE `credits` ADD `partial_credit_accumulator` integer DEFAULT 0;

-- Update existing rows to have default values
UPDATE `companies` SET `sort_order` = 0 WHERE `sort_order` IS NULL;
UPDATE `companies` SET `is_pinned` = 0 WHERE `is_pinned` IS NULL;
UPDATE `credits` SET `partial_credit_accumulator` = 0 WHERE `partial_credit_accumulator` IS NULL;
