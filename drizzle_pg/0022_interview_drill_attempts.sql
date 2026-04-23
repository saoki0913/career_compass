-- Phase 2 Stage 7: Weakness drill attempts.
-- 最弱回答に対する応募者の書き直しと delta スコアを保存する。
-- - drill/start: why_weak / improvement_pattern / model_rewrite / retry_question を書き込み
-- - drill/score: retry_answer / retry_scores / delta_scores を UPDATE、completed_at を埋める
-- 1 row = 1 drill サイクル。guest / user は owner_xor で排他。
--
-- Rollback:
--   DROP TABLE IF EXISTS "interview_drill_attempts";

CREATE TABLE IF NOT EXISTS "interview_drill_attempts" (
  "id" text PRIMARY KEY,
  "conversation_id" text NOT NULL REFERENCES "interview_conversations"("id") ON DELETE CASCADE,
  "user_id" text REFERENCES "users"("id") ON DELETE CASCADE,
  "guest_id" text REFERENCES "guest_users"("id") ON DELETE CASCADE,
  "company_id" text NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,

  "original_feedback_id" text REFERENCES "interview_feedback_histories"("id") ON DELETE SET NULL,
  "weakest_turn_id" text,
  "weakest_axis" text,
  "weakest_question" text,
  "weakest_answer" text,
  "original_scores" jsonb,

  "why_weak" text,
  "improvement_pattern" text,
  "model_rewrite" text,
  "retry_question" text,

  "retry_answer" text,
  "retry_scores" jsonb,
  "delta_scores" jsonb,

  "prompt_version" text NOT NULL DEFAULT 'unknown',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "completed_at" timestamptz,

  CONSTRAINT "interview_drill_attempts_owner_xor"
    CHECK (("user_id" IS NULL) <> ("guest_id" IS NULL))
);

CREATE INDEX IF NOT EXISTS "interview_drill_attempts_conversation_idx"
  ON "interview_drill_attempts" ("conversation_id", "created_at");

CREATE INDEX IF NOT EXISTS "interview_drill_attempts_company_idx"
  ON "interview_drill_attempts" ("company_id", "created_at");
