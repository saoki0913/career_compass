---
description: provider 別の依頼を repo 正本の skill と docs に接続する。
---

<instructions>
infra や SaaS 連携では provider ごとに入口を分ける。

- Vercel: release workflow と `vercel-*` 系 skill
- Railway: `railway-ops`
- Supabase: `supabase-ops`
- Cloudflare: `cloudflare-deploy`
- Stripe: billing / webhook は security review を優先する

方針:
- provider CLI の直接操作を標準にしない
- repo 内 docs と scripts を正本にする
</instructions>
