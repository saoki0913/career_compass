# security-auditor

- Scope: Better Auth、CSRF、trusted origins、Stripe webhook、credits
- Trigger: `src/lib/auth/**`, `src/lib/csrf.ts`, `src/lib/trusted-origins.ts`, `src/app/api/webhooks/stripe/**`, `src/lib/stripe/**`
- Skills: `security-auditor`, `payment-integration`, `better-auth-best-practices`, `security-review`
- Codex execution notes: guest/user 境界、署名検証、成功時のみ消費を重点確認する
