---
name: quality-review
description: 品質レビュー・監査の実施。対象領域をヒアリングし、サブエージェントに委譲して docs/review/ に記録を残す。
language: ja
---

# Quality Review — 品質レビュー実施スキル

docs/review/ に記録する品質レビュー・監査を実施する。

## ワークフロー

### Step 1: 現状把握

`docs/review/TRACKER.md` を読み、対象 topic の既存レビュー・計画の有無を確認する。前回レビューがあれば日付と主要指摘を把握する。

### Step 2: ヒアリング（必須）

以下を確認してから作業を開始する。ユーザーが十分な情報を提供済みなら省略可:

- **対象**: レビュー対象（機能名、ファイル群、システム全体など）
- **深度**: クイックチェック or フル監査
- **重点領域**: セキュリティ / 機能品質 / 保守性 / パフォーマンス / 特定の懸念事項
- **前回差分**: 前回レビューが存在する場合、差分に注目するか

### Step 3: カテゴリ判定とサブエージェント委譲

| カテゴリ | ディレクトリ | 委譲先 |
|---------|------------|--------|
| 機能品質 | feature/ | prompt-engineer, code-reviewer |
| セキュリティ | security/ | security-auditor |
| 保守性・設計 | maintainability-architecture/ | architect, code-reviewer |
| ハーネス | harness/ | 直接実施 |

複数領域にまたがる場合は、カテゴリごとに分割してレビューを実施する。

### Step 4: レビュー実施

対象コードを読み、findings をテーブル形式（重篤度: Critical / High / Medium / Low）でまとめる。具体的なファイルパスと行番号を含める。

### Step 5: ドキュメント作成

docs/review/<category>/ にファイルを作成する。

**命名規約**（`docs/review/README.md` 準拠）:

| カテゴリ | パターン |
|---------|---------|
| feature | `<機能名>_quality_audit_YYYYMMDD.md` |
| security | `<領域名>_YYYY-MM-DD.md` |
| maintainability-architecture | `YYYY-MM-DD-<トピック>.md` |
| harness | `YYYY-MM-DD-<トピック>.md` |

**ファイル冒頭に YAML frontmatter を付与する**:

```yaml
---
topic: <トピック名（英語ケバブケース、TRACKER の topic 列と一致）>
review_date: YYYY-MM-DD
category: <feature|security|maintainability-architecture|harness>
supersedes: <前回レビューのファイル名（あれば）>
status: active
---
```

### Step 6: TRACKER 更新と検証

1. `docs/review/TRACKER.md` の該当行を更新（行がなければ追加）
2. `npm run test:review-tracker` で整合性を確認

## ルール

- ヒアリングなしにレビューを開始しない
- 同 topic の旧ファイルは削除しない（履歴証跡として残す）
- 旧ファイルの frontmatter `status` を `superseded` に更新する
