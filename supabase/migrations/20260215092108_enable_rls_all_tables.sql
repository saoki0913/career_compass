-- ==========================================================================
-- RLS: Defense-in-Depth for Career Compass
-- ==========================================================================
-- ENABLE RLS on ALL 33 tables. No permissive policies.
-- Effect:
--   postgres superuser (Drizzle ORM)  → BYPASSES RLS → no impact on app
--   anon/authenticated (REST API)     → BLOCKED → defense-in-depth
-- ==========================================================================

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    -- Auth tables (Better Auth)
    'users',
    'sessions',
    'accounts',
    'verifications',
    -- Guest tables
    'guest_users',
    'login_prompts',
    -- User data (dual ownership: userId XOR guestId)
    'companies',
    'applications',
    'tasks',
    'documents',
    'notifications',
    'gakuchika_contents',
    'es_templates',
    'motivation_conversations',
    'daily_free_usage',
    'submission_items',
    -- User-only data
    'user_profiles',
    'credits',
    'credit_transactions',
    'subscriptions',
    'calendar_settings',
    'notification_settings',
    -- Child tables
    'job_types',
    'deadlines',
    'document_versions',
    'ai_threads',
    'ai_messages',
    'gakuchika_conversations',
    'calendar_events',
    -- Engagement tables
    'template_likes',
    'template_favorites',
    -- System/admin tables
    'processed_stripe_events',
    'waitlist_signups',
    'contact_messages'
  ]
  LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    END IF;
  END LOOP;
END
$$;
