---
description: Codex CLI に実装タスクを委譲する（workspace-write sandbox）
---

Codex CLI (GPT-5.4) に独立性の高い実装タスクを委譲する。

手順:
1. 実装対象のタスク記述をユーザーから受け取るか、docs/issues/ から特定する
2. タスク内容を一時ファイルに書き出す: `/tmp/codex-ctx-<timestamp>.md`
3. wrapper を実行する: `bash scripts/codex/delegate.sh implementation --context-file <path>`
4. `.claude/state/codex-handoffs/` の最新ディレクトリから `result.md` を Read で読み取る
5. Codex が行った変更を `git diff` で確認する
6. 変更内容をレビューし、必要に応じて追加修正を行う
7. 失敗時は Claude 自身で実装を続行する

注意:
- Codex は workspace-write sandbox で実行される（ファイル編集可能）
- git push, rm -rf (whitelist 外), secrets アクセスは wrapper レベルで禁止
- Codex が行った変更は commit されない。Claude が検証後に commit する
- codex-delegation-workflow skill に詳細な判断基準がある
