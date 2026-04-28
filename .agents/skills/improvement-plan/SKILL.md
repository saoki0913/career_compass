---
name: improvement-plan
description: 品質レビューに基づく改善計画の作成。レビュー結果を優先順位付けし docs/plan/ に計画書を残す。
language: ja
---

# Improvement Plan — 改善計画作成スキル

docs/plan/ に記録する改善計画を作成する。

## ワークフロー

### Step 1: レビュー確認

1. `docs/review/TRACKER.md` を読み、対象 topic の最新レビューと既存計画を確認する
2. 最新レビューを読み、findings の全体像を把握する
3. 既存の計画書がある場合はその状態（未着手/進行中/完了）を確認する

レビューが存在しない場合はユーザーに通知し、先に quality-review skill の実施を提案する。

### Step 2: ヒアリング（必須）

以下を確認してから計画書を作成する:

- **優先項目**: レビュー findings のうち優先的に対処するもの（Critical/High は原則全件含める）
- **計画タイプ**: IMPROVEMENT（段階的改善）/ HOTFIX（緊急修正）/ REDESIGN（再設計）
- **目標メトリクス**: 達成条件（例: 「Grade D → B+」「Critical 0件」）
- **タイムライン**: 制約があれば（Phase 依存、他計画との関係）
- **除外項目**: 今回の計画から除外するもの

### Step 3: 計画設計

architect サブエージェントに委譲し、以下を設計する:

- 実装ステップの分解（ID 付き: S-1, M-1, P-1 等）
- ステップ間の依存関係
- 各ステップの委譲先サブエージェント（AGENTS.md Subagent Routing 参照）
- blast radius の評価

### Step 4: ドキュメント作成

docs/plan/ に `<TOPIC>_<TYPE>_PLAN.md` を作成する。

**ファイル冒頭に YAML frontmatter を付与する**:

```yaml
---
topic: <トピック名（英語ケバブケース、TRACKER の topic 列と一致）>
plan_date: YYYY-MM-DD
based_on_review: <category/レビューファイル名>
status: 未着手
---
```

**本文ヘッダー**:

```markdown
**根拠レビュー**: docs/review/<category>/<ファイル名>
**目標**: <達成条件>
**委譲先**: <サブエージェント名>
```

### Step 5: TRACKER・EXECUTION_ORDER 更新と検証

1. `docs/review/TRACKER.md` の該当行を更新（行がなければ追加）
2. `docs/plan/EXECUTION_ORDER.md` の該当 Phase に追記（新 Phase が必要なら末尾に追加）
3. `npm run test:review-tracker` で整合性を確認

## ルール

- レビューが存在しない topic の計画は作成しない（先にレビューを促す）
- 既存の計画が `未着手` の場合、新規作成ではなく更新を提案する
- `superseded` にする場合は TRACKER の備考に後継計画を記載する
- ヒアリングなしに計画を開始しない
