---
description: 就活Pass の標準 release automation を実行し、develop→staging→main→production→Playwright 検証まで進める。
user-invocable: true
---

# Deploy Production

本番デプロイは repo 内の標準スクリプトだけを使う。

## 実行順

1. `make ops-release-check`
2. 必要なら release 対象だけを stage
3. `make deploy`
4. staging / production の Playwright 検証結果を確認

## 正本

- `scripts/release/release-career-compass.sh`
- `scripts/release/post-deploy-playwright.sh`

## 禁止

- `git push origin main`
- `vercel deploy --prod` の直接実行
- `railway up` の直接実行
