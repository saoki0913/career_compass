DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'company_info_monthly_usage'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'company_info_monthly_usage'
      AND column_name = 'schedule_fetch_free_uses'
  ) THEN
    ALTER TABLE public.company_info_monthly_usage
      ADD COLUMN schedule_fetch_free_uses integer NOT NULL DEFAULT 0;
  END IF;
END $$;
