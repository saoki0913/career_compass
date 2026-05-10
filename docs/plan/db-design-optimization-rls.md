# DB設計・最適化・マイグレーション・RLS 計画書

> 作成日: 2026-05-04
> 対象: Career Compass (就活Pass) — Supabase PostgreSQL + Drizzle ORM
> レビュー: Codex plan_review PASS_WITH_CONCERNS (全7件反映済み)

---

## 目次

1. [現状分析](#1-現状分析)
2. [RLS ポリシー設計](#2-rls-ポリシー設計)
3. [DB 最適化](#3-db-最適化)
4. [JSONB 戦略](#4-jsonb-戦略)
5. [マイグレーション運用フレームワーク](#5-マイグレーション運用フレームワーク)
6. [優先度マトリクスと実行ロードマップ](#6-優先度マトリクスと実行ロードマップ)
7. [モニタリングと検証](#7-モニタリングと検証)

---

## 1. 現状分析

### 1.1 スキーマ概要

| 指標 | 値 |
|------|-----|
| テーブル数 | 38 (Better Auth alias 含めると 41) |
| カラム数 | ~200 |
| 外部キー | 69 |
| インデックス | 72 (うち partial 6) |
| JSONB カラム | 20 |
| XOR 制約テーブル | 13 |
| Enum フィールド | 33+ |
| マイグレーション | 27 |

対象ファイル: `src/lib/db/schema.ts` (1042行), `src/lib/db/relations.ts` (426行)

### 1.2 ドメイン別テーブルマップ

| ドメイン | テーブル数 | テーブル名 |
|----------|------------|------------|
| 認証 | 5 | users, sessions, accounts, verifications, guestUsers |
| ユーザー設定 | 4 | userProfiles, calendarSettings, notificationSettings, loginPrompts |
| 企業・選考 | 5 | companies, applications, jobTypes, deadlines, companyPdfIngestJobs |
| 課金 | 4 | subscriptions, credits, creditTransactions, companyInfoMonthlyUsage |
| タスク | 2 | tasks, taskTemplates |
| 通知 | 2 | notifications, contactMessages |
| ドキュメント | 5 | documents, documentVersions, gakuchikaContents, gakuchikaConversations, userPins |
| AI 会話 | 3 | aiThreads, aiMessages, motivationConversations |
| 面接模擬 | 4 | interviewConversations, interviewFeedbackHistories, interviewTurnEvents, interviewDrillAttempts |
| 提出物 | 1 | submissionItems |
| カレンダー | 2 | calendarEvents, calendarSyncJobs |
| Webhook | 1 | processedStripeEvents |

### 1.3 リレーション構造

3つの中心ハブを持つスター型トポロジ:

- **users hub**: 20+ テーブルへの 1:N / 1:1 関係。認証済みユーザーの全データの起点
- **guestUsers hub**: 12 テーブルへの 1:N 関係。ゲストユーザーのデータ起点
- **companies hub**: 7 テーブルへの 1:N 関係。企業情報を中心としたビジネスデータ

FK チェーン最大深度: `ai_messages → ai_threads → documents → companies → users` (4ホップ)

### 1.4 XOR 制約パターン

13テーブルで `(user_id IS NULL) <> (guest_id IS NULL)` の CHECK 制約を使用。このパターンはアプリ側の `isOwnedByIdentity()` (`src/bff/identity/owner-access.ts`) と対応し、ゲスト/認証済みユーザーの排他的所有権を保証する。

対象: companies, applications, tasks, notifications, documents, gakuchikaContents, submissionItems, userPins, motivationConversations, interviewConversations, interviewFeedbackHistories, interviewTurnEvents, interviewDrillAttempts

### 1.5 既存インデックス評価

**強み**:
- userId/guestId + createdAt の複合インデックスがフィード型クエリをカバー
- deadline テーブルに7インデックス（companyId, dueDate, 確認状態の組み合わせ）
- 6つの partial インデックス（未読通知、アクティブドキュメント、未完了締切、pending カレンダー同期）

**欠損**:
- `companies.status` — 20状態のパイプラインフィルタに専用インデックスなし
- `deadlines(companyId, dueDate, completedAt)` — ダッシュボードの頻出フィルタに最適な複合インデックスなし
- 検索対象カラム（name, notes, content）に GIN/GiST インデックスなし

**冗長候補** (4件): `tasks_status_idx`, `notifications_is_read_idx`, `documents_status_idx`, `company_info_monthly_usage_user_idx` — いずれも composite/partial インデックスの prefix でカバー済み

### 1.6 JSONB カラム一覧

全20 JSONB カラムが「ドキュメントストア」型（WHERE 句でのフィルタなし）。GIN インデックスや正規化は不要。array 型 12カラム、object 型 8カラム。最新の migration 0026 で text → jsonb への変換が完了済み。

---

## 2. RLS ポリシー設計

### 2.1 現状

- 全33テーブルで `ENABLE ROW LEVEL SECURITY` 済み、permissive policy ゼロ（deny-all 戦略）
- `anon` / `authenticated` ロールの全権限を REVOKE 済み（新テーブルも event trigger で自動）
- アプリは `postgres` スーパーユーザーで接続（RLS バイパス）
- アプリ層で 60+ 箇所の所有権チェック

対象ファイル: `supabase/migrations/20260215092108_enable_rls_all_tables.sql`, `supabase/migrations/20260325110000_harden_public_data_api.sql`

### 2.2 方針: 段階的ロール分離

**Phase 1 (READ-ONLY)**: `app_role` で SELECT のみ RLS チェック。Write は `postgres` を継続
**Phase 2 (FULL)**: 安定後に Write も `app_role` に移行

### 2.3 3ロールモデル

| ロール | 用途 | RLS | 接続 |
|--------|------|-----|------|
| `app_role` | アプリのクエリ（Phase 1: SELECT のみ） | 適用 | `APP_DATABASE_URL` (新規) |
| `auth_role` | Better Auth の session/account 操作 | BYPASSRLS | `AUTH_DATABASE_URL` (新規) |
| `postgres` | マイグレーション、cron ジョブ | BYPASSRLS | `DIRECT_URL` (既存) |

**根拠**: Better Auth はユーザー作成・セッション作成時に identity 未確定のため BYPASSRLS が必要。cron は全ユーザー横断のため BYPASSRLS 必要。

### 2.4 Identity Injection アーキテクチャ

ゲストユーザーは Supabase JWT を持たないため `auth.uid()` が使えない。`SET LOCAL` でトランザクションスコープの GUC 変数を使用する。

**境界 API 設計** (Codex 指摘反映):

- `dbReadWithIdentity(identity, fn)` — `db.transaction` 内で `SET LOCAL app.current_user_id` / `app.current_guest_id` 注入後に fn 実行
- `dbWriteAdmin(fn)` — postgres ロールで fn 実行（Phase 1 では全 Write がこちら）
- Identity は cookie 解決済みの内部 `RequestIdentity` のみ注入。browser-visible header/device token を RLS policy 入力にしない
- `allowDeviceTokenHeader` を使う全ルートの棚卸しと identity source テスト行列を Phase 0 で作成

対象ファイル: `src/lib/db/index.ts`, `src/bff/identity/request-identity.ts`

**DB 側ヘルパー関数**:

- `app_user_id()` — `current_setting('app.current_user_id', true)`
- `app_guest_id()` — `current_setting('app.current_guest_id', true)`
- `app_is_owner(user_id, guest_id)` — `(user_id = app_user_id()) OR (guest_id = app_guest_id())`

**PgBouncer 互換性**: `SET LOCAL` はトランザクションスコープで COMMIT/ROLLBACK 時に自動クリア。`prepare: false` が前提。

### 2.5 6ポリシーパターン

| パターン | テーブル数 | 条件 | 対象テーブル |
|----------|------------|------|------------|
| A: userId only | 9 | `user_id = app_user_id()` | userProfiles, subscriptions, credits, creditTransactions, calendarSettings, notificationSettings, companyInfoMonthlyUsage, calendarEvents, calendarSyncJobs |
| B: XOR ownership | 13 | `app_is_owner(user_id, guest_id)` | companies, applications, tasks, notifications, documents, gakuchikaContents, submissionItems, userPins, motivationConversations, interviewConversations, interviewFeedbackHistories, interviewTurnEvents, interviewDrillAttempts |
| C: FK 継承 | 7 | `EXISTS (SELECT 1 FROM parent WHERE ...)` | jobTypes, deadlines, documentVersions, aiThreads, aiMessages, gakuchikaConversations, companyPdfIngestJobs |
| D: Auth | 4 | self-referencing + auth_role bypass | users, sessions, accounts, verifications |
| E: Guest-only | 2 | `guest_id = app_guest_id()` | guestUsers, loginPrompts |
| F: System/admin | 3 | app route からアクセスなし | processedStripeEvents, contactMessages, taskTemplates |

**FK 継承の設計** (Codex 指摘反映):

ai_messages は直接の owner column を持たない。親テーブルチェーンをたどる:

`ai_messages → ai_threads → documents → (userId XOR guestId)`

ポリシー: `EXISTS (SELECT 1 FROM ai_threads t JOIN documents d ON t.document_id = d.id WHERE t.id = thread_id AND app_is_owner(d.user_id, d.guest_id))`

パフォーマンス: 2ホップ JOIN だが既存 FK インデックスでカバー。推定 10-15% オーバーヘッド。

### 2.6 ロールアウト計画 (5フェーズ)

| Phase | 内容 | blast radius |
|-------|------|-------------|
| 0 | 境界 API + SET LOCAL wrapper + identity source 棚卸し + 未注入 SELECT 検出テスト | なし |
| 1 | PII/金融テーブル (7) | 中 |
| 2 | ユーザーコンテンツ (11): documents, AI, interview 系 | 中 |
| 3 | アプリデータ (9): applications, tasks, deadlines 等 | 中 |
| 4 | Auth + System (11) | 高 |

### 2.7 特殊ケース

| ケース | 対応 |
|--------|------|
| Better Auth | `auth_role` (BYPASSRLS)。identity 未確定時の操作に必要 |
| Stripe Webhook | `withIdentity()` で event metadata から userId 抽出・注入 |
| cron | `postgres` ロール。全ユーザー横断処理 |
| ゲスト移行 | トランザクション内で両 identity を SET LOCAL。`app_is_owner()` が両方チェック |

### 2.8 リスク分析

| リスク | 緩和策 |
|--------|--------|
| PgBouncer + SET LOCAL リーク | transaction mode では COMMIT/ROLLBACK で自動クリア |
| read-after-write 事故 | Phase 1 では Write 後の Read も postgres 経由を維持 |
| FK 継承 policy のパフォーマンス | 既存 FK インデックスでカバー。EXPLAIN ANALYZE で事前検証 |
| auth_role の混入 | 接続 URL を環境変数で厳格分離。CI チェック |

---

## 3. DB 最適化

### 3.1 インデックス最適化

#### 新規追加 (5件)

| # | テーブル | インデックス | 種類 | 効果 | 工数 |
|---|---------|-------------|------|------|------|
| 1 | companies | `companies_status_idx` ON (status) | B-tree | パイプラインフィルタ高速化 | S |
| 2 | deadlines | `deadlines_company_due_completed_idx` ON (companyId, dueDate DESC, completedAt) | composite | 締切クエリ最適化 | S |
| 3 | companies | `companies_name_trgm_idx` USING GIN (name gin_trgm_ops) | GIN | 検索 LIKE 高速化 | S |
| 4 | documents | `documents_content_trgm_idx` USING GIN | GIN | 全文 LIKE 高速化 | S |
| 5 | tasks | `tasks_user_open_idx` ON (userId) WHERE status = 'open' | partial | ダッシュボード最適化 | S |

#### 冗長削除 (4件)

`tasks_status_idx`, `notifications_is_read_idx`, `documents_status_idx`, `company_info_monthly_usage_user_idx` — 削除前に `pg_stat_user_indexes.idx_scan` で使用率確認必須。

#### pg_trgm 導入

- `CREATE EXTENSION IF NOT EXISTS pg_trgm` を `supabase/migrations/` で実行
- 既存 LIKE クエリは変更不要（PostgreSQL が GIN インデックスを自動利用）
- トレードオフ: インデックスサイズ増大（B-tree の 2-5 倍）、Write 時オーバーヘッド

### 3.2 クエリ最適化

#### getTodayTaskData (`src/lib/server/dashboard-loaders.ts:211`)

**現状**: 全 open task を 4x LEFT JOIN → メモリで7比較関数ソート → 1件返す
**方針**: DB 側 ORDER BY + LIMIT 化。partial インデックス活用
**前提** (Codex 指摘): golden test で既存優先順位ロジックの同値性を保証（JST基準、承認済み締切のみ、blocked task）

#### performSearch (`src/lib/server/search-loader.ts:59`)

**現状**: 3テーブルに並列 `LIKE '%keyword%'`、各最大20件
**方針**: pg_trgm + GIN でクエリ変更なしに高速化

#### loadCompaniesForUser (`src/lib/server/company-loaders.ts:22`)

**現状**: 3x 並列クエリ（企業一覧 + 集計3本）→ JS で結合
**方針**: LATERAL JOIN で1クエリ化。Drizzle の LATERAL サポート確認後に判断

### 3.3 接続・キャッシュ戦略

- 接続プール設定は現状維持 (max: 5 prod, prepare: false)
- `idle_timeout` 20s → 10s 短縮検討
- キャッシュ: ダッシュボード集計を Upstash Redis に短期キャッシュ (TTL 30s) する案
- Materialized View: 現時点不要（個人スコープデータで共有ビューの恩恵薄い）

---

## 4. JSONB 戦略

### 4.1 方針

全20 JSONB カラムがドキュメントストア型。GIN インデックス・正規化は不要。DB 側 CHECK 制約 + アプリ側 Zod バリデーションの両層防御。

### 4.2 DB 側: CHECK 制約

migration 0026 のパターン踏襲（preflight 検証 → CHECK 追加）。

| 期待型 | CHECK 制約 | 対象カラム数 |
|--------|-----------|------------|
| array | `jsonb_typeof(col) = 'array' OR col IS NULL` | 12 |
| object | `jsonb_typeof(col) = 'object' OR col IS NULL` | 8 |

### 4.3 アプリ側: Zod バリデーション

- 既存の `JsonRecord` / `ReminderTiming` 型を Zod スキーマに昇格
- 面接系の複雑な JSONB (interviewPlanJson, turnStateJson) は型定義を厳格化
- Write 前バリデーション、失敗時は `createApiErrorResponse()` で構造化エラー返却

対象ファイル: `src/lib/db/schema.ts`, `drizzle_pg/0026_db_redesign_jsonb_columns.sql`

---

## 5. マイグレーション運用フレームワーク

### 5.1 命名規約

**Drizzle (`drizzle_pg/`)**: `NNNN_<type>_<description>.sql`

| prefix | 用途 | 例 |
|--------|------|-----|
| `ddl_` | テーブル・カラム変更 | `0027_ddl_add_fts_config.sql` |
| `dml_` | データ操作 | `0028_dml_backfill_column.sql` |
| `idx_` | インデックス | `0029_idx_companies_status.sql` |
| `jsonb_` | JSONB 制約 | `0030_jsonb_check_constraints.sql` |
| `drop_` | 破壊的 (要 `-- DESTRUCTIVE:`) | `0031_drop_legacy.sql` |

**Supabase (`supabase/migrations/`)**: タイムスタンプ + prefix

| prefix | 用途 |
|--------|------|
| `rls_` | RLS / policy |
| `grants_` | REVOKE / GRANT |
| `idx_concurrent_` | CONCURRENTLY インデックス |
| `pg_` | extensions / triggers |

### 5.2 ロールバック戦略

全ファイルに `-- Rollback:` セクション必須。型別のロールバック手順を文書化。破壊的変更 (DROP) はバックアップからのリストアが前提。

### 5.3 squash 方針

- 本番適用済み: squash 禁止
- develop 未マージ: 同一機能で 3ファイル以上のチャーンが発生したら squash
- `IF NOT EXISTS` で冪等性確保

### 5.4 CI 検証拡張

**新規**: `scripts/ci/validate-migrations.mjs`

チェック項目 (Codex 指摘反映):
1. Journal エントリ数 = ファイル数
2. `-- Rollback:` セクション存在
3. Snapshot 整合性
4. `CREATE INDEX CONCURRENTLY` のトランザクション禁止
5. Drizzle/Supabase 間のドリフト検出
6. 冗長 index 削除時の `pg_stat_user_indexes` 証跡要求

### 5.5 zero-downtime パターン

| パターン | 手順 |
|----------|------|
| NOT NULL 追加 | nullable + default → アプリデプロイ → backfill → SET NOT NULL |
| カラムリネーム | 3リリースサイクル方式 |
| CONCURRENTLY | `supabase/migrations/` で実行。低トラフィック時間帯 (深夜 JST) |
| JSONB 制約 | アプリ側バリデーション先行 → preflight + CHECK |
| RLS policy | postgres bypass のため追加自体は無影響 |

### 5.6 二重ディレクトリの使い分け

| ディレクトリ | スコープ | 適用順序 |
|-------------|---------|---------|
| `drizzle_pg/` | DDL, DML, 標準 INDEX, CHECK | 先 |
| `supabase/migrations/` | RLS, grants, CONCURRENTLY, extensions | 後 |

対象ファイル: `drizzle_pg/`, `supabase/migrations/`, `drizzle.config.ts`, `.github/workflows/main-promotion-guard.yml`

---

## 6. 優先度マトリクスと実行ロードマップ

### 6.1 施策マトリクス

| # | 施策 | リスク | 工数 | 効果 | Phase |
|---|------|--------|------|------|-------|
| 1 | RLS 境界 API + SET LOCAL wrapper | 低 | M | 高 | 0 |
| 2 | identity source 棚卸し + テスト行列 | 低 | S | 高 | 0 |
| 3 | 新規インデックス 5件 | 低 | S | 高 | 1 |
| 4 | 冗長インデックス 4件削除 | 低 | S | 低 | 1 |
| 5 | JSONB CHECK 制約 (20カラム) | 低 | S | 中 | 2 |
| 6 | Zod バリデーション設計 | 低 | M | 中 | 2 |
| 7 | pg_trgm + GIN インデックス | 低 | S | 高 | 3 |
| 8 | ダッシュボード golden test | 低 | M | 高 | 4前提 |
| 9 | getTodayTaskData 最適化 | 中 | M | 高 | 4 |
| 10 | performSearch 最適化 | 低 | S | 中 | 4 |
| 11 | company list aggregation 改善 | 中 | M | 中 | 4 |
| 12 | マイグレーション命名規約 | 低 | S | 中 | 5 |
| 13 | ロールバック戦略文書化 | 低 | S | 中 | 5 |
| 14 | validate-migrations.mjs | 低 | M | 高 | 5 |
| 15 | RLS policy 定義 (38テーブル) | 低 | L | 高 | 6 |
| 16 | テーブル別ポリシーテスト | 中 | L | 高 | 6 |
| 17 | app_role SELECT 切替 | 高 | L | 高 | 7 |
| 18 | app_role Write 切替 | 高 | L | 高 | 7+ |

### 6.2 フェーズ詳細

#### Phase 0: RLS 境界 API + identity source 棚卸し

**目的**: RLS 導入の技術的前提を整備
**前提**: なし
**完了条件**: `dbReadWithIdentity()` / `dbWriteAdmin()` が利用可能、未注入 SELECT 検出テスト合格

#### Phase 1: インデックス追加 (低リスク)

**目的**: クエリ性能の即効的改善
**前提**: なし（Phase 0 と独立）
**完了条件**: 5インデックス追加、4冗長削除、EXPLAIN ANALYZE で改善確認
**注意**: I/O + write amplification あり。低トラフィック時間帯推奨

#### Phase 2: JSONB CHECK 制約

**目的**: データ整合性の防御
**前提**: なし（独立）
**完了条件**: 20カラムに CHECK 制約、preflight 検証パス

#### Phase 3: pg_trgm + GIN

**目的**: LIKE 検索の高速化
**前提**: なし（独立）
**完了条件**: extension 有効化、GIN インデックス作成、検索パフォーマンス改善確認

#### Phase 4: クエリ最適化

**目的**: ダッシュボード・検索の UX 改善
**前提**: Phase 1 (インデックス)、golden test 作成済み、architecture gate 通過
**完了条件**: golden test 合格、クエリ統合、レスポンスタイム改善

#### Phase 5: マイグレーション運用フレームワーク

**目的**: マイグレーション品質の制度化
**前提**: なし（独立）
**完了条件**: validate-migrations.mjs CI 組込、命名規約文書化

#### Phase 6: RLS policy 定義

**目的**: 多層防御の DB 層を構築
**前提**: Phase 0 (境界 API)
**完了条件**: 38テーブルにポリシー定義、positive/negative テストパス

#### Phase 7: RLS ロール切り替え

**目的**: RLS の実効化
**前提**: Phase 6 完了、RFC / architecture gate 通過
**完了条件**: app_role で全クエリ実行、RLS 実効化、パフォーマンス劣化なし

---

## 7. モニタリングと検証

### 7.1 インデックス使用率

`pg_stat_user_indexes.idx_scan` で新規インデックスの利用を確認。冗長削除前は最低1週間の idx_scan = 0 観測。

### 7.2 EXPLAIN ANALYZE チェックリスト

5つのホットクエリで Seq Scan → Index Scan 改善を確認:
1. `getTodayTaskData` — `src/lib/server/dashboard-loaders.ts:216`
2. `performSearch` — `src/lib/server/search-loader.ts:59`
3. `loadCompaniesForUser` — `src/lib/server/company-loaders.ts:22`
4. `getUpcomingDeadlines` — `src/lib/server/deadline-loaders.ts:53`
5. `loadDocumentsForUser` — `src/lib/server/document-loaders.ts`

### 7.3 RLS ポリシー有効性

- `pg_tables.rowsecurity` + `pg_policies` で全テーブルの RLS 状態・ポリシー数を確認
- app_role で SET LOCAL なしの SELECT → 0行返却テスト

### 7.4 スキーマドリフト検出

- 既存: `npm run check:prod-db-drift`, `check-db-high-load-readiness.mjs`
- 新規: `validate-migrations.mjs` を CI に組込

### 7.5 パフォーマンスベースライン

Phase 4 と Phase 7 の前後で計測: ダッシュボード初期ロード (p50/p95)、検索レスポンス (p50/p95)、企業一覧ロード (p50/p95)、DB 接続プール使用率

---

## 完了条件チェックリスト

- [x] 全7セクション完備
- [x] 各セクションに対象ファイル参照あり
- [x] 優先度マトリクスに全18施策を含む
- [x] 実行順序が設計判断と一致 (Phase 0-7)
- [x] Codex plan review の全7件の指摘を反映
- [x] 設計方針 + 優先度マトリクスレベルで記述
