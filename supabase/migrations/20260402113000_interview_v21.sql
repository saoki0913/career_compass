alter table if exists interview_feedback_histories
  add column if not exists weakest_turn_id text,
  add column if not exists weakest_question_snapshot text,
  add column if not exists weakest_answer_snapshot text,
  add column if not exists satisfaction_score integer;

create table if not exists interview_turn_events (
  id text primary key,
  turn_id text not null,
  conversation_id text not null references interview_conversations(id) on delete cascade,
  user_id text references users(id) on delete cascade,
  guest_id text references guest_users(id) on delete cascade,
  company_id text not null references companies(id) on delete cascade,
  question text not null default '',
  answer text not null default '',
  topic text,
  question_type text,
  turn_action text,
  followup_style text,
  intent_key text,
  coverage_checklist_snapshot text not null default '{}',
  deterministic_coverage_passed boolean not null default false,
  llm_coverage_hint text,
  format_phase text,
  format_guard_applied text,
  created_at timestamptz not null default now(),
  constraint interview_turn_events_owner_xor check ((user_id is null) <> (guest_id is null))
);

create index if not exists interview_turn_events_conversation_idx
  on interview_turn_events (conversation_id, created_at);
create index if not exists interview_turn_events_company_idx
  on interview_turn_events (company_id, created_at);
create index if not exists interview_turn_events_turn_id_idx
  on interview_turn_events (turn_id);
