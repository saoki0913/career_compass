# DB 再設計に伴う staging / production リセット・再ブートストラップ計画

> 作成日: 2026-05-24
> 対象: Career Compass (就活Pass) — Supabase PostgreSQL + Drizzle ORM
> 関連: DB 再設計の本体は [`db-design-optimization-rls.md`](./db-design-optimization-rls.md)、取得手順は [`../release/SUPABASE.md`](../release/SUPABASE.md)、運用は [`../operations/production/DB_MIGRATION.md`](../operations/production/DB_MIGRATION.md)、変数 SSOT は [`../operations/platform/ENVIRONMENT_VARIABLES.md`](../operations/platform/ENVIRONMENT_VARIABLES.md)

---

## 1. 背景・決定

env 変数セットアップ作業（2026-05-24）の中で、staging DB の migration を流そうとして **migration の fresh replay が失敗**する問題が判明した。これを受けてユーザーは次を決定した。

- **DB 関連の env 設定は後回しにする**。DB 以外のサービス（Stripe / Google OAuth / Upstash / Sentry 等）の env 設定は DB と独立に先行してよい。
- ローカルで **DB を大幅に再設計**してから、staging / production に適用し直す。
- **現在の staging / production DB は完全リセット前提**（破棄してよい）。本番 DB にも消して良い開発データしかない（開発中フェーズ）。
- 再設計が完了してから、両環境の DB を新規に作り直す。

> env テンプレ整備（doc / `secrets-examples` / README）の commit は完了済み（`c872b4c0`）。DB はその中の唯一の後回し項目。

---

## 2. 今回の調査で判明した事実

### 2.1 migration の fresh replay が失敗する（最重要）

`drizzle_pg/0018_conversation_jsonb.sql` と `drizzle_pg/0026_db_redesign_jsonb_columns.sql` が、`text` 列を `jsonb` に変換する際に **`DROP DEFAULT` を挟まずに `ALTER COLUMN ... TYPE jsonb USING ...::jsonb` している**。

- 例: `stage_question_counts` は `0015_interview_sessions.sql` で `text DEFAULT '{}' NOT NULL` として作成 → `0018` が型変換で `default for column "stage_question_counts" cannot be cast automatically to type jsonb` で失敗。
- `USING` 句は行データの変換用で、**既存 DEFAULT のキャストは別途必要**。空 DB でもデータと無関係に DEFAULT のキャストで落ちる。
- 該当列は `0018` / `0026` に多数（`messages` / `completed_stages` / `scores` / `corporate_info_urls` / `phase` / `metadata` 等）。

### 2.2 本番が pending:0 だった理由

production DB は `make db-migrate-check` で `pending: 0`（Drizzle）かつ hash 不一致なし。これは **先に現行スキーマを構築（db:push 相当で列が最初から jsonb）→ migration を journal に記録（baseline）** という手順でブートストラップされたため。順次 replay を経ていないので 2.1 のバグを踏んでいない。

→ 既存の migration ファイル（`0018` / `0026`）を後から編集すると**ハッシュが変わり、本番 journal と不一致**になる。編集は避け、再設計で squash するのが安全。

### 2.3 環境の現状（リセット対象）

- **staging** (`vbjykhkyhmxickxcgvdh`): 完全新規。今回 db:push + journal baseline（`scripts/release/baseline-drizzle-journal.mjs`）で一度ブートストラップしたが、RLS 未適用。**リセット対象。**
- **production**: 既存・稼働実績あり。Drizzle journal は baseline 済み（pending:0）。Supabase CLI migration（RLS 系21本）は記録が乖離（appliedCount=15、local=21）。**リセット対象。**

### 2.4 未解決の確認事項

- supabase CLI に**別プロジェクト `dqlaqqgldpmfqmfzzgvk` へのリンクが残存**している。素の `supabase db push`（`--db-url` なし）はこの別プロジェクトに当たるため**実行禁止**。正体（ローカル開発用 cloud DB か / 本番か）を要確認・整理。

---

## 3. 再設計時に必ず満たす条件

1. **migration を fresh replay-safe にする**。最も確実なのは **migration の squash**（再設計後の現行スキーマから `db:generate` で 0000 を作り直す）。squash しない場合は、各 `text→jsonb` 変換の直前に `ALTER COLUMN ... DROP DEFAULT` を入れてから `TYPE jsonb`、最後に `SET DEFAULT ...::jsonb` の順にする。
2. RLS / ハードニング（`supabase/migrations/`）も新スキーマのテーブル構成に合わせて整理する。
3. `src/lib/db/schema.ts` 再設計の本体方針は [`db-design-optimization-rls.md`](./db-design-optimization-rls.md) に従う。

---

## 4. リセット & 再ブートストラップ手順（再設計完了後に実施）

> staging で先に通し、確認後に production。production 適用前に「消して良いデータのみ」であることを再確認する。

1. **ローカルで再設計を確定** — `src/lib/db/schema.ts` を再設計 → `npm run db:generate`（squash 推奨で fresh replay-safe な migration を再生成）。`make db-validate` / `npx tsc --noEmit` で整合確認。
2. **対象 DB を完全リセット** — 各環境の Supabase で（接続先 ref を必ず確認のうえ）:
   ```sql
   DROP SCHEMA IF EXISTS public CASCADE;
   DROP SCHEMA IF EXISTS drizzle CASCADE;
   CREATE SCHEMA public;
   GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
   GRANT ALL ON SCHEMA public TO postgres, service_role;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, service_role;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, service_role;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres, service_role;
   ```
   （`auth` / `storage` / `extensions` 等の Supabase システムスキーマには触れない）
3. **Drizzle スキーマ適用** — fresh replay が通る前提なら正攻法で:
   ```bash
   dotenv -e .env.<env> -- node scripts/release/run-migrations.mjs --env <env> --json   # staging はまず確認、production は make deploy-migrate
   ```
   replay が通らない場合のみ、db:push + journal baseline にフォールバック（[`scripts/release/baseline-drizzle-journal.mjs`](../../scripts/release/baseline-drizzle-journal.mjs)）。
4. **RLS / ハードニング適用** — `--db-url` で対象 DB を明示（リンク状態に依存しない）:
   ```bash
   dotenv -e .env.<env> -- sh -c 'supabase migration list --db-url "$DIRECT_URL"'   # 差分確認
   dotenv -e .env.<env> -- sh -c 'supabase db push --db-url "$DIRECT_URL"'           # 適用
   ```
   > `dotenv` はプロジェクトの `./node_modules/.bin/dotenv`（dotenv-cli）を使う。OS の Python 版 `dotenv` は `-e` の意味が異なり使えない。
5. **env を更新** — `.env.staging` / `.env.production` と `.secrets/{staging,production}/nextjs.env` の `DATABASE_URL`（6543 Transaction Pooler）/ `DIRECT_URL`（5432 Session Pooler）。`DIRECT_URL` は **Session Pooler（`aws-...pooler.supabase.com:5432`）**を使う（Direct の `db.<ref>.supabase.co` は IPv6 専用で IPv4 環境から `no route to host` になる）。
6. **検証** — `make db-migrate-check-staging` / `make deploy-status` で `pending: 0` / `supabasePending: 0`、`SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public'` で RLS 有効を確認。

---

## 5. 既知のハマりどころ（今回踏んだもの）

| 症状 | 原因 | 対処 |
|---|---|---|
| `getaddrinfo ENOTFOUND db.<ref>.supabase.co` | `DIRECT_URL` に Direct 接続（IPv6 専用） | Session Pooler（`aws-...pooler.supabase.com:5432`）を使う |
| `default ... cannot be cast automatically to type jsonb` | `0018`/`0026` の replay 非安全 | squash で再生成、または `DROP DEFAULT` を挟む |
| `password authentication failed` (supabase link) | リンクのプロンプトに誤ったパスワード | `--db-url "$DIRECT_URL"` で接続文字列直指定にしてプロンプト回避 |
| 別プロジェクトに push されそうになる | 旧リンク `dqlaqqgldpmfqmfzzgvk` 残存 | 必ず `--db-url` を使う。素の `supabase db push` を実行しない |
| `dotenv: Invalid value for '-e'` | OS の Python 版 `dotenv` | `./node_modules/.bin/dotenv`（dotenv-cli）を使う |
| ローカル `db:push` が `column "messages" cannot be cast automatically to type jsonb` | 旧スキーマ DB への in-place `text→jsonb` ALTER（0018/0026 と同根） | 空 DB に db:push（fresh）。in-place 変換は不可 |
| `make db-up`（`supabase start`）が `relation "users" does not exist` で失敗 | `config.toml [db.migrations] enabled=true` がまっさらな DB に `supabase/migrations/` を適用するが、それらが Drizzle 製テーブル（`users` 等）に依存 | local は `[db.migrations] enabled=false` + `npm run db:push`（Drizzle が schema SSOT）。RLS は deployed のみ |

> **migration アーキテクチャの根本問題（要再設計）**: `supabase/migrations/`（CLI・21本）と `drizzle_pg/`（Drizzle・40本）が**混在**し、一部テーブル（例 `interview_conversations`）が**両方で定義**されている。さらに `supabase/migrations` が Drizzle 製テーブルに FK 依存するため、まっさらな DB に `supabase start` 単独で当てると順序エラーで落ちる。再設計では (a) Drizzle を schema SSOT に一本化、(b) `supabase/migrations` は RLS/ハードニング overlay に限定し Drizzle 適用後に流す前提を明確化、(c) local は `[db.migrations] enabled=false`、を満たす。

---

## 6. 本番 Stripe live 設定（デプロイ直前に実施・手順確定済み）

> 正本の手順は [`../release/STRIPE.md`](../release/STRIPE.md)。本節は **DB 再設計 → 本番デプロイの順序にどう組み込むか**と前提・検証結果のみを記録する（コマンドは STRIPE.md を参照し重複させない）。2026-05-25 にコードと doc の整合を検証済み。

### 6.1 前提（2026-05-25 時点・ユーザー確認済み）

- Stripe 本番アカウントは **live 承認済み**で `sk_live_` キーを保有。よって live リソース作成（bootstrap-live）は技術的にはいつでも可能。
- ただし **live checkout の実疎通**には (a) 本番デプロイ（DB 再設計が前提＝本計画 §4 完了後）と (b) credits 修正（`db33fc8e` の `monthly-reset.ts` の `now()` 化）の本番反映が必要。
- このため live リソース作成も **本番デプロイが近づいてから**まとめて実施する。先行作成しても疎通確認できず、Dashboard に未使用リソースが残るだけのため。

### 6.2 コード側 hard gate（`validateStripePriceConfig`・本番は server 起動時に強制）

本番 env が次を満たさないと **サーバ起動が FATAL で停止**する（`src/lib/stripe/config.ts` で検証済み）。

- `STRIPE_SECRET_KEY` = `sk_live_*`（`sk_test_*` だと FATAL。staging は逆に `sk_live_` を弾く）
- `STRIPE_WEBHOOK_SECRET` = `whsec_*`（必須）
- `STRIPE_PORTAL_CONFIGURATION_ID` = `bpc_*`（必須）
- `STRIPE_PRICE_*` 4 本すべて `price_*`（必須）
- 加えて Terms of Service URL（Dashboard → Settings → Public details）未設定だと Checkout が 400。

### 6.3 整合確認済みの事実（コードと doc が一致）

- webhook 8 events（`checkout.session.completed` / `customer.subscription.updated` / `customer.subscription.deleted` / `invoice.payment_succeeded` / `invoice.payment_failed` / `charge.refunded` / `charge.dispute.created` / `charge.dispute.closed`）が **`managed-config.json`・STRIPE.md・`route.ts` の dispatch（`STRIPE_EVENT_HANDLERS`）・`webhook-handlers.ts` の 8 ハンドラ**で完全一致。
- live key 解決順（`scripts/stripe/core.mjs` の `resolveStripeSecretKey`）= `STRIPE_SECRET_KEY_LIVE` → `STRIPE_LIVE_SECRET_KEY` → `STRIPE_SECRET_KEY`（最初の `sk_live_` を採用）。bootstrap は `STRIPE_SECRET_KEY_LIVE` をプロセス env で渡す前提（`.env.local` に置かない）。
- `handleCheckoutCompleted` は `updatePlanAllocationCoreTx` を呼ぶ。これが credits 修正（`now()`）の対象関数。**credits fix を本番に出さないと本番 checkout が 500 になる**（プラン・クレジット未反映）。

### 6.4 デプロイ直前の実施順（本計画 §4 完了後）

1. 本計画 §4 で production DB をリセット・再ブートストラップ（RLS まで）。
2. credits 修正（`db33fc8e`）を含む `develop` を `main` にマージし本番デプロイ。
3. `STRIPE_SECRET_KEY_LIVE=<sk_live_...> npm run stripe:bootstrap-live`（STRIPE.md 2-3）。products / prices / webhook / portal を冪等作成。標準出力の `STRIPE_PRICE_*` を控える。
4. `STRIPE_WEBHOOK_SECRET`（whsec_）は Dashboard で確認し repo local `.secrets/production/nextjs.env` に反映（bootstrap は標準出力に出さない）。
5. `.secrets/production/nextjs.env` に Stripe 7 値（`STRIPE_SECRET_KEY`=sk_live / `STRIPE_WEBHOOK_SECRET` / 4×`STRIPE_PRICE_*` / `STRIPE_PORTAL_CONFIGURATION_ID`）を入れ、Terms URL を Dashboard で設定。
6. `zsh scripts/release/sync-career-compass-secrets.sh --check --target vercel-production --vercel-env production` → `--apply ...` で Vercel production に反映。
7. `make stripe-preflight`（`readiness: "ready"`）で整合確認。
8. 本番で **実カードの少額 live checkout** で疎通（プラン反映・クレジット付与）を 1 件確認 → 必要なら返金（4242 はテストモード専用で live では使えない）。
9. `npm run stripe:audit -- --env live --json`（`ok: true`）を CI / cron 監視に組み込む。

> backend (Railway) には Stripe 設定不要（Stripe は Vercel フロントのみ）。

---

## 7. 残タスク

- [ ] ローカル DB 再設計（[`db-design-optimization-rls.md`](./db-design-optimization-rls.md) ベース）と migration squash
- [ ] `supabase/migrations`（CLI）と `drizzle_pg`（Drizzle）の重複・依存を解消（テーブル定義は Drizzle に一本化、CLI 側は RLS overlay に限定、local は `[db.migrations] enabled=false`）
- [ ] **DB 再設計完了後に再実施（暫定対応の巻き戻し/再評価）**:
  - `supabase/config.toml` の `[db.migrations] enabled=false`（2026-05-24 にローカル復旧のため変更）を再評価する。migration を squash して順序安全になれば `true` に戻すか、ローカルは Drizzle SSOT のまま `false` を正式採用するかを決める。
  - ローカル DB をクリーン再作成して現行スキーマで作り直す（`make db-down-clean` → `make db-up` → `npm run db:push`）。
  - ローカル決済テスト（`stripe listen` + 4242 実チェックアウト）を再実施して業務ロジック（subscription 作成・クレジット付与）まで通す。
  - staging / production も §4 でリセット・再ブートストラップし直す。
- [ ] `dqlaqqgldpmfqmfzzgvk` リンクの正体確認・整理
- [ ] 再設計確定後、本計画 §4 で staging → production をリセット・再ブートストラップ
- [ ] 本番デプロイ直前に §6.4 で本番 Stripe live を設定（bootstrap-live → env 7 値 + Terms URL → preflight `ready` → 実カード少額 checkout 疎通）。credits 修正 `db33fc8e` の本番反映が前提
- [ ] `scripts/release/baseline-drizzle-journal.mjs` の commit 要否判断（squash で不要になる可能性）
