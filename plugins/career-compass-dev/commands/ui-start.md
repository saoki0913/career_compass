---
description: UI 実装の開始から review までを標準フローに乗せる。
---

<instructions>
UI 変更では、まずこの入口を使う。詳細は `.codex/commands/ui-start.md` を正本にする。

1. 対象 route を 1 つ決める
2. `npm run verify:prepare -- --route <route> --surface=marketing|product [--auth=none|guest|mock|real]`
3. 証跡が `.ai/verification/` に保存されたことを確認する
4. その後に UI 実装を始める
5. 実装後に `npm run verify:change -- --route <route> [--auth=...]`
6. 最後に `npm run verify:manual -- --route <route> [--auth=...]`

marketing UI:
- 必要時のみ `seo-change-check` の観点を追加する

product UI:
- `frontend-refactor-check` の観点を追加する

正本:
- `.codex/commands/ui-start.md`
- `AGENTS.md`
- `docs/architecture/FRONTEND_UI_GUIDELINES.md`
</instructions>
