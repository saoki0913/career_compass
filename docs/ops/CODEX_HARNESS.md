# Codex Harness 運用リファレンス

**最終確認**: 2026-04-18

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

`post-edit-dispatcher.sh` だけは Claude と同じ AI functional E2E reminder を必須導線として共有する。実際の判定ロジックは `.claude/hooks/lib/e2e-functional-reminder.sh` を source し、`es-review`, `gakuchika`, `motivation`, `interview`, `company-info-search`, `rag-ingest`, `selection-schedule` の各 feature 変更で対応する `make test-e2e-functional-local-*` を 1 セッション 1 回だけ案内する。実際の block は agent hook ではなく repo-managed `.githooks/pre-commit` が担当する。

## 5.1 Claude-to-Codex Delegation

Claude Code (Opus 4.6) から Codex CLI (GPT-5.4) へ作業を委譲するフロー。4 モードで運用する。

| モード | sandbox | codex コマンド | 用途 |
|---|---|---|---|
| `plan_review` | read-only | `codex exec` | 設計/計画の second opinion レビュー |
| `implementation` | workspace-write | `codex exec` | 独立性の高い実装タスクの委譲 |
| `post_review` | read-only (組込) | `codex review --uncommitted` | uncommitted changes のクロスレビュー |
| `imagegen` | workspace-write | `codex exec` | GPT Image 2 (`$imagegen`) による LP/UI アセット生成 |

**起動**: Claude Code の command (`/codex-plan-review`, `/codex-implement`, `/codex-post-review`, `/codex-imagegen`) → `scripts/codex/delegate.sh <mode>` → Codex CLI。timeout は default 3600s、長時間タスクのみ `--timeout 7200` を明示する。

### 5.1.2 imagegen モード

GPT Image 2 (`$imagegen`) を使った画像生成の委譲。ChatGPT サブスク内で実行される。

- **品質ガイドライン**: `.codex/skills/imagegen/` の構造化プロンプト + Anti-Tacky Guidelines + awesome-gpt-image-2 の知見を統合
- **テンプレート**: `scripts/codex/prompt-templates/imagegen.md` — Use-Case Taxonomy、Prompt Augmentation Rules、就活Pass デザインシステム準拠
- **出力先**: `public/generated_images/` — ファイル名規則 `{taxonomy}_{description}_{YYYYMMDD}_{seq}.png`
- **Scope audit**: post-run で `git diff --name-only` + `ls-files --others` を検査し、`public/generated_images/` 外の変更は `SCOPE_VIOLATION` で fail-close
- **承認フロー**: Claude が生成画像を Read で視覚確認 → AskUserQuestion でユーザーに提示 → 承認後に LP 正式アセット (`public/marketing/screenshots/` + `landing-media.ts`) へ昇格検討
- **Fallback**: `$imagegen` が利用不可の場合、`~/.codex/skills/imagegen/scripts/image_gen.py` CLI を使用（`OPENAI_API_KEY` 必要）

`delegate.sh` は handoff prompt に共通の `Codex Harness Activation` ブロックを差し込み、`.codex/commands/codex-start.md` の orientation、`AGENTS.md` + `.codex/config.toml` routing による agent 選定、`.codex/agents/*.toml` の `developer_instructions`、および `.codex/skills/` / `.agents/skills/` の活用を明示的に要求する。

**State**: `.claude/state/codex-handoffs/<request_id>/` に `request.md`, `result.md`, `meta.json` を保存。`.gitignore` 対象でローカルのみ。

**フォールバック**: Codex が失敗（timeout / 非ゼロ exit / 空結果）した場合は Claude が自身で作業を続行し、`meta.json` に失敗を記録。

**ガードレール**: wrapper が secrets 参照・`danger-full-access` sandbox・provider CLI 直叩きをブロック。既存 hook の guardrail と同等レベル。

### 5.1.1 オーケストレーター運用（CLAUDE.md Section C）

Claude = オーケストレーター、Codex = ワーカーの閉ループ運用。正本は `CLAUDE.md` Section C。

**Plan mode での委譲判断**: Section A の plan review 後、AskUserQuestion で委譲可否をユーザーに確認。委譲スコープ・推奨 Codex エージェント・コンテキスト準備計画・推定時間・戦略オプションを提示する。

**委譲閾値**: 変更 ≥3 ファイル or ≥50 行 → Codex 委譲。閾値未満 → Claude 直接実装。

**リッチコンテキスト**: Codex はスキル・Web 検索を使えないため、Claude が委譲前に対象コード・関連パターン・ライブラリ docs・テスト期待値をコンテキストファイルにまとめて渡す。テンプレート: `scripts/codex/prompt-templates/implementation.md`。

**閉ループ**: 実装 → Claude 検証 → 不合格なら再委譲（1回）→ まだ不合格なら Claude 修正 → Codex post_review → stage → E2E → commit → push。

**並列安全性**: Codex 実行中は Claude はファイル編集しない（リサーチ・設計・ユーザー対話のみ）。

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
