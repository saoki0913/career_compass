-- 日次サマリー送信時刻（JST の「時」、API で 7/9/12/18 のみ許可）
ALTER TABLE "notification_settings" ADD COLUMN IF NOT EXISTS "daily_summary_hour_jst" integer DEFAULT 9 NOT NULL;
