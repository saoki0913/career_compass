ALTER TABLE "calendar_settings" ADD COLUMN "google_granted_scopes" text;
ALTER TABLE "calendar_settings" ADD COLUMN "google_calendar_email" text;
ALTER TABLE "calendar_settings" ADD COLUMN "google_calendar_connected_at" timestamp with time zone;
ALTER TABLE "calendar_settings" ADD COLUMN "google_calendar_needs_reconnect" boolean DEFAULT false NOT NULL;
