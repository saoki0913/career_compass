# 通知機能

締切リマインド、ES添削完了通知、デイリーサマリーなどのアプリ内通知機能。

## 入口

| 項目 | パス |
|------|------|
| 通知管理 hook | `src/hooks/useNotifications.ts` |
| 通知一覧 | `src/app/notifications/page.tsx` |
| API | `src/app/api/notifications/` |
| 日次 Cron | `src/app/api/cron/daily-notifications/route.ts`（締切リマインド・90日クリーンアップ） |
| 毎時 Cron | `src/app/api/cron/hourly-daily-summary/route.ts`（デイリーサマリー。JST 時刻一致時のみ） |
| JST ヘルパー | `src/lib/datetime/jst.ts` |

---

## 1. 概要

| 項目 | 内容 |
|------|------|
| **通知タイプ** | 5種（締切リマインド、締切接近、企業情報取得、ES添削完了、デイリーサマリー） |
| **配信方式** | アプリ内通知（ポーリング） |
| **既読管理** | 個別既読 + 一括既読 |
| **有効期限** | `expiresAt` による自動失効 |
| **ゲスト対応** | デバイストークンによるゲストユーザーサポート |

---

## 2. 通知タイプ

| ID | 日本語名 | アイコン | トリガー |
|----|---------|---------|---------|
| `deadline_reminder` | 締切リマインド | - | 4段階スマートリマインダー (7d/3d/1d/0d) |
| `deadline_near` | 締切が近づいています | - | 締切24〜48時間前 |
| `company_fetch` | 企業情報取得 | - | 企業情報フェッチ完了時 |
| `es_review` | ES添削完了 | - | ES添削処理完了時 |
| `daily_summary` | デイリーサマリー | - | 日次Cronジョブ |

---

## 3. 処理フロー

### 3.1 イベント駆動通知

```
トリガーイベント発生（例: ES添削完了）
  ↓
notifications テーブルに通知レコード作成
  → title, message, type, data(JSON)
  ↓
フロント: useNotifications() が定期ポーリング
  → 未読バッジ更新
  → 通知リスト表示
```

### 3.2 Cronベース通知

```
/api/cron/daily-notifications (UTC 0:00 = JST 9:00 付近・日次)
  ↓
1. 締切リマインド（deadline_reminders バッチ — 4段階スマートリマインダー）
2. 90日超の通知削除（cleanup）

/api/cron/hourly-daily-summary (毎時 UTC)
  ↓
POST /api/notifications/batch { type: "daily_summary" }
  → 現在の JST「時」がユーザーの dailySummaryHourJst（7/9/12/18）と一致するユーザーのみ
  → 同一 JST 日に daily_summary 未送信なら1件作成
  → 締切件数は当該ユーザーの企業に紐づく締切のみ集計
```

### 3.3 スマートリマインダー (4段階)

締切タイプに応じた重要度レベルで、適切なタイミングにリマインドを送信する。

| 重要度 | 対象タイプ | ティア |
|--------|-----------|--------|
| aggressive | ES提出, 面接全般, WEBテスト, 適性検査, 内定返答 | 7d, 3d, 1d, 0d |
| standard | 説明会, インターン | 3d, 1d, 0d |
| light | その他 | 1d, 0d |

**ティア判定基準** (締切までの残り時間):

| ティア | 時間範囲 | メッセージ例 |
|--------|---------|-------------|
| 0d | ≤12h | 「今日が締切です」 |
| 1d | 12-36h | 「締切が明日です」 |
| 3d | 36-84h | 「締切が3日以内です」 |
| 7d | 84-180h | 「締切まで1週間です」 |

**重複排除**: dedup key は `${ownerKey}:${deadlineId}:${tier}` — 各締切×各ティアで最大1通知。
**フラッド防止**: ユーザーあたり1回のバッチ処理で最大5通知。
**ユーザーカスタマイズ**: `deadlineReminderOverrides` で締切タイプ別にティアを変更可能。

---

## 4. 通知設定

ユーザーごとに通知タイプ別のON/OFFを設定可能。

### `notificationSettings` テーブル

| 設定項目 | デフォルト | 説明 |
|----------|-----------|------|
| `deadline_reminder` | ON | 締切リマインド通知 |
| `deadline_near` | ON | 締切接近通知 |
| `company_fetch` | ON | 企業情報取得完了通知 |
| `es_review` | ON | ES添削完了通知 |
| `daily_summary` | ON | デイリーサマリー通知 |
| `daily_summary_hour_jst` | `9` | デイリーサマリーの送信時刻（JST の時。許可: 7, 9, 12, 18） |
| `deadline_reminder_overrides` | `null` | 締切タイプ別リマインダーティア上書き (JSON text) |

`deadline_reminder_overrides` の形式:
```json
{ "es_submission": ["7d","3d","1d","0d"], "briefing": ["1d","0d"] }
```
`null` の場合はデフォルトの重要度マッピングを適用する。

---

## 5. DBテーブル

### `notifications`

| カラム | 型 | 説明 |
|--------|-----|------|
| `userId` / `guestId` | `text (FK)` | 通知先（XOR制約） |
| `type` | `enum` | 通知タイプ（5種） |
| `title` | `text` | 通知タイトル |
| `message` | `text` | 通知メッセージ本文 |
| `data` | `text (JSON)` | 追加データ（リンク先等） |
| `isRead` | `boolean` | 既読フラグ |
| `expiresAt` | `timestamptz` | 有効期限（30日後等） |

**インデックス**:
- `user_id`, `guest_id` — オーナー検索
- `is_read` — 未読フィルタ
- `user_created_at DESC` — 新着順取得
- 部分インデックス: `user_unread_created_at` (`is_read = false` のみ)

### `notificationSettings`

- ユーザーごとの通知種別ON/OFF設定テーブル

---

## 6. APIルート

| メソッド | エンドポイント | 説明 |
|----------|---------------|------|
| GET | `/api/notifications` | 通知一覧取得（`limit`, `unreadOnly` パラメータ） |
| POST | `/api/notifications/[id]/read` | 個別既読処理 |
| POST | `/api/notifications/read-all` | 全件既読処理 |
| POST | `/api/notifications/batch` | バッチ操作 |
| POST | `/api/cron/daily-notifications` | 日次通知Cronジョブ |

---

## 7. フック

### `useNotifications(options)`

| オプション | 型 | 説明 |
|-----------|-----|------|
| `limit` | `number` | 取得件数上限 |
| `unreadOnly` | `boolean` | 未読のみ取得 |

**返却値**:

| 値 | 型 | 説明 |
|-----|-----|------|
| `notifications` | `Notification[]` | 通知一覧 |
| `unreadCount` | `number` | 未読件数 |
| `isLoading` | `boolean` | 読み込み中 |
| `error` | `string \| null` | エラー |
| `refresh` | `() => Promise<void>` | 再取得 |
| `markAsRead` | `(id: string) => Promise<boolean>` | 個別既読 |
| `markAllAsRead` | `() => Promise<boolean>` | 全件既読 |

---

## 8. UI

### 通知一覧ページ (`/notifications`)
- 通知カードリスト（タイプアイコン + タイトル + メッセージ + 時間）
- 未読バッジ
- 「すべて既読」ボタン
- 空状態: 「新しい通知はありません」

### ヘッダー通知アイコン
- 未読件数バッジ（赤丸）
- クリックで通知ページに遷移

---

## 9. ビジネスルール

1. **JST基準**: 通知のタイミング計算はAsia/Tokyoタイムゾーン
2. **30日失効**: 通知は作成から30日後に自動失効（`expiresAt`）
3. **設定尊重**: `notificationSettings` でOFFの通知タイプは生成しない
4. **ゲスト対応**: ゲストユーザーにも通知を配信（`guestId` で紐づけ）
5. **楽観的UI更新**: 既読処理はローカルステートを即座に更新（API完了を待たない）

---

## 関連ファイル

| ファイル | 役割 |
|----------|------|
| `src/hooks/useNotifications.ts` | 通知管理フック（168行） |
| `src/app/notifications/page.tsx` | 通知一覧ページ |
| `src/app/api/notifications/route.ts` | 通知一覧API |
| `src/app/api/notifications/[id]/read/route.ts` | 個別既読API |
| `src/app/api/notifications/read-all/route.ts` | 全件既読API |
| `src/app/api/notifications/batch/route.ts` | バッチ操作API |
| `src/app/api/cron/daily-notifications/route.ts` | 日次Cronジョブ |
| `src/lib/notifications/deadline-importance.ts` | 締切タイプ別重要度マッピング + ティア判定 |
| `src/lib/db/schema.ts` | DBスキーマ（`notifications`, `notificationSettings`） |
