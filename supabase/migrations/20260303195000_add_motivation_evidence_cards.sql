ALTER TABLE IF EXISTS public.motivation_conversations
ADD COLUMN IF NOT EXISTS last_evidence_cards text,
ADD COLUMN IF NOT EXISTS stage_status text;
