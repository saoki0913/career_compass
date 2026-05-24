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

Codex は lifecycle hooks を first-class に使う。公式仕様では `[features] hooks = true` を有効化し、`.codex/hooks.json` または `.codex/config.toml` inline `[hooks]` から `PreToolUse`, `PostToolUse`, `PermissionRequest`, `UserPromptSubmit`, `SessionStart`, `Stop` を読み込む。

この repo では `.codex/config.toml` に feature flag、`.codex/hooks.json` に配線、`.codex/hooks/*.sh` に実体を置く。project-local hooks は Codex で project trust が有効な場合だけ読み込まれる。

Codex hook 配線:

| event | matcher | hook |
|---|---|---|
| `SessionStart` | `startup\|resume` | `session-orientation.sh` |
| `PreToolUse` | `Bash\|Read\|mcp__filesystem__.*\|apply_patch\|Edit\|Write` | `pre-tool-dispatcher.sh` |
| `PermissionRequest` | `Bash\|Read\|mcp__filesystem__.*` | `permission-request-guard.sh` |
| `PostToolUse` | `Bash` | `post-bash-output-guard.sh` |
| `PostToolUse` | `apply_patch\|Edit\|Write` | `post-edit-dispatcher.sh` |
| `UserPromptSubmit` | all | `user-prompt-submit-router.sh` |
| `Stop` | all | `stop-summary.sh` |

`pre-tool-dispatcher.sh` は tool input を先に軽量判定し、該当する場合だけ個別 guard を呼び出す。これにより通常の `Bash` 実行で no-op guard が毎回直列表示される状態を避けつつ、危険操作は fail-close する。分類は `scripts/harness/command-classifier.mjs` を使い、quoted path、nested shell、wrapper command を含む secrets / push / release / destructive delete を検出する。

Codex では `Bash` の `PostToolUse` を秘密情報漏えい検知の補助線に限定する。`post-bash-output-guard.sh` は fail-open で、通常出力には何も出さず、疑わしい secret pattern が出た場合だけ警告する。Bash の実行制御は `PreToolUse` と `PermissionRequest` 側で維持する。

Codex では最終メッセージの自然文を `Stop` でブロックしない。Default mode では `AskUserQuestion` 相当のツールが常に使えるとは限らず、closeout の通常文確認を hook で止めると安全停止そのものが deadlock するため。commit / push / release / provider / secrets / destructive delete の実行制御は `PreToolUse` と `PermissionRequest` に集約する。

Codex 単体では `AskUserQuestion` を呼べない。Codex 側は対話確認で止めず、`$HOME/.codex/sessions/career_compass/` の Codex autonomy intent と manifest を検証して進む。`UserPromptSubmit` が release / deploy / push intent を記録し、manifest は `scripts/harness/diff-snapshot.mjs` が生成して `HEAD`、staged diff、必要に応じて exact command、release mode、TTL に bind する。Claude harness はこの自律化の対象外。

Test category gate は「実行」を止めない。Codex は static / security / E2E functional / Quality の実行 checkpoint を自動生成して確認を進める。skip や soft fail / judge fail の受容は自動化せず、失敗内容を解消してから再実行する。

Push / release / production promotion は、UserPromptSubmit で production / release intent が記録された session かつ matching `codex-autonomy` manifest がある場合にだけ自動通過する。通常 push は `git push origin develop` に限定し、release は repo script / Make target に限定する。本番反映は staging checkpoint が current `HEAD` に一致する場合のみ許可する。direct provider mutation は manifest があっても許可しない。

Hard deny は残す。force push、secret/env/key の直接読み取り、production/all secret apply、unsafe recursive delete、rollback、contract/destructive migration、direct provider mutating CLI は Codex autonomy manifest で上書きできない。

危険操作を許可する checkpoint の自己発行も hard deny として扱う。`push`、`release`、`migration`、`production-promotion`、`secret-apply`、`staging-verified`、`codex-autonomy` は、通常の Codex Bash から `diff-snapshot.mjs checkpoint` を直接実行して作成できない。これらは対応する guard、review 結果、または Codex 自律 manifest の内部処理が生成する。`prompt-quality-verification`、`commit-review`、`test-categories` は危険操作の許可ではなく品質確認記録なので、この hard deny には含めない。

Prompt / LLM edit は Codex では次の edit を止めない。`post-edit-dispatcher.sh` が prompt quality debt を JSON で記録し、commit 前に `prompt-quality-verification-$SESSION_ID` を要求する。これにより修正ループは止めず、参考 ES 漏洩、AI-smell、日本語品質、token/cost の確認は commit gate に集約する。

### Local env と外部サービス read-only 操作

`process.env` は実行中プロセスに渡された環境変数で、`.env.local` は自動では入らない。Codex の通常 Bash に `.env.local` を全体注入すると、任意コマンドが `printenv` 等で秘密値を表示できるため禁止する。

外部サービスの read-only 調査で Sentry / Stripe / GitHub / Vercel / Railway / Supabase / Google Cloud のローカル認証情報が必要な場合は、`scripts/harness/run-with-local-service-env.mjs` を使う。profile ごとの allowlist key だけを子プロセスへ渡し、stdout/stderr は loaded value と既存 secret pattern で redaction する。raw `dotenv -e .env.local -- ...` は classifier が unwrap し、secret read または provider gate の対象にする。

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
- `.codex/hooks/stop-summary.sh`

`post-edit-dispatcher.sh` は `scripts/harness/hook-shared.sh` の共通 helper を使う。`es-review`, `gakuchika`, `motivation`, `interview`, `company-info-search`, `rag-ingest`, `selection-schedule` の各 feature 変更で対応する `make test-e2e-functional-local-*` を 1 セッション 1 回だけ案内する。最終 block は repo-managed `.githooks/pre-commit` が担当する。

Codex 単体 checkpoint:

- `$HOME/.codex/sessions/career_compass/test-categories-$SESSION_ID`
- `$HOME/.codex/sessions/career_compass/codex-commit-delegation-$SESSION_ID`
- `$HOME/.codex/sessions/career_compass/push-approved-$SESSION_ID`
- `$HOME/.codex/sessions/career_compass/release-approved-$SESSION_ID`
- `$HOME/.codex/sessions/career_compass/autonomy-intent-$SESSION_ID.json`
- `$HOME/.codex/sessions/career_compass/autonomy-manifest-$SESSION_ID.json`
- `$HOME/.codex/sessions/career_compass/staging-verified-$HEAD_SHA`

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

## 5.3 Codex MCP チャネル（デュアルチャネル構成）

`delegate.sh`（batch execution）に加え、Codex MCP（対話的実行）が利用可能。Claude Code を司令塔、Codex MCP を実装エンジニアとして運用する。

### チャネル比較

| 項目 | delegate.sh | Codex MCP |
|---|---|---|
| 呼び出し方 | `bash scripts/codex/delegate.sh <mode>` | `mcp__codex__codex(prompt, cwd, profile, ...)` |
| 実行モデル | fire-and-forget (one-shot) | 対話的 (`threadId` で継続可能) |
| 安全ゲート | Claude 側 hooks + Codex 側 hooks | Codex 側 hooks のみ（`cwd` 指定時） |
| アーティファクト | `.codex/state/handoffs/{id}/` | Claude Code のコンテキストに直接返却 |
| 用途 | batch execution (4 モード) | 対話的実装、サブエージェント並列調査 |
| プロファイル | なし（モード別に固定） | `review_only` / `heavy_impl` / `small_auto` |

### プロファイル定義

`~/.codex/config.toml` に 3 プロファイルを定義。CLI 直接利用には影響しない（`--profile` で明示指定時のみ有効）。

| profile | sandbox | approval | 用途 |
|---|---|---|---|
| `heavy_impl` | workspace-write | on-request | 重い実装、テスト追加、リファクタ |
| `review_only` | read-only | never | 調査、レビュー、サブエージェント並列調査 |
| `small_auto` | workspace-write | never | docs/test/文言の軽微修正 |

### 既知の制限

- MCP 経由では Claude 側の hooks（`impl-start-codex-gate`, `commit-codex-gate` 等）は発火しない
- MCP 経由の Codex 出力は handoff ディレクトリに保存されない
- commit/push は Claude Code 側で行うため、既存の commit/push ゲートは引き続き有効
- `cwd` を正しく指定しないと、プロジェクトの `.codex/config.toml` / hooks / agents がロードされない

## 6. Config

`.codex/config.toml` では次を管理する。

- `[features]`
  - `hooks = true`
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
