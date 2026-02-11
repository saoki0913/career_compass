-- Row Level Security (RLS) policies for multi-tenant data isolation.
-- Defense-in-depth: even if application-level checks are bypassed,
-- direct DB access is restricted by user ownership.
--
-- NOTE: These policies use `current_setting('app.current_user_id')` and
-- `current_setting('app.current_guest_id')` which must be SET before queries
-- when using direct DB connections. Drizzle ORM queries from the application
-- already enforce ownership at the application level.

-- ============================================================
-- Companies
-- ============================================================
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY companies_user_isolation ON companies
  USING (
    user_id = current_setting('app.current_user_id', true)
    OR guest_id = current_setting('app.current_guest_id', true)
  );

-- ============================================================
-- Documents
-- ============================================================
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY documents_user_isolation ON documents
  USING (
    user_id = current_setting('app.current_user_id', true)
    OR guest_id = current_setting('app.current_guest_id', true)
  );

-- ============================================================
-- Tasks
-- ============================================================
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY tasks_user_isolation ON tasks
  USING (
    user_id = current_setting('app.current_user_id', true)
    OR guest_id = current_setting('app.current_guest_id', true)
  );

-- ============================================================
-- Applications
-- ============================================================
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY applications_user_isolation ON applications
  USING (
    user_id = current_setting('app.current_user_id', true)
    OR guest_id = current_setting('app.current_guest_id', true)
  );

-- ============================================================
-- Notifications
-- ============================================================
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY notifications_user_isolation ON notifications
  USING (
    user_id = current_setting('app.current_user_id', true)
    OR guest_id = current_setting('app.current_guest_id', true)
  );

-- ============================================================
-- Gakuchika Contents
-- ============================================================
ALTER TABLE gakuchika_contents ENABLE ROW LEVEL SECURITY;

CREATE POLICY gakuchika_contents_user_isolation ON gakuchika_contents
  USING (
    user_id = current_setting('app.current_user_id', true)
    OR guest_id = current_setting('app.current_guest_id', true)
  );

-- ============================================================
-- ES Templates
-- ============================================================
ALTER TABLE es_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY es_templates_user_isolation ON es_templates
  USING (
    user_id = current_setting('app.current_user_id', true)
    OR guest_id = current_setting('app.current_guest_id', true)
    OR is_public = true
  );

-- ============================================================
-- Motivation Conversations
-- ============================================================
ALTER TABLE motivation_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY motivation_conversations_user_isolation ON motivation_conversations
  USING (
    user_id = current_setting('app.current_user_id', true)
    OR guest_id = current_setting('app.current_guest_id', true)
  );

-- ============================================================
-- Daily Free Usage
-- ============================================================
ALTER TABLE daily_free_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY daily_free_usage_user_isolation ON daily_free_usage
  USING (
    user_id = current_setting('app.current_user_id', true)
    OR guest_id = current_setting('app.current_guest_id', true)
  );

-- ============================================================
-- Submission Items
-- ============================================================
ALTER TABLE submission_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY submission_items_user_isolation ON submission_items
  USING (
    user_id = current_setting('app.current_user_id', true)
    OR guest_id = current_setting('app.current_guest_id', true)
  );

-- ============================================================
-- User-only tables (no guest access)
-- ============================================================
ALTER TABLE credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY credits_user_isolation ON credits
  USING (user_id = current_setting('app.current_user_id', true));

ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY credit_transactions_user_isolation ON credit_transactions
  USING (user_id = current_setting('app.current_user_id', true));

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY subscriptions_user_isolation ON subscriptions
  USING (user_id = current_setting('app.current_user_id', true));

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_profiles_user_isolation ON user_profiles
  USING (user_id = current_setting('app.current_user_id', true));

ALTER TABLE calendar_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY calendar_settings_user_isolation ON calendar_settings
  USING (user_id = current_setting('app.current_user_id', true));

ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY notification_settings_user_isolation ON notification_settings
  USING (user_id = current_setting('app.current_user_id', true));

-- ============================================================
-- Bypass policy for the service role (application server)
-- The Drizzle ORM connection uses the service role, which should
-- bypass RLS. This is the default for the postgres superuser.
-- If using a non-superuser role, uncomment the following:
-- ============================================================
-- ALTER TABLE companies FORCE ROW LEVEL SECURITY;
-- CREATE POLICY service_role_bypass ON companies TO service_role USING (true);
