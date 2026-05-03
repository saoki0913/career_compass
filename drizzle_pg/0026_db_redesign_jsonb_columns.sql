-- DB Redesign DB-5..DB-7: text JSON columns -> jsonb.
--
-- Deployment order:
-- 1. Deploy app code that can read both legacy text JSON and parsed jsonb values.
-- 2. Drain/replace old app instances that still call JSON.parse directly.
-- 3. Apply this migration.
-- Rolling back to app code older than this migration is not safe without running the rollback SQL.

CREATE OR REPLACE FUNCTION pg_temp.is_valid_jsonb(value text)
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
  IF value IS NULL THEN
    RETURN true;
  END IF;
  PERFORM value::jsonb;
  RETURN true;
EXCEPTION WHEN others THEN
  RETURN false;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "companies"
    WHERE "corporate_info_urls" IS NOT NULL
      AND "corporate_info_urls" <> 'corporate_info_urls'
      AND NOT pg_temp.is_valid_jsonb("corporate_info_urls")
  ) THEN
    RAISE EXCEPTION 'Invalid JSON in companies.corporate_info_urls';
  END IF;
  IF EXISTS (SELECT 1 FROM "applications" WHERE "phase" IS NOT NULL AND NOT pg_temp.is_valid_jsonb("phase")) THEN
    RAISE EXCEPTION 'Invalid JSON in applications.phase';
  END IF;
  IF EXISTS (SELECT 1 FROM "notifications" WHERE "data" IS NOT NULL AND NOT pg_temp.is_valid_jsonb("data")) THEN
    RAISE EXCEPTION 'Invalid JSON in notifications.data';
  END IF;
  IF EXISTS (SELECT 1 FROM "user_profiles" WHERE "target_industries" IS NOT NULL AND NOT pg_temp.is_valid_jsonb("target_industries")) THEN
    RAISE EXCEPTION 'Invalid JSON in user_profiles.target_industries';
  END IF;
  IF EXISTS (SELECT 1 FROM "user_profiles" WHERE "target_job_types" IS NOT NULL AND NOT pg_temp.is_valid_jsonb("target_job_types")) THEN
    RAISE EXCEPTION 'Invalid JSON in user_profiles.target_job_types';
  END IF;
  IF EXISTS (SELECT 1 FROM "notification_settings" WHERE "reminder_timing" IS NOT NULL AND NOT pg_temp.is_valid_jsonb("reminder_timing")) THEN
    RAISE EXCEPTION 'Invalid JSON in notification_settings.reminder_timing';
  END IF;
  IF EXISTS (SELECT 1 FROM "notification_settings" WHERE "deadline_reminder_overrides" IS NOT NULL AND NOT pg_temp.is_valid_jsonb("deadline_reminder_overrides")) THEN
    RAISE EXCEPTION 'Invalid JSON in notification_settings.deadline_reminder_overrides';
  END IF;
  IF EXISTS (SELECT 1 FROM "deadlines" WHERE "auto_completed_task_ids" IS NOT NULL AND NOT pg_temp.is_valid_jsonb("auto_completed_task_ids")) THEN
    RAISE EXCEPTION 'Invalid JSON in deadlines.auto_completed_task_ids';
  END IF;
  IF EXISTS (SELECT 1 FROM "gakuchika_conversations" WHERE "star_scores" IS NOT NULL AND NOT pg_temp.is_valid_jsonb("star_scores")) THEN
    RAISE EXCEPTION 'Invalid JSON in gakuchika_conversations.star_scores';
  END IF;
  IF EXISTS (SELECT 1 FROM "ai_messages" WHERE "metadata" IS NOT NULL AND NOT pg_temp.is_valid_jsonb("metadata")) THEN
    RAISE EXCEPTION 'Invalid JSON in ai_messages.metadata';
  END IF;
END;
$$;

ALTER TABLE "companies"
  ALTER COLUMN "corporate_info_urls" TYPE jsonb
  USING CASE
    WHEN "corporate_info_urls" IS NULL THEN NULL
    WHEN "corporate_info_urls" = 'corporate_info_urls' THEN NULL
    ELSE "corporate_info_urls"::jsonb
  END;

ALTER TABLE "applications"
  ALTER COLUMN "phase" TYPE jsonb
  USING CASE WHEN "phase" IS NULL THEN NULL ELSE "phase"::jsonb END;

ALTER TABLE "notifications"
  ALTER COLUMN "data" TYPE jsonb
  USING CASE WHEN "data" IS NULL THEN NULL ELSE "data"::jsonb END;

ALTER TABLE "user_profiles"
  ALTER COLUMN "target_industries" TYPE jsonb
  USING CASE WHEN "target_industries" IS NULL THEN NULL ELSE "target_industries"::jsonb END,
  ALTER COLUMN "target_job_types" TYPE jsonb
  USING CASE WHEN "target_job_types" IS NULL THEN NULL ELSE "target_job_types"::jsonb END;

ALTER TABLE "notification_settings"
  ALTER COLUMN "reminder_timing" TYPE jsonb
  USING CASE WHEN "reminder_timing" IS NULL THEN NULL ELSE "reminder_timing"::jsonb END,
  ALTER COLUMN "deadline_reminder_overrides" TYPE jsonb
  USING CASE WHEN "deadline_reminder_overrides" IS NULL THEN NULL ELSE "deadline_reminder_overrides"::jsonb END;

ALTER TABLE "deadlines"
  ALTER COLUMN "auto_completed_task_ids" TYPE jsonb
  USING CASE WHEN "auto_completed_task_ids" IS NULL THEN NULL ELSE "auto_completed_task_ids"::jsonb END;

ALTER TABLE "gakuchika_conversations"
  ALTER COLUMN "star_scores" TYPE jsonb
  USING CASE WHEN "star_scores" IS NULL THEN NULL ELSE "star_scores"::jsonb END;

ALTER TABLE "ai_messages"
  ALTER COLUMN "metadata" TYPE jsonb
  USING CASE WHEN "metadata" IS NULL THEN NULL ELSE "metadata"::jsonb END;

-- Rollback:
-- ALTER TABLE "ai_messages" ALTER COLUMN "metadata" TYPE text USING "metadata"::text;
-- ALTER TABLE "gakuchika_conversations" ALTER COLUMN "star_scores" TYPE text USING "star_scores"::text;
-- ALTER TABLE "deadlines" ALTER COLUMN "auto_completed_task_ids" TYPE text USING "auto_completed_task_ids"::text;
-- ALTER TABLE "notification_settings"
--   ALTER COLUMN "reminder_timing" TYPE text USING "reminder_timing"::text,
--   ALTER COLUMN "deadline_reminder_overrides" TYPE text USING "deadline_reminder_overrides"::text;
-- ALTER TABLE "user_profiles"
--   ALTER COLUMN "target_industries" TYPE text USING "target_industries"::text,
--   ALTER COLUMN "target_job_types" TYPE text USING "target_job_types"::text;
-- ALTER TABLE "notifications" ALTER COLUMN "data" TYPE text USING "data"::text;
-- ALTER TABLE "applications" ALTER COLUMN "phase" TYPE text USING "phase"::text;
-- ALTER TABLE "companies" ALTER COLUMN "corporate_info_urls" TYPE text USING "corporate_info_urls"::text;
