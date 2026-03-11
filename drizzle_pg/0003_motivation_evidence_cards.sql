ALTER TABLE "motivation_conversations" ADD COLUMN IF NOT EXISTS "last_evidence_cards" text;
ALTER TABLE "motivation_conversations" ADD COLUMN IF NOT EXISTS "stage_status" text;
