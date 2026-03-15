ALTER TABLE deadlines ADD COLUMN google_calendar_id text;
ALTER TABLE deadlines ADD COLUMN google_event_id text;
ALTER TABLE deadlines ADD COLUMN google_sync_status text DEFAULT 'idle' NOT NULL;
ALTER TABLE deadlines ADD COLUMN google_sync_error text;
ALTER TABLE deadlines ADD COLUMN google_synced_at timestamptz;
ALTER TABLE deadlines ADD COLUMN google_sync_suppressed_at timestamptz;

ALTER TABLE calendar_events ADD COLUMN google_calendar_id text;
ALTER TABLE calendar_events ADD COLUMN google_event_id text;
ALTER TABLE calendar_events ADD COLUMN google_sync_status text DEFAULT 'idle' NOT NULL;
ALTER TABLE calendar_events ADD COLUMN google_sync_error text;
ALTER TABLE calendar_events ADD COLUMN google_synced_at timestamptz;
UPDATE calendar_events
SET google_event_id = external_event_id
WHERE google_event_id IS NULL
  AND external_event_id IS NOT NULL;

CREATE TABLE calendar_sync_jobs (
  id text PRIMARY KEY NOT NULL,
  user_id text NOT NULL REFERENCES users(id) ON DELETE cascade,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  action text NOT NULL,
  target_calendar_id text,
  google_event_id text,
  status text DEFAULT 'pending' NOT NULL,
  attempts integer DEFAULT 0 NOT NULL,
  last_error text,
  scheduled_at timestamptz DEFAULT now() NOT NULL,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX calendar_sync_jobs_status_scheduled_idx
  ON calendar_sync_jobs (status, scheduled_at);

CREATE INDEX calendar_sync_jobs_user_entity_idx
  ON calendar_sync_jobs (user_id, entity_type, entity_id);
