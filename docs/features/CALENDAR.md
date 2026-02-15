# カレンダー機能

締切・ワークブロック・Google Calendar予定を統合表示するカレンダー機能。

**参照実装**:
- `src/app/calendar/page.tsx` — カレンダーメインページ（月ビュー）
- `src/app/calendar/settings/page.tsx` — Google Calendar設定ページ
- `src/hooks/useCalendar.ts` — カレンダー関連フック群
- `src/components/calendar/` — UIコンポーネント

---

## 1. 概要

| 項目 | 内容 |
|------|------|
| **ビュー** | 月表示（カレンダーグリッド） |
| **イベント種別** | 締切（赤）、ワークブロック（青）、Google予定（緑） |
| **Google連携** | OAuth認証によるGoogle Calendar双方向同期 |
| **ワークブロック提案** | Google Calendarの空き時間を分析してタスクを提案 |

---

## 2. イベント種別

| 種別 | 色 | ソース | 説明 |
|------|-----|--------|------|
| `deadline` | 赤 (`bg-red-100`) | アプリ内締切 | 登録済み締切を自動表示 |
| `work_block` | 青 (`bg-blue-100`) | ユーザー作成 | 手動追加のタスク時間枠 |
| `google` | 緑 (`bg-green-100`) | Google Calendar | Google連携時のみ表示 |

---

## 3. 処理フロー

### 3.1 月表示データ取得

```
カレンダーページ表示
  ↓
useCalendarEvents({ start, end })
  → GET /api/calendar/events?start=X&end=Y
  → { events: CalendarEvent[], deadlines: DeadlineEvent[] }
  ↓
useGoogleCalendar().fetchGoogleEvents(start, end)  ※Google連携時のみ
  → GET /api/calendar/google?action=events&start=X&end=Y
  → { events: GoogleCalendarEvent[] }
  ↓
3種イベントを日付別にマージ → 重複排除 → カレンダーグリッド表示
```

### 3.2 ワークブロック作成

```
日付セルクリック → AddEventModal
  ↓
タイトル + 開始時刻 + 終了時刻を入力
  ↓
POST /api/calendar/events
  → アプリDB + Google Calendar（連携時は二重書き込み）
  → タイトルに "[就活Compass] " プレフィックス付与（Google側）
```

### 3.3 ワークブロック提案（AI）

```
FABボタン（Google連携時のみ表示）
  ↓
GET /api/calendar/google?action=suggest&start=YYYY-MM-DD
  → Google Calendarのfreebusy情報を分析
  → 空き時間を検出し作業提案リストを返却
  ↓
WorkBlockSuggestionsModal で候補表示
  → ユーザー選択 → POST /api/calendar/events で作成
```

---

## 4. 重複排除ロジック

Google Calendar連携時、アプリ登録のワークブロックとGoogle側のイベントが重複して表示されることを防止する。

```
1. Google eventsからキーのSetを構築
   キー = "${dateKey}|${normalizedTitle}|${startMinute}"
   ※ "[就活Compass] " プレフィックスを除去し小文字正規化

2. アプリイベント（work_blockのみ）をフィルタ
   → 同じキーがGoogle側に存在する場合はスキップ

3. 締切イベントは常時表示（Google側に重複しない）
```

---

## 5. Google Calendar連携

### 5.1 OAuth設定

| 項目 | 内容 |
|------|------|
| **トークン保存先** | `calendarSettings` テーブル |
| **トークン種別** | `googleAccessToken`, `googleRefreshToken`, `googleTokenExpiresAt` |
| **有効期限管理** | API呼び出し前に自動リフレッシュ |

### 5.2 設定ページ（`/calendar/settings`）

- Google Calendarの接続/切断
- 対象カレンダーの選択（`targetCalendarId`）
- freebusy対象カレンダーの選択（`freebusyCalendarIds`）
- 作業推奨時間帯の設定（`preferredTimeSlots`）

---

## 6. UIコンポーネント

### CalendarSidebar

サイドバー情報パネル（デスクトップは右カラム、モバイルはSheet）:
- 今週の締切（次7日間）
- 今日のスケジュール
- Google Calendar接続状態バッジ
- 選択日の詳細表示

### EventDetailModal

イベント詳細表示モーダル:
- **締切**: 企業名、残日数、信頼度バッジ
- **Googleイベント**: サマリー、日時、Google Calendar編集リンク
- **ワークブロック**: 時間帯、削除ボタン（確認あり）

### WorkBlockFAB

フローティングアクションボタン:
- Google Calendar連携時のみ表示
- クリックでワークブロック提案モーダルを開く

---

## 7. レスポンシブ対応

| 画面幅 | レイアウト |
|--------|-----------|
| デスクトップ (`lg:`) | 3:1の2カラム（カレンダー + サイドバー） |
| モバイル | 1カラム + ボトムSheetでサイドバー表示 |

- モバイルサイドバー: 「今週の締切」トリガーボタン → ボトムSheet
- 緊急締切数バッジ表示

---

## 8. DBテーブル

### `calendarSettings`（1ユーザー1レコード）

| カラム | 型 | 説明 |
|--------|-----|------|
| `provider` | `"google" \| "app"` | カレンダープロバイダー |
| `targetCalendarId` | `text` | 同期先Google Calendar ID |
| `freebusyCalendarIds` | `text (JSON)` | freebusy参照カレンダーID群 |
| `preferredTimeSlots` | `text (JSON)` | 作業推奨時間帯 `{ start, end }` |
| `googleAccessToken` | `text` | OAuth アクセストークン |
| `googleRefreshToken` | `text` | OAuth リフレッシュトークン |
| `googleTokenExpiresAt` | `timestamptz` | トークン有効期限 |

### `calendarEvents`

| カラム | 型 | 説明 |
|--------|-----|------|
| `type` | `"deadline" \| "work_block"` | イベント種別 |
| `title` | `text` | イベントタイトル |
| `startAt` | `timestamptz` | 開始日時 |
| `endAt` | `timestamptz` | 終了日時 |
| `deadlineId` | `text (FK)` | 締切への参照（deadline型のみ） |
| `externalEventId` | `text` | Google CalendarイベントID |

---

## 9. APIルート

| メソッド | エンドポイント | 説明 |
|----------|---------------|------|
| GET | `/api/calendar/events` | アプリイベント + 締切を取得（`start`, `end` パラメータ） |
| POST | `/api/calendar/events` | ワークブロック作成（Google同期あり） |
| DELETE | `/api/calendar/events/[id]` | ワークブロック削除（Google側も削除） |
| GET | `/api/calendar/settings` | カレンダー設定取得 |
| PUT | `/api/calendar/settings` | カレンダー設定更新 |
| GET | `/api/calendar/google?action=events` | Google Calendar イベント取得 |
| GET | `/api/calendar/google?action=suggest` | 空き時間からワークブロック提案 |
| POST | `/api/calendar/google` | Google Calendarイベント作成 |
| GET | `/api/calendar/calendars` | ユーザーのGoogle Calendar一覧取得 |

---

## 10. フック

| フック | 説明 |
|--------|------|
| `useCalendarEvents({ start, end })` | アプリイベント+締切のCRUD |
| `useCalendarSettings()` | カレンダー設定の取得・更新 |
| `useGoogleCalendar()` | Google連携状態・イベント取得・ワークブロック提案 |

---

## 関連ファイル

| ファイル | 役割 |
|----------|------|
| `src/app/calendar/page.tsx` | カレンダーメインページ（894行） |
| `src/app/calendar/settings/page.tsx` | Google Calendar設定（424行） |
| `src/hooks/useCalendar.ts` | カレンダーフック群（334行） |
| `src/components/calendar/CalendarSidebar.tsx` | サイドバー |
| `src/components/calendar/EventDetailModal.tsx` | イベント詳細モーダル |
| `src/components/calendar/WorkBlockFAB.tsx` | ワークブロック提案FAB |
| `src/app/api/calendar/events/route.ts` | イベントCRUD API |
| `src/app/api/calendar/events/[id]/route.ts` | イベント個別操作API |
| `src/app/api/calendar/settings/route.ts` | 設定API |
| `src/app/api/calendar/google/route.ts` | Google Calendar連携API |
| `src/app/api/calendar/calendars/route.ts` | Google Calendar一覧API |
| `src/lib/db/schema.ts` | DBスキーマ（`calendarSettings`, `calendarEvents`） |
