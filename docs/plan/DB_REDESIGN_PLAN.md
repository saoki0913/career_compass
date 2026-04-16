---
topic: db-redesign
plan_date: 2026-04-14
based_on_review: null
status: 未着手
implementation_level: 手順書レベル
---

# DB再設計 実装ガイド

## 0. このドキュメントの読み方

- **対象読者**: ジュニアエンジニア（Drizzle ORM / PostgreSQL の基本経験あり）
- **前提知識**: SQL ALTER TABLE, Drizzle ORM schema 定義, JSON/JSONB の違い
- **用語集**: 末尾「8. 用語集」を参照
- **関連ドキュメント**:
  - DB 再作成: `docs/setup/DB_REBUILD_CHECKLIST.md`
  - Supabase 運用: `docs/setup/DB_SUPABASE.md`
  - スキーマ設計: `docs/architecture/DATABASE.md`
  - スキーマ定義: `src/lib/db/schema.ts`

---

## 1. 背景と目的

### なぜ必要か

パフォーマンス問題（画面遷移の遅さ、余計なデータ再取得）の根本原因はスキーマ設計とクエリ層の両方にある。具体的に:
- text 列に JSON 文字列を保存 → read/write 毎に `JSON.parse()`/`JSON.stringify()` が必要
- gakuchika の messages が二重文字列化されるバグ
- deadline-loaders が相関サブクエリ × N 行で遅い

### 完了後の期待状態

- 全 JSON データが適切な jsonb 型で保存されている
- `JSON.parse()`/`JSON.stringify()` の不要な呼び出しがゼロ
- deadline-loaders が 1 クエリで完結する
- Drizzle Relations が定義され、型安全なリレーション参照が可能

### スコープ外

- `loginPrompts` テーブルの削除、AI 系テーブルの `guestId` 列削除
- `gakuchikaContents.linkedCompanyIds` の jsonb 化（効果低）
- 既存インデックスの削除（EXPLAIN ANALYZE 後に別途判断）
- ページネーション追加

---

## 2. 事前準備チェックリスト

- [ ] ブランチ作成: `feature/db-redesign-phase1`（Phase ごとに別ブランチ推奨）
- [ ] ローカル DB 再作成:
  1. `.env.local` の `DATABASE_URL` がローカルを向いていることを確認
  2. `supabase stop --no-backup && supabase start`
  3. `npm run db:migrate:as-app` で既存 migration を適用
- [ ] `npm run build` が PASS
- [ ] `npm run test:unit` が PASS

---

## 3. タスク一覧

| Phase | ID | タスク名 | 対象 | 推定工数 | 依存 | blast radius |
|-------|-----|---------|------|---------|------|-------------|
| 1 | DB-1 | relations.ts 作成 | `src/lib/db/relations.ts` (新規) | 2h | なし | 低 (純粋追加) |
| 1 | DB-2 | db/index.ts スキーママージ更新 | `src/lib/db/index.ts` | 30min | DB-1 | 中 (型変更) |
| 1 | DB-3 | schema.ts にインデックス追加 | `src/lib/db/schema.ts` | 30min | なし | 低 |
| 2 | DB-4 | gakuchika JSON.stringify バグ修正 | 2 route ファイル | 30min | なし | **低 (最高 ROI)** |
| 2 | DB-5 | P0 text→jsonb 変換 (5カラム) | schema + 5 route/loader | 3h | なし | **高** |
| 2 | DB-6 | P1 text→jsonb 変換 (2カラム) | schema + 2 route/loader | 1.5h | なし | **高** |
| 2 | DB-7 | P2 text→jsonb 変換 (3カラム) | schema + 3 route/loader | 2h | なし | 中 |
| 3 | DB-8 | deadline-loaders クエリ最適化 | `deadline-loaders.ts` | 2h | DB-3 推奨 | 中 |

---

## 4. 各タスクの詳細手順

### Task DB-1: relations.ts 作成

#### 4.1.1 目的

Drizzle ORM のリレーション定義を追加し、型安全なリレーション参照を可能にする。

#### 4.1.2 対象ファイル

| ファイル | 操作 | 概要 |
|---------|------|------|
| `src/lib/db/relations.ts` | **新規** | 全リレーション定義 |

#### 4.1.3 手順

**Step 1: ファイルを作成**
- パス: `src/lib/db/relations.ts`
- `import { relations } from "drizzle-orm"` と各テーブルを `schema.ts` から import

**Step 2: 以下のリレーションを定義**
- `users` ↔ `sessions`, `accounts`, `userProfiles`, `subscriptions`, `credits`, `creditTransactions`, `companies`, `documents`, `tasks`, `notifications`, `notificationSettings`, `calendarSettings`
- `guestUsers` ↔ `companies`, `documents`, `tasks`, `notifications`, `loginPrompts`
- `companies` ↔ `applications`, `deadlines`, `documents`, `tasks`, `motivationConversations`, `interviewConversations`, `companyPdfIngestJobs`
- `applications` ↔ `jobTypes`, `deadlines`, `submissionItems`, `documents`
- `deadlines` ↔ `tasks`, `calendarEvents`
- `documents` ↔ `documentVersions`, `aiThreads`
- `aiThreads` ↔ `aiMessages`
- `gakuchikaContents` ↔ `gakuchikaConversations` (1:many)
- `interviewConversations` ↔ `interviewFeedbackHistories`, `interviewTurnEvents`

**Step 3: 各リレーションに外部キーと型を明記**
- `one()` / `many()` を使い、`fields` と `references` を明示

#### 4.1.4 受入基準

- [ ] AC-1: `src/lib/db/relations.ts` が存在する
- [ ] AC-2: 上記の全リレーションが定義されている
- [ ] AC-3: `npm run build` がエラー 0

#### 4.1.5 テスト仕様

| テスト種別 | コマンド / 手順 | 期待結果 |
|-----------|----------------|---------|
| 型チェック | `npm run build` | エラー 0 |
| import 確認 | relations.ts が schema.ts の全テーブルを正しく import | コンパイルエラーなし |

#### 4.1.6 リスク評価

| リスク | 影響度 | 発生確率 | 対策 |
|--------|-------|---------|------|
| リレーション定義ミス | 低 | 中 | 既存の foreign key 制約と照合 |

#### 4.1.7 ロールバック手順

```bash
rm src/lib/db/relations.ts
```

---

### Task DB-2: db/index.ts スキーママージ更新

#### 4.2.1 目的

DB-1 で作成した relations.ts を Drizzle の schema にマージし、型安全なリレーション参照を有効化する。

#### 4.2.2 対象ファイル

| ファイル | 操作 | 概要 |
|---------|------|------|
| `src/lib/db/index.ts` | 変更 | import rename + schema merge + 型更新 |

#### 4.2.3 手順

**Step 1: import をリネーム**
- `import * as schema from "./schema"` → `import * as tables from "./schema"`

**Step 2: relations を import してマージ**
- `import * as relations from "./relations"`
- `const schema = { ...tables, ...relations }`

**Step 3: 型を更新**
- `PostgresJsDatabase<typeof schema>` に統一
- `createMissingDb()` の戻り値型も同様に更新

#### 4.2.4 受入基準

- [ ] AC-1: `db.query.users.findFirst({ with: { companies: true } })` が型エラーなしでコンパイルされる
- [ ] AC-2: `npm run build` がエラー 0
- [ ] AC-3: 既存のクエリが引き続き動作する

#### 4.2.5 テスト仕様

| テスト種別 | コマンド / 手順 | 期待結果 |
|-----------|----------------|---------|
| 型チェック | `npm run build` | エラー 0 |
| ユニット | `npm run test:unit` | 既存テスト PASS |
| 手動確認 | `/dashboard` を表示 | 正常表示 |

#### 4.2.6 リスク評価

| リスク | 影響度 | 発生確率 | 対策 |
|--------|-------|---------|------|
| 型変更で既存クエリが壊れる | 中 | 低 | `tables` → `schema` の merge は後方互換。既存の `db.select()` は影響なし |

#### 4.2.7 ロールバック手順

```bash
git checkout -- src/lib/db/index.ts
```

---

### Task DB-3: schema.ts にインデックス追加

#### 4.3.3 手順

**Step 1: deadlines テーブルにインデックス追加**
- ファイル: `src/lib/db/schema.ts`
- 追加: `deadlines(company_id, completed_at, due_date)` 複合インデックス
- 用途: 最寄り締切 + 今後7日 クエリの WHERE + ORDER BY をカバー

**Step 2: tasks テーブルにインデックス追加**
- 追加: `tasks(deadline_id, status)` 複合インデックス
- 用途: 締切ダッシュボードのタスク集計で COUNT WHERE status='done' を効率化

**Step 3: migration 生成と適用**
- `npm run db:generate` で migration SQL を自動生成
- `npm run db:migrate:as-app` でローカル DB に適用

**Step 4: EXPLAIN ANALYZE で効果確認**
- ローカル DB で以下を実行:
  ```sql
  EXPLAIN ANALYZE SELECT * FROM deadlines WHERE company_id = 'xxx' AND completed_at IS NULL ORDER BY due_date ASC LIMIT 5;
  ```
- Index Scan が使われていることを確認

#### 4.3.4 受入基準

- [ ] AC-1: `npm run db:generate` がエラーなしで migration を生成
- [ ] AC-2: `npm run db:migrate:as-app` がエラーなしで適用
- [ ] AC-3: EXPLAIN ANALYZE で新インデックスが使用されている

#### 4.3.6 リスク評価

| リスク | 影響度 | 発生確率 | 対策 |
|--------|-------|---------|------|
| 本番での index 作成が重い | 中 | 低 | `CREATE INDEX CONCURRENTLY` で非ロッキング作成 |

#### 4.3.7 ロールバック手順

```sql
-- ロールバック SQL
DROP INDEX IF EXISTS deadlines_company_completed_due_idx;
DROP INDEX IF EXISTS tasks_deadline_status_idx;
```
```bash
git checkout -- src/lib/db/schema.ts
# migration ファイルも削除
```

---

### Task DB-4: gakuchika JSON.stringify バグ修正 (最高 ROI、最初に実施)

#### 4.4.1 目的

gakuchika の messages が二重文字列化されるバグを修正する。migration 不要でコード修正のみ。

#### 4.4.2 対象ファイル

| ファイル | 操作 | 概要 |
|---------|------|------|
| `src/app/api/gakuchika/[id]/conversation/new/route.ts` | 変更 | L117 の `JSON.stringify()` 除去 |
| `src/app/api/gakuchika/[id]/conversation/resume/route.ts` | 変更 | L149 の `JSON.stringify()` 除去 |

#### 4.4.3 手順

**Step 1: new/route.ts のバグ修正**
- ファイル: `src/app/api/gakuchika/[id]/conversation/new/route.ts`
- L117 付近: `JSON.stringify(initialMessages)` → `initialMessages` に変更
- Drizzle ORM の jsonb 列ドライバは自動的にシリアライズするため、`JSON.stringify()` は不要

**Step 2: resume/route.ts のバグ修正**
- ファイル: `src/app/api/gakuchika/[id]/conversation/resume/route.ts`
- L149 付近: `JSON.stringify(messages)` → `messages` に変更

**Step 3: 参考として正しいパターンを確認**
- `motivationConversations.messages` — object を直接渡している（正しい）
- `interviewConversations.messages` — object を直接渡している（正しい）

#### 4.4.4 受入基準

- [ ] AC-1: `new/route.ts` に `JSON.stringify(initialMessages)` が存在しない
- [ ] AC-2: `resume/route.ts` に `JSON.stringify(messages)` が存在しない
- [ ] AC-3: `npm run build` がエラー 0

#### 4.4.5 テスト仕様

| テスト種別 | コマンド / 手順 | 期待結果 |
|-----------|----------------|---------|
| 型チェック | `npm run build` | エラー 0 |
| 手動確認 | ガクチカ新規会話を開始し、messages が正しく保存されることを確認 | DB の messages 列が JSON object（文字列ではない） |
| 手動確認 | ガクチカ既存会話を再開し、会話が正常に表示されること | メッセージ表示正常 |
| 検証 SQL | `SELECT jsonb_typeof(messages) FROM gakuchika_conversations LIMIT 5` | 全行 `array` |

#### 4.4.6 リスク評価

| リスク | 影響度 | 発生確率 | 対策 |
|--------|-------|---------|------|
| 既存の二重文字列化データが読めなくなる | 中 | 中 | 読み取り側で `typeof messages === "string"` チェックを追加し、旧データは `JSON.parse()` でフォールバック |

#### 4.4.7 ロールバック手順

```bash
git checkout -- src/app/api/gakuchika/[id]/conversation/new/route.ts
git checkout -- src/app/api/gakuchika/[id]/conversation/resume/route.ts
```

---

### Task DB-5: P0 text→jsonb 変換 (5カラム)

#### 4.5.1 目的

頻繁に読み書きされる 5 カラムを text → jsonb に変換し、不要な stringify/parse を除去する。

#### 4.5.2 対象ファイル

| # | テーブル.列 | write 側 | read 側 |
|---|-----------|---------|---------|
| 1 | `companies.corporateInfoUrls` | `fetch-corporate/route.ts` | `sources.ts` |
| 2 | `applications.phase` | `applications/route.ts:230` | `company-loaders.ts:185` |
| 3 | `notifications.data` | `notifications/batch/route.ts` | 同上 |
| 4 | `userProfiles.targetIndustries` | `settings/profile/route.ts` | `account-loaders.ts` |
| 5 | `userProfiles.targetJobTypes` | 同上 | 同上 |

#### 4.5.3 手順 (各カラムに対して以下の 5 ステップを繰り返す)

**Step 1: 既存値の検証 SQL を実行**
```sql
-- ローカル DB で実行。不正な JSON がないか確認
SELECT count(*) FROM <table>
WHERE <column> IS NOT NULL
  AND NOT (<column> ~ '^\s*[\[\{"\-0-9tfn]');
```
結果が 0 でない場合は、不正データを手動で修正してから進む。

**Step 2: migration SQL を作成**
- ファイル: `drizzle_pg/NNNN_<table>_<column>_to_jsonb.sql`
```sql
ALTER TABLE <table>
  ALTER COLUMN <column> TYPE jsonb
  USING CASE
    WHEN <column> IS NULL THEN NULL
    ELSE <column>::jsonb
  END;
```

**Step 3: schema.ts の型を変更**
- `text("<column>")` → `jsonb("<column>").$type<T>()` に変更
- `T` は該当列の TypeScript 型（例: `string[]`, `Record<string, unknown>` 等）

**Step 4: write 側の `JSON.stringify()` を除去**
- 対象ファイルの該当箇所から `JSON.stringify()` ラッパーを削除
- Drizzle の jsonb ドライバが自動シリアライズするため不要

**Step 5: read 側の `JSON.parse()` を除去**
- 対象ファイルの該当箇所から `JSON.parse()` / `parseStringArray()` 等を削除
- jsonb 列は自動的にオブジェクトとして読み取られる

**Step 6: ローカルで検証**
```bash
npm run db:migrate:as-app
npm run build
npm run test:unit
```

#### 4.5.4 受入基準

- [ ] AC-1: 5 カラムすべてが `schema.ts` で `jsonb()` 型になっている
- [ ] AC-2: 対象ファイルに不要な `JSON.stringify()` / `JSON.parse()` が存在しない
- [ ] AC-3: `npm run build` がエラー 0
- [ ] AC-4: 対象機能の手動スモークテストが正常

#### 4.5.5 テスト仕様

| テスト種別 | コマンド / 手順 | 期待結果 |
|-----------|----------------|---------|
| migration | `npm run db:migrate:as-app` | エラーなし |
| 型チェック | `npm run build` | エラー 0 |
| 手動: 企業情報 | 企業の法人情報取得を実行 | `corporateInfoUrls` が正常保存/読取り |
| 手動: 選考 | 選考フェーズを更新 | `phase` が正常保存/読取り |
| 手動: 通知 | 通知を確認 | `data` が正常読取り |
| 手動: プロフィール | 業界/職種を設定→設定画面で確認 | 正常表示 |

#### 4.5.6 リスク評価

| リスク | 影響度 | 発生確率 | 対策 |
|--------|-------|---------|------|
| **本番データに不正 JSON がある** | **高** | 中 | Step 1 の検証 SQL を本番で先に実行。不正データは手動修正 |
| migration 中のテーブルロック | 中 | 低 | 行数が少ないテーブルから開始。大テーブルは低トラフィック時に実行 |
| read/write の変更漏れ | 中 | 中 | `grep -rn "JSON.stringify\|JSON.parse" src/` で漏れを検出 |

#### 4.5.7 ロールバック手順

```sql
-- 各カラムのロールバック SQL (カラムごとに実行)
ALTER TABLE companies ALTER COLUMN corporate_info_urls TYPE text USING corporate_info_urls::text;
ALTER TABLE applications ALTER COLUMN phase TYPE text USING phase::text;
ALTER TABLE notifications ALTER COLUMN data TYPE text USING data::text;
ALTER TABLE user_profiles ALTER COLUMN target_industries TYPE text USING target_industries::text;
ALTER TABLE user_profiles ALTER COLUMN target_job_types TYPE text USING target_job_types::text;
```
```bash
# アプリ側も戻す
git checkout -- src/lib/db/schema.ts
git checkout -- src/lib/company-info/sources.ts
# ... 各対象ファイル
```

---

### Task DB-6: P1 text→jsonb 変換 (2カラム — 設定系)

#### 4.6.2 対象

| # | テーブル.列 | 注意点 |
|---|-----------|-------|
| 6 | `notificationSettings.reminderTiming` | read/write 両側を同一 PR で必ず同時修正 |
| 7 | `notificationSettings.deadlineReminderOverrides` | 同上 |

#### 4.6.3 手順

DB-5 と同じ 5 ステップ。**特に重要**: `settings/notifications/route.ts` と `account-loaders.ts` の read/write 両側を**同時に**変更すること。片方だけ変更するとデータ不整合になる。

#### 4.6.7 ロールバック SQL

```sql
ALTER TABLE notification_settings ALTER COLUMN reminder_timing TYPE text USING reminder_timing::text;
ALTER TABLE notification_settings ALTER COLUMN deadline_reminder_overrides TYPE text USING deadline_reminder_overrides::text;
```

---

### Task DB-7: P2 text→jsonb 変換 (3カラム — 低頻度)

#### 4.7.2 対象

| # | テーブル.列 |
|---|-----------|
| 8 | `deadlines.autoCompletedTaskIds` |
| 9 | `gakuchikaConversations.starScores` |
| 10 | `aiMessages.metadata` |

#### 4.7.3 手順

DB-5 と同じ 5 ステップ。

#### 4.7.7 ロールバック SQL

```sql
ALTER TABLE deadlines ALTER COLUMN auto_completed_task_ids TYPE text USING auto_completed_task_ids::text;
ALTER TABLE gakuchika_conversations ALTER COLUMN star_scores TYPE text USING star_scores::text;
ALTER TABLE ai_messages ALTER COLUMN metadata TYPE text USING metadata::text;
```

---

### Task DB-8: deadline-loaders クエリ最適化

#### 4.8.1 目的

相関サブクエリ × N 行を derived table JOIN に置換し、deadline-loaders を 1 クエリに最適化する。

#### 4.8.2 対象ファイル

| ファイル | 操作 | 概要 |
|---------|------|------|
| `src/lib/server/deadline-loaders.ts` | 変更 | L68-78 の相関サブクエリを derived table JOIN に置換 |

#### 4.8.3 手順

**Step 1: 現在のクエリパターンを確認**
- ファイル: `src/lib/server/deadline-loaders.ts` L68-78
- 現状: N 行 × 2 サブクエリ（total tasks, done tasks）

**Step 2: Drizzle ORM で以下の SQL 相当のクエリを実装**
```sql
SELECT d.id, d.type, d.title, d.due_date, d.status_override,
       d.is_confirmed, d.completed_at, d.created_at,
       c.name AS company_name, c.id AS company_id,
       COALESCE(t.total, 0) AS total_tasks,
       COALESCE(t.done, 0) AS completed_tasks
FROM deadlines d
INNER JOIN companies c ON d.company_id = c.id
LEFT JOIN (
  SELECT deadline_id,
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE status = 'done') AS done
  FROM tasks
  GROUP BY deadline_id
) t ON t.deadline_id = d.id
WHERE c.user_id = $1 AND d.is_confirmed = true
```

**Step 3: `computeDeadlineStatus()` は JS で維持**
- completedAt/statusOverride/dueDate/task 進捗の組合せで決まるため完全 SQL 化はコスト対効果が低い

**Step 4: EXPLAIN ANALYZE で改善確認**
- Before/After の実行計画を比較
- DB-3 のインデックスが使われていることを確認

#### 4.8.4 受入基準

- [ ] AC-1: deadline-loaders が 1 クエリで deadline + task 集計を取得する
- [ ] AC-2: EXPLAIN ANALYZE で相関サブクエリが存在しない
- [ ] AC-3: `/dashboard` の締切表示が正常
- [ ] AC-4: `npm run build` がエラー 0

#### 4.8.5 テスト仕様

| テスト種別 | コマンド / 手順 | 期待結果 |
|-----------|----------------|---------|
| 型チェック | `npm run build` | エラー 0 |
| 手動確認 | `/dashboard` の締切一覧 | 正常表示、タスク件数正確 |
| 手動確認 | 締切の追加/完了操作後にリロード | 即座に反映 |
| パフォーマンス | EXPLAIN ANALYZE でコスト比較 | Before より改善 |

#### 4.8.6 リスク評価

| リスク | 影響度 | 発生確率 | 対策 |
|--------|-------|---------|------|
| Drizzle ORM で derived table JOIN が表現しにくい | 中 | 中 | `db.execute(sql\`...\`)` で raw SQL を使用する選択肢もある |
| task 集計の数値が旧実装と異なる | 高 | 低 | 旧実装と新実装を並行実行して結果を比較 |

#### 4.8.7 ロールバック手順

```bash
git checkout -- src/lib/server/deadline-loaders.ts
```

---

## 5. 実行順序と依存関係図

```
Phase 1:
  DB-1 (relations.ts) → DB-2 (index.ts merge)
  DB-3 (index 追加) ← 独立

Phase 2 (Phase 1 完了後):
  DB-4 (stringify バグ) ← 最初に実施（最高 ROI、最低リスク）
  DB-5 (P0 jsonb×5) → DB-6 (P1 jsonb×2) → DB-7 (P2 jsonb×3)

Phase 3 (Phase 2 完了後推奨):
  DB-8 (deadline-loaders) ← DB-3 のインデックスが前提

推奨: DB-4 → DB-1 → DB-2 → DB-3 → DB-5 → DB-6 → DB-7 → DB-8
```

---

## 6. 全体の完了条件

- [ ] 全 8 タスクの受入基準が満たされている
- [ ] `npm run build` が PASS
- [ ] `npm run test:unit` が PASS
- [ ] `npm run db:generate` で差分が出ないこと（schema.ts と DB が同期）
- [ ] スモークテスト: dashboard 表示、企業一覧/詳細、各 AI 機能、ゲスト操作
- [ ] EXPLAIN ANALYZE で新インデックスの効果確認
- [ ] コードレビュー完了

---

## 7. 全体リスク評価とロールバック戦略

### データ損失リスク (最重要)

| リスク | 影響度 | 発生確率 | 対策 |
|--------|-------|---------|------|
| text→jsonb 変換で不正 JSON がある | **高** | 中 | **必ず** Step 1 の検証 SQL を本番で先に実行 |
| migration 中のテーブルロック | 中 | 低 | 低トラフィック時に実行。大テーブルは `ALTER ... USING` の処理時間を事前計測 |
| read/write 変更漏れ | 中 | 中 | `grep -rn "JSON.stringify\|JSON.parse" src/` で全箇所確認 |

### ロールバック戦略

- **Phase 1 (純粋追加)**: `git revert` で完結。DB 変更は `DROP INDEX` のみ
- **Phase 2 (カラム型変更)**: 各カラムのロールバック SQL を用意（各タスクの 4.X.7 に記載）。ロールバック後はアプリ側コードも戻す
- **Phase 3 (クエリ変更)**: `git revert` で完結。DB 変更なし
- **本番適用前**: 必ずステージング環境でフル検証。`npm run db:migrate:as-app` → スモークテスト → 本番適用の順序

### 本番適用手順

1. ステージング DB で migration 実行 + 検証
2. 本番 DB バックアップ取得
3. 低トラフィック時（JST 深夜帯）に migration 実行
4. アプリデプロイ
5. スモークテスト
6. 問題あればロールバック SQL 実行 + アプリロールバック

---

## 8. 用語集

| 用語 | 説明 |
|------|------|
| **jsonb** | PostgreSQL の JSON Binary 型。テキスト型と異なり、パース済みバイナリで保存されるため検索・インデックスが可能 |
| **text→jsonb 変換** | `ALTER TABLE ... ALTER COLUMN ... TYPE jsonb USING column::jsonb` で列の型を変更する操作 |
| **二重文字列化** | jsonb 列に `JSON.stringify()` で書込むと、JSON が文字列としてさらにエスケープされる問題。`"[1,2,3]"` ではなく `"\"[1,2,3]\""` になる |
| **相関サブクエリ** | 外側クエリの各行に対して内側クエリを実行する方式。N 行 × M サブクエリで N×M 回実行される |
| **derived table JOIN** | サブクエリの結果を仮想テーブルとして JOIN する方式。1 回のクエリで完結する |
| **EXPLAIN ANALYZE** | PostgreSQL のクエリ実行計画を表示するコマンド。実際に実行して時間を計測する |
| **Drizzle ORM** | TypeScript 用の ORM。schema 定義から型安全なクエリを生成する |
| **migration** | DB スキーマの変更を記録した SQL ファイル。`drizzle_pg/` に配置 |
| **ContextVar** | Python の非同期変数スコープ（本計画では無関係だが `llm_usage_cost.py` で使用） |
