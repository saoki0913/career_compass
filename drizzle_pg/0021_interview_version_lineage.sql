-- Phase 2 Stage 0-3: 評価ハーネスのための prompt / policy / case_seed 世代追跡
-- `interview_turn_events` と `interview_feedback_histories` にスコア由来の
-- prompt 変更世代 / followup policy 版数 / case seed 版数を保存する 3 列を追加する。
-- 将来の A/B test 基盤として、評価スコアがどの世代に由来するかを可視化する。
--
-- Rollback:
--   ALTER TABLE "interview_turn_events"
--     DROP COLUMN IF EXISTS "prompt_version",
--     DROP COLUMN IF EXISTS "followup_policy_version",
--     DROP COLUMN IF EXISTS "case_seed_version";
--   ALTER TABLE "interview_feedback_histories"
--     DROP COLUMN IF EXISTS "prompt_version",
--     DROP COLUMN IF EXISTS "followup_policy_version",
--     DROP COLUMN IF EXISTS "case_seed_version";

ALTER TABLE "interview_turn_events"
  ADD COLUMN IF NOT EXISTS "prompt_version" text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS "followup_policy_version" text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS "case_seed_version" text;

ALTER TABLE "interview_feedback_histories"
  ADD COLUMN IF NOT EXISTS "prompt_version" text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS "followup_policy_version" text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS "case_seed_version" text;
