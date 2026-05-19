# Supabase 環境分離（staging ↔ production DB 分離）実装記録

作成日: 2026-05-18 JST
更新日: 2026-05-19 JST
ステータス: Implemented（同一 project 内 schema 分離案は Superseded）

## 結論

staging と production は Supabase の別 project として分離する。

| 環境 | Supabase project | Project ref | app schema | 接続元 |
|---|---|---|---|---|
| local | local Supabase / Docker Postgres | n/a | `public` | `.env.local` |
| staging | `career-compass-staging` | `vbjykhkyhmxickxcgvdh` | `public` | `.env.staging` / `.secrets/staging/nextjs.env` |
| production | `career-compass-db` | `dqlaqqgldpmfqmfzzgvk` | `public` | `.env.production` / `.secrets/production/nextjs.env` |

schema 名で staging/production を分けない。両環境とも独立した Supabase project の `public` schema を使う。

## 判断理由

当初案は Supabase Free 制約を前提に、同一 project 内で production=`public` / staging=`staging` schema を分ける案だった。しかしこの案は以下の理由で長期運用に向かない。

- Supabase 公式の Managing Environments は、staging と production に separate Supabase projects を作成し、develop→staging / main→production に migration を流す構成を例示している。
- Supabase の platform docs では project ごとに dedicated Postgres instance が提供されるため、project 分離は Auth / Storage / Realtime を含む環境分離の境界として自然である。
- DB instance / roles / extensions / storage / migration locks / compute が共有され、staging の事故が production に波及しうる。
- Drizzle migration SQL に `REFERENCES "public".` が含まれるため、schema 分離には runner 側の FK 変換・履歴 schema 分離・search_path assert が必要になる。
- Transaction pooler と `search_path` の組み合わせは運用ミスの検知が難しく、production `public` を守るための実装コストが大きい。
- staging E2E / reset / migration の書き込み先を本番と物理的に分けられない限り、運用ルール依存が残る。

ユーザー承認により `career-compass-staging` を新規 Supabase project として作成したため、長期的な正解は別 project 分離とする。

## 実装方針

### DB / migration

- `scripts/release/run-migrations.mjs` は `--env staging` を受け付け、`.env.staging` の `DIRECT_URL` を使う。
- staging deploy は `run-migrations.mjs --env staging` を実行し、production project へ migration を適用しない。
- production migration は `run-migrations.mjs --env production` / `make deploy-migrate` のみで実行する。
- `scripts/ci/check-schema-drift.mjs` は `--env staging` で `.env.staging` を読み、staging project の drift を確認する。
- `make db-migrate-check-staging` / `make db-drift-check-staging` を staging 用確認コマンドとする。

### secrets

- staging Supabase secret sync target は `supabase-staging`。
- production Supabase secret sync target は `supabase-production`。
- backward compatibility のため `supabase` は production alias として残す。
- `SUPABASE_STAGING_PROJECT_REF=vbjykhkyhmxickxcgvdh` を staging bundle の meta key とする。
- `DATABASE_URL` / `DIRECT_URL` は `.secrets/staging/nextjs.env` と `.secrets/production/nextjs.env` で別々に管理する。

### APP_ENV SSOT

- staging は Vercel Production env scope を使うが、論理環境は `APP_ENV=staging` / `NEXT_PUBLIC_APP_ENV=staging`。
- billing/security の production 判定は `VERCEL_ENV` ではなく `resolveAppEnvironment()` を使う。
- Stripe staging は `sk_test_*` を使い、`sk_live_*` は fatal reject する。

## Superseded: schema 分離案

以下の旧タスクは別 project 分離により不要になった。

| 旧 task | 状態 | 理由 |
|---|---|---|
| `resolveDatabaseSchema()` 追加 | Superseded | schema で環境を分けない |
| `staging_drizzle` 履歴 schema 分離 | Superseded | project ごとに migration history が独立する |
| public 固定 FK の target schema 変換 | Superseded | staging も production も各 project の `public` を参照する |
| staging schema bootstrap / hardening | Superseded | `CREATE SCHEMA staging` は不要 |
| staging schema RLS/grant/FK/search_path assert | Superseded | schema 分離を行わない |

## 残タスク

| Status | Priority | Task | Owner | Acceptance Criteria |
|---|---|---|---|---|
| Done | P0 | staging Supabase project 作成 | orchestrator | `career-compass-staging` / `vbjykhkyhmxickxcgvdh` が Active Healthy |
| Done | P0 | staging migration runner path 追加 | release-engineer | `run-migrations.mjs --env staging --dry-run --json` が `.env.staging` を対象にする |
| Done | P0 | staging deploy の production DB migration 経路を削除 | release-engineer | `deploy-staging.sh` が `--env production` で migration を実行しない |
| Done | P0 | Supabase secret target 分離 | release-engineer | `supabase-staging` / `supabase-production` target が別 project ref を使う |
| Done | P1 | Stripe / portal の `VERCEL_ENV` production 判定を APP_ENV SSOT に移行 | security-auditor | staging の test key が production hard gate に入らず、production は live key / portal config を必須化 |
| Done | P1 | CI-only 6 変数を T3 Env 経由へ移行 | nextjs-developer | `src/env/server.ts` schema/runtimeEnv と呼び出し元が一致 |
| Pending | P0 | staging DB 接続情報を secret bundle に投入 | operator | `.secrets/staging/nextjs.env` に staging project の `DATABASE_URL` / `DIRECT_URL` を設定し、provider sync check が通る |
| Pending | P1 | staging DB へ migration 適用 | operator | `run-migrations.mjs --env staging --json` が staging project のみを更新する |

## Verification

```bash
zsh -n scripts/release/sync-career-compass-secrets.sh scripts/release/lib/secret-plan.sh scripts/release/deploy-staging.sh scripts/release/release-career-compass.sh
node --test scripts/release/sync-career-compass-secrets.test.mjs scripts/harness/command-classifier.test.mjs
npx vitest run src/env/server.test.ts src/lib/stripe/config.test.ts src/app/api/stripe/portal/route.test.ts src/app/api/internal/test-auth/login/route.test.ts src/app/api/internal/local-ai-live/principal-preflight/route.test.ts
npm run check:env-drift
```

staging `DATABASE_URL` / `DIRECT_URL` が secret bundle に入るまでは、実 DB migration / drift check は実行しない。

## References

- Supabase Docs: [Managing Environments](https://supabase.com/docs/guides/deployment/managing-environments/)
- Supabase Docs: [Compute and Disk](https://supabase.com/docs/guides/platform/compute-add-ons/)
- Supabase Docs: [Branching](https://supabase.com/features/branching)
