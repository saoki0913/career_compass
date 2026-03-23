---
name: railway-ops
description: 就活Pass の Railway staging/production 運用。release automation から使う env sync, auth check, backend health check, staging custom domain 前提の操作に特化。Trigger: Railway, staging backend, production backend, stg-api.shupass.jp, railway env sync.
---

# Railway Ops

Railway 操作は repo 内 scripts を通す。

## Use

- env sync: `scripts/release/sync-career-compass-secrets.sh --target railway-staging|railway-production`
- release preflight: `scripts/bootstrap-career-compass-infra.sh --check`
- health check: `https://stg-api.shupass.jp/health`, `https://shupass-backend-production.up.railway.app/health`

## Notes

- staging は `develop`、production は `main`
- 通常 release で `railway up` は使わない
