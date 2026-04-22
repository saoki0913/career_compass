-- Aligns public.notification_settings with Drizzle schema (drizzle_pg/0019).
ALTER TABLE IF EXISTS public.notification_settings
  ADD COLUMN IF NOT EXISTS "deadline_reminder_overrides" text;
