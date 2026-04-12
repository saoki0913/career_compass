# Career Compass ハーネス設計 厳密レビュー

> **レビュー日**: 2026-04-12
> **対象**: `.claude/`, `.codex/`, `.cursor/`, `.agents/`, `.mcp.json`, `CLAUDE.md`, `AGENTS.md`, `scripts/agent-pipeline/sync-pipeline.mjs`
> **正本参照**: [`docs/ops/AI_HARNESS.md`](../ops/AI_HARNESS.md) (最終確認 2026-04-11)
> **再設計記録**: [`docs/review/harness/2026-04-09-claude-code-harness-redesign.md`](./2026-04-09-claude-code-harness-redesign.md)
> **評価方針**: 厳しめ。2026 年 4 月時点の Claude Code / Cursor / Codex のベストプラクティスに照らし、不足と乖離を明確にする。

---

## 1. エグゼクティブサマリー

**総合評価: B+**

Claude Code をメインツールとした場合、canonical → mirror パターン、13 サブエージェント体制、8 hook ガードレール、段階的 pipeline（gate → PRD → issues → TDD）の組み合わせは個人開発として非常に成熟している。しかし、以下 5 点の構造的な問題がある。

1. **参照スキルの実在性が保証されていない** — 5 種類のスキルが agent 定義で参照されているのに `.claude/skills/` に存在せず、user scope (`~/.claude/skills/`) または `.agents/skills/` にしかない。別環境・別ユーザーでは agent が意図通り動かない
2. **Notion MCP が宙に浮いている** — `.mcp.json` に定義されているが、13 agent のどの定義にも利用手順が書かれていない
3. **Cursor / Codex のハーネスが実質不在** — skill mirror はあるが、routing / hooks / MCP / セキュリティ設定が欠落しており、Claude Code との機能パリティが極めて低い
4. **opus 偏重のコスト問題** — 再設計時は opus 4 / sonnet 9 だったのが opus 11 / sonnet 2 に膨張。変更根拠の記録なし
5. **2026 新機能の未活用** — HTTP hooks, Prompt hooks, Agent hooks, FileChanged / SubagentStart / SessionEnd 等の新イベントが未採用

---

## 2. 評価軸と詳細レビュー

### 2.1 設計思想とアーキテクチャ — 評価: A-

#### 強み

**canonical → mirror パターン**は本ハーネスの最大の強み。`private/agent-pipeline/skills/*.md` を単一の正本とし、`sync-pipeline.mjs` で 4 ツール向けに機械的展開する設計は、手動管理のドリフトを構造的に排除する。

```
private/agent-pipeline/skills/*.md (canonical)
        │
        ▼  sync-pipeline.mjs
        ├── .claude/skills/{name}/SKILL.md
        ├── .codex/skills/{name}/SKILL.md
        ├── .codex/commands/{name}.md
        └── .cursor/rules/{name}.mdc
```

**CLAUDE.md のスリム化**（363 → 121 行）は正しい判断。system prompt 圧迫を避けつつ、Subagent Routing 表という「判断に直結する情報」だけを残している。

**pipeline 設計**（`architecture-gate` → `write-prd` → `prd-to-issues` → `tdd`）は、AI による継ぎ足し実装の負債蓄積を防ぐ仕組みとして効果的。`BLOCK` → `improve-architecture` → RFC の昇格パスも明確。

#### 懸念

- `.kiro/steering/` が未作成のまま。ワークスペースルートの `/Users/saoki/CLAUDE.md` が `.kiro/specs/` を参照しているが、career_compass に `.kiro/` ディレクトリ自体が存在しない。Spec-Driven Development フレームワークとの関係が不明確。
- `AI_HARNESS.md` が 555 行に達しており、CLAUDE.md のスリム化とは逆に、参照頻度の低い詳細が肥大化している。

---

### 2.2 サブエージェント設計の妥当性 — 評価: B

#### 責務境界

13 agent の責務分離は概ね適切。特に `ui-designer` ↔ `nextjs-developer` の境界（ビジュアル vs ロジック）が両方の agent 定義で明文化されている点は良い。

`architect` が gate → PRD → RFC の一貫したフローを持ち、領域横断変更の起点として機能する設計も妥当。

#### model 選択の問題: opus 11 / sonnet 2

**再設計記録（2026-04-09）**では以下の方針が記載されている:

> **opus**（4 agents）: 設計判断、品質審査、セキュリティ監査、プロンプト最適化
> **sonnet**（9 agents）: 反復速度が重要な領域

しかし **運用リファレンス（2026-04-11）** では `opus 11 / sonnet 2` に変更されており、変更理由の記録がない。

| agent | 再設計時 | 現行 | sonnet 降格候補? |
|-------|---------|------|-----------------|
| architect | opus | opus | -- |
| prompt-engineer | opus | opus | -- |
| security-auditor | opus | opus | -- |
| code-reviewer | opus | opus | -- |
| fastapi-developer | sonnet | **opus** | 候補。実装タスクの大半は sonnet で十分 |
| nextjs-developer | sonnet | **opus** | 候補。同上 |
| ui-designer | sonnet | **opus** | 候補。ビジュアル実装は sonnet で十分 |
| database-engineer | sonnet | **opus** | 候補。スキーマ変更は定型的 |
| rag-engineer | sonnet | **opus** | 候補。パイプライン実装は sonnet で十分 |
| search-quality-engineer | sonnet | **opus** | 微妙。品質改善ループは判断が重要 |
| product-strategist | sonnet | **opus** | 候補。UX/SEO 分析は sonnet で十分 |
| test-automator | sonnet | sonnet | -- |
| release-engineer | sonnet | sonnet | -- |

**推奨**: fastapi-developer, nextjs-developer, ui-designer, database-engineer, product-strategist の 5 agent は sonnet に戻す検討を推奨。opus 11 体制のコストは sonnet 比で約 5 倍。

#### tools 指定

- `release-engineer` は `Edit` / `Write` を持たない（`Read, Bash, Grep, Glob`）。release scripts の修正が必要な場合に不便。意図的であれば問題ないが、明示的な理由が未記載。
- `product-strategist` は `WebFetch` を持つが `Bash` を持たない。`curl` でのデータ取得ができない点は意図的か不明。

---

### 2.3 各サブエージェントの MCP サーバー利用状況 — 評価: C+

現行の MCP: `playwright` (project scope), `notion` (project scope), `context7` (user scope)

#### 全 agent x MCP マトリクス

| agent | Context7 | Playwright | Notion | 評価 |
|-------|----------|------------|--------|------|
| architect | 未参照 | 未参照 | 未参照 | **要改善**。フレームワーク横断の設計判断に Context7 が有用 |
| prompt-engineer | 明記あり | 未参照 | 未参照 | **問題**。Notion MCP が存在するのに prompt registry 連携の手順なし |
| security-auditor | 明記あり | 未参照 | 未参照 | 適切 |
| code-reviewer | 明記あり | 未参照 | 未参照 | 適切 |
| fastapi-developer | 明記あり | 未参照 | 未参照 | 適切 |
| nextjs-developer | 明記あり | 未参照 | 未参照 | 妥当（UI は ui-designer 委譲） |
| ui-designer | 曖昧 | 「Phase 2 以降」 | 未参照 | **問題**。playwright は既に `.mcp.json` にあるのに未活用 |
| database-engineer | "if available" | 未参照 | 未参照 | 適切 |
| rag-engineer | "if available" | 未参照 | 未参照 | 適切 |
| search-quality-engineer | **未参照** | 未参照 | 未参照 | **欠落**。NLP/検索ライブラリの docs 注入なし |
| test-automator | "if available" | **明記あり** | 未参照 | 良好。Playwright 利用手順が具体的 |
| release-engineer | 未参照（意図的） | 未参照 | 未参照 | 妥当。CLI 代替を明記 |
| product-strategist | **未参照** | 未参照 | 未参照 | **欠落**。LP 検証に Playwright、SEO 調査に Context7 が有用 |

#### 発見事項

**Critical: Notion MCP の agent 連携欠落**

`.mcp.json` に `notion` サーバーが定義されている:

```json
{
  "mcpServers": {
    "notion": {
      "type": "http",
      "url": "https://mcp.notion.com/mcp"
    }
  }
}
```

しかし 13 agent のどの定義にも Notion MCP の利用手順が書かれていない。`AI_HARNESS.md` 6.1 節には「Notion Prompt Registry と参考 ES Database の取得」が用途として記載されているが、`prompt-engineer` agent にその利用方法が記載されていない。MCP を導入しておきながら agent 側で活用されていない。

**High: Context7 参照の不統一**

Context7 の参照パターンが 3 通り混在している:

1. **明記** (手順付き): prompt-engineer, security-auditor, code-reviewer, fastapi-developer, nextjs-developer — 具体的な `mcp__context7__resolve-library-id` → `mcp__context7__query-docs` の 2 ステップ
2. **曖昧** ("if available"): ui-designer, database-engineer, rag-engineer, test-automator — 手順なし
3. **未参照**: architect, search-quality-engineer, release-engineer, product-strategist

統一フォーマットで全 agent に記載すべき（release-engineer のみ「不要」を明示）。

**High: Playwright MCP の活用率**

`.mcp.json` に playwright が定義されているが、明示的に活用している agent は `test-automator` のみ。`ui-designer` は「Phase 2 以降」と棚上げしているが、Phase 2 がいつかの定義がなく、実質的に無期限棚上げ。

---

### 2.4 スキル割り当ての整合性検証 — 評価: C+

#### 件数

| カウント方法 | 数 |
|-------------|---|
| `AI_HARNESS.md` 記載 | 30 |
| `.claude/skills/` 実ディレクトリ | 25 |
| `.claude/skills/` symlink | 5 |
| 合計 | 30 (一致) |

ただし `.claude/skills/x-mentor/` が `AI_HARNESS.md` 3.1 節の一覧表に**記載されていない**（ドキュメント漏れ）。

#### symlink の管理問題

以下 5 skill は `.agents/skills/` へのシンボリックリンク:

| skill | symlink target |
|-------|---------------|
| `prompt-engineer` | `../../.agents/skills/prompt-engineer` |
| `rag-engineer` | `../../.agents/skills/rag-engineer` |
| `ui-ux-pro-max` | `../../.agents/skills/ui-ux-pro-max` |
| `vercel-react-best-practices` | `../../.agents/skills/vercel-react-best-practices` |
| `hybrid-search-implementation` | `../../.agents/skills/hybrid-search-implementation` |

これらは `sync-pipeline.mjs` の管轄外。canonical (`private/agent-pipeline/skills/`) を編集しても、これら 5 skill には反映されない。canonical → mirror の一貫性が崩れている。

`sync-pipeline.mjs` は `private/agent-pipeline/skills/` のファイルを処理して `.claude/skills/{name}/SKILL.md` に書き出すが、symlink 先の `.agents/skills/` は書き出し対象に含まれない。つまり:

- **pipeline で管理される skill**: 25 本（canonical → mirror）
- **手動管理の skill**: 5 本（symlink 先を直接編集）

この二重管理が文書化されていない。

#### 外部由来スキルの品質乖離

- `rag-engineer/SKILL.md` — source が `vibeship-spawner-skills (Apache 2.0)`。汎用的な RAG アーキテクト向けの英語テキストで、career_compass の ChromaDB + BM25 + Cross-Encoder 構成との具体的な対応が薄い。一方で `rag-engineer` agent 定義自体は career_compass 固有のファイルパスと手順を持っている。skill と agent の内容が乖離している。
- `ui-ux-pro-max` — 387 行 + `scripts/` + `data/` の巨大スキル。career_compass 固有の shadcn/ui + Tailwind 4 のガイダンスが汎用的な「50 styles / 21 palettes」の中に埋もれる。

#### agent が参照するスキルの実在確認

| agent | 参照スキル | `.claude/skills/` | `.agents/skills/` | `~/.claude/skills/` | 到達性 |
|-------|-----------|-------------------|-------------------|---------------------|--------|
| prompt-engineer | `ai-product` | 不在 | 不在 | **存在** | user scope 依存 |
| rag-engineer | `ai-product` | 不在 | 不在 | **存在** | user scope 依存 |
| code-reviewer | `codex-review` | 不在 | **存在** | 不在 | `.claude/skills/` にリンクなし。Claude Code の description マッチで発見される可能性はあるが保証なし |
| security-auditor | `better-auth-best-practices` | 不在 | 不在 | **存在** | user scope 依存 |
| security-auditor | `security-review` | 不在 | 不在 | **存在** | user scope 依存 |
| ui-designer | `frontend-design` | 不在 | 不在 | **存在** | user scope 依存。agent 内に「loaded from personal scope」記載あり |

**問題**: 6 スキルのうち 5 つが `~/.claude/skills/`（user scope）にのみ存在する。これはローカル環境に依存しており、別の開発者やマシンでは agent が意図通り動作しない。ポータビリティが担保されていない。

`codex-review` は `.agents/skills/` に存在するが `.claude/skills/` にリンクがない。Claude Code が `.agents/skills/` をスキル検索パスに含むかどうかはドキュメント上不明確。

---

### 2.5 Hooks の品質と 2026 ベストプラクティス適合 — 評価: B-

#### 適合している点

- **command hook + exit code パターン**: 公式仕様準拠。block (exit 2) と warn (exit 0) の使い分けが一貫している
- **セキュリティ hook**: `git-push-guard.sh` (force push block) と `secrets-guard.sh` (secrets 直接読み取り block) は実害防止に直結
- **dry-run 手順**: `AI_HARNESS.md` 5.4 節に再現可能な検証コマンドが文書化されている
- **`$CLAUDE_PROJECT_DIR` 変数**: リポジトリパスのハードコードを避けている
- **session-orientation**: branch / git status / 直近コミット / active agents の自動注入は context 効率化として優れている

#### 不適合: 2026 新機能の未活用

2026 年の Claude Code は以下の hook handler type を提供している:

| handler type | 現行ハーネスでの利用 | ベストプラクティスでの用途 |
|-------------|-------------------|------------------------|
| **command** | 8 本すべて | シェルスクリプトで判定・出力 |
| **HTTP** | **未使用** | 外部 CI/Slack/監査ログへの POST |
| **prompt** | **未使用** | LLM による yes/no 判定（コード品質、セキュリティチェック） |
| **agent** | **未使用** | サブエージェント起動による複雑な検証 |

2026 年の Claude Code は以下のライフサイクルイベントを提供している:

| event | 現行ハーネスでの利用 | ベストプラクティスでの用途 |
|-------|-------------------|------------------------|
| SessionStart | `session-orientation.sh` | 作業コンテキスト注入 |
| **SessionEnd** | **未使用** | セッションサマリー生成、未完了タスク記録 |
| PreToolUse | 3 hook | セキュリティガード |
| PostToolUse | 4 hook | リマインダー |
| **FileChanged** | **未使用** | 自動 lint、ファイル監視 |
| **SubagentStart/Stop** | **未使用** | agent 起動ログ、コスト追跡 |
| **PreCompact/PostCompact** | **未使用** | コンテキスト圧縮前後のチェックポイント |
| **Stop** | **未使用** | 完了時の検証 |

#### PostToolUse の過密問題

`Edit|Write` matcher に 4 hook がバインドされている:

```json
{
  "matcher": "Edit|Write",
  "hooks": [
    { "command": "prompt-eval-reminder.sh" },
    { "command": "maintainability-reminder.sh" },
    { "command": "schema-change-reminder.sh" },
    { "command": "test-change-reminder.sh" }
  ]
}
```

毎回のファイル編集で 4 プロセスが起動し、それぞれが `jq` でパス判定を行う。大半は対象外パスで即 `exit 0` するが、プロセス起動コストが累積する。

**推奨**: 1 つのディスパッチャスクリプトに統合し、パス判定を 1 回で完了させる。

```bash
#!/bin/bash
# post-edit-dispatcher.sh: 4 hook を 1 プロセスで処理
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
# 1 回のパス判定で適切なリマインダーを出力
```

#### maintainability-reminder のカウンタ管理

`$HOME/.claude/sessions/career_compass/edit-count-{SESSION_ID}` でファイル管理しているが、セッション終了時にクリーンアップされない。長期運用でファイルが蓄積する。SessionEnd hook でクリーンアップすべき。

---

### 2.6 Cursor / Codex 向けハーネスの評価 — 評価: D

#### Cursor: skill mirror のみ、実質的なハーネスなし

| 項目 | 状態 | 問題 |
|------|------|------|
| `.cursor/rules/*.mdc` | 26 ファイル (25 pipeline + 1 手動) | すべて `alwaysApply: false`。手動呼び出し前提 |
| `.cursorignore` | **不在** | `.env*`, `codex-company/.secrets/`, `*.pem`, `private/` が除外されていない |
| `.cursor/mcp.json` | **不在** | Cursor 向け MCP 設定なし。playwright / notion が使えない |
| Agent routing | **なし** | `AGENTS.md` を手動参照するしかない |
| Plan Mode / Agent Mode ガイダンス | **なし** | Cursor の Plan Mode 活用手順が未文書化 |

**`.cursorignore` の不在はセキュリティリスク**: Cursor のエージェントが `codex-company/.secrets/` 配下のファイルにアクセスできる状態にある。Claude Code では `secrets-guard.sh` hook で block しているが、Cursor にはこのガードレールがない。

**`alwaysApply: false` の問題**: Cursor のベストプラクティスでは、プロジェクト共通の必須ルール（コーディング規約、セキュリティルール、routing 表）は `alwaysApply: true` にすべき。現状ではユーザーが手動で呼び出さない限りルールが適用されない。

#### Codex: mirror はあるが設定ファイルなし

| 項目 | 状態 | 問題 |
|------|------|------|
| `.codex/skills/` | sync-pipeline で mirror | 動作するが Context7 等の MCP 参照なし |
| `.codex/commands/` | sync-pipeline で mirror | 動作 |
| `.codex/config.toml` | **不在** | `setup_commands`, `verification_commands`, MCP 設定なし |
| `AGENTS.md` | 存在 (root) | subdirectory `AGENTS.md` / `AGENTS.override.md` 未活用 |
| Codex MCP | **未設定** | `config.toml` の `[mcp_servers.*]` なし |

Codex のベストプラクティスでは `config.toml` に以下を設定すべき:

```toml
[setup]
commands = ["npm install", "cd backend && pip install -r requirements.txt"]

[verification]
commands = ["npm run lint", "npm run test:unit -- --run"]

[mcp_servers.context7]
command = "npx"
args = ["-y", "@upstash/context7-mcp"]

[mcp_servers.playwright]
command = "npx"
args = ["-y", "@playwright/mcp", "--headless"]
```

#### ツール間カバレッジ比較

| 機能 | Claude Code | Cursor | Codex |
|------|------------|--------|-------|
| Subagent routing 自動適用 | CLAUDE.md + agents/ | なし | AGENTS.md (root のみ) |
| Skill 自律起動 | description マッチ | alwaysApply:false (手動) | description マッチ |
| Hook ガードレール | 8 hook (block + warn) | なし | なし |
| MCP (project) | playwright + notion | なし | なし |
| MCP (user) | context7 | なし | なし |
| セキュリティ除外 | secrets-guard hook | .cursorignore 不在 | なし |
| Session context 注入 | session-orientation | なし | なし |
| Setup/Verify commands | なし (hook で代替) | なし | config.toml 不在 |

---

### 2.7 ドキュメント整合性 — 評価: B-

#### リンク切れ

`AI_HARNESS.md` に 2 箇所のリンク切れ:

1. **6 行目**: `[docs/review/2026-04-09-claude-code-harness-redesign.md](../review/2026-04-09-claude-code-harness-redesign.md)`
   → 実パス: `../review/harness/2026-04-09-claude-code-harness-redesign.md` (`harness/` サブディレクトリが欠落)

2. **4.2 節** (244 行目): 同じリンク
   → 同じ修正が必要

#### opus/sonnet 比率の不整合

| ドキュメント | opus | sonnet |
|-------------|------|--------|
| 再設計記録 (2026-04-09) | 4 | 9 |
| 運用リファレンス (2026-04-11) | 11 | 2 |

変更理由と変更日の記録がない。

#### skill 件数の不整合

`AI_HARNESS.md` 3.1 節の一覧表に `x-mentor` が含まれていない。`.claude/skills/x-mentor/` は実在するため、ドキュメント漏れ。

#### `.agents/skills/` の件数

`AI_HARNESS.md` 3.2 節は「14 skill」と記載しているが、実ディレクトリは **15** (`codex-review` が追加されている、または `x-mentor` がカウントから漏れている)。

---

## 3. 2026 ベストプラクティス適合チェックリスト

### Claude Code

| # | ベストプラクティス | 適合 | 根拠 |
|---|-------------------|------|------|
| 1 | CLAUDE.md は判断情報のみ、絶対ルールは hooks で強制 | **部分的** | 大半の hard rules は CLAUDE.md にしかない。hooks は 3 本の block のみ |
| 2 | Subagent で研究タスクを隔離しコンテキスト汚染を防ぐ | **適合** | 13 agent が独立 context window で動作 |
| 3 | context window の管理を意識した設計 | **適合** | session-orientation で最小コンテキスト注入、skill は description マッチ |
| 4 | HTTP / Prompt / Agent hooks の活用 | **未適合** | command hook のみ使用 |
| 5 | FileChanged / SubagentStart 等の新イベント活用 | **未適合** | 2 イベントのみ (PreToolUse, PostToolUse, SessionStart) |
| 6 | SessionEnd での記録・クリーンアップ | **未適合** | SessionEnd hook 不在 |
| 7 | hook は CLAUDE.md より信頼性が高い (100% vs ~80%) | **理解済** | セキュリティ系は hook で block。ただし UI preflight 等は hook ではなく warn のみ |
| 8 | verification criteria で自己検証 | **部分的** | dry-run は文書化されているが CI 統合なし |

### Cursor

| # | ベストプラクティス | 適合 | 根拠 |
|---|-------------------|------|------|
| 9 | `.cursorignore` でセンシティブファイル除外 | **未適合** | ファイル不在 |
| 10 | `alwaysApply: true` で必須ルール自動注入 | **未適合** | 26 ルール全て `false` |
| 11 | `.cursor/mcp.json` で MCP 共有 | **未適合** | ファイル不在 |
| 12 | Anti-Hallucination Rule | **未適合** | パッケージ実在確認のルールなし |
| 13 | Interface-First Development | **未適合** | 型定義先行のルールなし |
| 14 | Plan Mode の活用ガイダンス | **未適合** | 未文書化 |

### Codex

| # | ベストプラクティス | 適合 | 根拠 |
|---|-------------------|------|------|
| 15 | `config.toml` で setup/verify commands | **未適合** | ファイル不在 |
| 16 | subdirectory `AGENTS.md` | **未活用** | root のみ |
| 17 | `AGENTS.override.md` | **未活用** | 不在 |
| 18 | Codex MCP 設定 (`config.toml`) | **未適合** | MCP 設定なし |
| 19 | Goal/Context/Constraints/Done-when 構造化 | **部分的** | AGENTS.md にはあるが Codex 最適化されていない |
| 20 | `.agents/skills/` の活用 | **適合** | 15 skill が存在し、一部は Codex から到達可能 |

### 共通

| # | ベストプラクティス | 適合 | 根拠 |
|---|-------------------|------|------|
| 21 | canonical → mirror の一貫性 | **部分的** | symlink 5 本が sync-pipeline 管轄外 |
| 22 | agent が参照する skill の実在保証 | **未適合** | 5 skill が user scope 依存、1 skill が `.agents/` のみ |
| 23 | MCP の agent 連携文書化 | **未適合** | Notion MCP が全 agent で未連携 |
| 24 | ドキュメントの件数・リンク整合 | **未適合** | リンク切れ 2 箇所、件数ずれ複数 |

**適合率**: 24 項目中 適合 3 / 部分適合 5 / 未適合 16 = **33%**

---

## 4. 改善提案

### P0: 即座に修正すべき (品質・安全性に直結)

#### P0-1. 参照スキルの実在性保証

agent 定義で参照されているが `.claude/skills/` に存在しない 6 スキルへの対処:

| スキル | 現状の所在 | 推奨対処 |
|--------|-----------|----------|
| `ai-product` | `~/.claude/skills/` | `.agents/skills/` にコピーし `.claude/skills/` から symlink |
| `codex-review` | `.agents/skills/` | `.claude/skills/` から symlink 追加 |
| `better-auth-best-practices` | `~/.claude/skills/` | `.agents/skills/` にコピーし `.claude/skills/` から symlink |
| `security-review` | `~/.claude/skills/` | `.agents/skills/` にコピーし `.claude/skills/` から symlink |
| `frontend-design` | `~/.claude/skills/` | `.agents/skills/` にコピーし `.claude/skills/` から symlink |

または、agent 定義から user scope 依存のスキル参照を削除し、agent 定義自体にそのスキルの核心部分を組み込む。

#### P0-2. Notion MCP の agent 連携

`prompt-engineer` agent に Notion MCP の利用手順を追加:

```markdown
## Notion MCP の使い方
参考 ES Database や Prompt Registry を取得するとき:
1. `mcp__notion__search` で対象ページ/DB を検索
2. `mcp__notion__get_page` で内容を取得
Notion MCP は project scope で提供される。初回は OAuth 認証が必要。
```

#### P0-3. `.cursorignore` の作成

```
# Secrets
codex-company/.secrets/
.env
.env.*
*.pem

# Private pipeline source
private/

# Generated (read-only)
.claude/skills/
.codex/
.cursor/rules/
```

#### P0-4. リンク切れ修正

`AI_HARNESS.md` の 2 箇所:
- 6 行目: `../review/2026-04-09-...` → `../review/harness/2026-04-09-...`
- 244 行目: 同上

### P1: 1-2 週間以内 (運用品質の向上)

#### P1-1. Context7 参照の統一

全 agent に以下の統一フォーマットを追加:

```markdown
## Context7 の使い方
ライブラリ/フレームワークのドキュメントが必要なとき:
1. `mcp__context7__resolve-library-id` でライブラリ ID を取得
2. `mcp__context7__query-docs` で関連セクションを取得
Context7 は user scope MCP で提供される。利用不可の場合はスキップしてよい。
```

追加が必要な agent: `architect`, `search-quality-engineer`, `product-strategist`。
`release-engineer` は「Context7 不要（CLI 操作のみ）」と明示。

#### P1-2. Playwright MCP の実活用

- `ui-designer`: 「Phase 2 以降」を削除し、Playwright MCP の利用手順を追加
- `product-strategist`: LP 検証用に Playwright MCP の利用手順を追加

#### P1-3. PostToolUse hooks の統合

4 つの PostToolUse hook を 1 つのディスパッチャスクリプトに統合:

```
.claude/hooks/post-edit-dispatcher.sh
  ├── prompt-eval-reminder (path match)
  ├── maintainability-reminder (extension + counter)
  ├── schema-change-reminder (path match)
  └── test-change-reminder (path match)
```

#### P1-4. opus → sonnet の再評価

fastapi-developer, nextjs-developer, ui-designer, database-engineer, product-strategist を sonnet に変更する試行。1 週間の dogfood で品質劣化を計測し、問題なければ確定。

#### P1-5. `x-mentor` のドキュメント追記

`AI_HARNESS.md` 3.1 節の一覧表に `x-mentor` を追加。

#### P1-6. `.cursor/mcp.json` の作成

Cursor 向け MCP 設定ファイルを作成し、playwright と notion を共有:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp", "--headless"]
    }
  }
}
```

### P2: 次のハーネス改修時 (アーキテクチャ改善)

#### P2-1. symlink スキルの canonical 統合

選択肢 A: 5 symlink の正本を `private/agent-pipeline/skills/` に移し、sync-pipeline の管轄にする。
選択肢 B: symlink を「非 canonical」と明示的に位置付け、管理方針を `AI_HARNESS.md` に文書化する。

#### P2-2. Codex `config.toml` の導入

setup_commands, verification_commands, MCP 設定を含む `.codex/config.toml` を作成。

#### P2-3. Cursor routing rule の新設

`alwaysApply: true` の routing rule を新設し、Subagent Routing 表を Cursor でも自動適用:

```yaml
---
description: "Career Compass の必須ルール: セキュリティ・コーディング規約・agent routing"
alwaysApply: true
---
```

#### P2-4. 新 hook イベントの活用

| event | 用途 |
|-------|------|
| SessionEnd | セッションサマリー生成 + edit-count ファイルのクリーンアップ |
| FileChanged | 変更ファイルの自動 lint (`npm run lint -- <path>`) |
| SubagentStart | agent 起動ログを `docs/ops/agent-usage.log` に記録（コスト追跡用） |
| Stop | 完了時の `git status` サマリー |

#### P2-5. HTTP / Prompt hooks の導入

- **HTTP hook**: PostToolUse で変更サマリーを Slack/Discord に POST
- **Prompt hook**: PreToolUse で大規模ファイル編集前に LLM による「分割すべきか」判定

---

## 5. 付録: サブエージェント完全マトリクス

| agent | model | tools | project skills | user scope skills | Context7 | Playwright | Notion | 問題点 |
|-------|-------|-------|---------------|------------------|----------|------------|--------|--------|
| architect | opus | Read,Edit,Write,Grep,Glob,Bash | architecture-gate, improve-architecture, write-prd, prd-to-issues | -- | 未参照 | 未参照 | 未参照 | Context7 未参照 |
| prompt-engineer | opus | Read,Edit,Write,Grep,Glob,Bash | prompt-engineer(sym), ai-writing-auditor, llm-architect | ai-product | 明記 | 未参照 | 未参照 | Notion MCP 未連携、ai-product が user scope |
| security-auditor | opus | Read,Edit,Write,Bash,Grep,Glob | security-auditor, payment-integration | better-auth-best-practices, security-review | 明記 | 未参照 | 未参照 | 2 skill が user scope |
| code-reviewer | opus | Read,Grep,Glob,Edit,Bash | code-reviewer, refactoring-specialist | -- | 明記 | 未参照 | 未参照 | codex-review が .agents のみ |
| fastapi-developer | opus | Read,Edit,Write,Bash,Grep,Glob | fastapi-developer | -- | 明記 | 未参照 | 未参照 | sonnet 降格候補 |
| nextjs-developer | opus | Read,Edit,Write,Bash,Grep,Glob | nextjs-developer, vercel-react-best-practices(sym) | -- | 明記 | 未参照 | 未参照 | sonnet 降格候補 |
| ui-designer | opus | Read,Edit,Write,Bash,Grep,Glob | ui-ux-pro-max(sym) | frontend-design | 曖昧 | Phase2棚上 | 未参照 | sonnet 候補、Playwright 未活用、frontend-design が user scope |
| database-engineer | opus | Read,Edit,Write,Bash,Grep,Glob | postgres-pro, database-optimizer | -- | if available | 未参照 | 未参照 | sonnet 降格候補 |
| rag-engineer | opus | Read,Edit,Write,Bash,Grep,Glob | rag-engineer(sym), hybrid-search-implementation(sym) | ai-product | if available | 未参照 | 未参照 | ai-product が user scope、skill 内容が汎用的 |
| search-quality-engineer | opus | Read,Edit,Write,Bash,Grep,Glob | improve-search, nlp-engineer | -- | **未参照** | 未参照 | 未参照 | Context7 完全欠落 |
| test-automator | sonnet | Read,Edit,Write,Bash,Grep,Glob | test-automator, tdd | -- | if available | **明記** | 未参照 | 良好 |
| release-engineer | sonnet | Read,Bash,Grep,Glob | release-automation, railway-ops, supabase-ops | -- | 不要(明記) | 未参照 | 未参照 | Edit/Write なし (意図的?) |
| product-strategist | opus | Read,Edit,Write,Grep,Glob,WebFetch | competitive-analyst, ux-researcher, seo-specialist | -- | **未参照** | 未参照 | 未参照 | Context7/Playwright 未参照、sonnet 候補 |

**凡例**: (sym) = `.agents/skills/` への symlink

---

## 6. 結論

本ハーネスは **Claude Code 単体での開発には十分成熟している**。canonical → mirror パターン、段階的 pipeline、hook ガードレールの 3 層防御は模範的であり、個人開発としてはトップクラスの設計品質。

しかし、以下 3 点が今後のスケーラビリティと信頼性のボトルネックになる:

1. **ポータビリティの欠如**: 6 スキルが user scope 依存、Cursor / Codex のハーネスが実質不在。「このマシンの、このユーザーの、Claude Code でしか正しく動かない」状態
2. **MCP 活用の不徹底**: 3 MCP サーバーを導入しておきながら、13 agent 中 Notion は全 agent 未連携、Playwright は 1 agent のみ、Context7 は 4 agent が未参照
3. **2026 ベストプラクティスとのギャップ**: 適合率 33% (24 項目中 8 適合)。特に Cursor / Codex 側の未対応が大きい

P0 の 4 項目（スキル実在性、Notion 連携、.cursorignore、リンク切れ）を優先的に修正し、P1 で運用品質を底上げすることを推奨する。
