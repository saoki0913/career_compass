# 通知機能

締切リマインド、ES添削完了通知、デイリーサマリーなどのアプリ内通知機能。

**参照実装**:
- `src/hooks/useNotifications.ts` — 通知管理フック
- `src/app/notifications/page.tsx` — 通知一覧ページ
- `src/app/api/notifications/` — 通知API
- `src/app/api/cron/daily-notifications/route.ts` — 日次通知Cronジョブ

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
| `deadline_reminder` | 締切リマインド | ⏰ | 定期Cronジョブ（締切前日等） |
| `deadline_near` | 締切が近づいています | 🔔 | 締切24〜48時間前 |
| `company_fetch` | 企業情報取得 | 🏢 | 企業情報フェッチ完了時 |
| `es_review` | ES添削完了 | ✨ | ES添削処理完了時 |
| `daily_summary` | デイリーサマリー | 📋 | 日次Cronジョブ |

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
/api/cron/daily-notifications (日次実行)
  ↓
1. 全ユーザーの今後の締切を検索
2. 締切リマインド通知を生成
   → 24時間以内: deadline_near
   → 設定日数以内: deadline_reminder
3. デイリーサマリー通知を生成
   → 今日のタスク数、今後の締切数
  ↓
ユーザーごとにバッチ通知作成
  → notificationSettings でフィルタ（ON/OFFチェック）
  → JST基準で日付計算
```

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
| `src/lib/db/schema.ts` | DBスキーマ（`notifications`, `notificationSettings`） |
