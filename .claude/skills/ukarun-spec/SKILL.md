---
name: ukarun:spec
description: SPEC.mdから特定セクションの仕様を確認。/ukarun:spec credits, /ukarun:spec list など
---

# Skill: /ukarun:spec - 仕様確認コマンド

## Description
SPEC.mdから特定セクションの仕様を抽出・整理して表示する。実装前の仕様確認に使用。

## Trigger
- `/ukarun:spec {section}` - 指定セクションの仕様を表示
- `/ukarun:spec list` - 全セクション一覧を表示
- `/ukarun:spec search {keyword}` - キーワードで仕様を検索

## Section Mapping

| Command | Section | Title |
|---------|---------|-------|
| `overview` | 0 | 目的・ターゲット・スコープ |
| `non-functional` | 1 | 非機能仕様 |
| `auth` | 2 | 認証・アカウント |
| `plans` | 3 | 料金・プラン・制限 |
| `credits` | 4 | クレジット仕様 |
| `screens` | 5 | 画面一覧 |
| `onboarding` | 6 | オンボーディング |
| `dashboard` | 7 | ダッシュボード |
| `companies` | 8 | 企業登録 |
| `company-info` | 9 | 企業情報取得/更新 |
| `applications` | 10 | 応募枠 |
| `deadlines` | 11 | 締切承認UX |
| `notifications` | 12 | 通知 |
| `tasks` | 13 | タスク・進捗管理 |
| `calendar` | 14 | カレンダー連携 |
| `es-editor` | 15 | ESエディタ |
| `ai-review` | 16 | AI添削 |
| `gakuchika` | 17 | ガクチカ深掘りBot |
| `submission` | 18 | 提出物テンプレ |
| `flows` | 19 | 典型ユーザーフロー |
| `acceptance` | 20 | 受入観点 |
| `glossary` | 21 | 用語集 |

## Output Format

When displaying spec, include:
1. **Purpose**: このセクションの目的
2. **Key Points**: 重要なポイント（箇条書き）
3. **Constraints**: 制約・制限事項
4. **Related Sections**: 関連セクション
5. **Implementation Notes**: 実装時の注意点

## Example Usage

```
User: /ukarun:spec credits

Response:
## 4. クレジット仕様

### Purpose
ユーザーの利用量を管理し、プランに応じた機能制限を実現する。

### Key Points
- 月次付与（加入日起算）
  - Free: 30
  - Standard: 300
  - Pro: 800
- 繰り越しなし（毎月リセット）
- 成功時のみ消費

### Constraints
- 企業情報取得/更新
  - 1日無料回数: 3回（ゲスト2回）
  - 無料枠外: 1クレジット/成功
  - 部分成功（締切なし）: 0.5クレジット
- ES添削
  - 見積: ceil(文字数/800)
  - 上限: 5クレジット

### Related Sections
- Section 3: 料金・プラン・制限
- Section 9: 企業情報取得/更新
- Section 16: AI添削

### Implementation Notes
- 0.5クレジットは内部累積、2回で1消費
- 失敗時は消費0、無料回数も減らない
- クレジット残高は整数表示
```

## Workflow

1. Read `docs/SPEC.md`
2. Extract relevant section
3. Format with context
4. Highlight implementation-critical points
