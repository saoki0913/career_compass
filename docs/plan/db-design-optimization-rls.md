# DB/RLS 本番前準備・設計計画書

> **DB/RLS 設計正本**: DB スキーマ、接続境界、行レベルセキュリティ（RLS: Row Level Security）、所有者整合性、JSONB、索引、マイグレーション運用、検証方針は本書を正本とする。staging / production のリセット実行手順は [`db-staging-production-reset-bootstrap-plan.md`](./db-staging-production-reset-bootstrap-plan.md) を正本とする。

> **Task state SSOT**: 実装フェーズのタスク状態は `docs/plan/plan-tasks.json` を正本とする。DB/RLS 作業中に一時 JSON を使う場合も、完了後は evidence を `plan-tasks.json` と本書へ要約して一時 JSON を削除する。

> 作成日: 2026-05-04
> 最終更新: 2026-05-25
> 対象: Career Compass (就活Pass) — Supabase PostgreSQL + Drizzle ORM
> 現方針: まず準備・inventory・manifest・警告モードを進め、接続分離と RLS 実効化は機能修正がほぼ固まってから、staging / production reset は機能凍結後に実施する。

---

## 1. 目的

DB/RLS 改善を一括で実行せず、次の 3 段階に分けて安全に進める。

| 段階 | 実施時期 | 目的 |
|---|---|---|
| 準備 | 今すぐ | 設計正規化、inventory、raw SQL manifest、RLS policy matrix、警告モード検査を整える |
| 実装 | 機能修正がほぼ固まった段階 | `appDb` / `authDb` / `adminDb` 分離、Better Auth 分離、local RLS SELECT 検証を行う |
| 確定・リセット | 本番前の機能凍結後 | migration squash、3 層 migration 確定、local fresh replay、staging / production reset を行う |

この分割により、機能修正が残る段階で production reset 前提の migration を確定してしまうリスクを避ける。

---

## 2. 現状確認

### 2.1 主要な事実

- 現行 `src/lib/db/index.ts` は `DATABASE_URL` 単一接続で、RLS 用接続境界がない。
- Better Auth は同じ `db` を使っているため、通常アプリ読み取り用接続へ RLS を適用すると認証処理が壊れ得る。
- `drizzle_pg` は migration が肥大化し、`0018` / `0026` に fresh replay 非安全な text→jsonb 変換がある。
- `drizzle_pg/meta` は journal と snapshot が不整合で、履歴として不健全。
- Drizzle 生成 SQL だけでは owner integrity trigger、RLS policy、raw partial index、grant は復元されない。
- `supabase/migrations` には RLS 以外の DDL/DML が残っているため、RLS overlay としての責務が曖昧。
- `docs/plan/execution-order.md` は RLS policy / role migration を post-release 扱いにしており、本書の「pre-release SELECT RLS」と衝突していた。

### 2.2 設計上の禁止事項

- 通常 API から `adminDb` を直接 import しない。
- `auth_role` に広い `BYPASSRLS` を与えない。
- browser-visible header や raw `guest_device_token` を RLS policy の入力にしない。
- `supabase db push` の素実行、`--linked` 実行、production 向け `npm run db:push` を使わない。
- production reset は機能凍結前に実施しない。

---

## 3. 接続境界設計

### 3.1 3 接続モデル

| 接続 | 想定 URL | 用途 | 権限 |
|---|---|---|---|
| `appDb` | `APP_DATABASE_URL` | 通常ユーザー/ゲストの読み取り | SELECT のみ、RLS 適用、RLS bypass 不可、書き込み不可 |
| `authDb` | `AUTH_DATABASE_URL` | Better Auth の認証テーブル操作 | Better Auth table のみ。通常ドメインテーブル権限なし |
| `adminDb` | `ADMIN_DATABASE_URL` または `DIRECT_URL` | 書き込み、cron、Stripe webhook、guest migration、migration | 通常 route から import 禁止。用途を許可リストで固定 |

### 3.2 旧 `db` の扱い

旧 `db` は「互換のために残す」ではなく「封じ込める」対象とする。

- 原則として `db` export は廃止方向。
- 移行期間中に残す場合は、許可ファイル、期限、削除予定タスクを `docs/plan/plan-tasks.json` に持たせる。
- 通常 API、BFF、UI 向け server utility からの raw `db` / `adminDb` import は警告モードから検査を始め、接続分離後に強制化する。
- 例外候補は migration helper、internal test、cron、Stripe webhook、guest migration、write service に限定する。

### 3.3 URL 権限検証

環境変数の存在チェックだけでは不十分。検証コマンドまたは起動時チェックで以下を確認する。

| URL | 必須確認 |
|---|---|
| `APP_DATABASE_URL` | `current_user` が `app_role`、対象テーブル SELECT 可、INSERT/UPDATE/DELETE 不可、RLS bypass 不可 |
| `AUTH_DATABASE_URL` | Better Auth table の必要操作可、通常ドメインテーブル権限なし |
| `ADMIN_DATABASE_URL` / `DIRECT_URL` | migration / write service が可能、通常 route から import 不可 |

---

## 4. Identity と RLS 注入

### 4.1 境界 API

- `dbReadWithIdentity(identity, fn)`
  `appDb.transaction` 内で `SET LOCAL app.current_user_id` または `SET LOCAL app.current_guest_id` を設定し、渡された transaction だけで SELECT を実行する。
- `dbWriteAdmin(fn)`
  `adminDb` で書き込みを実行する。通常 route から直接 `adminDb` を import せず、許可された write service 経由に寄せる。
- `dbAuth`
  Better Auth adapter に渡す専用接続。通常ドメイン処理から import 不可にする。

### 4.2 通常 identity の扱い

- 認証済み user session がある場合は user identity を正とする。
- user session と guest cookie が同時に存在する通常 API では user だけを RLS に注入する。
- user / guest の両方を RLS に同時注入する通常経路は禁止する。
- guest migration は `adminDb` 専用処理として例外扱いにする。
- RLS policy へ渡す guest は解決済み `guest_users.id` のみ。`guest_device_token` や browser-visible header は使わない。

### 4.3 DB 側 helper

通常 policy は BFF の排他的所有者モデルに合わせる。

- `app_current_user_id()`
- `app_current_guest_id()`
- `app_is_user_owner(user_id)`
- `app_is_guest_owner(guest_id)`
- `app_is_xor_owner(user_id, guest_id)`

`app_is_xor_owner` は user / guest の同時注入を正常扱いしない。移行処理は RLS ではなく `adminDb` で扱う。

---

## 5. RLS Phase A

### 5.1 本番前対象テーブル

Phase A では、ユーザー/ゲストの主要プロダクトデータの SELECT を `app_role` + RLS で実効化する。

| 分類 | 対象 |
|---|---|
| direct owner | `companies`, `applications`, `tasks`, `notifications`, `documents`, `gakuchika_contents`, `submission_items`, `user_pins`, `motivation_conversations`, `interview_conversations`, `interview_feedback_histories`, `interview_turn_events`, `interview_drill_attempts` |
| parent owner | `job_types`, `deadlines`, `document_versions`, `ai_threads`, `ai_messages`, `gakuchika_conversations` |
| user only | `company_rag_ingest_quotes` |

### 5.2 Phase A 対象外

| 分類 | 対象 | 理由 | 次の扱い |
|---|---|---|---|
| auth only | `users`, `sessions`, `accounts`, `verifications` | Better Auth 専用 | `authDb` で分離し、通常 `appDb` から読ませない |
| admin only | `processed_stripe_events`, `contact_messages`, `task_templates` | システム/管理用途 | 通常ユーザー SELECT 対象外 |
| user settings / billing | `user_profiles`, `subscriptions`, `credits`, `credit_transactions`, `calendar_settings`, `notification_settings`, `company_info_monthly_usage`, `calendar_events`, `calendar_sync_jobs`, `login_prompts`, `guest_users` | 認証・課金・初回 guest 解決と絡むため影響が大きい | Phase B で個別に設計。guest 初回解決は `adminDb` または専用関数で扱う |

対象外テーブルは「adminDb 読み取り継続」で放置しない。理由、期限、次フェーズを inventory に持たせる。

### 5.3 policy matrix

| policy 型 | 条件 | 必須テスト |
|---|---|---|
| direct owner | row の `user_id` / `guest_id` が identity と一致 | no identity = 0、own = rows、other owner = 0 |
| parent owner | 親テーブルをたどって owner を確認 | 親 owner が他人なら子も 0 |
| auth only | `authDb` 専用 | `appDb` から不可 |
| admin only | `adminDb` 専用 | `appDb` から不可 |
| system private | 通常ユーザー非公開 | `appDb` から不可 |

---

## 6. owner integrity

### 6.1 方針

子テーブルの owner 継承は trigger だけに寄せすぎない。

- 可能な箇所は複合外部キーまたは direct owner column へ寄せる。
- Drizzle で自然に表現しづらい例外だけ trigger で守る。
- `shupass_owner_integrity_violations()` は最終版を integrity layer に含める。
- API は DB 例外に頼る前に owner 条件付き mutation / lookup を維持する。

### 6.2 必須対象

- `applications.company_id`
- `documents.company_id/application_id/job_type_id`
- `tasks.company_id/application_id/deadline_id`
- `deadlines.application_id/job_type_id`
- `motivation_conversations.company_id`
- `interview_*`
- `submission_items.application_id`
- `user_pins.entity_id`
- `ai_threads.gakuchika_id`
- `company_rag_ingest_quotes.company_id`

---

## 7. JSONB 方針

### 7.1 inventory

現行 schema の `jsonb(` は 39 箇所ある。古い「20 カラム」前提は破棄し、`schema.ts` から自動生成した JSONB inventory を正とする。

### 7.2 CHECK の粒度

- `array` / `object` 程度の型 CHECK は入れる。
- AI 出力系 JSON に細かすぎる構造 CHECK を入れない。
- 詳細な構造は TypeScript / Zod / API 入力検証で担保する。
- 将来構造が変わる JSON は migration が重くならないよう、DB 制約を最小限にする。

---

## 8. migration 3 層管理

### 8.1 3 層

| 層 | 内容 | 管理 |
|---|---|---|
| schema | Drizzle 生成 SQL。テーブル、基本 FK、通常 index、基本 CHECK | `drizzle_pg` |
| integrity | owner integrity、JSONB CHECK、partial index、raw invariant | `drizzle_pg` の custom SQL または runner 管理の integrity layer |
| security | role、grant、RLS helper、RLS policy | runner 管理の security layer。`supabase db push` 素実行に依存しない |

### 8.2 履歴管理

`run-migrations.mjs` 管理下で以下を検出する。

- local-only migration
- remote-only migration
- hash 差分
- schema / integrity / security manifest の不一致
- `supabase_migrations.schema_migrations` の残存・欠落・remote-only

`supabasePending: 0` は security layer の manifest と履歴テーブルを突き合わせて判定する。staging でも hard gate にする。

### 8.3 archive 方針

- 旧 `drizzle_pg` / `supabase/migrations` は実行対象外 archive に退避する。
- archive 後に `validate-migrations.sh` が空の `supabase/migrations` 前提で落ちないよう更新する。
- 旧 migration は編集して hash を変えない。
- production reset は旧履歴を温存するのではなく、新しい 3 層履歴で再構築する。

---

## 9. raw SQL manifest と自動 inventory

### 9.1 自動 inventory

`schema.ts` から以下を生成する。

- table 一覧
- owner model
- JSONB 一覧
- index 一覧
- FK 一覧
- Phase A / Phase B 分類

### 9.2 raw SQL manifest

raw SQL 側は以下を manifest 化する。

- owner integrity function / trigger
- JSONB CHECK
- partial index
- RLS helper
- RLS policy
- grant / revoke
- extension

### 9.3 差分検査

自動 inventory と raw SQL manifest を照合し、以下を検出する。

- owner table なのに RLS policy がない
- JSONB なのに型 CHECK 方針が未分類
- raw SQL にしかない table / index / trigger
- schema にある table が policy matrix にない
- Phase A 対象なのに正負テストがない

---

## 10. lifecycle hook / harness 事前診断

この作業は DB 再設計本体ではなく、事前診断トラックとして扱う。

目的は、常時実行でノイズになっている guard を特定し、必要なら実行タイミングや対象を整理すること。安全ゲートを弱めることではない。

弱めてはいけない gate:

- `.claude/hooks/migration-safety-guard.sh`
- `release-provider-guard.sh`
- `production-promotion-guard.sh`
- commit / push / production / secret / destructive command の承認 gate

準備フェーズでは warning-only の import 検査を追加し、接続分離完了後に強制化する。

---

## 11. RLS 検証

### 11.1 正負検証

Phase A 対象テーブルごとに以下を SQL レベルで確認する。

- no identity = 0 rows
- own user identity = rows
- own guest identity = rows
- other user = 0 rows
- other guest = 0 rows
- parent owner が他人なら子テーブルも 0 rows
- user / guest 同時注入は通常 API では発生しない

### 11.2 RLS 迂回条件の検証

PostgreSQL の RLS は `BYPASSRLS` 権限だけでなく、table owner による迂回にも注意する。Phase A では次を必須確認に含める。

- `app_role` が Phase A 対象テーブルの owner ではない。
- table owner として接続せざるを得ない場合は、対象テーブルで `FORCE ROW LEVEL SECURITY` が有効である。
- `auth_role` に広い `BYPASSRLS` を与えない。
- `adminDb` / migration 用 role は通常 API から import できない。

検証 SQL 候補:

```sql
select
  n.nspname as schema_name,
  c.relname as table_name,
  pg_get_userbyid(c.relowner) as table_owner,
  c.relrowsecurity,
  c.relforcerowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'companies',
    'applications',
    'tasks',
    'notifications',
    'documents',
    'deadlines',
    'ai_threads',
    'ai_messages'
  );
```

`table_owner = app_role` かつ `relforcerowsecurity = false` の行がある場合は release gate で失敗扱いにする。

### 11.3 性能検証

RLS の `EXISTS` policy は正しさだけでなく性能も検証する。

必須 `EXPLAIN ANALYZE` 対象:

- `document_versions → documents`
- `ai_messages → ai_threads → documents`
- `deadlines → companies`
- `tasks → deadlines/applications/companies`
- 企業一覧、締切一覧、ドキュメント一覧、通知一覧、面接履歴一覧

目安:

- 主要画面の DB 時間が RLS 前比 1.2〜1.5 倍を超える場合は policy または index を見直す。
- parent owner policy の JOIN キー、owner キーには必要な複合 index を置く。

---

## 12. 実行ロードマップ

### Phase 0: 準備

今すぐ行う。

- 計画書の正規化
- table / owner / jsonb / index inventory 生成
- raw SQL manifest 設計
- RLS policy matrix 作成
- lifecycle hook / harness 事前診断
- migration / release / production 安全ゲートを弱めない前提整理
- `appDb` / `authDb` / `adminDb` の設計と検証項目定義
- raw `db` / `adminDb` import 禁止検査を warning-only で導入

### Phase A: local 実装

機能修正がほぼ固まった段階で行う。

- `appDb` / `authDb` / `adminDb` 実装
- Better Auth の `authDb` 分離
- `dbReadWithIdentity()` / `dbWriteAdmin()` 導入
- 旧 `db` import 封じ込め
- Phase A SELECT RLS の local 検証
- RLS 正負検証
- 主要 query の性能検証

### Phase Final: migration 確定

本番前の機能凍結後に行う。

- 旧 `drizzle_pg` / `supabase/migrations` archive
- `schema / integrity / security` の 3 層 migration 確定
- local fresh replay
- staging reset
- production reset
- `pending: 0` / `supabasePending: 0` / remote-only なし確認

---

## 13. 完了条件

- `db-design-optimization-rls.md` が DB/RLS 設計正本として読める。
- `db-staging-production-reset-bootstrap-plan.md` が reset / release 手順に集中している。
- RLS Phase A 対象テーブルと対象外理由が明記されている。
- `auth_role = 広い BYPASSRLS` の古い前提が残っていない。
- `schema / integrity / security` の 3 層 migration 方針が明記されている。
- raw SQL manifest と自動 inventory の差分検査方針がある。
- RLS 正負検証と性能検証が明記されている。
- lifecycle hook / harness は事前診断として分離され、安全ゲートを弱めないことが明記されている。
