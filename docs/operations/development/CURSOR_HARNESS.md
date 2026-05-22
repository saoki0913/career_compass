# Cursor Harness 運用リファレンス

**最終確認**: 2026-04-17

この文書は `career_compass` における Cursor 用ハーネスの current state をまとめる。Cursor は Claude の hook/subagent 機構をそのまま持たないため、`AGENTS.md`、`.cursor/rules/*.mdc`、`private/agent-pipeline/cursor-prompts/*.md`、`.cursor/mcp.json` を組み合わせて等価な運用品質を出す。

## 1. 正本の置き場所

- ルーティング正本: `AGENTS.md` / `CLAUDE.md`
- Cursor core rule 正本: `.cursor/rules/career-compass-core.mdc`
- specialist rule 正本: `private/agent-pipeline/skills/*.md`
- Cursor prompt template 正本: `private/agent-pipeline/cursor-prompts/*.md`
- Cursor MCP 正本: `.cursor/mcp.json`

原則:
- `AGENTS.md` は変更対象から担当 agent を決める durable guidance
- `career-compass-core.mdc` は Cursor 全体に常時適用する guardrail
- specialist rule は generator で配布し、手編集しない
- Claude hook 依存の品質ゲートは rule / prompt / docs / test に置き換えて担保する

## 2. Cursor で担保する品質

Cursor では次を最低ラインにする。

- `AGENTS.md` の routing を起点に担当領域を切り替える
- `career-compass-core.mdc` で secrets / generated boundary / UI workflow / release escalation を常時注入する
- `.cursor/rules/*.mdc` で specialist workflow を利用する
- `.cursor/mcp.json` で Playwright / Notion を project scope で使えるようにする

対象外:
- Background Agents のセットアップ
- Claude の hook event と完全同型な deny / escalation 制御

## 3. Rules

### 3.1 `career-compass-core.mdc`

`alwaysApply: true` の手動 rule。次の guardrail を保持する。

- `AGENTS.md` / `CLAUDE.md` の Subagent Routing を優先する
- `codex-company/.secrets/` を直接読まない
- generated file を直接編集しない
- UI 変更では `ui:preflight` → `lint:ui:guardrails` → `test:ui:review` を守る
- release / deploy / security / architecture の高リスク変更は適切な specialist に寄せる

### 3.2 generated specialist rules

`private/agent-pipeline/skills/*.md` から `scripts/agent-pipeline/sync-pipeline.mjs` で `.cursor/rules/*.mdc` を生成する。

運用ルール:
- generator 管轄の `.cursor/rules/*.mdc` は手編集しない
- canonical を更新したら `node scripts/agent-pipeline/sync-pipeline.mjs` を実行する
- 生成 rule 数は harness test で監視する

## 4. MCP

`.cursor/mcp.json` は Claude / Codex と同じ 2 サーバーを持つ。

- `playwright`
  - interactive な browser 操作と UI review 用
- `notion`
  - Prompt Registry / 参考 ES 参照用

Cursor では MCP 構成を `.mcp.json` から自動生成しない。`.cursor/mcp.json` が正本。

## 5. 検証

```bash
npm run test:agent-pipeline
npm run test:cursor-harness
npm run test:harness
```

`test:cursor-harness` では最低限次を確認する。

- `.cursor/mcp.json` が playwright / notion を持つ
- `career-compass-core.mdc` が `alwaysApply: true` と必須 guardrail を持つ
- generated specialist rule 数が canonical と一致する
- `CURSOR_HARNESS.md` が source-of-truth を明示している
