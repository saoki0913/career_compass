---
name: release-automation
description: "就活Pass の標準 release automation。develop で preflight、staged release scope の commit、develop push、staging 検証、develop->main 自動昇格、production の Playwright 検証までを repo 内 scripts で実行する。Trigger: deploy, release, 本番へデプロイ, staging, main promotion, production rollout."
---

# Release Automation

本番リリースでは、手作業の provider CLI ではなく repo 内 scripts を正本にする。

## Standard flow

1. `make ops-release-check`
2. 必要なら release 対象だけを stage
3. `make deploy`
4. 結果として staging / production の Playwright 検証まで確認する

## Source of truth

- `scripts/release/release-career-compass.sh`
- `scripts/release/post-deploy-playwright.sh`
- `scripts/release/sync-career-compass-secrets.sh`

## Guardrails

- `develop` 以外から始めない
- unstaged / untracked を混ぜたまま release しない
- `git push origin main` を直接使わない
- `vercel deploy --prod` と `railway up` を直接使わない
