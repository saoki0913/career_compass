create table if not exists interview_conversations (
  id text primary key,
  user_id text references users(id) on delete cascade,
  guest_id text references guest_users(id) on delete cascade,
  company_id text not null references companies(id) on delete cascade,
  messages text not null,
  status text not null default 'setup_pending',
  current_stage text not null default 'industry_reason',
  question_count integer not null default 0,
  stage_question_counts text not null default '{}',
  completed_stages text not null default '[]',
  last_question_focus text,
  question_flow_completed boolean not null default false,
  selected_industry text,
  selected_role text,
  selected_role_source text,
  active_feedback_draft text,
  current_feedback_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint interview_conversations_owner_xor check ((user_id is null) <> (guest_id is null))
);

create index if not exists interview_conversations_company_idx
  on interview_conversations(company_id);

create unique index if not exists interview_conversations_company_user_ux
  on interview_conversations(company_id, user_id);

create unique index if not exists interview_conversations_company_guest_ux
  on interview_conversations(company_id, guest_id);

create table if not exists interview_feedback_histories (
  id text primary key,
  conversation_id text not null references interview_conversations(id) on delete cascade,
  user_id text references users(id) on delete cascade,
  guest_id text references guest_users(id) on delete cascade,
  company_id text not null references companies(id) on delete cascade,
  overall_comment text not null,
  scores text not null default '{}',
  strengths text not null default '[]',
  improvements text not null default '[]',
  improved_answer text not null default '',
  preparation_points text not null default '[]',
  premise_consistency integer not null default 0,
  source_question_count integer not null default 0,
  source_messages_snapshot text not null default '[]',
  created_at timestamptz not null default now(),
  constraint interview_feedback_histories_owner_xor check ((user_id is null) <> (guest_id is null))
);

create index if not exists interview_feedback_histories_company_idx
  on interview_feedback_histories(company_id, created_at desc);

create index if not exists interview_feedback_histories_conversation_idx
  on interview_feedback_histories(conversation_id, created_at desc);
