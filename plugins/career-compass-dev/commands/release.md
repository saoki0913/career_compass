---
description: staging / production release を repo 標準の release automation に寄せる。
---

<instructions>
release 依頼では provider CLI を直接叩かず、repo の正本 workflow を使う。

1. 先に `make ops-release-check`
2. 明示がなければ `make deploy-stage-all`
3. `staged-only` 指定があるときだけ `make deploy`
4. staging / production の検証結果まで確認する

同義:
- 本番にデプロイして
- 本番反映して
- 公開して
- リリースして
- ship it
- deploy to production

正本:
- `.codex/commands/deploy-production.md`
- `scripts/release/release-career-compass.sh`
</instructions>
