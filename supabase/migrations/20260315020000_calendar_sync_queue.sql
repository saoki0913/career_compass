ALTER TABLE IF EXISTS public.deadlines ADD COLUMN IF NOT EXISTS google_calendar_id text;
ALTER TABLE IF EXISTS public.deadlines ADD COLUMN IF NOT EXISTS google_event_id text;
ALTER TABLE IF EXISTS public.deadlines ADD COLUMN IF NOT EXISTS google_sync_status text DEFAULT 'idle' NOT NULL;
ALTER TABLE IF EXISTS public.deadlines ADD COLUMN IF NOT EXISTS google_sync_error text;
ALTER TABLE IF EXISTS public.deadlines ADD COLUMN IF NOT EXISTS google_synced_at timestamptz;
ALTER TABLE IF EXISTS public.deadlines ADD COLUMN IF NOT EXISTS google_sync_suppressed_at timestamptz;

ALTER TABLE IF EXISTS public.calendar_events ADD COLUMN IF NOT EXISTS google_calendar_id text;
ALTER TABLE IF EXISTS public.calendar_events ADD COLUMN IF NOT EXISTS google_event_id text;
ALTER TABLE IF EXISTS public.calendar_events ADD COLUMN IF NOT EXISTS google_sync_status text DEFAULT 'idle' NOT NULL;
ALTER TABLE IF EXISTS public.calendar_events ADD COLUMN IF NOT EXISTS google_sync_error text;
ALTER TABLE IF EXISTS public.calendar_events ADD COLUMN IF NOT EXISTS google_synced_at timestamptz;

DO $$
BEGIN
  IF to_regclass('public.calendar_events') IS NOT NULL THEN
    UPDATE public.calendar_events
    SET google_event_id = external_event_id
    WHERE google_event_id IS NULL
      AND external_event_id IS NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.users') IS NOT NULL
    AND to_regclass('public.calendar_sync_jobs') IS NULL THEN
    CREATE TABLE public.calendar_sync_jobs (
      id text PRIMARY KEY NOT NULL,
      user_id text NOT NULL REFERENCES public.users(id) ON DELETE cascade,
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
      ON public.calendar_sync_jobs (status, scheduled_at);

    CREATE INDEX calendar_sync_jobs_user_entity_idx
      ON public.calendar_sync_jobs (user_id, entity_type, entity_id);
  END IF;
END $$;
