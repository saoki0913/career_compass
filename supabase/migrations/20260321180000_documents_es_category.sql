-- ES エディタ文書の分類（type は引き続き es。documents.type の tips とは別）
ALTER TABLE IF EXISTS public.documents
  ADD COLUMN IF NOT EXISTS es_category text NOT NULL DEFAULT 'entry_sheet';

DO $$
BEGIN
  IF to_regclass('public.documents') IS NOT NULL THEN
    COMMENT ON COLUMN public.documents.es_category IS 'entry_sheet|resume|assignment|memo|interview_prep|tips|reflection|other';
  END IF;
END $$;
