---
name: release-automation
description: 就活Pass の本番リリース運用。`scripts/release/release-career-compass.sh` を正本にして、develop から staging、自動 PR merge、本番 smoke まで進める。デプロイ、本番リリース、staging確認、release automation、Vercel/Railway/Supabase secrets sync のタスクで使う。
---

# Release Automation

就活Pass の release は repo 内 scripts を正本にする。手動で provider を叩くより先に、必ず以下を見る。

## 使う入口

- preflight: `scripts/release/release-career-compass.sh --check`
- full release: `make deploy`
- stage all + full release: `make deploy-stage-all`
- secrets sync: `scripts/bootstrap/career-compass/sync-career-compass-env.sh`

## 自然文の解釈

次のような依頼は、すべて本番リリース依頼として扱う。

- `本番にデプロイして`
- `本番反映して`
- `公開して`
- `リリースして`
- `本番に出して`
- `push this live`
- `ship it`
- `deploy to production`

デフォルトは `make ops-release-check` の後に `make deploy-stage-all`。ユーザーが staged-only を明示したときだけ `make deploy` を使う。

## 標準フロー

1. `develop` で `--check`
2. staged-only の release scope を確認。明示がなければ `make deploy-stage-all`
3. `make deploy` または `make deploy-stage-all`
4. `develop` push
5. `Develop CI` 成功待ち
6. staging health / Playwright
7. `develop -> main` PR 自動作成と merge
8. production health / read-only Playwright

## 参照先

- `scripts/release/`
- `scripts/bootstrap/career-compass/`
- `docs/release/PRODUCTION.md`
- `docs/ops/CLI_GUARDRAILS.md`

## 注意

- direct `git push origin main` はしない
- direct `vercel deploy --prod` / `railway up` はしない
- secrets 正本は `/Users/saoki/work/codex-company/.secrets/career_compass`
