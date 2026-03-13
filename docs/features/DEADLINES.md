# 締切管理機能

ES提出、面接、WEBテストなどの就活イベント締切を管理する機能。自動抽出（企業情報フェッチ時）と手動登録の両方に対応。

**参照実装**:
- `src/hooks/useDeadlines.ts` — 締切取得フック
- `src/components/dashboard/DeadlineList.tsx` — ダッシュボード締切リスト
- `src/components/deadlines/` — 締切フォーム・モーダル
- `src/components/companies/DeadlineApprovalModal.tsx` — 自動抽出承認UI

---

## 1. 概要

| 項目 | 内容 |
|------|------|
| **登録方法** | 自動抽出（企業情報フェッチ時） + 手動作成 |
| **承認制** | 自動抽出した締切はユーザー承認が必要（`isConfirmed`） |
| **信頼度** | 3段階（`high` / `medium` / `low`） |
| **タスク連携** | 締切作成時にタスクを自動生成 |
| **カレンダー連携** | カレンダービューに自動表示 |

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
DeadlineApprovalModal で候補表示
  → ユーザーが承認（isConfirmed: true）/ 却下 / 修正
  ↓
承認された締切をDBに保存
  → タスク自動生成（TASKS.md参照）
```

### 3.2 手動作成フロー

```
企業詳細ページ or ダッシュボード
  ↓
DeadlineModal（作成/編集フォーム）
  → タイトル、タイプ、期限日、メモを入力
  ↓
POST /api/deadlines/[id] or PUT
  → isConfirmed: true（手動は自動承認）
```

---

## 4. 信頼度レベル

| レベル | バッジ色 | 意味 |
|--------|---------|------|
| `high` | 緑 | 公式サイトからの明確な情報 |
| `medium` | 黄 | 推定情報（例年の傾向など） |
| `low` | 赤 | 信頼性の低い情報 |

---

## 5. 緊急度表示ロジック

### 色分け

| 残日数 | 色 | 追加効果 |
|--------|-----|---------|
| ≤ 1日 | 赤 (`text-red-700`) | バウンスアニメーション |
| ≤ 3日 | オレンジ (`text-orange-600`) | パルスアニメーション（今日のみ） |
| ≤ 7日 | アンバー (`text-amber-600`) | — |
| > 7日 | グレー | — |

### 表示形式
- `daysLeft` = 期限日 - 今日（JST基準）
- 「今日」「明日」「あと N 日」のラベル形式

---

## 6. DBテーブル

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
| `completedAt` | `timestamptz` | 完了日時 |
| `autoCompletedTaskIds` | `text (JSON)` | 自動完了したタスクID群 |

**インデックス**: `company_id`, `application_id`, `job_type_id`, `due_date`, `confirm_completed_due`（複合）

---

## 7. APIルート

| メソッド | エンドポイント | 説明 |
|----------|---------------|------|
| GET | `/api/deadlines/upcoming?days=7` | 今後N日の締切一覧（`{ deadlines, count, periodDays }`） |
| GET | `/api/deadlines/[id]` | 締切詳細 |
| PUT | `/api/deadlines/[id]` | 締切更新（承認、日付変更など） |
| DELETE | `/api/deadlines/[id]` | 締切削除 |
| GET | `/api/companies/[id]/deadlines` | 企業に紐づく締切一覧 |

---

## 8. フック

### `useDeadlines(days = 7)`

| 返却値 | 型 | 説明 |
|--------|-----|------|
| `deadlines` | `Deadline[]` | 締切一覧（`daysLeft` 計算済み） |
| `count` | `number` | 件数 |
| `isLoading` | `boolean` | 読み込み中 |
| `error` | `string \| null` | エラー |
| `refresh` | `() => Promise<void>` | 再取得 |

---

## 9. ビジネスルール

1. **承認必須**: 自動抽出した締切はユーザーが承認するまで有効にならない
2. **JST基準**: 締切の日次計算は Asia/Tokyo タイムゾーン
3. **タスク連動**: 締切完了時に関連する自動生成タスクも自動完了
4. **カレンダー表示**: 締切はカレンダービューに赤色で自動表示

---

## 関連ファイル

| ファイル | 役割 |
|----------|------|
| `src/hooks/useDeadlines.ts` | 締切取得フック（95行） |
| `src/components/dashboard/DeadlineList.tsx` | ダッシュボード締切リスト |
| `src/components/deadlines/DeadlineForm.tsx` | 締切フォーム |
| `src/components/deadlines/DeadlineModal.tsx` | 締切モーダル |
| `src/components/companies/DeadlineApprovalModal.tsx` | 自動抽出承認UI |
| `src/app/api/deadlines/upcoming/route.ts` | 今後の締切API |
| `src/app/api/deadlines/[id]/route.ts` | 締切個別操作API |
| `src/app/api/companies/[id]/deadlines/route.ts` | 企業別締切API |
| `src/lib/db/schema.ts` | DBスキーマ（`deadlines`） |
