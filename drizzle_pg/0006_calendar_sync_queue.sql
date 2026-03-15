ALTER TABLE "deadlines" ADD COLUMN "google_calendar_id" text;--> statement-breakpoint
ALTER TABLE "deadlines" ADD COLUMN "google_event_id" text;--> statement-breakpoint
ALTER TABLE "deadlines" ADD COLUMN "google_sync_status" text DEFAULT 'idle' NOT NULL;--> statement-breakpoint
ALTER TABLE "deadlines" ADD COLUMN "google_sync_error" text;--> statement-breakpoint
ALTER TABLE "deadlines" ADD COLUMN "google_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "deadlines" ADD COLUMN "google_sync_suppressed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "google_calendar_id" text;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "google_event_id" text;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "google_sync_status" text DEFAULT 'idle' NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "google_sync_error" text;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "google_synced_at" timestamp with time zone;--> statement-breakpoint
UPDATE "calendar_events"
SET "google_event_id" = "external_event_id"
WHERE "google_event_id" IS NULL
  AND "external_event_id" IS NOT NULL;--> statement-breakpoint
CREATE TABLE "calendar_sync_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"action" text NOT NULL,
	"target_calendar_id" text,
	"google_event_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"scheduled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "calendar_sync_jobs" ADD CONSTRAINT "calendar_sync_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_sync_jobs_status_scheduled_idx" ON "calendar_sync_jobs" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX "calendar_sync_jobs_user_entity_idx" ON "calendar_sync_jobs" USING btree ("user_id","entity_type","entity_id");--> statement-breakpoint
