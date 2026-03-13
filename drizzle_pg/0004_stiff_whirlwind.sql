CREATE TABLE "company_pdf_ingest_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"source_url" text NOT NULL,
	"storage_bucket" text NOT NULL,
	"storage_path" text NOT NULL,
	"file_name" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"detected_content_type" text,
	"secondary_content_types" text,
	"chunks_stored" integer DEFAULT 0 NOT NULL,
	"extracted_chars" integer DEFAULT 0 NOT NULL,
	"extraction_method" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "motivation_conversations" ADD COLUMN IF NOT EXISTS "conversation_context" text;--> statement-breakpoint
ALTER TABLE "motivation_conversations" ADD COLUMN IF NOT EXISTS "selected_role" text;--> statement-breakpoint
ALTER TABLE "motivation_conversations" ADD COLUMN IF NOT EXISTS "selected_role_source" text;--> statement-breakpoint
ALTER TABLE "motivation_conversations" ADD COLUMN IF NOT EXISTS "desired_work" text;--> statement-breakpoint
ALTER TABLE "motivation_conversations" ADD COLUMN IF NOT EXISTS "question_stage" text;--> statement-breakpoint
ALTER TABLE "motivation_conversations" ADD COLUMN IF NOT EXISTS "last_suggestion_options" text;--> statement-breakpoint
ALTER TABLE "company_pdf_ingest_jobs" ADD CONSTRAINT "company_pdf_ingest_jobs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "company_pdf_ingest_jobs_company_status_idx" ON "company_pdf_ingest_jobs" USING btree ("company_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "company_pdf_ingest_jobs_source_url_ux" ON "company_pdf_ingest_jobs" USING btree ("source_url");--> statement-breakpoint
CREATE INDEX "company_pdf_ingest_jobs_created_at_idx" ON "company_pdf_ingest_jobs" USING btree ("created_at");
