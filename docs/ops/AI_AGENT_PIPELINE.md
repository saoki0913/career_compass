# AI Agent Pipeline

Matt Pocock 氏の 5-step pipeline を、この repo では `Codex` `Claude Code` `Cursor` で共通運用できるようにそろえる。

## 使う順番

1. `grill-me`
2. `write-prd`
3. `prd-to-issues`
4. `tdd`
5. `improve-architecture`

## 正本

- 共通 source: `private/agent-pipeline/skills/*.md`
- テンプレート: `private/agent-pipeline/templates/*.md`
- Cursor prompt template: `private/agent-pipeline/cursor-prompts/*.md`
- 生成スクリプト: `scripts/agent-pipeline/sync-pipeline.mjs`

## 生成物の保存先

- PRD: `docs/prd/YYYY-MM-DD-<slug>.md`
- 実装 issue: `docs/issues/<slug>/01-<issue-slug>.md`
- Architecture RFC: `docs/rfc/YYYY-MM-DD-<slug>.md`

## ツール別の呼び出し方

- Codex: `.codex/commands/<name>.md` または `.codex/skills/<name>/SKILL.md`
- Claude Code: `.claude/commands/<name>.md` または `.claude/skills/<name>/SKILL.md`
- Cursor: `.cursor/rules/<name>.mdc` を参照し、`private/agent-pipeline/cursor-prompts/<name>.md` を prompt template として使う

## 運用ルール

- canonical source を編集したら `node scripts/agent-pipeline/sync-pipeline.mjs` を実行する。
- 生成済み adapter は直接編集しない。
- 命令文は英語、生成される PRD / issue / RFC は日本語を基本にする。
