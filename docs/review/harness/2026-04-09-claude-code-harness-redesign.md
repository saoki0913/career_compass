# Claude Code ハーネス再設計記録（2026-04-09）

> 本ドキュメントは再設計時点の一次記録（履歴）です。現行状態の詳細リファレンスと運用ガイドは [`docs/ops/AI_HARNESS.md`](../ops/AI_HARNESS.md) を参照してください。

運用 3〜4 か月で蓄積した歪みを解消するため、`CLAUDE.md` / skills / agents / commands / hooks / MCP を総入れ替えした。公式仕様（hooks-guide、skills、MCP、sub-agents）に準拠し、generator → agent → MCP/hooks → CLAUDE.md の順で実施。

## 主な問題点（Before）
- `CLAUDE.md` の Skill Auto-Trigger Rules（140 行）は実質ドキュメントのみで、スキル起動は実際には `SKILL.md` の description マッチで動く
- サブエージェントは汎用 `backend-architect.md` 1 個のみ
- スキル 40 個の出自が generated / symlinked / hand-written の 3 系統で混在
- MCP サーバーゼロ（Context7 不在で framework docs 注入なし）
- `CLAUDE.md` が 363 行に肥大化し、毎会話で system prompt を圧迫
- `.kiro/steering/*` を参照していたが未作成
- generator を直さずに `.claude/skills/` を整理しても次の sync で巻き戻る

## 実施内容

### Phase 0. Generator 基盤の再設計
- `scripts/agent-pipeline/sync-pipeline.mjs` から `.claude/commands/` への書き出しを削除し、`.claude/skills/` 一本化
- `private/agent-pipeline/skills/` から `context-manager`, `grill-me`, `performance-engineer` を削除
- hand-written skills（`release-automation`, `railway-ops`, `supabase-ops`, `improve-search`）を generator 化
- `scripts/agent-pipeline/sync-pipeline.test.mjs` の期待値を `.claude/commands/` 未生成に更新

### Phase 1. 高頻度 6 サブエージェント導入
`.claude/agents/` に以下を作成（model / tools / skills を各 agent ごとに厳密化）：
- `prompt-engineer` (opus) — `backend/app/prompts/*`, LLM 出力品質
- `fastapi-developer` (sonnet) — FastAPI router, SSE, Pydantic
- `nextjs-developer` (sonnet) — App Router pages / API, hooks
- `ui-designer` (sonnet) — `src/components/**`, marketing LP visuals
- `code-reviewer` (opus) — 品質レビュー, dead code, 500 行超ファイル
- `release-engineer` (sonnet) — `make deploy`, provider CLI, secrets sync

### Phase 2. MCP 導入と残り 7 agent 追加
- **Context7**（`--scope user`）— 全プロジェクト共通で Claude / OpenAI / FastAPI / Next.js / Drizzle などの最新 docs を注入
- **Playwright**（`--scope project`, `.mcp.json`）— `ui-designer` / `test-automator` からの interactive E2E
- 残り 7 agent を追加: `rag-engineer`, `search-quality-engineer`, `database-engineer`, `security-auditor`, `test-automator`, `architect`, `product-strategist`

CLI 代替ありの MCP（Supabase、Railway、Vercel、GitHub）は導入せず、`supabase` / `railway` / `vercel` / `gh` CLI を agent system prompt から直接使う方針とした。

### Phase 3. Hooks 導入（公式 matcher / if 仕様準拠）
`.claude/settings.json` + `.claude/hooks/*.sh` を作成。すべて実行権限付与済み。
| hook | イベント | 目的 |
|---|---|---|
| `ui-preflight-reminder.sh` | PreToolUse (Edit\|Write) | UI ファイル編集前に `ui:preflight` リマインダ |
| `git-push-guard.sh` | PreToolUse (Bash) | `git push --force` 系を block、main/develop push を警告 |
| `secrets-guard.sh` | PreToolUse (Read\|Bash) | `codex-company/.secrets/` 直接アクセスを block |
| `prompt-eval-reminder.sh` | PostToolUse (Edit\|Write) | prompt / LLM 変更後に eval 提案を出す |
| `maintainability-reminder.sh` | PostToolUse (Edit\|Write) | TS/TSX/PY 編集 5 回ごとに dead code 点検を促す |
| `session-orientation.sh` | SessionStart (startup\|resume) | git status / 直近 5 コミット / active agents を context 注入 |

matcher はツール名の regex のみ、パス / コマンド判定は script 内で `jq -r '.tool_input.*'` で行う（公式仕様）。dry-run 検証 OK（force block=2, secrets block=2, UI warning=0, prompt reminder=0, counter=5 で発火）。

### Phase 4. CLAUDE.md スリム化（363 → 121 行）
- 削除: Skill Auto-Trigger Rules 全 14 セクション、Current App Structure、Data Model Notes、Development Commands、Key File Locations、`.kiro/steering/*` 参照
- 追加: **Subagent Routing** 表（変更対象 → 委譲先 agent の早見表）
- 残: Project Overview / Target Users / Tech Stack / Business Rules / Core Architecture Notes（非自明フローのみ）/ API Error Handling / UI Change Workflow / Key Commands / Documentation Rules
- `AGENTS.md` を `cp` で byte-identical に同期

### Phase 5. クリーンアップ
- `.claude/agents/backend-architect.md` を削除（新 13 agents で置換）
- `.codex/` / `.cursor/` / `private/agent-pipeline/cursor-prompts/` 配下の削除済みスキル残骸を整理
- `.kiro/steering/` 参照が他に残っていないことを grep で確認

## 最終状態

| 項目 | Before | After |
|---|---|---|
| CLAUDE.md 行数 | 363 | 121 |
| `.claude/agents/` | 1（汎用テンプレ） | 13 |
| `.claude/skills/` | 40（3 系統混在） | 30（25 generated + 5 symlink） |
| `.claude/commands/` | 27（generator 由来 24 + 手書き 3） | 3（真のワークフローのみ） |
| `.claude/hooks/` | 0 | 6 |
| MCP サーバー | 0 | 2（context7 user scope, playwright project scope） |

## Agent × Skill 割当の最終形

| agent | model | 主な skill |
|---|---|---|
| prompt-engineer | opus | prompt-engineer, ai-writing-auditor, llm-architect |
| fastapi-developer | sonnet | fastapi-developer |
| nextjs-developer | sonnet | nextjs-developer, vercel-react-best-practices |
| ui-designer | sonnet | ui-ux-pro-max |
| code-reviewer | opus | code-reviewer, refactoring-specialist, codex-review |
| release-engineer | sonnet | release-automation, railway-ops, supabase-ops |
| rag-engineer | sonnet | rag-engineer, hybrid-search-implementation |
| search-quality-engineer | sonnet | nlp-engineer, improve-search |
| database-engineer | sonnet | postgres-pro, database-optimizer |
| security-auditor | opus | security-auditor, payment-integration |
| test-automator | sonnet | test-automator, tdd |
| architect | opus | architecture-gate, improve-architecture, write-prd, prd-to-issues |
| product-strategist | sonnet | ux-researcher, competitive-analyst, seo-specialist |

## 検証

```bash
npm run test:agent-pipeline        # 1/1 pass
npm run agent-pipeline:sync        # 成功、idempotent
claude mcp list                    # context7, playwright 両方 Connected
wc -l CLAUDE.md                    # 121
diff CLAUDE.md AGENTS.md           # 差分なし
```

hooks の dry-run: 6 本すべて期待どおりの exit code / 出力。

## 今後の運用

1. 1 週間 dogfood し、delegation の当たり具合と hook の邪魔度を観測
2. Phase 2 以降で追加した 7 agent のうち使用頻度が低いものは description を調整
3. Context7 が docs 注入で補えるケースを増やし、agent system prompt の固定情報を削減
4. `/simplify` + maintainability hook の効果測定（dead code 指摘回数を記録）

## 参照
- 再設計プラン: `/Users/saoki/.claude/plans/lexical-jumping-rainbow.md`
- Claude Code Hooks Guide: https://code.claude.com/docs/en/hooks-guide
- Claude Code Skills: https://code.claude.com/docs/en/skills
- Claude Code MCP: https://code.claude.com/docs/en/mcp
- Claude Code Sub-agents: https://code.claude.com/docs/en/sub-agents
