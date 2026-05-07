-- SEC-006: enforce owner consistency between owner-scoped children and parents.
-- Validation query after migration:
--   select count(*) from shupass_owner_integrity_violations();

CREATE OR REPLACE FUNCTION shupass_owner_matches(
  child_user_id text,
  child_guest_id text,
  parent_user_id text,
  parent_guest_id text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (child_user_id IS NOT NULL AND child_user_id = parent_user_id AND parent_guest_id IS NULL)
      OR (child_guest_id IS NOT NULL AND child_guest_id = parent_guest_id AND parent_user_id IS NULL)
$$;

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
  SELECT 'submission_items', si.id, 'application_owner_mismatch'
    FROM submission_items si
    JOIN applications a ON a.id = si.application_id
   WHERE si.application_id IS NOT NULL
     AND NOT shupass_owner_matches(si.user_id, si.guest_id, a.user_id, a.guest_id)
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
  ELSIF TG_TABLE_NAME IN ('documents', 'tasks') THEN
    IF NEW.company_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM companies c
       WHERE c.id = NEW.company_id
         AND shupass_owner_matches(NEW.user_id, NEW.guest_id, c.user_id, c.guest_id)
    ) THEN
      RAISE EXCEPTION '% owner must match company owner', TG_TABLE_NAME USING ERRCODE = '23514';
    END IF;
    IF NEW.application_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM applications a
       WHERE a.id = NEW.application_id
         AND shupass_owner_matches(NEW.user_id, NEW.guest_id, a.user_id, a.guest_id)
    ) THEN
      RAISE EXCEPTION '% owner must match application owner', TG_TABLE_NAME USING ERRCODE = '23514';
    END IF;
    IF TG_TABLE_NAME = 'documents' AND NEW.job_type_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM job_types jt
      JOIN applications a ON a.id = jt.application_id
       WHERE jt.id = NEW.job_type_id
         AND shupass_owner_matches(NEW.user_id, NEW.guest_id, a.user_id, a.guest_id)
    ) THEN
      RAISE EXCEPTION 'documents owner must match job type application owner' USING ERRCODE = '23514';
    END IF;
    IF TG_TABLE_NAME = 'tasks' AND NEW.deadline_id IS NOT NULL AND NOT EXISTS (
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

DROP TRIGGER IF EXISTS applications_owner_integrity_trg ON applications;
CREATE TRIGGER applications_owner_integrity_trg
BEFORE INSERT OR UPDATE OF company_id, user_id, guest_id ON applications
FOR EACH ROW EXECUTE FUNCTION shupass_enforce_owner_integrity();

DROP TRIGGER IF EXISTS documents_owner_integrity_trg ON documents;
CREATE TRIGGER documents_owner_integrity_trg
BEFORE INSERT OR UPDATE OF company_id, application_id, job_type_id, user_id, guest_id ON documents
FOR EACH ROW EXECUTE FUNCTION shupass_enforce_owner_integrity();

DROP TRIGGER IF EXISTS tasks_owner_integrity_trg ON tasks;
CREATE TRIGGER tasks_owner_integrity_trg
BEFORE INSERT OR UPDATE OF company_id, application_id, deadline_id, user_id, guest_id ON tasks
FOR EACH ROW EXECUTE FUNCTION shupass_enforce_owner_integrity();

DROP TRIGGER IF EXISTS deadlines_owner_integrity_trg ON deadlines;
CREATE TRIGGER deadlines_owner_integrity_trg
BEFORE INSERT OR UPDATE OF company_id, application_id, job_type_id ON deadlines
FOR EACH ROW EXECUTE FUNCTION shupass_enforce_owner_integrity();

DROP TRIGGER IF EXISTS motivation_conversations_owner_integrity_trg ON motivation_conversations;
CREATE TRIGGER motivation_conversations_owner_integrity_trg
BEFORE INSERT OR UPDATE OF company_id, user_id, guest_id ON motivation_conversations
FOR EACH ROW EXECUTE FUNCTION shupass_enforce_owner_integrity();

DROP TRIGGER IF EXISTS interview_conversations_owner_integrity_trg ON interview_conversations;
CREATE TRIGGER interview_conversations_owner_integrity_trg
BEFORE INSERT OR UPDATE OF company_id, user_id, guest_id ON interview_conversations
FOR EACH ROW EXECUTE FUNCTION shupass_enforce_owner_integrity();

DROP TRIGGER IF EXISTS interview_feedback_histories_owner_integrity_trg ON interview_feedback_histories;
CREATE TRIGGER interview_feedback_histories_owner_integrity_trg
BEFORE INSERT OR UPDATE OF conversation_id, company_id, user_id, guest_id ON interview_feedback_histories
FOR EACH ROW EXECUTE FUNCTION shupass_enforce_owner_integrity();

DROP TRIGGER IF EXISTS interview_turn_events_owner_integrity_trg ON interview_turn_events;
CREATE TRIGGER interview_turn_events_owner_integrity_trg
BEFORE INSERT OR UPDATE OF conversation_id, company_id, user_id, guest_id ON interview_turn_events
FOR EACH ROW EXECUTE FUNCTION shupass_enforce_owner_integrity();

DROP TRIGGER IF EXISTS interview_drill_attempts_owner_integrity_trg ON interview_drill_attempts;
CREATE TRIGGER interview_drill_attempts_owner_integrity_trg
BEFORE INSERT OR UPDATE OF conversation_id, company_id, user_id, guest_id ON interview_drill_attempts
FOR EACH ROW EXECUTE FUNCTION shupass_enforce_owner_integrity();

DROP TRIGGER IF EXISTS submission_items_owner_integrity_trg ON submission_items;
CREATE TRIGGER submission_items_owner_integrity_trg
BEFORE INSERT OR UPDATE OF application_id, user_id, guest_id ON submission_items
FOR EACH ROW EXECUTE FUNCTION shupass_enforce_owner_integrity();
