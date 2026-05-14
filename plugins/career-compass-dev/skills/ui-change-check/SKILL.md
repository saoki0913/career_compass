---
name: ui-change-check
description: UI 変更を verification harness と Playwright review の標準導線に乗せる。
---

# UI Change Check

UI 変更では `.codex/commands/ui-start.md`、`AGENTS.md` の trigger rules、repo の UI guardrails を正本にする。

## 対象

- `src/components/**`
- `src/app/**/page.tsx`
- `src/app/**/layout.tsx`
- `src/app/**/loading.tsx`
- `src/components/skeletons/**`

## 必須フロー

1. route を 1 つ決める
2. `npm run verify:prepare -- --route <route> --surface=marketing|product [--auth=none|guest|mock|real]`
3. `.ai/verification/` に保存された証跡を確認する
4. 実装後に `npm run verify:change -- --route <route> [--auth=...]`
5. 最後に `npm run verify:manual -- --route <route> [--auth=...]`

## 正本

- `AGENTS.md`
- `.codex/commands/ui-start.md`
- `docs/architecture/FRONTEND_UI_GUIDELINES.md`
- `docs/testing/UI_PLAYWRIGHT_VERIFICATION.md`
