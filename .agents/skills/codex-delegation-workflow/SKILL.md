---
name: codex-delegation-workflow
description: Codex CLI への作業委譲の判断基準とオーケストレーション手順。plan_review / implementation / post_review / imagegen の4モード。
language: ja
---

# Codex Delegation Workflow

Codex (Opus 4.6) から Codex CLI (GPT-5.4) へ作業を委譲するためのオーケストレーション指針。

## いつ Codex に委譲するか

### plan_review モード
- PRD / RFC / issue の設計レビューを独立した視点で行いたいとき
- architecture-gate の PASS_WITH_REFACTOR / BLOCK 判定の second opinion として
- 変更の影響範囲が広く、別モデルの視点が有用と判断されるとき

### implementation モード
- 独立性の高いタスク（テスト追加、ドキュメント生成、lint 修正）を並行処理したいとき
- Codex の context window が逼迫し、作業を分離したいとき
- Python / TypeScript の局所的な実装タスクで、Codex のコード生成を活用したいとき

### post_review モード
- 大規模変更（ファイル数 >= 10 or 行数 >= 500）の commit 前レビュー
- hotspot ファイルの変更を含む commit 前レビュー
- security-sensitive ファイル（auth, csrf, stripe, credits）の変更後
- マルチモデルレビューで見落としを減らしたいとき

### imagegen モード
- LP/UI 用の画像アセットを GPT Image 2 (`$imagegen`) で生成したいとき
- ヒーロー画像、機能イラスト、UI モック、デザイン素材の生成
- ChatGPT サブスク内で実行（API 課金なし）
- 品質: `.codex/skills/imagegen/` の構造化プロンプト + Anti-Tacky Guidelines を適用
- 出力先: `public/generated_images/` → 承認後に LP 正式アセットへ昇格
- Scope audit: `public/generated_images/` 外の変更は fail-close

## 委譲しないケース
- release / deploy / provider CLI 操作（release-engineer の領域）
- secrets へのアクセスが必要な作業
- scope の再定義が必要な設計判断（architect の領域）
- 既存の Codex agent / skill で十分対応可能な局所的修正
- ユーザーが明示的に Codex のみでの作業を求めている場合

## 実行手順

1. `/codex-plan-review` or `/codex-implement` or `/codex-post-review` or `/codex-imagegen` を実行
2. 内部で `scripts/codex/delegate.sh <mode>` が Codex CLI を非対話実行する（default timeout 3600s、長時間タスクのみ最大 7200s）。Bash ツール timeout は AGENTS.md「Bash Tool Timeout Policy」に従う
3. 結果は `.Codex/state/codex-handoffs/<request_id>/result.md` に保存される
4. Codex が結果を Read で読み込み、内容を判断する
5. 必要に応じて Codex の提案を採用・修正・却下する

## 失敗時フォールバック

| 失敗状態 | 標準動作 |
|---|---|
| TIMEOUT (default 3600s / max 7200s) | Codex が自身で作業を続行 |
| CODEX_ERROR (非ゼロ exit) | meta.json に記録、Codex が続行 |
| PARSE_FAILURE (result.md が空) | Codex が続行 |
| plan_review 失敗 | Codex 単独レビューへフォールバック |
| implementation 失敗 | Codex がスコープを縮めて自力実装 |
| post_review 失敗 | code-reviewer / security-auditor skill へ戻す |
| imagegen 失敗 | `$imagegen` 不可なら `image_gen.py` CLI (要 OPENAI_API_KEY) へ fallback |
| SCOPE_VIOLATION | imagegen で許可パス外の変更を検出。画像は収集せず Codex に報告 |

すべての失敗は `.Codex/state/codex-handoffs/<request_id>/meta.json` に記録される。

## 制約
- Codex に release, provider CLI, secret access, scope 再定義は持たせない
- AGENTS.md が正本（.codex/ 側のファイルは source of truth にしない）
- request/result は Markdown 正本 (v1)
- Codex が行った変更は Codex が検証してから commit する
- wrapper のガードレールは既存 hook の guardrail と同等（secrets, force-push, destructive rm）
