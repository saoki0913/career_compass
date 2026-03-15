# カレンダー機能

締切、作業ブロック、Google Calendar の外部予定を統合表示する。

## 概要

| 項目 | 内容 |
|------|------|
| ビュー | 月表示 |
| アプリ内イベント | 締切、作業ブロック |
| Google 連携開始 | `/calendar/settings` の明示操作のみ |
| Google 同期方式 | 非同期キュー (`calendar_sync_jobs`) |
| 空き時間提案 | Google freebusy を利用 |

## 現在の仕様

### 連携の原則
- Google ログインだけでは Google カレンダー連携は有効にならない。
- 連携、再連携、解除、追加先カレンダー変更はすべて `/calendar/settings` から行う。
- Google を有効化するには、接続済みであることに加えて `targetCalendarId` を明示選択する必要がある。
- 追加先カレンダーを変更しても、既存の Google ミラー予定は移動しない。以後の同期ジョブから新しい追加先を使う。

### 同期対象
- 確定済み締切
- 作業ブロック

### Google 側の識別
- タイトル接頭辞は `[就活Pass][締切]` または `[就活Pass][作業]`
- `extendedProperties.private` に `managedBy`, `entityType`, `entityId` を保存する
- 旧接頭辞 `[シューパス]`, `[就活Compass]` も同一イベントとして扱う

## データ取得フロー

### 月表示
1. `GET /api/calendar/events?start=X&end=Y` でアプリ内の締切と作業ブロックを取得する。
2. Google 連携時のみ `GET /api/calendar/google?action=events&start=X&end=Y` を呼ぶ。
3. `/api/calendar/google` は Google 側の app-managed 予定を同期しつつ、外部予定だけを返す。
4. カレンダー画面ではアプリ内イベントを真実のデータとして表示し、Google 外部予定だけを追加表示する。

### freebusy / 提案
- `GET /api/calendar/google?action=freebusy`
- `GET /api/calendar/google?action=suggest`
- `freebusyCalendarIds` に入っているカレンダーだけを集計対象にする

## 同期フロー

### 作成・更新
1. 締切または作業ブロックを保存する。
2. `enqueueDeadlineSync()` または `enqueueWorkBlockUpsert()` が `calendar_sync_jobs` に `upsert` ジョブを積む。
3. `GET /api/cron/calendar-sync` が pending ジョブを処理する。
4. Google 作成成功時に各レコードへ `googleCalendarId`, `googleEventId`, `googleSyncStatus`, `googleSyncedAt` を反映する。

### 削除
1. 既存の Google ミラー ID を使って `delete` ジョブを積む。
2. ジョブは保存時点の `targetCalendarId` を保持する。
3. 追加先変更後でも、古いミラー予定は保存済みの Google ID で削除する。

### エラー処理
- 3回まで自動再試行
- 失敗時は `notifications.type = calendar_sync_failed` を作成
- 設定画面の `syncSummary` に pending 件数と failed 件数を表示

## Google 側変更の扱い

### 作業ブロック
- Google 側で編集されたタイトル・時刻は、カレンダー読込時の reconcile でアプリ側へ反映する。
- Google 側で削除された場合は、対応するアプリ側の作業ブロックも削除する。

### 締切
- Google 側で削除された場合、アプリ側の締切は消さず `suppressed` にする。
- `suppressed` になった締切は自動再作成しない。

## 主なテーブル

### `calendar_settings`
- `provider`
- `targetCalendarId`
- `freebusyCalendarIds`
- `googleAccessToken`
- `googleRefreshToken`
- `googleGrantedScopes`
- `googleCalendarEmail`
- `googleCalendarConnectedAt`
- `googleCalendarNeedsReconnect`

注記:
- Google token は暗号化して保存する。

### `deadlines`
- `googleCalendarId`
- `googleEventId`
- `googleSyncStatus`
- `googleSyncError`
- `googleSyncedAt`
- `googleSyncSuppressedAt`

### `calendar_events`
- `googleCalendarId`
- `googleEventId`
- `googleSyncStatus`
- `googleSyncError`
- `googleSyncedAt`

### `calendar_sync_jobs`
- `entityType`
- `entityId`
- `action`
- `targetCalendarId`
- `googleEventId`
- `status`
- `attempts`
- `lastError`
- `scheduledAt`
- `startedAt`
- `completedAt`

## API

| メソッド | エンドポイント | 用途 |
|----------|---------------|------|
| GET | `/api/calendar/events` | アプリ内イベントと締切の取得 |
| POST | `/api/calendar/events` | 作業ブロック作成と同期ジョブ投入 |
| DELETE | `/api/calendar/events/[id]` | 作業ブロック削除と同期ジョブ投入 |
| GET | `/api/calendar/settings` | 設定と `syncSummary` の取得 |
| PUT | `/api/calendar/settings` | 追加先カレンダー、freebusy、provider 更新 |
| GET | `/api/calendar/calendars` | Google カレンダー一覧取得 |
| POST | `/api/calendar/calendars` | Google カレンダー作成のみ。設定は変えない |
| GET | `/api/calendar/google?action=events` | 外部 Google 予定取得 + reconcile |
| GET | `/api/calendar/google?action=freebusy` | 空き時間計算用の busy 取得 |
| GET | `/api/calendar/google?action=suggest` | 作業ブロック提案 |
| GET | `/api/cron/calendar-sync` | 同期ジョブ処理 |

## 関連ファイル

- `src/app/calendar/page.tsx`
- `src/app/calendar/settings/page.tsx`
- `src/app/api/calendar/events/route.ts`
- `src/app/api/calendar/events/[id]/route.ts`
- `src/app/api/calendar/google/route.ts`
- `src/app/api/calendar/settings/route.ts`
- `src/app/api/calendar/calendars/route.ts`
- `src/app/api/cron/calendar-sync/route.ts`
- `src/lib/calendar/connection.ts`
- `src/lib/calendar/google.ts`
- `src/lib/calendar/sync.ts`
- `src/lib/db/schema.ts`
