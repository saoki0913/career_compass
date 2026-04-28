---
description: Codex CLI に現在の変更のコードレビューを委譲する
---

Codex CLI (GPT-5.5) の `codex review --uncommitted` で uncommitted changes をレビューする。

手順:
1. `git diff --stat` で現在の変更を確認する。変更がなければスキップ
2. wrapper を実行する: `bash scripts/codex/delegate.sh post_review`
3. `.claude/state/codex-handoffs/` の最新ディレクトリから `result.md` を Read で読み取る
4. Codex のレビュー結果を要約し、severity=high の指摘があれば対応する
5. 失敗時は Claude 自身の code-reviewer / security-auditor skill で同等のレビューを行う

注意:
- `codex review --uncommitted` を使用する（Codex 組み込みのレビュー機能）
- 結果は advisory であり、Claude が最終判断する
- 大規模変更（ファイル数 ≥10 / 行数 ≥500 / hotspot 変更）で特に有効
