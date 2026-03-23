DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'company_info_monthly_usage'
  ) THEN
    CREATE TABLE public.company_info_monthly_usage (
      id text PRIMARY KEY,
      user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
      month_key text NOT NULL,
      rag_ingest_units integer NOT NULL DEFAULT 0,
      rag_overflow_units integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX company_info_monthly_usage_user_month_ux
      ON public.company_info_monthly_usage(user_id, month_key);
    CREATE INDEX company_info_monthly_usage_user_idx
      ON public.company_info_monthly_usage(user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'credits'
      AND column_name = 'partial_credit_accumulator'
  ) THEN
    UPDATE public.credits
    SET
      balance = balance * 2,
      monthly_allocation = monthly_allocation * 2;

    ALTER TABLE public.credits
      DROP COLUMN partial_credit_accumulator;
  END IF;
END $$;
