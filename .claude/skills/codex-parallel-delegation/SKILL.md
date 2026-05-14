---
name: codex-parallel-delegation
description: Claude がタスクを分解し、Plugin (/codex:rescue) + MCP (codex()) を使い分けて Codex エージェントに並列委譲するための指針。
language: ja
---

# Codex 並列委譲ガイド

Plugin + MCP の 2 チャネルを活用し、タスクを並列で Codex エージェントに委譲する。

## パターン A: 並列 fire-and-forget（Plugin）

独立した複数サブタスクを同時実行。結果を Claude が統合する。

1. タスクを 2-4 の独立サブタスクに分解（ドメイン別: frontend/backend/security/test）
2. 各サブタスクに `/codex:rescue --background` を発火
   - プロンプトに対象ファイルパスを明示（`.codex/config.toml [routing]` がエージェント自動選択）
   - 制約・ビジネスルール・テスト期待値を含む
3. `/codex:status` で全ジョブ監視
4. 全完了後 `/codex:result` で結果収集
5. Claude が統合・競合解決・検証（tsc, テスト, diff review）

## パターン B: 主タスク対話 + サブタスク並列（MCP + Plugin）

メインタスクは対話的ステアリング、付随タスクは並列実行。

1. メインタスク → MCP `codex(heavy_impl)` で対話的ステアリング
   - `codex-reply()` で追加指示・方向修正（最大 3 ターン）
2. 独立した付随タスク → `/codex:rescue --background` で並列実行
3. `/codex:status` でサブタスク完了を監視
4. MCP メインタスク完了後、Plugin サブタスク結果を統合
5. 競合があれば Claude が解決

## パターン C: 並列調査（MCP review_only）

調査観点を分割し、複数の read-only セッションで並列調査する。

1. 調査観点を 2-3 に分割（例: security / architecture / test coverage）
2. 各観点に MCP `codex(review_only)` を発火
3. 結果を統合して判断
4. 実装が必要なら パターン A or B へ移行

## エージェント指定

`.codex/config.toml [routing]` がファイルパスからエージェントを自動選択する。プロンプトに対象ファイルを明示すれば適切なエージェントが起動する。

明示指定したい場合はプロンプトに含める:
```
.codex/agents/fastapi-developer.toml の指針に従って実装してください。
```

## 注意事項

- 並列実行中は Claude はファイル編集を行わない（競合防止）
- 各サブタスクは互いに独立していること（同一ファイルを複数ジョブが編集しない）
- code-reviewer が含まれる場合は blocking。全完了前に「大筋は変わらない」と推測して統合・計画確定・最終回答へ進まない
- `/codex:status` timeout / pending / running は code-reviewer の完了ではない。待機を継続するか、ユーザーが明示的に待機不要と指示した場合だけ例外にする
- 結果統合後に `/codex:review` で統合レビューを実行
- 設計判断が含まれる場合は `/codex:adversarial-review` も実行
