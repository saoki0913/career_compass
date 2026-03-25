-- Align with drizzle_pg/0008_notification_daily_summary_hour.sql (日次サマリー JST 送信時刻)
ALTER TABLE IF EXISTS public.notification_settings ADD COLUMN IF NOT EXISTS "daily_summary_hour_jst" integer DEFAULT 9 NOT NULL;
