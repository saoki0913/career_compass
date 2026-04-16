# Codex Harness 運用リファレンス

**最終確認**: 2026-04-17

この文書は `career_compass` における Codex 用ハーネスの current state をまとめる。Codex は Claude の mirror ではなく、`AGENTS.md` と repo skill を土台にしつつ、**project-scoped custom agent** を `.codex/agents/*.toml` に持つ構成へ寄せている。運用品質は Claude 正本と等価にそろえ、完全同型にはしない。

## 1. 正本の置き場所

- ルーティング正本: `AGENTS.md` / `CLAUDE.md`
- Codex runtime agent 正本: `.codex/agents/*.toml`
- Codex skill / command / hook: `.codex/skills/`, `.codex/commands/`, `.codex/hooks/`
- repo skill 正本: `.agents/skills/*`
- 人間向け routing 補助: `.agents/agents/*.md`
- 共通 pipeline 正本: `private/agent-pipeline/skills/*.md`

原則:
- `AGENTS.md` は「どの仕事をどの agent に寄せるか」の正本
- Codex が runtime で使う custom agent は `.codex/agents/*.toml`
- `.agents/skills/` は repo-specific skill の正本
- `.agents/agents/` は runtime source ではなく補助資料
- Claude との差分は必要最小限に留め、Codex 側の runtime は `.codex/` に閉じ込める
- Claude 正本の hook / docs / test と矛盾しないことを前提に、Codex では config / custom agent / wrapper / test で同等品質を担保する

## 2. Codex customization の優先順

OpenAI の current guidance に沿って、Codex では次の順で振る舞いを決める。

1. `AGENTS.md`
2. `.codex/agents/*.toml`
3. `.agents/skills/*` と `.codex/skills/*`
4. `.codex/config.toml`
5. `.codex/commands/*` と `.codex/hooks/*`

意味:
- `AGENTS.md` は durable guidance
- custom agent は専門 subagent の runtime 定義
- skill は repeatable workflow と domain expertise
- config は threads / verification / MCP などの session-wide policy
- command / shell wrapper は補助導線

## 3. Codex custom agents

`.codex/agents/*.toml` が Codex の runtime source。各ファイルは 1 agent を表し、少なくとも次を持つ。

- `name`
- `description`
- `developer_instructions`

必要に応じて次も持つ。

- `model`
- `model_reasoning_effort`
- `sandbox_mode`
- `[[skills.config]]`

現行 agent は次の 13 体制。

- `architect`
- `prompt-engineer`
- `security-auditor`
- `code-reviewer`
- `fastapi-developer`
- `nextjs-developer`
- `ui-designer`
- `database-engineer`
- `rag-engineer`
- `search-quality-engineer`
- `test-automator`
- `release-engineer`
- `product-strategist`

各 agent は担当 skill を `skills.config` で束ね、Codex の implicit discovery を強める。

## 4. Skills

skill は 2 系統ある。

- `.agents/skills/*`
  - repo-specific かつ hand-authored な実体
- `.codex/skills/*`
  - pipeline mirror または wrapper skill

運用ルール:
- repo 固有 workflow は `.agents/skills/` を source of truth にする
- `sync-pipeline` 管轄の skill は `private/agent-pipeline` を編集して mirror を更新する
- custom agent の `skills.config` には、実在する skill path だけを登録する

この repo で Codex から特に効く skill:

- `architecture-gate`
- `write-prd`
- `prd-to-issues`
- `frontend-design`
- `vercel-react-best-practices`
- `security-review`
- `database-design`
- `rag-implementation`
- `similarity-search-patterns`
- `audit-website`

## 5. Commands と wrapper

Codex では first-class hook に全面依存せず、command と shell wrapper を補助導線として使う。

主な入口:

- `/codex-start`
- `/ui-start`
- `/reset-changes`
- `/update-docs`
- `/codex-closeout`

shell wrapper:

- `.codex/hooks/session-orientation.sh`
- `.codex/hooks/ui-preflight-reminder.sh`
- `.codex/hooks/secrets-guard.sh`
- `.codex/hooks/git-push-guard.sh`
- `.codex/hooks/post-edit-dispatcher.sh`
- `.codex/hooks/file-changed-lint.sh`
- `.codex/hooks/subagent-start-log.sh`
- `.codex/hooks/stop-summary.sh`
- `.codex/hooks/session-end-cleanup.sh`

wrapper は guardrail と closeout の補助であり、agent selection の正本ではない。

## 6. Config

`.codex/config.toml` では次を管理する。

- `[agents]`
  - `max_threads = 6`
  - `max_depth = 1`
- `[routing]`
  - `AGENTS.md` の 13 subagent routing を Codex 側の path rule に写像する
- `setup.commands`
- `verification.commands`
- `mcp_servers.*`

この repo では Codex custom agent を使う前提なので、thread 数と深さは conservative に保つ。

## 7. 検証

```bash
npm run test:claude-harness
npm run test:agent-pipeline
npm run test:codex-harness
npm run test:cursor-harness
npm run test:harness
```

`test:codex-harness` では最低限次を確認する。

- `.codex/agents/*.toml` の存在
- required field の存在
- 主要 agent の skill binding
- `.codex/config.toml` の `[agents]` / `[routing]` / `mcp_servers.*`
- `CODEX_HARNESS.md` の source-of-truth 記述
- `AI_AGENT_PIPELINE.md` の stale step 除去
