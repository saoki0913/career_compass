---
description: Codex に実装タスクを委譲する（MCP primary / Plugin rescue / delegate.sh fallback）
---

Codex に独立性の高い実装タスクを委譲する。タスクの性質に応じてチャネルを選択する。

チャネル選択:
- **対話的ステアリング必要** → MCP `codex(heavy_impl)` + `codex-reply`
- **fire-and-forget でよい** → Plugin `/codex:rescue [--background]`
- **バッチ fallback** → `bash scripts/codex/delegate.sh implementation --context-file <path>`

手順（MCP primary）:
1. 実装対象のタスクとコンテキストを準備する
2. `mcp__codex__codex(prompt, cwd, profile=heavy_impl, sandbox=workspace-write)` を実行
3. 結果確認 → 追加指示は `codex-reply`（最大 3 ターン）
4. `git diff` で変更を確認 → 検証（tsc, テスト）
5. 不合格 → `codex-reply` でフィードバック（1 回のみ）→ まだ不合格 → Claude 直接修正

手順（Plugin rescue）:
1. `/codex:rescue [--background]` でタスクを委譲
2. `/codex:status` で完了確認 → `/codex:result` で結果取得
3. `git diff` で変更を確認 → 検証

手順（delegate.sh fallback）:
1. コンテキストを `/tmp/codex-ctx-<timestamp>.md` に書き出す
2. `bash scripts/codex/delegate.sh implementation --context-file <path>` を実行
3. handoff から `result.md` を Read → `git diff` で確認 → 検証

注意:
- Codex は workspace-write sandbox で実行される（ファイル編集可能）
- git push, rm -rf (whitelist 外), secrets アクセスは禁止
- Codex が行った変更は commit されない。Claude が検証後に commit する
- codex-delegation-workflow / codex-parallel-delegation skill に詳細な判断基準がある
