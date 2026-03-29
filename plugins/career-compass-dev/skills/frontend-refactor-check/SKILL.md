---
name: frontend-refactor-check
description: Next.js / React 変更を既存 UI guide と Vercel best practices に揃える。
---

# Frontend Refactor Check

frontend refactor では既存 visual language を壊さず、Next.js / React の責務分離を優先する。

## 確認項目

- Server / Client boundary は妥当か
- 不要な state / effect / client 化が増えていないか
- route preflight と UI review を実施したか
- 既存デザインシステムとレスポンシブ導線を壊していないか

## 正本

- `docs/architecture/FRONTEND_UI_GUIDELINES.md`
- `AGENTS.md`
- `vercel-react-best-practices`
