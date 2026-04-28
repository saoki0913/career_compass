# Codex Harness 運用リファレンス

**最終確認**: 2026-04-18

この文書は `career_compass` における Codex 用ハーネスの current state をまとめる。Codex は Claude の mirror ではなく、`AGENTS.md` と repo skill を土台にしつつ、**project-scoped custom agent** を `.codex/agents/*.toml` に持つ。Claude Code からの `scripts/codex/delegate.sh` 導線は互換クライアントとして残すが、Codex 単体セッションの runtime 正本は `.codex/` と `scripts/harness/` に置く。

## 1. 正本の置き場所

- ルーティング正本: `AGENTS.md`
- Codex runtime agent 正本: `.codex/agents/*.toml`
- Codex skill / command / hook: `.codex/skills/`, `.codex/commands/`, `.codex/hooks/`
- 共通 safety / checkpoint 正本: `scripts/harness/`
- repo skill 正本: `.agents/skills/*`
- 人間向け routing 補助: `.agents/agents/*.md`
- 共通 pipeline 正本: `private/agent-pipeline/skills/*.md`

原則:
- `AGENTS.md` は「どの仕事をどの agent に寄せるか」の正本
- Codex が runtime で使う custom agent は `.codex/agents/*.toml`
- `.agents/skills/` は repo-specific skill の正本
- `.agents/agents/` は runtime source ではなく補助資料
- Codex 側の runtime は `.codex/` に閉じ込める
- Claude Code 導線は Codex harness を呼び出す互換入口であり、Codex 単体の正本にはしない

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

## 5. Hooks / Commands

Codex は lifecycle hooks を first-class に使う。公式仕様では `[features] codex_hooks = true` を有効化し、`.codex/hooks.json` または `.codex/config.toml` inline `[hooks]` から `PreToolUse`, `PostToolUse`, `PermissionRequest`, `UserPromptSubmit`, `SessionStart`, `Stop` を読み込む。

この repo では `.codex/config.toml` に feature flag、`.codex/hooks.json` に配線、`.codex/hooks/*.sh` に実体を置く。project-local hooks は Codex で project trust が有効な場合だけ読み込まれる。

Codex hook 配線:

| event | matcher | hook |
|---|---|---|
| `SessionStart` | `startup\|resume` | `session-orientation.sh` |
| `PreToolUse` | `Bash\|Read\|mcp__filesystem__.*\|apply_patch\|Edit\|Write` | `pre-tool-dispatcher.sh` |
| `PermissionRequest` | `Bash\|Read\|mcp__filesystem__.*` | `permission-request-guard.sh` |
| `PostToolUse` | `apply_patch\|Edit\|Write` | `post-edit-dispatcher.sh` |
| `PostToolUse` | `Bash` | `post-tool-failure-triage.sh` |
| `UserPromptSubmit` | all | `user-prompt-submit-router.sh` |
| `Stop` | all | `stop-plaintext-confirm-guard.sh`, `stop-summary.sh` |

`pre-tool-dispatcher.sh` は tool input を先に軽量判定し、該当する場合だけ個別 guard を呼び出す。これにより通常の `Bash` 実行で no-op guard が毎回直列表示される状態を避けつつ、危険操作は fail-close する。分類は `scripts/harness/command-classifier.mjs` を使い、quoted path、nested shell、wrapper command を含む secrets / push / release / destructive delete を検出する。

Test category gate は重要カテゴリだけを対象にする。`lint` / `tsc` / unit は Codex の反復速度を優先して自由に実行できる。E2E functional、Quality、Security、commit 前 review は `$HOME/.codex/sessions/career_compass/` の checkpoint を必要とする。

Codex では file edit が `apply_patch` として届くため、`.codex/hooks/lib/codex-hook-utils.sh` で `tool_input.command` から変更ファイルと追加行を抽出する。dispatcher と各 hook 本体は旧 `file_path` 形式にも対応し、手動 dry-run と実 runtime の両方で同じ判定を使う。

TDD enforcement は Codex では強制しない。安全系と品質ゲートは hook / pre-commit で止め、TDD は agent instruction と review で扱う。

主な入口:

- `/codex-start`
- `/ui-start`
- `/reset-changes`
- `/update-docs`
- `/codex-closeout`

hook / wrapper:

- `.codex/hooks/session-orientation.sh`
- `.codex/hooks/pre-tool-dispatcher.sh`
- `.codex/hooks/ui-preflight-reminder.sh`（廃止: dispatcher 配線解除済み・手動実行用）
- `.codex/hooks/secrets-guard.sh`
- `.codex/hooks/git-push-guard.sh`
- `.codex/hooks/destructive-rm-guard.sh`
- `.codex/hooks/bandaid-guard.sh`
- `.codex/hooks/prompt-edit-confirm-guard.sh`
- `.codex/hooks/commit-codex-gate.sh`
- `.codex/hooks/test-category-gate.sh`
- `.codex/hooks/permission-request-guard.sh`
- `.codex/hooks/post-edit-dispatcher.sh`
- `.codex/hooks/post-tool-failure-triage.sh`
- `.codex/hooks/user-prompt-submit-router.sh`
- `.codex/hooks/stop-plaintext-confirm-guard.sh`
- `.codex/hooks/stop-summary.sh`

`post-edit-dispatcher.sh` は `scripts/harness/hook-shared.sh` の共通 helper を使う。`es-review`, `gakuchika`, `motivation`, `interview`, `company-info-search`, `rag-ingest`, `selection-schedule` の各 feature 変更で対応する `make test-e2e-functional-local-*` を 1 セッション 1 回だけ案内する。最終 block は repo-managed `.githooks/pre-commit` が担当する。

Codex 単体 checkpoint:

- `$HOME/.codex/sessions/career_compass/test-categories-$SESSION_ID`
- `$HOME/.codex/sessions/career_compass/codex-commit-delegation-$SESSION_ID`
- `$HOME/.codex/sessions/career_compass/push-approved-$SESSION_ID`
- `$HOME/.codex/sessions/career_compass/release-approved-$SESSION_ID`

## 5.1 Codex 単体運用

Codex 単体では `.codex/commands/codex-start.md`、`.codex/config.toml`、`.codex/agents/*.toml`、`.codex/hooks/*` を入口にする。

標準フロー:

1. SessionStart で branch、dirty state、利用候補 agent を確認する。
2. `AGENTS.md` と `.codex/config.toml` routing で専門 agent / skill を選ぶ。
3. 実装前に短い計画と検証コマンドを決める。
4. 実装中は PreToolUse が secrets、push、release/provider、destructive delete、prompt edit、band-aid を guard する。
5. E2E / Quality / Security は test category checkpoint に紐づけて実行する。
6. 大規模・hotspot commit は `post_review` の `review.json` と commit-review checkpoint を要求する。
7. push / release は current `HEAD` と dirty snapshot に一致する approval checkpoint が必要。

Codex 単体の audit artifact は `.codex/sessions/$SESSION_ID/` に置く方針とし、handoff artifact は `.codex/state/handoffs/` に保存する。

## 5.2 Claude-to-Codex Delegation

Claude Code から Codex CLI (GPT-5.5) へ作業を委譲するフロー。4 モードで運用する。

| モード | sandbox | codex コマンド | 用途 |
|---|---|---|---|
| `plan_review` | read-only | `codex exec` | 設計/計画の second opinion レビュー |
| `implementation` | workspace-write | `codex exec` | 独立性の高い実装タスクの委譲 |
| `post_review` | read-only (組込) | `codex review --uncommitted` | uncommitted changes のクロスレビュー |
| `imagegen` | workspace-write | `codex exec` | GPT Image 2 (`$imagegen`) による LP/UI アセット生成 |

**起動**: Claude Code の command (`/codex-plan-review`, `/codex-implement`, `/codex-post-review`, `/codex-imagegen`) → `scripts/codex/delegate.sh <mode>` → Codex CLI。timeout は default 3600s、長時間タスクのみ `--timeout 7200` を明示する。

### 5.2.1 imagegen モード

GPT Image 2 (`$imagegen`) を使った画像生成の委譲。ChatGPT サブスク内で実行される。

- **品質ガイドライン**: `.codex/skills/imagegen/` の構造化プロンプト + Anti-Tacky Guidelines + awesome-gpt-image-2 の知見を統合
- **テンプレート**: `scripts/codex/prompt-templates/imagegen.md` — Use-Case Taxonomy、Prompt Augmentation Rules、就活Pass デザインシステム準拠
- **出力先**: `public/generated_images/` — ファイル名規則 `{taxonomy}_{description}_{YYYYMMDD}_{seq}.png`
- **出力検査**: post-run で `public/generated_images/`, `public/marketing/`, `.codex/cache/`, `.codex/tmp/` 配下の画像候補を収集し、`images.json` に記録する。正式アセットへの昇格は Claude の視覚確認とユーザー承認後に行う
- **承認フロー**: Claude が生成画像を Read で視覚確認 → AskUserQuestion でユーザーに提示 → 承認後に LP 正式アセット (`public/marketing/screenshots/` + `landing-media.ts`) へ昇格検討
- **Fallback**: `$imagegen` が利用不可の場合、`~/.codex/skills/imagegen/scripts/image_gen.py` CLI を使用（`OPENAI_API_KEY` 必要）

`delegate.sh` は handoff prompt に共通の `Codex Harness Activation` ブロックを差し込み、`.codex/commands/codex-start.md` の orientation、`AGENTS.md` + `.codex/config.toml` routing による agent 選定、`.codex/agents/*.toml` の `developer_instructions`、および `.codex/skills/` / `.agents/skills/` の活用を明示的に要求する。

**State**: `.codex/state/handoffs/<request_id>/` に `request.md`, `result.md`, `meta.json` を保存。旧 `.claude/state/codex-handoffs/<request_id>/` は移行期間の read fallback として扱う。

**フォールバック**: Codex が失敗（timeout / 非ゼロ exit / 空結果）した場合は呼び出し元が継続判断し、`meta.json` に失敗を記録する。

**ガードレール**: wrapper が secrets 参照・`danger-full-access` sandbox・provider CLI 直叩きをブロックする。さらに hooks は共通 safety kernel (`scripts/harness/guard-core.sh`) を使い、secrets read、通常 push、force push、release/deploy/provider CLI、破壊的 delete を一貫して fail-close する。

## 6. Config

`.codex/config.toml` では次を管理する。

- `[features]`
  - `codex_hooks = true`
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
- `.codex/config.toml` の `[features]` / `[agents]` / `[routing]` / `mcp_servers.*`
- `.codex/hooks.json` の lifecycle hook 配線
- Codex 実入力形式 (`apply_patch`) で UI / band-aid / prompt confirmation gate が動くこと
- `CODEX_HARNESS.md` の source-of-truth 記述
- `AI_AGENT_PIPELINE.md` の stale step 除去
