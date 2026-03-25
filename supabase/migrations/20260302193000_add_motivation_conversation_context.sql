ALTER TABLE IF EXISTS public.motivation_conversations
ADD COLUMN IF NOT EXISTS conversation_context text,
ADD COLUMN IF NOT EXISTS selected_role text,
ADD COLUMN IF NOT EXISTS selected_role_source text,
ADD COLUMN IF NOT EXISTS desired_work text,
ADD COLUMN IF NOT EXISTS question_stage text,
ADD COLUMN IF NOT EXISTS last_suggestion_options text;
