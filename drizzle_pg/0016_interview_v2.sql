ALTER TABLE "interview_conversations" ADD COLUMN IF NOT EXISTS "role_track" text;
ALTER TABLE "interview_conversations" ADD COLUMN IF NOT EXISTS "interview_format" text;
ALTER TABLE "interview_conversations" ADD COLUMN IF NOT EXISTS "selection_type" text;
ALTER TABLE "interview_conversations" ADD COLUMN IF NOT EXISTS "interview_stage" text;
ALTER TABLE "interview_conversations" ADD COLUMN IF NOT EXISTS "interviewer_type" text;
ALTER TABLE "interview_conversations" ADD COLUMN IF NOT EXISTS "strictness_mode" text;
ALTER TABLE "interview_conversations" ADD COLUMN IF NOT EXISTS "interview_plan_json" text;
ALTER TABLE "interview_conversations" ADD COLUMN IF NOT EXISTS "turn_state_json" text;
ALTER TABLE "interview_conversations" ADD COLUMN IF NOT EXISTS "turn_meta_json" text;

ALTER TABLE "interview_feedback_histories" ADD COLUMN IF NOT EXISTS "consistency_risks" text NOT NULL DEFAULT '[]';
ALTER TABLE "interview_feedback_histories" ADD COLUMN IF NOT EXISTS "weakest_question_type" text;
