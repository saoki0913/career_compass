---
description: UI 作業の開始前に preflight を必ず通し、実装後に Playwright review までつなぐ。
---

<instructions>
UI タスクでは、最初に次を行う。

1. 対象 route を 1 つ決める
2. `npm run verify:prepare -- --route <route> --surface=marketing|product [--auth=none|guest|mock|real]` を実行する
3. 証跡は `.ai/verification/` に保存される
4. その後にだけ UI 実装を始める
5. 実装後は `npm run verify:change -- --route <route> [--auth=...]` を実行する
6. 最後に `npm run verify:manual -- --route <route> [--auth=...]` で目視確認を記録する

補足:
- 新規 UI / 大きな改修では `docs/architecture/FRONTEND_UI_GUIDELINES.md` の hard rules を優先する
- 既存画面では既存の visual language と layout pattern を壊さない
</instructions>
