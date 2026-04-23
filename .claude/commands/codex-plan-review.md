---
description: Codex CLI に設計/計画の read-only レビューを委譲する
---

Codex CLI (GPT-5.4) に設計レビューを委譲して、マルチモデルの second opinion を得る。

手順:
1. レビュー対象の設計文書を特定する（docs/prd/, docs/rfc/, docs/issues/, または現在のプラン）
2. 対象内容を一時ファイルに書き出す: `/tmp/codex-ctx-<timestamp>.md`
3. wrapper を実行する: `bash scripts/codex/delegate.sh plan_review --context-file <path>`
4. `.claude/state/codex-handoffs/` の最新ディレクトリから `result.md` を Read で読み取る
5. Codex の findings を要約し、Claude 自身の判断と統合する
6. 失敗時 (TIMEOUT / CODEX_ERROR) は Claude 自身で同等のレビューを行い、失敗理由を会話に記録する

注意:
- Codex は read-only sandbox で実行される。ファイル編集は行わない。
- 結果は advisory であり、最終判断は Claude が行う。
- codex-delegation-workflow skill に詳細な判断基準がある。
