# カレンダー機能

締切、作業ブロック、Google Calendar の外部予定を統合表示する。

## 入口

| 項目 | パス |
|------|------|
| ページ | `src/app/(product)/calendar/page.tsx` |
| 設定 | `src/app/(product)/calendar/settings/page.tsx` |
| hook | `src/hooks/useCalendar.ts` |
| Google 連携 | `src/lib/calendar/` |
| 同期 Cron | `src/app/api/cron/calendar-sync/route.ts` |

## 概要

| 項目 | 内容 |
|------|------|
| ビュー | 月表示 |
| アプリ内イベント | 締切、作業ブロック |
| Google 連携開始 | `/calendar/settings` の明示操作のみ |
| Google 同期方式 | 非同期キュー (`calendar_sync_jobs`) + update-in-place (PATCH) |
| 空き時間提案 | Google freebusy を利用 |
| トークン管理 | CAS (Compare-and-Swap) による競合安全なリフレッシュ |

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
- 接頭辞 `[就活Pass]`, `[シューパス]` を同一イベントとして扱う
- `findEventByEntityId()` で `privateExtendedProperty=entityId={id}` クエリにより既存イベントを検索

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

### Sync State Machine (upsert)

| 状態 | 条件 | 動作 |
|------|------|------|
| **same calendar + 既存あり** | `entity.googleCalendarId === job.targetCalendarId` かつ `findEventByEntityId()` で発見 | PATCH (update-in-place) → ID 不変 |
| **different calendar** | `entity.googleCalendarId !== job.targetCalendarId` | 旧カレンダーのイベントは残す。新カレンダーに CREATE。DB の googleCalendarId/googleEventId を新側に更新 |
| **not found** | `findEventByEntityId()` で未発見 (初回 or 外部削除後) | CREATE → 新規 ID を DB に保存 |
| **delete** | action = "delete" | DELETE (404 は許容) |

### 作成・更新
1. 締切または作業ブロックを保存する。
2. `enqueueDeadlineSync()` または `enqueueWorkBlockUpsert()` が `calendar_sync_jobs` に `upsert` ジョブを積む。
3. `GET /api/cron/calendar-sync` が pending ジョブを処理する。
4. `processUpsertJob()` が state machine に従い、既存イベントは PATCH、未発見なら CREATE する。
5. Google 操作成功時に各レコードへ `googleCalendarId`, `googleEventId`, `googleSyncStatus`, `googleSyncedAt` を反映する。

### 削除
1. 既存の Google ミラー ID を使って `delete` ジョブを積む。
2. ジョブは保存時点の `targetCalendarId` を保持する。
3. 追加先変更後でも、古いミラー予定は保存済みの Google ID で削除する。

### エラー処理
- 3回まで自動再試行
- 失敗時は `notifications.type = calendar_sync_failed` を作成
- 設定画面の `syncSummary` に pending 件数と failed 件数を表示
- 設定画面に同期失敗時の再試行ボタン (`POST /api/calendar/sync-retry`)

### トークンリフレッシュ (CAS)

並行 sync job が同時に期限切れトークンを検出した場合の競合を CAS で安全に処理する。

1. 通常 SELECT (ロックなし) → `updatedAt` を CAS キーとして記録
2. Google にリフレッシュ要求
3. CAS 更新: `WHERE updatedAt = {古い値}` で条件付き UPDATE
4. CAS 失敗 = 別ジョブが先にリフレッシュ済み → DB から最新トークンを返す
5. refresh 失敗: 再読込してまだ期限切れかチェック → 本当に失敗なら reconnect マーク

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
| POST | `/api/calendar/sync-retry` | 失敗した同期ジョブの再試行 |

## 関連ファイル

| ファイル | 役割 |
|----------|------|
| `src/app/(product)/calendar/page.tsx` | カレンダーページ |
| `src/app/(product)/calendar/settings/page.tsx` | 設定ページ (sync status インジケータ付き) |
| `src/app/api/calendar/events/route.ts` | アプリ内イベント API |
| `src/app/api/calendar/events/[id]/route.ts` | イベント個別操作 API |
| `src/app/api/calendar/google/route.ts` | Google 連携 API |
| `src/app/api/calendar/settings/route.ts` | 設定 API |
| `src/app/api/calendar/calendars/route.ts` | カレンダー一覧 API |
| `src/app/api/calendar/sync-retry/route.ts` | 同期再試行 API |
| `src/app/api/cron/calendar-sync/route.ts` | 同期 Cron ジョブ |
| `src/lib/calendar/connection.ts` | トークン管理 (CAS リフレッシュ) |
| `src/lib/calendar/google.ts` | Google API ラッパー (findEventByEntityId, updateCalendarEvent) |
| `src/lib/calendar/sync-provider.ts` | sync state machine (processUpsertJob) |
| `src/lib/calendar/sync-persistence.ts` | 同期永続化 (retryFailedSyncJobs) |
| `src/lib/db/schema.ts` | DBスキーマ |
