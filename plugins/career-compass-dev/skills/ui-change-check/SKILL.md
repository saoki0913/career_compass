---
name: ui-change-check
description: UI 変更を `ui:preflight`、guardrails、Playwright review の標準導線に乗せる。
---

# UI Change Check

UI 変更では `AGENTS.md` の trigger rules と repo の UI guardrails を正本にする。

## 対象

- `src/components/**`
- `src/app/**/page.tsx`
- `src/app/**/layout.tsx`
- `src/app/**/loading.tsx`
- `src/components/skeletons/**`

## 必須フロー

1. route を 1 つ決める
2. `npm run ui:preflight -- <route> --surface=marketing|product [--auth=none|guest]`
3. 出力 Markdown の要点を会話、PR、本作業ログのいずれかに残す
4. 実装後に `npm run lint:ui:guardrails`
5. 実装後に `npm run test:ui:review -- <route> [--auth=guest|mock]`

## 正本

- `AGENTS.md`
- `docs/architecture/FRONTEND_UI_GUIDELINES.md`
- `docs/testing/UI_PLAYWRIGHT_VERIFICATION.md`
