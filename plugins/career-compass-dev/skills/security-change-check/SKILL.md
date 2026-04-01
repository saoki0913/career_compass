---
name: security-change-check
description: auth、webhook、payment、guest/user ownership の変更を security review 観点で確認する。
---

# Security Change Check

security-sensitive な変更では `security-review` の観点を先に当てる。

## 対象

- `src/lib/auth/**`
- `src/lib/csrf.ts`
- `src/lib/trusted-origins.ts`
- `src/app/api/webhooks/stripe/route.ts`

## 確認項目

- auth / authorization が壊れていないか
- guest / user の owner 判定が維持されているか
- CSRF / trusted origins / webhook signature が維持されているか
- raw error や秘密情報を UI に漏らしていないか
- provider CLI を repo 正本より優先していないか
