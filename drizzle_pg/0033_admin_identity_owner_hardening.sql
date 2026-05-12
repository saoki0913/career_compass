-- SEC-007: Better Auth Admin identity fields and additional owner integrity.
--
-- Validation query after migration:
--   select count(*) from shupass_owner_integrity_violations();

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "role" text NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS "banned" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "ban_reason" text,
  ADD COLUMN IF NOT EXISTS "ban_expires" timestamp with time zone;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_role_allowed'
  ) THEN
    ALTER TABLE "users"
      ADD CONSTRAINT "users_role_allowed" CHECK ("role" in ('user', 'admin'));
  END IF;
END;
$$;

ALTER TABLE "sessions"
  ADD COLUMN IF NOT EXISTS "impersonated_by" text;

CREATE OR REPLACE FUNCTION shupass_owner_integrity_violations()
RETURNS TABLE(table_name text, row_id text, violation text)
LANGUAGE sql
STABLE
AS $$
  SELECT 'applications', a.id, 'company_owner_mismatch'
    FROM applications a
    JOIN companies c ON c.id = a.company_id
   WHERE NOT shupass_owner_matches(a.user_id, a.guest_id, c.user_id, c.guest_id)
  UNION ALL
  SELECT 'documents', d.id, 'company_owner_mismatch'
    FROM documents d
    JOIN companies c ON c.id = d.company_id
   WHERE d.company_id IS NOT NULL
     AND NOT shupass_owner_matches(d.user_id, d.guest_id, c.user_id, c.guest_id)
  UNION ALL
  SELECT 'documents', d.id, 'application_owner_mismatch'
    FROM documents d
    JOIN applications a ON a.id = d.application_id
   WHERE d.application_id IS NOT NULL
     AND NOT shupass_owner_matches(d.user_id, d.guest_id, a.user_id, a.guest_id)
  UNION ALL
  SELECT 'documents', d.id, 'job_type_owner_mismatch'
    FROM documents d
    JOIN job_types jt ON jt.id = d.job_type_id
    JOIN applications a ON a.id = jt.application_id
   WHERE d.job_type_id IS NOT NULL
     AND NOT shupass_owner_matches(d.user_id, d.guest_id, a.user_id, a.guest_id)
  UNION ALL
  SELECT 'tasks', t.id, 'company_owner_mismatch'
    FROM tasks t
    JOIN companies c ON c.id = t.company_id
   WHERE t.company_id IS NOT NULL
     AND NOT shupass_owner_matches(t.user_id, t.guest_id, c.user_id, c.guest_id)
  UNION ALL
  SELECT 'tasks', t.id, 'application_owner_mismatch'
    FROM tasks t
    JOIN applications a ON a.id = t.application_id
   WHERE t.application_id IS NOT NULL
     AND NOT shupass_owner_matches(t.user_id, t.guest_id, a.user_id, a.guest_id)
  UNION ALL
  SELECT 'tasks', t.id, 'deadline_owner_mismatch'
    FROM tasks t
    JOIN deadlines d ON d.id = t.deadline_id
    JOIN companies c ON c.id = d.company_id
   WHERE t.deadline_id IS NOT NULL
     AND NOT shupass_owner_matches(t.user_id, t.guest_id, c.user_id, c.guest_id)
  UNION ALL
  SELECT 'deadlines', d.id, 'application_company_mismatch'
    FROM deadlines d
    JOIN applications a ON a.id = d.application_id
   WHERE d.application_id IS NOT NULL
     AND a.company_id <> d.company_id
  UNION ALL
  SELECT 'deadlines', d.id, 'job_type_application_mismatch'
    FROM deadlines d
    JOIN job_types jt ON jt.id = d.job_type_id
    JOIN applications a ON a.id = jt.application_id
   WHERE d.job_type_id IS NOT NULL
     AND (d.application_id IS NOT NULL AND jt.application_id <> d.application_id
       OR d.application_id IS NULL AND a.company_id <> d.company_id)
  UNION ALL
  SELECT 'calendar_events', ce.id, 'deadline_owner_mismatch'
    FROM calendar_events ce
    JOIN deadlines d ON d.id = ce.deadline_id
    JOIN companies c ON c.id = d.company_id
   WHERE ce.deadline_id IS NOT NULL
     AND NOT (ce.user_id = c.user_id AND c.guest_id IS NULL)
  UNION ALL
  SELECT 'ai_threads', at.id, 'gakuchika_owner_mismatch'
    FROM ai_threads at
    JOIN documents d ON d.id = at.document_id
    JOIN gakuchika_contents gc ON gc.id = at.gakuchika_id
   WHERE at.gakuchika_id IS NOT NULL
     AND NOT shupass_owner_matches(d.user_id, d.guest_id, gc.user_id, gc.guest_id)
  UNION ALL
  SELECT 'user_pins', up.id, 'document_owner_mismatch'
    FROM user_pins up
    JOIN documents d ON d.id = up.entity_id
   WHERE up.entity_type = 'document'
     AND NOT shupass_owner_matches(up.user_id, up.guest_id, d.user_id, d.guest_id)
  UNION ALL
  SELECT 'user_pins', up.id, 'gakuchika_owner_mismatch'
    FROM user_pins up
    JOIN gakuchika_contents gc ON gc.id = up.entity_id
   WHERE up.entity_type = 'gakuchika'
     AND NOT shupass_owner_matches(up.user_id, up.guest_id, gc.user_id, gc.guest_id)
  UNION ALL
  SELECT 'motivation_conversations', m.id, 'company_owner_mismatch'
    FROM motivation_conversations m
    JOIN companies c ON c.id = m.company_id
   WHERE NOT shupass_owner_matches(m.user_id, m.guest_id, c.user_id, c.guest_id)
  UNION ALL
  SELECT 'interview_conversations', ic.id, 'company_owner_mismatch'
    FROM interview_conversations ic
    JOIN companies c ON c.id = ic.company_id
   WHERE NOT shupass_owner_matches(ic.user_id, ic.guest_id, c.user_id, c.guest_id)
  UNION ALL
  SELECT 'interview_feedback_histories', ifh.id, 'conversation_owner_mismatch'
    FROM interview_feedback_histories ifh
    JOIN interview_conversations ic ON ic.id = ifh.conversation_id
   WHERE NOT shupass_owner_matches(ifh.user_id, ifh.guest_id, ic.user_id, ic.guest_id)
  UNION ALL
  SELECT 'interview_turn_events', ite.id, 'conversation_owner_mismatch'
    FROM interview_turn_events ite
    JOIN interview_conversations ic ON ic.id = ite.conversation_id
   WHERE NOT shupass_owner_matches(ite.user_id, ite.guest_id, ic.user_id, ic.guest_id)
  UNION ALL
  SELECT 'interview_drill_attempts', ida.id, 'conversation_owner_mismatch'
    FROM interview_drill_attempts ida
    JOIN interview_conversations ic ON ic.id = ida.conversation_id
   WHERE NOT shupass_owner_matches(ida.user_id, ida.guest_id, ic.user_id, ic.guest_id)
  UNION ALL
  SELECT 'interview_drill_attempts', ida.id, 'original_feedback_owner_mismatch'
    FROM interview_drill_attempts ida
    JOIN interview_feedback_histories ifh ON ifh.id = ida.original_feedback_id
   WHERE ida.original_feedback_id IS NOT NULL
     AND (
       ida.conversation_id <> ifh.conversation_id
       OR ida.company_id <> ifh.company_id
       OR NOT shupass_owner_matches(ida.user_id, ida.guest_id, ifh.user_id, ifh.guest_id)
     )
  UNION ALL
  SELECT 'submission_items', si.id, 'application_owner_mismatch'
    FROM submission_items si
    JOIN applications a ON a.id = si.application_id
   WHERE si.application_id IS NOT NULL
     AND NOT shupass_owner_matches(si.user_id, si.guest_id, a.user_id, a.guest_id)
$$;

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
  ELSIF TG_TABLE_NAME = 'calendar_events' THEN
    IF NEW.deadline_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM deadlines d
      JOIN companies c ON c.id = d.company_id
       WHERE d.id = NEW.deadline_id
         AND NEW.user_id = c.user_id
         AND c.guest_id IS NULL
    ) THEN
      RAISE EXCEPTION 'calendar_events user must match deadline owner' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'ai_threads' THEN
    IF NEW.gakuchika_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM documents d
      JOIN gakuchika_contents gc ON gc.id = NEW.gakuchika_id
       WHERE d.id = NEW.document_id
         AND shupass_owner_matches(d.user_id, d.guest_id, gc.user_id, gc.guest_id)
    ) THEN
      RAISE EXCEPTION 'ai_threads gakuchika owner must match document owner' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'user_pins' THEN
    IF NEW.entity_type = 'document' AND NOT EXISTS (
      SELECT 1 FROM documents d
       WHERE d.id = NEW.entity_id
         AND shupass_owner_matches(NEW.user_id, NEW.guest_id, d.user_id, d.guest_id)
    ) THEN
      RAISE EXCEPTION 'user_pins owner must match document owner' USING ERRCODE = '23514';
    END IF;
    IF NEW.entity_type = 'gakuchika' AND NOT EXISTS (
      SELECT 1 FROM gakuchika_contents gc
       WHERE gc.id = NEW.entity_id
         AND shupass_owner_matches(NEW.user_id, NEW.guest_id, gc.user_id, gc.guest_id)
    ) THEN
      RAISE EXCEPTION 'user_pins owner must match gakuchika owner' USING ERRCODE = '23514';
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
    IF TG_TABLE_NAME = 'interview_drill_attempts' AND NEW.original_feedback_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM interview_feedback_histories ifh
       WHERE ifh.id = NEW.original_feedback_id
         AND ifh.conversation_id = NEW.conversation_id
         AND ifh.company_id = NEW.company_id
         AND shupass_owner_matches(NEW.user_id, NEW.guest_id, ifh.user_id, ifh.guest_id)
    ) THEN
      RAISE EXCEPTION 'interview_drill_attempts original feedback must match attempt owner' USING ERRCODE = '23514';
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

DROP TRIGGER IF EXISTS calendar_events_owner_integrity_trg ON calendar_events;
CREATE TRIGGER calendar_events_owner_integrity_trg
BEFORE INSERT OR UPDATE OF user_id, deadline_id ON calendar_events
FOR EACH ROW EXECUTE FUNCTION shupass_enforce_owner_integrity();

DROP TRIGGER IF EXISTS ai_threads_owner_integrity_trg ON ai_threads;
CREATE TRIGGER ai_threads_owner_integrity_trg
BEFORE INSERT OR UPDATE OF document_id, gakuchika_id ON ai_threads
FOR EACH ROW EXECUTE FUNCTION shupass_enforce_owner_integrity();

DROP TRIGGER IF EXISTS user_pins_owner_integrity_trg ON user_pins;
CREATE TRIGGER user_pins_owner_integrity_trg
BEFORE INSERT OR UPDATE OF user_id, guest_id, entity_type, entity_id ON user_pins
FOR EACH ROW EXECUTE FUNCTION shupass_enforce_owner_integrity();

DROP TRIGGER IF EXISTS interview_drill_attempts_owner_integrity_trg ON interview_drill_attempts;
CREATE TRIGGER interview_drill_attempts_owner_integrity_trg
BEFORE INSERT OR UPDATE OF conversation_id, company_id, original_feedback_id, user_id, guest_id ON interview_drill_attempts
FOR EACH ROW EXECUTE FUNCTION shupass_enforce_owner_integrity();

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
