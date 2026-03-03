ALTER TABLE motivation_conversations
ADD COLUMN conversation_context text,
ADD COLUMN selected_role text,
ADD COLUMN selected_role_source text,
ADD COLUMN desired_work text,
ADD COLUMN question_stage text,
ADD COLUMN last_suggestion_options text;
