ALTER TABLE "interview_feedback_histories"
ADD COLUMN IF NOT EXISTS "score_evidence_by_axis" jsonb DEFAULT '{}'::jsonb NOT NULL,
ADD COLUMN IF NOT EXISTS "score_rationale_by_axis" jsonb DEFAULT '{}'::jsonb NOT NULL,
ADD COLUMN IF NOT EXISTS "confidence_by_axis" jsonb DEFAULT '{}'::jsonb NOT NULL;
