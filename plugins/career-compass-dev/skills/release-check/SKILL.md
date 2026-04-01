---
name: release-check
description: staging / production release を repo の標準 release automation に寄せる。
---

# Release Check

release 依頼では provider CLI を直接叩かず、repo の正本 workflow を使う。

## 標準入口

1. `make ops-release-check`
2. 明示がなければ `make deploy-stage-all`
3. `staged-only` 指定時のみ `make deploy`

## 同義として扱う依頼

- 本番にデプロイして
- 本番反映して
- 公開して
- リリースして
- ship it
- deploy to production

## 正本

- `.codex/commands/deploy-production.md`
- `scripts/release/release-career-compass.sh`
- `docs/release/`
- `docs/ops/CLI_GUARDRAILS.md`
