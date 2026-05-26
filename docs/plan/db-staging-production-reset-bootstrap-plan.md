# DB/RLS 確定後の staging / production リセット・再ブートストラップ計画

> **運用手順正本**: DB/RLS の設計本体は [`db-design-optimization-rls.md`](./db-design-optimization-rls.md) を正本とする。本書は DB/RLS 設計確定後に local → staging → production をリセットし、再ブートストラップするための運用手順に限定する。

> 作成日: 2026-05-24
> 最終更新: 2026-05-25
> 関連: [`../release/SUPABASE.md`](../release/SUPABASE.md), [`../operations/production/DB_MIGRATION.md`](../operations/production/DB_MIGRATION.md), [`../operations/platform/ENVIRONMENT_VARIABLES.md`](../operations/platform/ENVIRONMENT_VARIABLES.md), [`../release/STRIPE.md`](../release/STRIPE.md)

---

## 1. 目的

DB/RLS 設計が確定した後、staging / production を安全に破棄・再構築する。

本書では以下を扱う。

- migration fresh replay 不能問題の解消後の再構築手順
- staging / production の reset gate
- 3 層 migration (`schema / integrity / security`) の適用順
- `pending: 0` / `supabasePending: 0` / remote-only 履歴なし確認
- Supabase project link 誤爆防止
- secret sync check
- Stripe preflight と Terms URL 確認
- production reset 時の停止手順
- バックアップまたは PITR 復元点、復元 rehearsal

本書では DB/RLS の設計判断そのものは扱わない。

---

## 2. 背景・決定

2026-05-24 の env 変数セットアップ作業で、staging DB の migration fresh replay が失敗する問題が判明した。

ユーザー決定:

- DB 関連 env 設定は、DB 再設計完了まで後回しにする。
- DB 以外の Stripe / Google OAuth / Upstash / Sentry 等の env 設定は独立に先行してよい。
- local / staging / production DB は完全リセットしてよい。
- ただし production reset は機能凍結後の最後に実施する。

---

## 3. 判明している問題

### 3.1 Drizzle migration の fresh replay 失敗

`drizzle_pg/0018_conversation_jsonb.sql` と `drizzle_pg/0026_db_redesign_jsonb_columns.sql` は、text→jsonb 変換時に `DROP DEFAULT` を挟まず `ALTER COLUMN ... TYPE jsonb USING ...::jsonb` している。

空 DB でも既存 DEFAULT の型変換で失敗し得るため、旧 migration を編集するのではなく、機能凍結後に 3 層 migration として作り直す。

### 3.2 baseline 済み DB と履歴不一致

production は先に現行スキーマを構築し、Drizzle journal を baseline 済みのため pending:0 になっている。旧 migration を編集すると hash 不一致になる。

対応:

- 旧 migration は編集しない。
- 機能凍結後に旧 `drizzle_pg` / `supabase/migrations` を archive へ退避する。
- reset 後は新しい `schema / integrity / security` 履歴で再構築する。

### 3.3 Supabase CLI link 誤爆リスク

Supabase CLI に別プロジェクト `dqlaqqgldpmfqmfzzgvk` へのリンクが残存している。

禁止:

- 素の `supabase db push`
- `supabase db push --linked`
- production 向け `npm run db:push`

許可:

- 接続先 project ref と DB URL を明示した check / apply
- release runner 管理下の migration

---

## 4. 実施前 gate

### 4.1 機能凍結 gate

staging / production reset は、以下が満たされるまで実施しない。

- DB/RLS 設計が `db-design-optimization-rls.md` に統合済み。
- Phase A の local RLS 検証が完了済み。
- 3 層 migration manifest が確定済み。
- 旧 `db` import 封じ込め方針が確定済み。
- code-reviewer 3 並列レビューで DB/RLS 設計が承認済み、または指摘対応済み。

### 4.2 停止 gate

production reset 前に以下を停止または無効化する。

- Vercel cron
- GitHub Actions の自動 deploy / scheduled workflow
- Stripe webhook endpoint
- 通常 production deploy
- 手動で走る release / migration job

停止した対象、停止時刻、再開手順を作業ログへ残す。

### 4.3 復元 gate

production reset 前に以下を確認する。

- 消してよいデータのみであることをユーザーが最終確認済み。
- 論理バックアップまたは PITR 復元点を確認済み。
- 復元 rehearsal の手順が確認済み。
- reset 失敗時の roll-forward 手順が確認済み。

---

## 5. 3 層 migration 適用順

DB/RLS 設計確定後、以下の順で適用する。

1. **schema layer**
   Drizzle 生成 SQL。テーブル、基本 FK、通常 index、基本 CHECK。
2. **integrity layer**
   owner integrity、JSONB CHECK、partial index、raw invariant。
3. **security layer**
   role、grant、RLS helper、RLS policy。

`security layer` は `supabase db push` の素実行に依存しない。`run-migrations.mjs` または専用 script の管理下で、manifest と履歴を突き合わせる。

---

## 6. local fresh replay

staging / production reset 前に local で必ず通す。

1. 旧 DB を破棄する。
2. schema layer を適用する。
3. integrity layer を適用する。
4. security layer を適用する。
5. migration 履歴を確認する。
6. RLS 正負検証を実行する。
7. owner integrity 検証を実行する。
8. JSONB CHECK 検証を実行する。
9. 主要 API smoke test を実行する。

確認項目:

- `pending: 0`
- `supabasePending: 0`
- remote-only migration なし
- local-only migration なし
- hash 差分なし
- `shupass_owner_integrity_violations()` が 0

---

## 7. staging reset 手順

production より先に staging で通す。

1. Supabase Dashboard で staging project ref を目視確認する。
2. `.secrets/staging/nextjs.env` と `.secrets/staging/supabase.env` をユーザーが更新する。
3. secret sync check を実行する。
4. staging の cron / deploy / webhook を停止する。
5. reset SQL の対象が staging であることを確認する。
6. `public` / `drizzle` と 3 層 migration 履歴を初期化する。
7. schema layer を適用する。
8. integrity layer を適用する。
9. security layer を適用する。
10. `pending: 0` / `supabasePending: 0` / remote-only なしを確認する。
11. RLS 正負検証、owner integrity、JSONB CHECK、主要 API smoke test を実行する。
12. 停止した webhook / cron / deploy を再開する。

staging でも `supabasePending: 0` は hard gate とする。

---

## 8. production reset 手順

production は staging の全検証が通った後に実施する。

1. ユーザーが production DB の破棄を最終承認する。
2. Supabase Dashboard で production project ref を目視確認する。
3. バックアップまたは PITR 復元点、復元 rehearsal を確認する。
4. secret sync check を実行する。
5. Stripe webhook、cron、deploy を停止する。
6. reset SQL の対象が production であることを確認する。
7. `public` / `drizzle` と 3 層 migration 履歴を初期化する。
8. schema layer を適用する。
9. integrity layer を適用する。
10. security layer を適用する。
11. `pending: 0` / `supabasePending: 0` / remote-only なしを確認する。
12. RLS 正負検証、owner integrity、JSONB CHECK、主要 API smoke test を実行する。
13. `make ops-release-check` を実行する。
14. Stripe preflight と Terms URL を確認する。
15. 停止した webhook / cron / deploy を再開する。
16. production health check を実行する。
17. Stripe webhook 停止中イベントを照合する。

### 8.1 Stripe webhook 停止中イベント照合

Stripe webhook を停止または delivery 不能にする場合は、Stripe の再送・重複・順序未保証を前提にする。

作業ログに必ず記録するもの:

- 停止開始時刻と再開時刻（JST / UTC の両方）
- 停止した endpoint / cron / deploy
- 対象 event type
- reset 前後の `processed_stripe_events` 件数と `processing` / `succeeded` / `failed` 内訳

再開後の照合手順:

1. Stripe Dashboard または Stripe API で停止期間中の event を確認する。
2. 対象 event type は `checkout.session.completed`、`customer.subscription.updated`、`customer.subscription.deleted`、`invoice.payment_succeeded`、`invoice.payment_failed`、`charge.refunded`、`charge.dispute.created`、`charge.dispute.closed` とする。
3. `processed_stripe_events` に存在しない event、または stale `processing` / `failed` の event を再処理候補にする。
4. 既に `succeeded` の event は重複処理しない。
5. Stripe API から subscription / invoice / charge / dispute の現状態を再取得し、`user_profiles.plan`、credits allocation、billing hold と突き合わせる。
6. 差分があれば自動補正せず、reconciliation log に残して個別対応する。
7. 照合結果を release log に保存し、`make stripe-preflight` を再実行する。

---

## 9. reset SQL の注意点

既存案の `public` / `drizzle` drop だけでは不十分。3 層 migration 履歴も初期化対象に含める。

触ってよいもの:

- `public`
- `drizzle`
- 本プロジェクトが作成した 3 層 migration 履歴 schema / table
- 必要に応じて `supabase_migrations.schema_migrations` の本プロジェクト対象履歴

触ってはいけないもの:

- Supabase の `auth`
- `storage`
- `extensions`
- provider が管理する system schema
- secret / vault

実行前に対象 DB と project ref を必ず表示し、ユーザー確認を取る。

---

## 10. 検証コマンド

代表コマンド:

```bash
make db-validate
node scripts/release/run-migrations.mjs --env staging --dry-run --json
make db-migrate-check-staging
make db-drift-check-staging
node scripts/release/run-migrations.mjs --env production --dry-run --json
make db-migrate-check
make db-drift-check
make ops-release-check
make stripe-preflight
```

`make db-validate` は最終的に以下を含むか、個別コマンドへ分離する。

- 3 層 migration 履歴検査
- fresh replay 検証
- security layer manifest 検査
- RLS SQL 検証
- owner integrity 検証
- JSONB CHECK 検証
- remote-only / local-only / hash 差分検出

---

## 11. Stripe 本番 live 設定

Stripe 本番設定は DB 設計本体へ混ぜず、DB reset 後の release 依存として本書に残す。

production DB reset と本番デプロイ準備が完了した後に実施する。

1. `STRIPE_SECRET_KEY_LIVE=<sk_live_...> npm run stripe:bootstrap-live`
2. Dashboard で `STRIPE_WEBHOOK_SECRET` を確認する。
3. `.secrets/production/nextjs.env` をユーザーが更新する。
4. secret sync check を実行する。
5. Terms URL を Dashboard で確認する。
6. `make stripe-preflight` で readiness を確認する。
7. 本番で実カード少額 checkout を 1 件確認する。
8. 必要なら返金する。
9. `npm run stripe:audit -- --env live --json` を確認する。

backend (Railway) には Stripe 設定不要。

---

## 12. 残タスク

- [ ] `db-design-optimization-rls.md` の Phase A 設計を実装へ進める。
- [ ] 3 層 migration manifest と履歴テーブルを確定する。
- [ ] `run-migrations.mjs` に schema / integrity / security 層の履歴検査を統合する。
- [ ] local fresh replay を通す。
- [ ] staging reset を通す。
- [ ] production reset を機能凍結後に通す。
- [ ] Supabase CLI の旧リンク `dqlaqqgldpmfqmfzzgvk` の正体を確認し、誤爆防止手順を更新する。
- [ ] Stripe live 手順を DB reset 後に実施する。
