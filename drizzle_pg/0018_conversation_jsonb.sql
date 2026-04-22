ALTER TABLE "motivation_conversations"
  ALTER COLUMN "messages" TYPE jsonb USING "messages"::jsonb,
  ALTER COLUMN "messages" SET DEFAULT '[]'::jsonb,
  ALTER COLUMN "motivation_scores" TYPE jsonb USING "motivation_scores"::jsonb,
  ALTER COLUMN "conversation_context" TYPE jsonb USING "conversation_context"::jsonb,
  ALTER COLUMN "last_evidence_cards" TYPE jsonb USING "last_evidence_cards"::jsonb,
  ALTER COLUMN "stage_status" TYPE jsonb USING "stage_status"::jsonb;

ALTER TABLE "interview_conversations"
  ALTER COLUMN "messages" TYPE jsonb USING "messages"::jsonb,
  ALTER COLUMN "messages" SET DEFAULT '[]'::jsonb,
  ALTER COLUMN "stage_question_counts" TYPE jsonb USING "stage_question_counts"::jsonb,
  ALTER COLUMN "stage_question_counts" SET DEFAULT '{}'::jsonb,
  ALTER COLUMN "completed_stages" TYPE jsonb USING "completed_stages"::jsonb,
  ALTER COLUMN "completed_stages" SET DEFAULT '[]'::jsonb,
  ALTER COLUMN "interview_plan_json" TYPE jsonb USING "interview_plan_json"::jsonb,
  ALTER COLUMN "turn_state_json" TYPE jsonb USING "turn_state_json"::jsonb,
  ALTER COLUMN "turn_meta_json" TYPE jsonb USING "turn_meta_json"::jsonb,
  ALTER COLUMN "active_feedback_draft" TYPE jsonb USING "active_feedback_draft"::jsonb;

ALTER TABLE "interview_feedback_histories"
  ALTER COLUMN "scores" TYPE jsonb USING "scores"::jsonb,
  ALTER COLUMN "scores" SET DEFAULT '{}'::jsonb,
  ALTER COLUMN "strengths" TYPE jsonb USING "strengths"::jsonb,
  ALTER COLUMN "strengths" SET DEFAULT '[]'::jsonb,
  ALTER COLUMN "improvements" TYPE jsonb USING "improvements"::jsonb,
  ALTER COLUMN "improvements" SET DEFAULT '[]'::jsonb,
  ALTER COLUMN "consistency_risks" TYPE jsonb USING "consistency_risks"::jsonb,
  ALTER COLUMN "consistency_risks" SET DEFAULT '[]'::jsonb,
  ALTER COLUMN "preparation_points" TYPE jsonb USING "preparation_points"::jsonb,
  ALTER COLUMN "preparation_points" SET DEFAULT '[]'::jsonb,
  ALTER COLUMN "source_messages_snapshot" TYPE jsonb USING "source_messages_snapshot"::jsonb,
  ALTER COLUMN "source_messages_snapshot" SET DEFAULT '[]'::jsonb;
