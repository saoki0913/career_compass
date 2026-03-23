---
description: UI 作業の開始前に preflight を必ず通し、実装後に Playwright review までつなぐ。
---

<instructions>
UI タスクでは、最初に次を行う。

1. 対象 route を 1 つ決める
2. `npm run ui:preflight -- <route> --surface=marketing|product [--auth=none|guest]` を実行する
3. 出力された Markdown の要点を会話や作業ログに残す
4. その後にだけ UI 実装を始める
5. 実装後は `npm run test:ui:review -- <route> [--auth=guest]` を実行する

補足:
- 新規 UI / 大きな改修では `docs/architecture/FRONTEND_UI_GUIDELINES.md` の hard rules を優先する
- 既存画面では既存の visual language と layout pattern を壊さない
</instructions>
