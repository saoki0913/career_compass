---
name: railway-ops
description: 就活Pass の Railway staging/production backend 運用。Railway auth 確認、env sync、health check、logs 確認、stg-api.shupass.jp と production backend の deploy 検証で使う。
---

# Railway Ops

Railway の直接 deploy ではなく、release automation と env sync を優先する。

## 正本

- `scripts/bootstrap/career-compass/sync-career-compass-env.sh --target railway-staging|railway-production`
- `scripts/release/release-career-compass.sh`
- `docs/release/RAILWAY.md`

## 使い分け

- auth 確認: `scripts/release/provider-auth-status.sh --strict`
- env sync: `scripts/bootstrap/career-compass/sync-career-compass-env.sh --apply --target railway-production`
- health: `curl https://stg-api.shupass.jp/health`, `curl https://shupass-backend-production.up.railway.app/health`

## 注意

- direct `railway up` は使わない
- release は `develop` / `main` の GitHub-connected deploy を前提にする
