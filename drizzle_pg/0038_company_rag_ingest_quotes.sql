CREATE TABLE IF NOT EXISTS "company_rag_ingest_quotes" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "company_id" text NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "kind" text NOT NULL,
  "input_hash" text NOT NULL,
  "plan_snapshot" text NOT NULL,
  "estimated_html_units" integer DEFAULT 0 NOT NULL,
  "estimated_pdf_units" integer DEFAULT 0 NOT NULL,
  "estimated_credits" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'quoted' NOT NULL,
  "source_results" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "reservation_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "reserved_at" timestamp with time zone,
  "confirmed_at" timestamp with time zone,
  "canceled_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "company_rag_ingest_quotes_kind_check" CHECK ("kind" in ('url', 'pdf')),
  CONSTRAINT "company_rag_ingest_quotes_status_check" CHECK ("status" in ('quoted', 'reserved', 'confirmed', 'canceled', 'expired'))
);

CREATE INDEX IF NOT EXISTS "company_rag_ingest_quotes_user_company_idx"
  ON "company_rag_ingest_quotes" ("user_id", "company_id");

CREATE INDEX IF NOT EXISTS "company_rag_ingest_quotes_status_expires_idx"
  ON "company_rag_ingest_quotes" ("status", "expires_at");

-- SAFE: new login-only quote table owner-integrity trigger; no existing rows are rewritten.
CREATE OR REPLACE FUNCTION "company_rag_ingest_quotes_enforce_owner"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "companies"
    WHERE "companies"."id" = NEW."company_id"
      AND "companies"."user_id" = NEW."user_id"
      AND "companies"."guest_id" IS NULL
  ) THEN
    RAISE EXCEPTION 'company_rag_ingest_quotes company owner mismatch'
      USING ERRCODE = '23514',
            CONSTRAINT = 'company_rag_ingest_quotes_company_owner_check';
  END IF;

  RETURN NEW;
END;
$$;

-- SAFE: trigger is created on the new quote table before app writes are enabled.
CREATE TRIGGER "company_rag_ingest_quotes_enforce_owner_trigger"
  BEFORE INSERT OR UPDATE OF "user_id", "company_id"
  ON "company_rag_ingest_quotes"
  FOR EACH ROW
  EXECUTE FUNCTION "company_rag_ingest_quotes_enforce_owner"();
