-- Phase 5A: Calendar & Deadline Improvements Schema Changes

-- 1. deadlines: add statusOverride column
ALTER TABLE "deadlines" ADD COLUMN IF NOT EXISTS "status_override" text;
--> statement-breakpoint

-- 2. tasks: add dependency columns
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "depends_on_task_id" text;
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "is_blocked" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "template_key" text;
--> statement-breakpoint

-- 3. tasks: self-referencing FK for depends_on_task_id
DO $$ BEGIN
  ALTER TABLE "tasks" ADD CONSTRAINT "tasks_depends_on_task_id_tasks_id_fk"
    FOREIGN KEY ("depends_on_task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- 4. tasks: index on depends_on_task_id
CREATE INDEX IF NOT EXISTS "tasks_depends_on_task_id_idx" ON "tasks" USING btree ("depends_on_task_id");
--> statement-breakpoint

-- 5. notification_settings: add deadline_reminder_overrides
ALTER TABLE "notification_settings" ADD COLUMN IF NOT EXISTS "deadline_reminder_overrides" text;
--> statement-breakpoint

-- 6. task_templates: new table
CREATE TABLE IF NOT EXISTS "task_templates" (
  "id" text PRIMARY KEY NOT NULL,
  "category" text NOT NULL,
  "title" text NOT NULL,
  "task_type" text NOT NULL,
  "sort_order" integer NOT NULL DEFAULT 0,
  "days_before_deadline" integer NOT NULL DEFAULT 0,
  "depends_on_sort_order" integer,
  "is_system" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_templates_category_idx" ON "task_templates" USING btree ("category");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_templates_category_sort_order_idx" ON "task_templates" USING btree ("category", "sort_order");
--> statement-breakpoint

-- 7. Seed task_templates with system templates (6 categories, 21 rows)
INSERT INTO "task_templates" ("id", "category", "title", "task_type", "sort_order", "days_before_deadline", "depends_on_sort_order", "is_system") VALUES
  -- es_submission: 下書き作成→添削依頼→修正→最終確認→提出
  ('tmpl_es_01', 'es_submission', '下書き作成', 'es', 0, 7, NULL, true),
  ('tmpl_es_02', 'es_submission', '添削依頼', 'es', 1, 5, 0, true),
  ('tmpl_es_03', 'es_submission', '修正', 'es', 2, 3, 1, true),
  ('tmpl_es_04', 'es_submission', '最終確認', 'es', 3, 1, 2, true),
  ('tmpl_es_05', 'es_submission', '提出', 'other', 4, 0, 3, true),
  -- test: テスト対策→受験環境確認→受験
  ('tmpl_test_01', 'test', 'テスト対策', 'web_test', 0, 5, NULL, true),
  ('tmpl_test_02', 'test', '受験環境確認', 'other', 1, 2, 0, true),
  ('tmpl_test_03', 'test', '受験', 'web_test', 2, 0, 1, true),
  -- interview: 企業研究→想定質問準備→模擬面接→最終確認
  ('tmpl_int_01', 'interview', '企業研究', 'other', 0, 7, NULL, true),
  ('tmpl_int_02', 'interview', '想定質問準備', 'other', 1, 5, 0, true),
  ('tmpl_int_03', 'interview', '模擬面接', 'other', 2, 2, 1, true),
  ('tmpl_int_04', 'interview', '最終確認', 'other', 3, 0, 2, true),
  -- briefing: 事前調査→質問準備→参加
  ('tmpl_brief_01', 'briefing', '事前調査', 'other', 0, 3, NULL, true),
  ('tmpl_brief_02', 'briefing', '質問準備', 'other', 1, 1, 0, true),
  ('tmpl_brief_03', 'briefing', '参加', 'other', 2, 0, 1, true),
  -- internship: 事前調査→準備物確認→参加
  ('tmpl_intern_01', 'internship', '事前調査', 'other', 0, 5, NULL, true),
  ('tmpl_intern_02', 'internship', '準備物確認', 'other', 1, 2, 0, true),
  ('tmpl_intern_03', 'internship', '参加', 'other', 2, 0, 1, true),
  -- offer_response: 条件整理→他社比較→回答
  ('tmpl_offer_01', 'offer_response', '条件整理', 'other', 0, 5, NULL, true),
  ('tmpl_offer_02', 'offer_response', '他社比較', 'other', 1, 3, 0, true),
  ('tmpl_offer_03', 'offer_response', '回答', 'other', 2, 0, 1, true)
ON CONFLICT ("id") DO NOTHING;
