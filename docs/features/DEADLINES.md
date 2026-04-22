# 締切管理機能

ES提出、面接、WEBテストなどの就活イベント締切を管理する機能。自動抽出（企業情報フェッチ時）と手動登録の両方に対応。

## 入口

| 項目 | パス |
|------|------|
| 締切取得 hook | `src/hooks/useDeadlines.ts` |
| ダッシュボード hook | `src/hooks/useDeadlinesDashboard.ts` |
| ダッシュボードページ | `src/app/(product)/deadlines/page.tsx` |
| ダッシュボード | `src/components/dashboard/DeadlineList.tsx` |
| フォーム・モーダル | `src/components/deadlines/` |
| 自動抽出承認 UI | `src/components/companies/DeadlineApprovalModal.tsx` |

---

## 1. 概要

| 項目 | 内容 |
|------|------|
| **登録方法** | 自動抽出（企業情報フェッチ時） + 手動作成 |
| **承認制** | 自動抽出した締切はユーザー承認が必要（`isConfirmed`） |
| **信頼度** | 3段階（`high` / `medium` / `low`） |
| **タスク連携** | 締切承認/作成時にテンプレートからタスクを自動生成（依存チェーン付き） |
| **カレンダー連携** | Google Calendar へ update-in-place (PATCH) 方式で同期 |
| **重複検出** | 承認UI でバッチ重複チェック（警告のみ、ブロックなし） |
| **ステータス** | 自動計算 + 手動オーバーライド（not_started / in_progress / completed / overdue） |

---

## 2. 締切タイプ

| ID | 日本語名 |
|----|---------|
| `es_submission` | ES提出 |
| `web_test` | WEBテスト |
| `aptitude_test` | 適性検査 |
| `interview_1` | 一次面接 |
| `interview_2` | 二次面接 |
| `interview_3` | 三次面接 |
| `interview_final` | 最終面接 |
| `briefing` | 説明会 |
| `internship` | インターン |
| `offer_response` | 内定回答 |
| `other` | その他 |

---

## 3. 処理フロー

### 3.1 自動抽出フロー

```
企業情報フェッチ（COMPANY_INFO_FETCH.md参照）
  ↓
採用スケジュール情報を解析
  → 締切候補を抽出（日付 + タイプ + 信頼度 + ソースURL）
  ↓
DeadlineApprovalModal で候補表示（重複警告バッジ付き）
  → ユーザーが承認（isConfirmed: true）/ 却下 / 修正
  ↓
承認された締切をDBに保存
  → テンプレートベースのタスク自動生成（依存チェーン付き）
  → Google Calendar へ同期（sync state machine）
```

### 3.2 手動作成フロー

```
企業詳細ページ or ダッシュボード
  ↓
DeadlineModal（作成/編集フォーム）
  → タイトル、タイプ、期限日、メモを入力
  ↓
POST /api/companies/[id]/deadlines
  → isConfirmed: true（手動は自動承認）
  → タイプに応じたテンプレートタスクを自動生成
```

---

## 4. ステータス管理

### 4.1 自動計算ロジック (`computeDeadlineStatus`)

| 優先度 | 条件 | ステータス |
|--------|------|-----------|
| 1 | `statusOverride` が設定済み | オーバーライド値 |
| 2 | `completedAt` が設定済み | `completed` |
| 3 | `dueDate < now` かつ未完了 | `overdue` (導出のみ) |
| 4 | 完了タスクが1件以上 | `in_progress` |
| 5 | デフォルト | `not_started` |

### 4.2 手動オーバーライド

`PUT /api/deadlines/[id]/status` で `not_started`, `in_progress`, `completed` を手動設定。
`null` でオーバーライド解除（自動計算に戻る）。`overdue` は導出のみでオーバーライド不可。

---

## 5. タスク自動生成

### 5.1 テンプレートカテゴリマッピング

| 締切タイプ | テンプレートカテゴリ |
|-----------|-------------------|
| `es_submission` | `es_submission` |
| `web_test`, `aptitude_test` | `test` |
| `interview_*` (全4種) | `interview` |
| `briefing` | `briefing` |
| `internship` | `internship` |
| `offer_response` | `offer_response` |
| `other` | なし（タスク生成しない） |

### 5.2 テンプレート例（es_submission）

| タスク | タイプ | 締切N日前 | 依存先 |
|--------|-------|----------|--------|
| 下書き作成 | es | 7日前 | — |
| 添削依頼 | es | 5日前 | 下書き作成 |
| 修正 | es | 3日前 | 添削依頼 |
| 最終確認 | es | 1日前 | 修正 |
| 提出 | other | 当日 | 最終確認 |

### 5.3 依存チェーン

- `dependsOnTaskId` でタスク間の依存を管理
- `isBlocked = true` で前タスク未完了時はブロック表示
- タスク完了時 → 後続タスクを自動アンブロック (`unblockSuccessor`)
- タスク差し戻し時 → 後続チェーンを再帰的にリブロック (`reblockSuccessors`)
- 実装: `src/lib/server/task-dependency.ts` (transaction 内で原子的に処理)

---

## 6. 重複検出

承認 UI (`DeadlineApprovalModal`) マウント時に `POST /api/companies/[id]/deadlines/check-duplicates` で一括チェック。

判定条件: 同一 (companyId, type) + dueDate ±1日 + normalizeTitle() 一致。
表示: 黄色バッジ「重複の可能性」+ テキスト警告。承認はブロックしない。

---

## 7. 信頼度レベル

| レベル | バッジ色 | 意味 |
|--------|---------|------|
| `high` | 緑 | 公式ソースかつ年度整合が取れた明確な情報 |
| `medium` | 黄 | 公式だが年度不一致の可能性がある、または trusted job site 由来の情報 |
| `low` | 赤 | 親会社/子会社/その他ソース由来、または不確実性が高い情報 |

---

## 8. 緊急度表示ロジック

| 残日数 | 色 | 追加効果 |
|--------|-----|---------|
| ≤ 1日 | 赤 (`text-red-700`) | バウンスアニメーション |
| ≤ 3日 | オレンジ (`text-orange-600`) | パルスアニメーション（今日のみ） |
| ≤ 7日 | アンバー (`text-amber-600`) | — |
| > 7日 | グレー | — |

---

## 9. DBテーブル

### `deadlines`

| カラム | 型 | 説明 |
|--------|-----|------|
| `companyId` | `text (FK, NOT NULL)` | 関連企業（必須） |
| `applicationId` | `text (FK)` | 関連選考 |
| `jobTypeId` | `text (FK)` | 関連職種 |
| `type` | `enum` | 締切タイプ（11種） |
| `title` | `text` | 締切タイトル |
| `description` | `text` | 説明 |
| `memo` | `text` | ユーザーメモ |
| `dueDate` | `timestamptz` | 期限日時 |
| `isConfirmed` | `boolean` | ユーザー承認済みフラグ |
| `confidence` | `"high" \| "medium" \| "low"` | 抽出信頼度 |
| `sourceUrl` | `text` | 情報ソースURL |
| `statusOverride` | `enum (nullable)` | 手動ステータス (`not_started` / `in_progress` / `completed`) |
| `completedAt` | `timestamptz` | 完了日時 |
| `autoCompletedTaskIds` | `text (JSON)` | 自動完了したタスクID群 |

### `task_templates`

| カラム | 型 | 説明 |
|--------|-----|------|
| `category` | `enum` | テンプレートカテゴリ（6種） |
| `title` | `text` | タスクタイトル |
| `taskType` | `enum` | タスクタイプ |
| `sortOrder` | `integer` | 表示順 |
| `daysBeforeDeadline` | `integer` | 締切N日前 |
| `dependsOnSortOrder` | `integer (nullable)` | 依存先の sortOrder |
| `isSystem` | `boolean` | システムテンプレートフラグ |

---

## 10. APIルート

| メソッド | エンドポイント | 説明 |
|----------|---------------|------|
| GET | `/api/deadlines` | 全締切一覧（フィルタ・ソート・サマリー付き） |
| GET | `/api/deadlines/upcoming?days=7` | 今後N日の締切一覧 |
| GET | `/api/deadlines/[id]` | 締切詳細 |
| PUT | `/api/deadlines/[id]` | 締切更新（承認、日付変更など） |
| PUT | `/api/deadlines/[id]/status` | ステータス手動オーバーライド |
| DELETE | `/api/deadlines/[id]` | 締切削除 |
| GET | `/api/companies/[id]/deadlines` | 企業に紐づく締切一覧 |
| POST | `/api/companies/[id]/deadlines` | 締切手動作成 |
| POST | `/api/companies/[id]/deadlines/check-duplicates` | バッチ重複チェック |

---

## 11. ビジネスルール

1. **承認必須**: 自動抽出した締切はユーザーが承認するまで有効にならない
2. **JST基準**: 締切の日次計算は Asia/Tokyo タイムゾーン
3. **タスク連動**: 締切完了時に関連する自動生成タスクも自動完了
4. **カレンダー表示**: 締切はカレンダービューに赤色で自動表示
5. **重複は警告のみ**: 重複検出は承認UI での警告バッジのみ。保存をブロックしない
6. **getRequestIdentity 統一**: 全 deadline API は `getRequestIdentity()` + `createApiErrorResponse()` パターンに統一

---

## 関連ファイル

| ファイル | 役割 |
|----------|------|
| `src/hooks/useDeadlines.ts` | 締切取得フック |
| `src/hooks/useDeadlinesDashboard.ts` | ダッシュボードSWRフック |
| `src/app/(product)/deadlines/page.tsx` | 締切ダッシュボードページ |
| `src/components/deadlines/DeadlinesDashboardClient.tsx` | ダッシュボードクライアント |
| `src/components/deadlines/DeadlineKanbanBoard.tsx` | カンバンボード |
| `src/components/deadlines/DeadlineKanbanCard.tsx` | カンバンカード |
| `src/components/deadlines/DeadlineSummaryStats.tsx` | サマリー統計 |
| `src/components/deadlines/DeadlineProgressBar.tsx` | 進捗バー |
| `src/components/deadlines/DeadlineListView.tsx` | リスト表示 |
| `src/components/dashboard/DeadlineList.tsx` | ダッシュボード締切リスト |
| `src/components/deadlines/DeadlineForm.tsx` | 締切フォーム |
| `src/components/deadlines/DeadlineModal.tsx` | 締切モーダル |
| `src/components/companies/DeadlineApprovalModal.tsx` | 自動抽出承認UI（重複警告付き） |
| `src/lib/server/deadline-status.ts` | ステータス計算ロジック |
| `src/lib/server/deadline-loaders.ts` | ダッシュボードデータローダー |
| `src/lib/server/task-generation.ts` | テンプレートベースタスク生成 |
| `src/lib/server/task-dependency.ts` | タスク依存管理サービス |
| `src/lib/company-info/deadline-persistence.ts` | 締切永続化 + 重複検出 |
| `src/lib/notifications/deadline-importance.ts` | 締切タイプ別重要度マッピング |
| `src/app/api/deadlines/route.ts` | 全締切一覧API |
| `src/app/api/deadlines/[id]/route.ts` | 締切個別操作API |
| `src/app/api/deadlines/[id]/status/route.ts` | ステータスオーバーライドAPI |
| `src/app/api/deadlines/upcoming/route.ts` | 今後の締切API |
| `src/app/api/companies/[id]/deadlines/route.ts` | 企業別締切API |
| `src/app/api/companies/[id]/deadlines/check-duplicates/route.ts` | 重複チェックAPI |
| `src/lib/db/schema.ts` | DBスキーマ（`deadlines`, `task_templates`） |
