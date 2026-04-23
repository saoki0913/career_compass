# docs/review — 保守性・アーキテクチャレビュー

このディレクトリは、コード変更を伴わない**保守性・責務・状態管理**の観点からのレビュー記録を置く。


## 参照コンテキスト

- アーキテクチャの意図・層の説明: リポジトリ直下の `.omm/`（`request-lifecycle`、`data-flow`、`route-page-map` 等）。

## レビュー構成

- `ai_quality_comprehensive_*.md` — 全AI機能の横断的品質評価（7軸100点満点）。個別feature auditとは配点軸が異なるため補完的に参照
- `feature/` — 個別機能の深堀りaudit（6軸100点満点）
- `security/` — セキュリティ監査
- `rag-architecture/` — RAG設計レビュー
- `harness/` — Claude Code harness レビュー
- `maintainability-architecture/` — 保守性・アーキテクチャレビュー
- `TRACKER.md` — 全トピックの状態管理

## 新しいレビューを追加するとき

- 全文の複製を増やさない: **正本に追記できるなら正本を更新**するか、日付入りの**補遺・差分**ファイルを追加する。
- ファイル名は `YYYY-MM-DD-` 接頭辞または役割が分かる名前（例: `*-supplement-*.md`）を推奨。
