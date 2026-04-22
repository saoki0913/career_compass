# AI Agent Pipeline

Matt Pocock 氏の pipeline を、この repo では `Codex` `Claude Code` `Cursor` で共通運用できるようにそろえる。
就活Pass では AI 継ぎ足し開発の負債を防ぐため、`write-prd` の前に `architecture-gate` を挟む。

## 使う順番

1. `architecture-gate`
2. `write-prd`
3. `prd-to-issues`
4. `tdd`
5. `improve-architecture`

## 各ステップの役割

- `architecture-gate`
  - `.omm/` とコードを使って、次の変更が安全に追加できるか判定する。
  - 重点確認対象は `overall-architecture`、`request-lifecycle`、`data-flow`、`external-integrations`、`route-page-map`。
  - 判定は `PASS` / `PASS_WITH_REFACTOR` / `BLOCK` の 3 値で終える。
- `write-prd`
  - gate 判定を前提に PRD を書く。`PASS_WITH_REFACTOR` の場合は最小リファクタを step 0 に含める。
- `prd-to-issues`
  - 実装順に薄い issue へ分解する。
- `tdd`
  - 実装前にテスト観点を固定する。
- `improve-architecture`
  - `architecture-gate` が `BLOCK` を返したときの昇格先。RFC を先に書く。

## 正本

- 共通 source: `private/agent-pipeline/skills/*.md`
- テンプレート: `private/agent-pipeline/templates/*.md`
- Cursor prompt template: `private/agent-pipeline/cursor-prompts/*.md`
- 生成スクリプト: `scripts/agent-pipeline/sync-pipeline.mjs`
- mirror 上書き対象 path の一覧は [`docs/ops/AI_HARNESS.md`](./AI_HARNESS.md) 3.5 節を参照

## 生成物の保存先

- PRD: `docs/prd/YYYY-MM-DD-<slug>.md`
- 実装 issue: `docs/issues/<slug>/01-<issue-slug>.md`
- Architecture RFC: `docs/rfc/YYYY-MM-DD-<slug>.md`

## ツール別の呼び出し方

- Codex: `.codex/commands/<name>.md` または `.codex/skills/<name>/SKILL.md`
- Claude Code: `.claude/skills/<name>/SKILL.md`（description マッチで自律起動）。`.claude/commands/` には pipeline 系は存在せず、`deploy-production` / `reset-changes` / `update-docs` の 3 種のみ。詳細は [`docs/ops/AI_HARNESS.md`](./AI_HARNESS.md) 3-4 章を参照。
- Cursor: `.cursor/rules/<name>.mdc` を参照し、`private/agent-pipeline/cursor-prompts/<name>.md` を prompt template として使う

## 運用ルール

- canonical source を編集したら `node scripts/agent-pipeline/sync-pipeline.mjs` を実行する。
- 生成済み adapter は直接編集しない。
- 命令文は英語、生成される PRD / issue / RFC は日本語を基本にする。
- 高リスク変更では `architecture-gate` を省略しない。
- `architecture-gate` が `BLOCK` のときは、実装や PRD を先に進めず `improve-architecture` を回す。
- `architecture-gate` が `PASS_WITH_REFACTOR` のときは、その最小リファクタを PRD / issue の先頭へ固定する。
- 要件整理は独立 skill に固定せず、`AGENTS.md` と各ツールの質疑導線で先に詰める。
