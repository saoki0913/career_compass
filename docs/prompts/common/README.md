# 共通プロンプト面

> runtime_linkage: forbidden

このディレクトリは、複数 AI 機能にまたがる LLM prompt surface のレビュー用スナップショットです。runtime 正本ではありません。

## 文書

- `json-repair.md`: JSON 解析失敗時の修復プロンプト。
- `provider-append.md`: JSON レスポンス用の provider 別注意書き。
- `safety-and-leakage.md`: `docs/prompts/**` と runtime prompt 変更時の漏洩防止ルール。
