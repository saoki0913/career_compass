export const SECRET_PATTERNS = Object.freeze([
  { name: "stripe_live_secret", regex: /sk_live_[A-Za-z0-9]{12,}/g },
  { name: "stripe_test_secret", regex: /sk_test_[A-Za-z0-9]{12,}/g },
  { name: "stripe_webhook_secret", regex: /whsec_[A-Za-z0-9]{12,}/g },
  { name: "openai_secret", regex: /sk-proj-[A-Za-z0-9_-]{20,}/g },
  { name: "openai_legacy_secret", regex: /sk-[A-Za-z0-9]{20,}/g },
  { name: "anthropic_secret", regex: /sk-ant-[A-Za-z0-9_-]{20,}/g },
  { name: "github_token", regex: /gh[opsu]_[A-Za-z0-9]{36}/g },
  { name: "supabase_project_token", regex: /sbp_[0-9a-f]{40}/g },
  { name: "jwt", regex: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g },
  {
    name: "production_database_url",
    regex: /postgres(?:ql)?:\/\/[^"'\s<>]+@[^"'\s<>]*(?:supabase\.com|pooler\.supabase\.com)[^"'\s<>]*/g,
  },
  {
    name: "named_secret_assignment",
    regex:
      /(?:OPENAI_API_KEY|ANTHROPIC_API_KEY|GOOGLE_API_KEY|BETTER_AUTH_SECRET|DATABASE_URL|STRIPE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY)\s*[=:]\s*["'][^"']{8,}["']/g,
  },
]);

