---
name: release-automation
description: 就活Pass の本番リリース運用。`scripts/release/release-career-compass.sh` を正本にして、develop から staging、自動 PR merge、本番 smoke まで進める。デプロイ、本番リリース、staging確認、release automation、Vercel/Railway/Supabase secrets sync のタスクで使う。
---

# Release Automation

就活Pass の release は repo 内 scripts を正本にする。手動で provider を叩くより先に、必ず以下を見る。

## 使う入口

- preflight: `scripts/release/release-career-compass.sh --check`
- full release: `make deploy`
- secrets sync: `scripts/bootstrap/career-compass/sync-career-compass-env.sh`

## 標準フロー

1. `develop` で `--check`
2. staged-only の release scope を確認
3. `make deploy`
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
