---
description: Codex にコードレビューを委譲する（Plugin primary / delegate.sh fallback）
---

Codex でコードレビューを実行する。Plugin (`/codex:review`) を primary、delegate.sh を fallback として使う。

手順:
1. `git diff --stat` で現在の変更を確認する。変更がなければスキップ
2. **Primary**: `/codex:review` を実行（`--base <ref>` でブランチ比較可）
3. `/codex:status` で完了確認 → `/codex:result` で結果取得
4. **Fallback**: Plugin が使えない場合 `bash scripts/codex/delegate.sh post_review` → handoff から `result.md` を Read
5. レビュー結果を要約し、severity=high の指摘があれば対応する
6. §B-3 条件に該当する場合 `/codex:adversarial-review` も追加実行（advisory）
7. 失敗時は Claude 自身の code-reviewer / security-auditor skill で同等のレビューを行う

注意:
- code-reviewer は blocking reviewer。結果取得前に commit / push / 最終回答へ進まない
- `/codex:status` timeout、pending、running は承認ではない。待機を継続するか、ユーザーの明示指示を得る
- Plugin 経由の checkpoint は `plugin-reviewed` 決定タイプを使用
- 結果は advisory であり、Claude が最終判断する
- 大規模変更（ファイル数 ≥10 / 行数 ≥500 / hotspot 変更）で特に有効
