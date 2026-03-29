---
name: infra-integration-check
description: Vercel、Railway、Supabase、Cloudflare、Stripe の依頼を repo 正本の skill と docs に接続する。
---

# Infra Integration Check

infra や SaaS 連携では、provider CLI を先に叩かず repo 正本を参照する。

## provider 別の入口

- Vercel: release workflow と `vercel-*` 系 skill
- Railway: `railway-ops`
- Supabase: `supabase-ops`
- Cloudflare: `cloudflare-deploy`
- Stripe: security review を優先

## 方針

- `scripts/release/`, `scripts/bootstrap/`, `docs/release/`, `docs/ops/CLI_GUARDRAILS.md` を正本にする
- provider 固有操作より先に、repo 標準の script / make target を探す
