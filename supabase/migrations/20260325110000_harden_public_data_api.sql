-- ============================================================================
-- Harden Supabase Data API for server-side-only access
-- ============================================================================
-- This project uses direct Postgres connections via Drizzle ORM.
-- Supabase's generated Data API is not a product dependency, so public schema
-- access is locked down with deny-all RLS and revoked grants.
--
-- Goals:
--   1) Ensure every existing public table has RLS enabled.
--   2) Revoke public schema access from anon/authenticated roles.
--   3) Revoke current and default grants on public tables/sequences/functions.
--   4) Auto-harden future public tables via an event trigger.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.apply_public_schema_hardening()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  table_record record;
BEGIN
  FOR table_record IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',
      table_record.schemaname,
      table_record.tablename
    );

    EXECUTE format(
      'REVOKE ALL ON TABLE %I.%I FROM anon, authenticated',
      table_record.schemaname,
      table_record.tablename
    );
  END LOOP;

  REVOKE USAGE ON SCHEMA public FROM anon, authenticated;
  REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
  REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
  REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;

  ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
END;
$$;

SELECT public.apply_public_schema_hardening();

CREATE OR REPLACE FUNCTION public.on_public_schema_ddl_hardening()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  PERFORM public.apply_public_schema_hardening();
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_event_trigger
    WHERE evtname = 'career_compass_public_schema_ddl_hardening'
  ) THEN
    CREATE EVENT TRIGGER career_compass_public_schema_ddl_hardening
      ON ddl_command_end
      WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS')
      EXECUTE FUNCTION public.on_public_schema_ddl_hardening();
  END IF;
END;
$$;
