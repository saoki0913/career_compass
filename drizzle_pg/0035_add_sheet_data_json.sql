SET lock_timeout = '5s';--> statement-breakpoint
ALTER TABLE "interview_feedback_histories" ADD COLUMN IF NOT EXISTS "sheet_data_json" jsonb;--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'interview_feedback_histories'
      AND column_name = 'sheet_data_json'
      AND data_type <> 'jsonb'
  ) THEN
    RAISE EXCEPTION 'sheet_data_json exists but is not jsonb — manual intervention required';
  END IF;
END $$;
