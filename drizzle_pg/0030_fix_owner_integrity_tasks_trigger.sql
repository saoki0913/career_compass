-- Fix SEC-006 trigger function for tasks.
--
-- The previous generic documents/tasks branch referenced NEW.job_type_id in the
-- shared trigger function. Task rows do not have job_type_id, so task inserts
-- could fail with "record NEW has no field job_type_id".

CREATE OR REPLACE FUNCTION shupass_enforce_owner_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'applications' THEN
    IF NOT EXISTS (
      SELECT 1 FROM companies c
       WHERE c.id = NEW.company_id
         AND shupass_owner_matches(NEW.user_id, NEW.guest_id, c.user_id, c.guest_id)
    ) THEN
      RAISE EXCEPTION 'applications owner must match company owner' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'documents' THEN
    IF NEW.company_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM companies c
       WHERE c.id = NEW.company_id
         AND shupass_owner_matches(NEW.user_id, NEW.guest_id, c.user_id, c.guest_id)
    ) THEN
      RAISE EXCEPTION 'documents owner must match company owner' USING ERRCODE = '23514';
    END IF;
    IF NEW.application_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM applications a
       WHERE a.id = NEW.application_id
         AND shupass_owner_matches(NEW.user_id, NEW.guest_id, a.user_id, a.guest_id)
    ) THEN
      RAISE EXCEPTION 'documents owner must match application owner' USING ERRCODE = '23514';
    END IF;
    IF NEW.job_type_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM job_types jt
      JOIN applications a ON a.id = jt.application_id
       WHERE jt.id = NEW.job_type_id
         AND shupass_owner_matches(NEW.user_id, NEW.guest_id, a.user_id, a.guest_id)
    ) THEN
      RAISE EXCEPTION 'documents owner must match job type application owner' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'tasks' THEN
    IF NEW.company_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM companies c
       WHERE c.id = NEW.company_id
         AND shupass_owner_matches(NEW.user_id, NEW.guest_id, c.user_id, c.guest_id)
    ) THEN
      RAISE EXCEPTION 'tasks owner must match company owner' USING ERRCODE = '23514';
    END IF;
    IF NEW.application_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM applications a
       WHERE a.id = NEW.application_id
         AND shupass_owner_matches(NEW.user_id, NEW.guest_id, a.user_id, a.guest_id)
    ) THEN
      RAISE EXCEPTION 'tasks owner must match application owner' USING ERRCODE = '23514';
    END IF;
    IF NEW.deadline_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM deadlines d
      JOIN companies c ON c.id = d.company_id
       WHERE d.id = NEW.deadline_id
         AND shupass_owner_matches(NEW.user_id, NEW.guest_id, c.user_id, c.guest_id)
    ) THEN
      RAISE EXCEPTION 'tasks owner must match deadline owner' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'deadlines' THEN
    IF NEW.application_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM applications a
       WHERE a.id = NEW.application_id
         AND a.company_id = NEW.company_id
    ) THEN
      RAISE EXCEPTION 'deadlines application must belong to deadline company' USING ERRCODE = '23514';
    END IF;
    IF NEW.job_type_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM job_types jt
      JOIN applications a ON a.id = jt.application_id
       WHERE jt.id = NEW.job_type_id
         AND (NEW.application_id IS NULL OR jt.application_id = NEW.application_id)
         AND a.company_id = NEW.company_id
    ) THEN
      RAISE EXCEPTION 'deadlines job type must belong to deadline application/company' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME IN ('motivation_conversations', 'interview_conversations') THEN
    IF NOT EXISTS (
      SELECT 1 FROM companies c
       WHERE c.id = NEW.company_id
         AND shupass_owner_matches(NEW.user_id, NEW.guest_id, c.user_id, c.guest_id)
    ) THEN
      RAISE EXCEPTION '% owner must match company owner', TG_TABLE_NAME USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME IN ('interview_feedback_histories', 'interview_turn_events', 'interview_drill_attempts') THEN
    IF NOT EXISTS (
      SELECT 1 FROM interview_conversations ic
       WHERE ic.id = NEW.conversation_id
         AND ic.company_id = NEW.company_id
         AND shupass_owner_matches(NEW.user_id, NEW.guest_id, ic.user_id, ic.guest_id)
    ) THEN
      RAISE EXCEPTION '% owner must match interview conversation owner', TG_TABLE_NAME USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'submission_items' THEN
    IF NEW.application_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM applications a
       WHERE a.id = NEW.application_id
         AND shupass_owner_matches(NEW.user_id, NEW.guest_id, a.user_id, a.guest_id)
    ) THEN
      RAISE EXCEPTION 'submission_items owner must match application owner' USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
DECLARE
  violation record;
BEGIN
  SELECT * INTO violation FROM shupass_owner_integrity_violations() LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'owner integrity violation: %.% %', violation.table_name, violation.row_id, violation.violation;
  END IF;
END;
$$;
