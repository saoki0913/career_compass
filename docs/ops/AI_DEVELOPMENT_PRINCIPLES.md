# AI開発の設計原則

AI を使った継続開発で、継ぎ足し実装による負債スパイラルを防ぐための運用原則です。
参考 URL はプロンプト本文ではなく運用文書側に閉じ、ここでは判断に使う思想だけを残します。

## 原則

- AI は既存コード修正と論理バグ修正が弱い前提で運用する。
- 新機能追加前に、必要なら最小リファクタを先に行う。
- DRY はコードの見た目ではなく、知識と責務の重複で判断する。
- 「とりあえず動く」より「後から直しやすい」を優先する。
- 設計理由を人間が短く説明できる状態を保つ。
- 画面、API、DB、AI、外部サービスの責務境界を崩さない。
- 大きい既存ファイルへ機能を継ぎ足す前に、分離の必要性を先に判定する。

## 運用ルール

- 高リスク変更では `write-prd` の前に `architecture-gate` を実行する。
- `architecture-gate` は `.omm/` とコードを根拠に `PASS` / `PASS_WITH_REFACTOR` / `BLOCK` を返す。
- `PASS_WITH_REFACTOR` の場合は、最小リファクタを機能実装より前に置く。
- `BLOCK` の場合は、`improve-architecture` で RFC を先に作る。

> `architecture-gate` / `improve-architecture` / `write-prd` / `prd-to-issues` / `tdd` は Claude Code では `.claude/skills/<name>/SKILL.md` として実装されており、自然言語で起動する。`.claude/commands/` には該当 command は存在しない（`deploy-production` / `reset-changes` / `update-docs` の 3 種のみ）。呼び出し方と全体像は [`docs/ops/AI_HARNESS.md`](./AI_HARNESS.md) 3-4 章を参照。

## 高リスク変更の目安

- `src/app/api/**` と `backend/app/**` をまたぐ新機能
- auth、billing、DB、calendar、AI、RAG、guest/user 境界の変更
- page / component / hook / loader / route handler の責務がまたがる変更
- すでに大きいモジュールへさらに責務を追加する変更

## この repo で特に警戒するホットスポット

- `backend/app/routers/company_info.py`
- `backend/app/routers/es_review.py`
- `backend/app/utils/llm.py`
- `src/components/companies/CorporateInfoSection.tsx`
- `src/components/es/ReviewPanel.tsx`
- `src/hooks/useESReview.ts`
- `src/lib/server/app-loaders.ts`

> hotspot リストの正本は `.claude/hooks/lib/skill-recommender.sh` の `HOTSPOT_FILES`。
> 追加・更新時は両方を同期する。

## 自動推奨ガードレール（Claude Code hooks）

機能改善・新機能追加・リファクタの依頼時に、以下のレビュー / リファクタ skill を自動推奨する hook がローカルで動作する（block ではなく context 注入）。
強制ではなく、Claude が判断して呼ぶ前提。

| 発火イベント | 発火条件 | 推奨 skill | 実装 |
|---|---|---|---|
| `UserPromptSubmit` | 「機能改善」「新機能」「リファクタ」「大規模」等の発話 | `architecture-gate` 着手前 / `code-reviewer` 実装後 | `.claude/hooks/user-prompt-submit-router.sh` |
| `UserPromptSubmit` | hotspot ファイル名（`es_review.py` 等）の言及 | `refactoring-specialist` / `maintainability-review` | 同上 |
| `UserPromptSubmit` | 「保守性」「品質レビュー」「コードレビュー」等の発話 | `maintainability-review` / `quality-review` / `code-reviewer` | 同上 |
| `PostToolUse (Edit\|Write)` | hotspot ファイル編集 | `refactoring-specialist` + `maintainability-review` + `code-reviewer` | `.claude/hooks/post-edit-dispatcher.sh` |
| `PostToolUse (Edit\|Write)` | 既存 500 行超ファイル（`.ts/.tsx/.py`）への追記 | `refactoring-specialist` / `architecture-gate` | 同上 |
| `PostToolUse (Edit\|Write)` | 同セッション内で `src/app/api/**` と `backend/app/**` 両方を編集 | `architect` / `maintainability-review` | 同上 |
| `Stop` | 変更ファイル数 ≥ 10 OR 変更行数 ≥ 500 OR hotspot 変更 | `maintainability-review` → `improvement-plan` → `refactoring-specialist` | `.claude/hooks/stop-summary.sh` |

すべて exit 0 で終了し作業を停止しない。閾値や hotspot リストは `.claude/hooks/lib/skill-recommender.sh` で集中管理する。
