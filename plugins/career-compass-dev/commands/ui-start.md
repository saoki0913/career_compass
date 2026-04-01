---
description: UI 実装の開始から review までを標準フローに乗せる。
---

<instructions>
UI 変更では、まずこの入口を使う。

1. 対象 route を 1 つ決める
2. `npm run ui:preflight -- <route> --surface=marketing|product [--auth=none|guest]`
3. 出力 Markdown の要点を会話、PR、本作業ログのいずれかに残す
4. 実装後に `npm run lint:ui:guardrails`
5. 実装後に `npm run test:ui:review -- <route> [--auth=guest|mock]`

marketing UI:
- 必要時のみ `seo-change-check` の観点を追加する

product UI:
- `frontend-refactor-check` の観点を追加する

正本:
- `.codex/commands/ui-start.md`
- `AGENTS.md`
- `docs/architecture/FRONTEND_UI_GUIDELINES.md`
</instructions>
