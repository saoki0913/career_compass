ALTER TABLE "interview_feedback_histories" ADD COLUMN "sheet_content" text;--> statement-breakpoint
ALTER TABLE "interview_feedback_histories" ADD COLUMN "sheet_generated_at" timestamp with time zone;
