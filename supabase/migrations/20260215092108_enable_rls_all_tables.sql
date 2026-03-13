-- ==========================================================================
-- RLS: Defense-in-Depth for Career Compass
-- ==========================================================================
-- ENABLE RLS on ALL 33 tables. No permissive policies.
-- Effect:
--   postgres superuser (Drizzle ORM)  → BYPASSES RLS → no impact on app
--   anon/authenticated (REST API)     → BLOCKED → defense-in-depth
-- ==========================================================================

-- Auth tables (Better Auth)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE verifications ENABLE ROW LEVEL SECURITY;

-- Guest tables
ALTER TABLE guest_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_prompts ENABLE ROW LEVEL SECURITY;

-- User data (dual ownership: userId XOR guestId)
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE gakuchika_contents ENABLE ROW LEVEL SECURITY;
ALTER TABLE es_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE motivation_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_free_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE submission_items ENABLE ROW LEVEL SECURITY;

-- User-only data
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;

-- Child tables
ALTER TABLE job_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE deadlines ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE gakuchika_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

-- Engagement tables
ALTER TABLE template_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_favorites ENABLE ROW LEVEL SECURITY;

-- System/admin tables
ALTER TABLE processed_stripe_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE waitlist_signups ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_messages ENABLE ROW LEVEL SECURITY;
