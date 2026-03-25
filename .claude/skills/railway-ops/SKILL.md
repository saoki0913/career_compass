---
name: railway-ops
description: 就活Pass の Railway staging/production 運用。env sync, backend health check, staging custom domain 前提の release automation を扱う。
language: ja
---

# Railway Ops

- env sync: `scripts/release/sync-career-compass-secrets.sh --target railway-staging|railway-production`
- health check: `stg-api.shupass.jp/health`, `shupass-backend-production.up.railway.app/health`
- 通常 release で `railway up` は使わない
