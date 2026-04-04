ALTER TABLE "interview_feedback_histories"
  ADD COLUMN IF NOT EXISTS "weakest_turn_id" text,
  ADD COLUMN IF NOT EXISTS "weakest_question_snapshot" text,
  ADD COLUMN IF NOT EXISTS "weakest_answer_snapshot" text,
  ADD COLUMN IF NOT EXISTS "satisfaction_score" integer;

CREATE TABLE IF NOT EXISTS "interview_turn_events" (
  "id" text PRIMARY KEY NOT NULL,
  "turn_id" text NOT NULL,
  "conversation_id" text NOT NULL REFERENCES "interview_conversations"("id") ON DELETE cascade,
  "user_id" text REFERENCES "users"("id") ON DELETE cascade,
  "guest_id" text REFERENCES "guest_users"("id") ON DELETE cascade,
  "company_id" text NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "question" text NOT NULL DEFAULT '',
  "answer" text NOT NULL DEFAULT '',
  "topic" text,
  "question_type" text,
  "turn_action" text,
  "followup_style" text,
  "intent_key" text,
  "coverage_checklist_snapshot" text NOT NULL DEFAULT '{}',
  "deterministic_coverage_passed" boolean NOT NULL DEFAULT false,
  "llm_coverage_hint" text,
  "format_phase" text,
  "format_guard_applied" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "interview_turn_events_owner_xor" CHECK (("user_id" is null) <> ("guest_id" is null))
);

CREATE INDEX IF NOT EXISTS "interview_turn_events_conversation_idx"
  ON "interview_turn_events" ("conversation_id", "created_at");
CREATE INDEX IF NOT EXISTS "interview_turn_events_company_idx"
  ON "interview_turn_events" ("company_id", "created_at");
CREATE INDEX IF NOT EXISTS "interview_turn_events_turn_id_idx"
  ON "interview_turn_events" ("turn_id");
