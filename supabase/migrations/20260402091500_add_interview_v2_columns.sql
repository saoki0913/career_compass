alter table if exists interview_conversations
  add column if not exists role_track text,
  add column if not exists interview_format text,
  add column if not exists selection_type text,
  add column if not exists interview_stage text,
  add column if not exists interviewer_type text,
  add column if not exists strictness_mode text,
  add column if not exists interview_plan_json text,
  add column if not exists turn_state_json text,
  add column if not exists turn_meta_json text;

alter table if exists interview_feedback_histories
  add column if not exists consistency_risks text not null default '[]',
  add column if not exists weakest_question_type text;
