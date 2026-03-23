---
name: release-automation
description: 就活Pass の標準 release automation。develop で preflight、staged release scope の commit、develop push、staging 検証、develop->main 自動昇格、production の Playwright 検証までを repo 内 scripts で実行する。
language: ja
---

# Release Automation

本番リリースでは `make deploy` を正本にする。

## 実行順

1. `make ops-release-check`
2. 必要なら release 対象だけを stage
3. `make deploy`

## 実装の正本

- `scripts/release/release-career-compass.sh`
- `scripts/release/post-deploy-playwright.sh`
- `scripts/release/sync-career-compass-secrets.sh`
