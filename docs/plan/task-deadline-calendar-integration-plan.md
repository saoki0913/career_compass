# タスク・締切・カレンダー連携 — 問題監査・改善計画書

> **Task state SSOT**: 実装フェーズのタスク状態は `docs/plan/plan-tasks.json` を正本とする。更新は `node scripts/plan/update-plan-task-status.mjs --id <task-id> --status <status> --source-plan <plan.md>`（または統合 JSON の完全な `id`）で行う。Markdown 内の Task Board / Task Tracker は計画本文として残すが、最新状態は統合 JSON を優先する。


> 作成日: 2026-05-05
> 対象: タスク管理、締切管理、Google Calendar 連携、通知・リマインダー
> 比重: **問題監査 70%** + **改善提案 30%**
> レビュー: Codex plan_review 実施済み (NEEDS_REVISION → 指摘反映済み)

---

## 1. エグゼクティブサマリー

### 調査の目的

就活Pass のタスク・締切・カレンダー連携の3機能領域について、現状実装の品質監査と改善計画を策定する。ユーザーの方針は「現状を複雑にせず、問題を発見して潰す」ことを最優先とし、改善提案はスマートナッジ（in-app）・タイムライン表示・タスク優先度に絞る。

### 主要発見

| 区分 | 件数 | 概要 |
|------|------|------|
| CRITICAL | 1件 | Google Calendar イベント削除の URI エンコード漏れ |
| HIGH | 6件 | トランザクション不整合、タスク巻き戻しロジック、JST タイムゾーン |
| MEDIUM | 13件 | 依存チェーン、エラーハンドリング、パフォーマンス |
| LOW | 4件 | バリデーション、境界値、コード品質 |
| アーキテクチャ統合 | 5件 | データフロー断絶、状態一貫性、双方向性欠如 |

### 調査手法

- 3つの専門エージェント（code-reviewer, product-strategist, architect）による並列深掘り分析
- Codex plan_review によるセカンドオピニオン（6件の指摘を反映）
- grill-me によるユーザーインタビューで方向性確定

---

## 2. 現状実装の概要

### 2.1 データモデル

```
companies ──(1:N)──→ deadlines ──(1:N)──→ tasks
                        │                    │
                        ├── calendarEvents    ├── dependsOnTaskId (self-ref)
                        ├── calendarSyncJobs  └── taskTemplates (参照)
                        └── notifications (data.deadlineId, FK なし)
```

**主要テーブルと特徴**:
- `deadlines`: 17カラム + Google Calendar 同期フィールド6つ。`isConfirmed`, `confidence`, `statusOverride` による3層制御
- `tasks`: 14カラム。`dependsOnTaskId` + `isBlocked` で依存チェーン。`templateKey` でテンプレート追跡
- `calendarEvents`: `type: deadline | work_block`、同期ステータス5状態管理
- `calendarSyncJobs`: `pending → processing → completed | failed`、3回リトライ、5分間隔
- `notifications`: `deadline_reminder | deadline_near | daily_summary` 等6タイプ
- `notificationSettings`: 4層リマインダーカスタマイズ、日次サマリー時刻 (JST 7/9/12/18)
- `taskTemplates`: 締切タイプ別テンプレート、`daysBeforeDeadline` で自動 dueDate 計算

### 2.2 主要フロー

```
[企業情報取得] → [AI 締切抽出 (FastAPI)] → [承認モーダル (confidence 表示)]
                                              ↓
                                    isConfirmed: true に更新
                                              ↓
                              ┌── generateTasksForDeadline()
                              ├── syncDeadlineImmediately() → Google Calendar
                              └── enqueueCalendarSyncJob() (フォールバック)

[Daily Cron JST 9:00] → deadline_reminders (4 層) → cleanup → daily_summary

[Calendar Cron] → processCalendarSyncBatch(20) → リトライ / 失敗通知
```

### 2.3 識別パターン

| 種別 | 識別方法 | 制約 |
|------|---------|------|
| ログインユーザー | Better Auth session → `userId` | FK 参照 |
| ゲスト | HttpOnly cookie → `guestId` | `guest_device_token` cookie が正 |
| 排他制約 | XOR: `userId` か `guestId` のどちらか一方のみ | `tasks_owner_xor` CHECK 制約あり |

---

## 3. 問題監査

### 3.1 CRITICAL（即座に修正必須）

#### C-1: Google Calendar eventId の URI エンコード漏れ

| 項目 | 内容 |
|------|------|
| ファイル | `src/lib/calendar/google.ts:238` |
| 問題 | `deleteCalendarEvent` が `events/${eventId}` で URL を構築し、`encodeURIComponent` を使用していない。同じファイルの `updateCalendarEvent:193` は正しくエンコードしている |
| 原因 | Google Calendar の eventId は base64 由来で `+`, `=`, `/` を含む可能性がある |
| 影響 | 特殊文字を含む eventId のイベント削除が 404 で失敗。Google Calendar にオーファンイベントが永続化する |
| 修正 | `events/${encodeURIComponent(eventId)}` に変更 |
| 工数 | S (1行) |
| 担当 | `nextjs-developer` |

---

### 3.2 HIGH（機能不全リスク — 計画的に早期修正）

#### H-1: 締切 un-completion が全 done タスクを巻き戻す

| 項目 | 内容 |
|------|------|
| ファイル | `src/app/api/deadlines/[id]/route.ts:268-276` |
| 問題 | `completedAt` を null に戻す際、`eq(tasks.status, "done")` で全タスクを open に戻す。`autoCompletedTaskIds` を WHERE 句で使っていない |
| 影響 | ユーザーが手動で完了したタスクまで巻き戻される |
| 修正 | `autoCompletedTaskIds` に含まれる ID のみを対象にフィルタ: `inArray(tasks.id, storedTaskIds)` |
| 工数 | S |

#### H-2: 締切完了 + タスク自動完了がトランザクション外

| 項目 | 内容 |
|------|------|
| ファイル | `src/app/api/deadlines/[id]/route.ts:246-265` |
| 問題 | (1) open タスク取得 → (2) タスク batch done → (3) deadline 更新 が3つの独立 DB 操作。クラッシュ時にタスクは done だが `autoCompletedTaskIds` が未記録 |
| 影響 | undo が不可能になるデータ不整合 |
| 修正 | `db.transaction()` で全操作をラップ |
| 工数 | S |

#### H-3: statusOverride=completed 時に autoCompletedTaskIds 未記録

| 項目 | 内容 |
|------|------|
| ファイル | `src/app/api/deadlines/[id]/status/route.ts:91-98` |
| 問題 | ステータスオーバーライドで completed にした際、タスクを自動完了するが ID を `autoCompletedTaskIds` に保存しない |
| 影響 | H-1 と合わせて undo 時にすべてのタスクが巻き戻される |
| 修正 | 自動完了したタスク ID を `autoCompletedTaskIds` に記録。H-2 と同様にトランザクション化 |
| 工数 | S |

#### H-4: タスク dueDate 計算のクランプが過去締切で崩壊

| 項目 | 内容 |
|------|------|
| ファイル | `src/lib/server/task-generation.ts:64,80` |
| 問題 | `const now = new Date()` を1回キャプチャし、`Math.max(now, rawDueDate)` でクランプ。過去の締切では全タスクが同一 dueDate に潰れ、`daysBeforeDeadline` による相対的な優先順序が失われる |
| 修正 | クランプを除去して相対日付を保持するか、`Math.max(deadlineDueDate - maxDaysBeforeDeadline, rawDueDate)` で相対順序を維持 |
| 工数 | S |

#### H-5: 締切削除時の即時同期失敗 → キュー投入 → DB 削除の整合性問題

| 項目 | 内容 |
|------|------|
| ファイル | `src/app/api/deadlines/[id]/route.ts:390-395` |
| 問題 | `syncDeadlineDeleteImmediately()` → 失敗 → `enqueueCalendarSyncJob()` → その後 `db.delete(deadlines)` が実行される |
| Codex 指摘反映 | 現行の delete job は `targetCalendarId` / `googleEventId` をジョブ自体に保持する設計。問題の本質は「即時削除失敗時の enqueue 成否と DB 削除のタイミング整合性」。enqueue 成功時は Google IDs がジョブ内に保持されるため問題なし |
| 影響 | enqueue 自体が失敗した場合にのみ Google Calendar オーファンが残る |
| 修正 | enqueue 失敗時のエラーハンドリングを追加し、失敗時は DB 削除前に再試行するか、`googleEventId` をローカル変数で保持して直接 Google API を呼ぶ |
| 工数 | S |

#### H-6: isSameDay がサーバーローカルタイムゾーン（UTC）で比較

| 項目 | 内容 |
|------|------|
| ファイル | `src/lib/company-info/deadline-persistence.ts:67-73` |
| 問題 | `isSameDay` が `getFullYear()`, `getMonth()`, `getDate()` を使用。Vercel ではサーバー TZ が UTC。JST 23:00 UTC (翌日 08:00 JST) の締切は UTC 日付で比較され、重複検出が失敗する |
| 修正 | `src/lib/datetime/jst.ts` の `getJstDateKey()` を使用して JST 日付で比較 |
| 工数 | S |

---

### 3.3 MEDIUM（エッジケース・改善）

#### M-1: overdue 判定が JST 日境界を考慮しない

| 項目 | 内容 |
|------|------|
| ファイル | `src/lib/server/deadline-status.ts:29` |
| 問題 | `params.dueDate < new Date()` で UTC 比較。JST 正午の締切が UTC 03:01 で overdue 判定される |
| 修正 | JST 日単位で比較: `startOfJstDayAsUtc(now)` と比較 |
| 工数 | S |

#### M-2: CRON_SECRET 空文字列フォールバック

| 項目 | 内容 |
|------|------|
| ファイル | `src/app/api/notifications/batch/route.ts:42` |
| 問題 | `process.env.CRON_SECRET || ""` でフォールバック。未設定時に意図しないアクセスが可能 |
| 修正 | `CRON_SECRET` 未設定時は即座に 401 を返す |
| 工数 | S |
| 担当 | `security-auditor` |

#### M-3: タスクステータス + 依存チェーン更新が非トランザクション

| 項目 | 内容 |
|------|------|
| ファイル | `src/app/api/tasks/[id]/route.ts:171-182` |
| 問題 | タスク status 更新と `unblockSuccessor` / `reblockSuccessors` が別操作。クラッシュ時に後続タスクが永続的にブロック |
| 修正 | `db.transaction()` でラップ |
| 工数 | S |

#### M-4: unblockSuccessor が単一 successor のみ処理

| 項目 | 内容 |
|------|------|
| ファイル | `src/lib/server/task-dependency.ts:16-31` |
| 問題 | `.limit(1)` で最初の後続タスクのみ unblock。複数タスクが同一タスクに依存する場合に未処理 |
| 修正 | `.limit(1)` を除去し全 successor をイテレート |
| 工数 | S |

#### M-5: 企業締切 API が createApiErrorResponse 未使用

| 項目 | 内容 |
|------|------|
| ファイル | `src/app/api/companies/[id]/deadlines/route.ts:97-100,146-150` |
| 問題 | `NextResponse.json({ error })` で raw エラー返却。`X-Request-Id`, `userMessage`, `action` なし |
| 修正 | `createApiErrorResponse()` に統一。受け入れ条件: `requestId` + `userMessage` + `action` の3フィールドを全レスポンスに含む |
| 工数 | S |

#### M-6: getRequestIdentity 二重呼び出し

| 項目 | 内容 |
|------|------|
| ファイル | `src/app/api/companies/[id]/deadlines/route.ts:97,153` |
| 問題 | `verifyCompanyAccess` 内と本体で `getRequestIdentity` を2回呼び出し |
| 修正 | `verifyCompanyAccess` から identity を返却するように変更 |
| 工数 | S |

#### M-7: saveExtractedDeadlines 内の N+1 クエリ

| 項目 | 内容 |
|------|------|
| ファイル | `src/lib/company-info/deadline-persistence.ts:219-256` |
| 問題 | 各抽出締切に対して `findExistingDeadline` を順次実行。10件で10クエリ |
| 修正 | 企業の既存締切を1クエリで一括取得し、インメモリマッチング |
| 工数 | M |

#### M-8: 承認時に body.type を使わず旧 type でタスク生成

| 項目 | 内容 |
|------|------|
| ファイル | `src/app/api/deadlines/[id]/route.ts:291-301` |
| 問題 | 承認（`isConfirmed: false → true`）と type 変更を同時に行う場合、旧 type でタスクテンプレートを選択 |
| 修正 | `body.type ?? currentDeadline.type` を使用 |
| 工数 | S |

#### M-9: useCalendarEvents が SWR 未使用

| 項目 | 内容 |
|------|------|
| ファイル | `src/hooks/useCalendar.ts:95-152` |
| 問題 | `useState` + `useEffect` + `fetch` で実装。SWR のリクエスト重複排除、stale-while-revalidate なし |
| 修正 | SWR に移行。キーは `start`/`end` パラメータベース |
| 工数 | M |

#### M-10: sync-queue.ts の非 null アサーション

| 項目 | 内容 |
|------|------|
| ファイル | `src/lib/calendar/sync-queue.ts:51,91` |
| 問題 | `settings!.targetCalendarId` — `canSyncToGoogle` 通過後だが明示的 null チェックなし |
| 修正 | `canSyncToGoogle` を type guard 化するか明示的チェック追加 |
| 工数 | S |

#### M-11: カレンダーイベント GET の leftJoin + WHERE 混在

| 項目 | 内容 |
|------|------|
| ファイル | `src/app/api/calendar/events/route.ts:72-80` |
| 問題 | `leftJoin(companies)` の後に `eq(companies.userId, userId)` で WHERE。事実上 innerJoin だが意図が不明瞭 |
| Codex 指摘反映 | guest には対応していない。新 API を作る場合は guest/user 両対応が必須 |
| 修正 | `innerJoin` に変更して意図を明確化 + guest 対応の owner condition 追加 |
| 工数 | S |

#### M-12: タスク完了 → 締切ステータス自動更新なし（双方向性の欠如）

| 項目 | 内容 |
|------|------|
| ファイル | `src/app/api/tasks/[id]/route.ts:155-182` |
| 問題 | 締切完了→タスク自動完了は実装済み。逆方向（全タスク完了→締切自動完了）は未実装 |
| 影響 | ダッシュボードの進捗表示が実態と乖離。ナッジ/タイムラインの正確性にも影響 |
| 修正 | タスク完了時に同一 deadline の全タスクが done かチェックし、全完了なら `deadline.completedAt` を自動設定 |
| 工数 | M |

#### M-13: 締切削除時の通知・同期ジョブのオーファン化

| 項目 | 内容 |
|------|------|
| ファイル | `src/app/api/deadlines/[id]/route.ts`、`src/lib/db/schema.ts` |
| 問題 | 締切削除時に `tasks` と `calendarEvents` はカスケード削除されるが、`notifications.data.deadlineId`（FK なし）と `calendarSyncJobs.entityId`（FK なし）はオーファン化する |
| 修正 | 削除前に `notifications`（`data->>'deadlineId'`）と `calendarSyncJobs`（`entityId` + `entityType='deadline'`）をクリーンアップ |
| 工数 | S |

---

### 3.4 LOW（改善提案）

#### L-1: tasks/route.ts の status パラメータ未検証

`src/app/api/tasks/route.ts:50` — 不正な status 値で空結果が返る（400 エラーを返すべき）

#### L-2: 7d ティアの 180h 境界でギャップ

`src/lib/notifications/deadline-importance.ts:37` — `max: 180` は `<` 比較のため正確に 7.5 日の締切がどのティアにも属さない

#### L-3: Cron 自己呼び出しの失敗サイレント化

`src/app/api/cron/daily-notifications/route.ts:57-68` — 個別バッチの失敗が HTTP 200 で返却。Vercel Cron 監視で検知不可

#### L-4: プレースホルダ dueDate のタイムゾーン

`src/lib/company-info/deadline-persistence.ts:239` — `new Date(year, 11, 31)` がサーバー TZ (UTC)。JST 基準なら `Date.UTC(year, 11, 31, 3, 0, 0)` (12:00 JST)

---

### 3.5 横断的観察

#### X-1: タスク依存関係の循環検出なし

`tasks.dependsOnTaskId` に自己参照 FK はあるが、循環検出ロジックがない。テンプレート生成では構造的に回避されるが、API 経由の手動設定では A→B→A のような循環が作成可能。`reblockSuccessors` が無限ループする可能性がある。

#### X-2: 通知テーブルの owner XOR 制約なし

`notifications` テーブルは `tasks_owner_xor` のような CHECK 制約を持たない。`userId` と `guestId` が同時に設定される、または両方 null になるケースが理論上可能。

#### X-3: カレンダー即時同期 + キューの TOCTOU

即時同期失敗 → `enqueueCalendarSyncJob` の間に、別リクエストが同じ締切を更新すると、2つの同期操作が競合する。`cancelPendingJobsForEntity` で緩和されるが、cancel と新規 insert の間にウィンドウがある。

#### X-4: statusOverride による overdue 隠蔽

`computeDeadlineStatus` で `statusOverride` が最優先。ユーザーが期限切れ締切を `not_started` にオーバーライドすると、ダッシュボードの overdue カウントから消える。意図的な設計かどうか要確認。

---

## 4. 改善提案

### 4.1 フェーズ構成

```
Phase 1 (Quick Win — 即時)
├── CRITICAL/HIGH 修正 (7件)
├── 自動優先度スコアリング (クライアントサイド)
└── 双方向ステータス同期 (M-12)

Phase 2 (短期 — 1-2週間)
├── MEDIUM 修正 (13件)
├── スマートナッジ MVP (3シナリオ)
└── 横断的観察の修正 (X-1 〜 X-4)

Phase 3 (中期 — 2-4週間)
├── スイムレーンタイムライン (デスクトップ + モバイルアジェンダ)
└── ナッジ拡張 (追加シナリオ + 設定UI)
```

> Codex 指摘反映: Phase 1 は CRITICAL/HIGH 修正に絞り、ナッジ永続化と Gantt API は Phase 2 以降に分離。

---

### 4.2 Phase 1: 自動優先度スコアリング

**概要**: 既存データ（`deadline.dueDate` + `deadline.type`）からタスクの urgency score をクライアントサイドで計算し、「今やるべきこと」を明確にする。

**スキーマ変更**: 不要（クライアント計算のみ）

**計算ロジック**:
```
urgencyScore = typeWeight(deadline.type) * timeDecay(hoursUntilDue)

typeWeight:
  es_submission: 1.0
  interview_*: 0.9
  web_test / aptitude_test: 0.8
  offer_response: 0.7
  briefing / internship: 0.5
  other: 0.3

timeDecay:
  <= 24h: 10
  <= 72h: 7
  <= 168h (7d): 4
  <= 336h (14d): 2
  > 336h: 1
```

**UI 変更**:
- タスク一覧のデフォルトソートを `urgencyScore` 降順に変更
- ダッシュボードの「今日のタスク」カードに urgencyScore のバッジ表示（高/中/低）
- 既存のタスクタイプ別ソートは維持（ユーザーが切り替え可能）

**対象ファイル**:
- `src/components/tasks/TasksPageClient.tsx` — ソートロジック追加
- `src/components/dashboard/TodayTasksCard.tsx` — スコアバッジ追加
- `src/lib/task-priority.ts` — 新規: 計算ロジック（純関数、テスト容易）

**工数**: S | **担当**: `nextjs-developer`

---

### 4.3 Phase 2: スマートナッジ MVP

**概要**: 締切とタスクの状態を横断的に分析し、ユーザーに能動的な提案をダッシュボードで表示する。in-app のみ。

#### 設計原則（ユーザーインタビューで確定）
- 「やるべきこと」ではなく「次のステップ」として提示
- 就活のストレスを増やさない（不安を煽らない）
- 達成感を感じさせるポジティブフィードバックを含む
- 「管理できている」安心感を提供する

#### MVP シナリオ（3種類）

**A1: ES 下書き未着手 + 締切迫る**

| 項目 | 内容 |
|------|------|
| トリガー | `deadline.type = es_submission` AND `dueDate` within 72h AND 紐づくドキュメントの内容 < 50文字 |
| メッセージ | "[Company名] のES提出まであと{N}日。下書きを始めましょう。" |
| CTA | "ESエディタを開く" → ドキュメントエディタ |
| 頻度制御 | 72h 突入時に1回。24h で未着手なら再トリガー |
| トーン | 励まし型: "始めましょう"。非難型禁止: "まだ書いていません" |

**B1: 締切クラスター警告**

| 項目 | 内容 |
|------|------|
| トリガー | 3件以上の confirmed 未完了締切が同一3日間ウィンドウ内に集中 |
| メッセージ | "今週は{N}件の締切が重なっています。優先順位を確認しましょう。" |
| CTA | "タイムラインで確認" → カレンダー/タイムライン |
| 頻度制御 | クラスターごとに週1回 |

**C2: 週次進捗サマリー**

| 項目 | 内容 |
|------|------|
| トリガー | 日曜 JST AND 過去7日間に1件以上のタスク完了 |
| メッセージ | "今週は{N}件のタスクを完了しました! 来週は{M}件の締切があります。" |
| CTA | "来週の準備を確認" → ダッシュボード |
| トーン | 祝福型: 達成感を強調 |

#### アーキテクチャ設計

**計算方式**: ハイブリッド
- **リアルタイム**: A1, B1 — ダッシュボードロード時に既存 deadline/task クエリに piggyback（追加クエリ 1-2本、~5ms）
- **バッチ**: C2 — 既存 daily_summary Cron に統合（追加 Cron 不要、Vercel Hobby 制約を回避）

**API 設計**:
- `GET /api/nudges` — 優先度順・頻度制御済みのナッジリスト返却（最大3件）
- `POST /api/nudges/:id/dismiss` — dismiss 記録（CSRF 保護適用）

**ナッジと通知の責務分離**:

> Codex 指摘反映: ナッジ用テーブルは既存 `notifications` との責務分担を明確にする。

| 観点 | notifications | nudges (新規) |
|------|--------------|--------------|
| ライフサイクル | イベント駆動（発火→表示→既読→期限切れ90日） | 状態駆動（条件成立中は常に表示。条件解消で自動消滅） |
| 永続性 | DB に保存、履歴として蓄積 | 一時的。dismiss 記録のみ永続化 |
| 生成元 | Cron バッチ（事前生成） | ダッシュボードロード時（リアルタイム計算） |

**新テーブル**: `nudge_interactions` のみ（dismiss 追跡用）

```sql
nudge_interactions:
  id (UUID PK)
  userId / guestId (XOR CHECK 制約)
  scenarioKey (varchar)    -- 例: "es_draft_near_deadline"
  targetType (varchar)     -- 例: "deadline"
  targetId (varchar)       -- 締切ID等
  dedupeKey (varchar)      -- scenarioKey + targetId + computedForJstDate
  action (enum: 'dismiss' | 'click')
  computedForJstDate (date) -- JST日付基準のナッジ計算日
  createdAt (timestamptz)

  CHECK (userId IS NOT NULL OR guestId IS NOT NULL)
  CHECK (NOT (userId IS NOT NULL AND guestId IS NOT NULL))
  INDEX: (userId, scenarioKey, targetId)
  INDEX: (guestId, scenarioKey, targetId)
```

ナッジ本体は DB に保存しない（リアルタイム計算結果をそのまま返却）。dismiss 済みの `dedupeKey` を除外することで頻度制御を実現。

**プラグインパターン**:
```typescript
interface NudgeScenario {
  key: string;
  computeMode: "realtime" | "batched";
  priority: number;
  evaluate(ctx: NudgeContext): NudgeResult | null;
}
```

新シナリオは `src/lib/nudges/scenarios/` にファイルを追加し、配列に登録するだけで拡張可能。

**頻度制御ルール**:

| ルール | 値 | 理由 |
|--------|-----|------|
| ダッシュボード最大表示 | 3件 | 圧倒感防止 |
| 同一 dedupeKey の再表示 | dismiss 後24h以降 | しつこさ防止 |
| ポジティブ比率下限 | 1:4 | 不安煽り防止 |
| 新規アカウント猶予 | 48h | 企業追加前のナッジは無意味 |
| 日次合計上限 | 5件 | 既存 flood cap と統一 |

**対象ファイル**:
- `src/lib/nudges/` — 新規ディレクトリ
  - `types.ts` — NudgeScenario インターフェース
  - `evaluator.ts` — シナリオ評価 + 頻度制御
  - `scenarios/es-draft-near-deadline.ts`
  - `scenarios/deadline-cluster.ts`
  - `scenarios/weekly-progress.ts`
- `src/app/api/nudges/route.ts` — GET エンドポイント
- `src/app/api/nudges/[id]/dismiss/route.ts` — POST dismiss
- `src/components/dashboard/NudgeBanner.tsx` — Priority 1 表示
- `src/components/dashboard/NudgeCard.tsx` — Priority 2 表示
- `src/hooks/useNudges.ts` — SWR フック

**工数**: M | **担当**: `nextjs-developer` + `ui-designer`

---

### 4.4 Phase 3: スイムレーンタイムライン

**概要**: 複数企業の締切とタスクを横断的に可視化するタイムライン。従来の Gantt チャートではなく、就活生に最適化したスイムレーン形式。

#### 名称: 「タイムライン」

> 「ガントチャート」はエンタープライズ PM のイメージが強い。ユーザー向けには「タイムライン」と呼ぶ。

#### デスクトップ表示 (>= 768px)

```
企業名          | < 4/28  4/29  4/30  5/1   5/2   5/3   5/4 > |  (<- 今日線)
----------------|----------------------------------------------|
A社             |         [ES提出 ##%--]              [面接1次] |
B社             |                    [Webテスト]               |
C社             |  [ES提出 ####]                               |
----------------|----------------------------------------------|
```

- 横軸: 時間（週/月切り替え）
- 縦軸: 企業（直近の締切が近い順にソート）
- マーカー: 締切タイプアイコン + 省略ラベル + タスク進捗バー
- 色分け: 未着手=グレー、進行中=青、完了=緑、期限切れ=赤
- 今日線: 赤い縦破線
- クリック: スライドアウトパネルで締切詳細 + タスク一覧

#### モバイル表示 (< 768px): アジェンダビュー

横スクロールのタイムラインはモバイルで使えない。代替としてアジェンダビュー:

```
-- 5月5日 (月) --------
  A社 | ES提出 [2/4 完了] *赤
  C社 | 面接1次 [0/3 完了] *青

-- 5月7日 (水) --------
  B社 | Webテスト [1/2 完了] *青
```

- 日付でグループ化した縦リスト
- 各項目: 企業名 + 締切タイプ + ミニ進捗バー + タスク数
- タップ展開: インラインでタスクリスト表示

#### API 設計

> Codex 指摘反映: `GET /api/timeline` は companies 起点で owner check 済みの範囲のみ返却。guest/user 両対応のテストを受け入れ条件に含める。

`GET /api/timeline` — 正規化された3配列を返却:
```json
{
  "companies": [{ "id": "...", "name": "...", "industry": "..." }],
  "deadlines": [{ "id": "...", "companyId": "...", "type": "...", "title": "...", "dueDate": "...", "status": "...", "taskProgress": { "total": 4, "completed": 2 } }],
  "tasks": [{ "id": "...", "deadlineId": "...", "title": "...", "status": "...", "dueDate": "..." }]
}
```

**owner check**: `companies.userId = identity.userId OR companies.guestId = identity.guestId`（排他）

**パフォーマンス**:
- 最大規模: 50社 x 5締切 x 3タスク = ~750要素、~60KB payload
- パジネーション不要（この規模なら単一 payload で十分）
- クライアント側で `Map<companyId, deadline[]>` をインデックス構築

#### ライブラリ選定: CSS Grid 自作

| 選択肢 | 判定 | 理由 |
|--------|------|------|
| gantt-task-react | 不採用 | 最終リリース 2022年7月（3年以上）、React 19 互換性不明 |
| frappe-gantt | 不採用 | Vanilla JS（React ラッパー不在）、フル Gantt はオーバースペック |
| @nivo/gantt | 不採用 | バンドルサイズ大、スイムレーンに不向き |
| **CSS Grid 自作** | **採用** | 完全な制御、最小バンドル、モバイルアジェンダは別コンポーネントで対応 |

オプション依存: `@tanstack/react-virtual`（50社超時の仮想スクロール、~5KB gzipped）

#### 既存カレンダーとの住み分け

| ビュー | 用途 | データ |
|--------|------|--------|
| カレンダー（月表示） | 日次計画: 「今日何をするか」 | 締切 + 作業ブロック + Google イベント |
| タイムライン | 戦略概観: 「企業間の締切がどう重なるか」 | 締切 + タスク進捗（作業ブロックなし） |

タイムラインのマーカークリック → カレンダーの該当日にディープリンク可能。

**対象ファイル**:
- `src/app/(product)/timeline/page.tsx` — 新規ページ
- `src/components/timeline/` — 新規ディレクトリ
  - `TimelineChart.tsx` — デスクトップ表示
  - `TimelineAgenda.tsx` — モバイルアジェンダ
  - `TimelineMarker.tsx` — 締切マーカー
  - `TimelineRow.tsx` — 企業行
- `src/app/api/timeline/route.ts` — GET エンドポイント
- `src/lib/server/timeline-loaders.ts` — データローダー
- `src/hooks/useTimeline.ts` — SWR フック

**工数**: L | **担当**: `ui-designer` + `nextjs-developer`

---

## 5. 実装ロードマップ

### Phase 1: バグ修正 + Quick Win

| # | 修正 | 対象ファイル | 工数 | 担当 |
|---|------|-------------|------|------|
| 1 | C-1: eventId URI エンコード | `calendar/google.ts` | S | `nextjs-developer` |
| 2 | H-1: un-completion のタスクフィルタ | `deadlines/[id]/route.ts` | S | `nextjs-developer` |
| 3 | H-2: 締切完了のトランザクション化 | `deadlines/[id]/route.ts` | S | `nextjs-developer` |
| 4 | H-3: statusOverride の autoCompletedTaskIds | `deadlines/[id]/status/route.ts` | S | `nextjs-developer` |
| 5 | H-4: dueDate クランプの修正 | `task-generation.ts` | S | `nextjs-developer` |
| 6 | H-5: 削除時の enqueue 整合性 | `deadlines/[id]/route.ts` | S | `nextjs-developer` |
| 7 | H-6: isSameDay の JST 対応 | `deadline-persistence.ts` | S | `nextjs-developer` |
| 8 | 自動優先度スコアリング | `TasksPageClient.tsx` 等 | S | `nextjs-developer` |
| 9 | M-12: 双方向ステータス同期 | `tasks/[id]/route.ts` | M | `nextjs-developer` |

**想定期間**: 2-3日

### Phase 2: MEDIUM 修正 + ナッジ MVP

| # | 修正 | 工数 | 担当 |
|---|------|------|------|
| 10-22 | M-1 〜 M-13 の修正 | S-M | `nextjs-developer`, `security-auditor` |
| 23 | X-1: 循環依存検出 | S | `nextjs-developer` |
| 24 | X-2: 通知テーブルの XOR 制約 | S | `database-engineer` |
| 25 | スマートナッジ MVP (A1, B1, C2) | M | `nextjs-developer` + `ui-designer` |

**想定期間**: 1-2週間

### Phase 3: タイムライン + ナッジ拡張

| # | 施策 | 工数 | 担当 |
|---|------|------|------|
| 26 | スイムレーンタイムライン (デスクトップ) | L | `ui-designer` + `nextjs-developer` |
| 27 | アジェンダビュー (モバイル) | M | `ui-designer` |
| 28 | ナッジ拡張 (A2, D1, D2) | M | `nextjs-developer` |
| 29 | ナッジ設定 UI + dismiss | M | `ui-designer` |
| 30 | タスク依存関係 UI の活性化 | M | `nextjs-developer` |

**想定期間**: 2-4週間

---

## 6. リスク評価

| リスク | 影響 | 緩和策 |
|--------|------|--------|
| ナッジが既存通知と二重管理になる | UX 混乱、メンテコスト増 | 責務分離を明確化（通知=イベント駆動永続、ナッジ=状態駆動一時）。dismiss のみ DB 保存 |
| ハイブリッド計算での重複生成 | 同一ナッジが2回表示 | `dedupeKey`（scenario + target + JSTDate）で排他 |
| Timeline API の過取得・情報漏洩 | セキュリティリスク | companies 起点で owner check。guest/user 両対応の E2E テストを受け入れ条件に |
| タイムラインのモバイル UX | モバイルで使えない | アジェンダビューをモバイル専用で提供。水平スクロール禁止 |
| ナッジが就活の不安を煽る | ユーザー離脱 | アンチアンキシティ設計原則を遵守。ポジティブ比率 1:4 を維持 |
| Phase 3 のスコープ膨張 | 工数超過 | タイムラインとナッジ拡張は独立 PR。段階リリース |
| schema.ts への追加 (1041行) | 500行超ファイルへの責務追加 | `nudge_interactions` は最小テーブル（7カラム）。`database-engineer` がインデックス設計をレビュー |

---

## 7. 受け入れ条件チェックリスト

### Phase 1
- [ ] C-1 修正: `deleteCalendarEvent` が `encodeURIComponent(eventId)` を使用
- [ ] H-1 〜 H-6 修正: 各修正にユニットテスト追加
- [ ] 自動優先度: タスク一覧のデフォルトソートが urgencyScore 降順
- [ ] M-12: 全タスク完了時に締切が自動完了（トランザクション内）
- [ ] 既存 E2E テストが全パス

### Phase 2
- [ ] M-1 〜 M-13 修正完了
- [ ] ナッジ MVP: ダッシュボードに最大3件のナッジ表示
- [ ] ナッジ A1: ES 締切72h以内 + 下書き未着手で表示
- [ ] ナッジ B1: 3件以上の締切が3日間に集中で警告
- [ ] ナッジ C2: 週次進捗サマリー（タスク完了時のみ）
- [ ] dismiss 機能: 24h クールダウン
- [ ] guest/user 両対応: 全 API で owner XOR 検証
- [ ] CSRF: `POST /api/nudges/:id/dismiss` に CSRF 保護

### Phase 3
- [ ] タイムライン: デスクトップで企業 x 時間のスイムレーン表示
- [ ] タイムライン: モバイルでアジェンダビュー
- [ ] タイムライン: 50社 x 5締切の描画がブロッキングなし
- [ ] タイムライン: `GET /api/timeline` が owner check 済みデータのみ返却
- [ ] ナッジ拡張: A2 (面接準備), D1 (期限切れ), D2 (未確認締切)

---

## 8. 担当エージェント routing

> Codex 指摘反映: 主担当と実装分担を明記

| 領域 | 主担当 | 補助 |
|------|--------|------|
| 全体設計・ゲート判断 | `architect` | -- |
| バグ修正 (C-1, H-1〜H-6, M-*) | `nextjs-developer` | `code-reviewer` |
| DB スキーマ追加 (nudge_interactions) | `database-engineer` | `architect` |
| セキュリティ (CSRF, CRON_SECRET, owner check) | `security-auditor` | `nextjs-developer` |
| ナッジ UI (NudgeBanner, NudgeCard) | `ui-designer` | `nextjs-developer` |
| タイムライン UI (Chart, Agenda) | `ui-designer` | `nextjs-developer` |
| API 実装 (/api/nudges, /api/timeline) | `nextjs-developer` | `architect` |
| カレンダー同期修正 | `nextjs-developer` | `security-auditor` |
| テスト | `test-automator` | -- |

---

## 9. 競合分析サマリー

### 就活系サービスとの比較

| 機能 | ONE CAREER / マイナビ / リクナビ | 就活Pass (現状) | 就活Pass (提案後) |
|------|------|------|------|
| タスク管理 | なし（リスト型サービス） | テンプレート自動生成 + 依存関係 | + 優先度スコア + ナッジ |
| 締切管理 | 締切日リスト表示のみ | AI 抽出 + 承認 + 4層リマインダー | + クラスター検知 + 逆算ナッジ |
| カレンダー | なし | Google Calendar 一方向同期 | 変更なし（十分） |
| タイムライン | なし | 月カレンダーのみ | + スイムレーン + アジェンダ |
| スマートナッジ | なし | なし | 3種類 → 段階的に拡張 |

### 差別化ポイント

就活プラットフォームはリスティングサービスであり、ワークフロー管理の機能を持たない。就活Pass のタスク自動生成 + 依存関係 + リマインダーは既に独自の差別化領域にある。スマートナッジとタイムラインは、この差別化をさらに深める。

### 汎用ツールとの差別化

Todoist/Notion は汎用的だがドメイン知識がない。「ES 提出前に企業研究タスクを自動生成」「面接3日前に準備不足を検知」は就活 Pass にしかできない。
