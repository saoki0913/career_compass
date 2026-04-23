---
topic: harness
plan_date: 2026-04-14
based_on_review: harness/2026-04-12-harness-strict-review.md
status: 完了
implementation_level: 手順書レベル
last_progress: 2026-04-18
---

> **v4 以降の改善** は本計画書ではなく `.claude/plans/harness-improvement-plan-md-web-askuserq-stateless-avalanche.md` で追跡する。permissions.deny 追加、件数ドリフト detector、AI_HARNESS.md §7.4 stale 是正と §8 ハーネス観測性 新設が v4 のスコープ。

## 進捗スナップショット (2026-04-17)

| Task | 状態 | 備考 |
|------|------|------|
| H-1a skill コピー | 完了 | 2026-04-12 までに 5 スキルが `.claude/skills/` 上の symlink（`.agents/skills/` 指向）で揃い済み |
| H-1b AI_HARNESS 記載 | 完了 | 1.2.1 節に 10 スキルの手動管理表あり |
| H-1c Context7 統一 | 完了 | 13/13 agent に統一セクション、release-engineer は「Context7 は不要」明記 |
| H-1d Notion MCP | 完了 | Notion は active 利用中、`prompt-engineer.md` に利用手順あり |
| H-2a `.cursorignore` | 完了 (2026-04-17) | `secrets/`, `*.key`, `codex-company/` を追記 |
| H-2b `.codex/config.toml` | 完了 (2026-04-17) | `[routing]` 6 ルール + `[security] deny_patterns` を追加、tomllib パース確認済み |
| H-1e hooks 再点検 | 完了 (2026-04-17) | orphan 2 本を `PermissionRequest` / `PostToolUseFailure` で配線、AI_HARNESS.md 更新 |
| H-3a opus→sonnet | スキップ | ユーザー方針で opus 11 / sonnet 2 を維持（2026-04-17 判断） |

# ハーネス改善 実装ガイド

## 0. このドキュメントの読み方

- **対象読者**: ジュニアエンジニア（AI ハーネス設定の経験不問）
- **前提知識**: Git 基本操作、シンボリックリンクの概念、Markdown 編集
- **用語集**: 末尾「8. 用語集」を参照
- **関連ドキュメント**:
  - レビュー根拠: `docs/review/harness/2026-04-12-harness-strict-review.md`
  - ハーネス運用リファレンス: `docs/ops/AI_HARNESS.md`
  - エージェント定義: `.claude/agents/*.md`
  - スキルソース: `.agents/skills/`（canonical）、`.claude/skills/`（Claude Code 用）

---

## 1. 背景と目的

### なぜ必要か

2026-04-12 のハーネス厳格レビューで B+ 評価を受けた。主要な構造問題は:
- 6 スキルが user scope にしか存在せず、別環境で agent が意図通り動作しない
- Context7 参照が agent 間で不統一（明記 5 / 曖昧 4 / 未参照 4）
- Opus 偏重（11/13 が opus）で、実装タスク中心の agent にコスト過剰

### 完了後の期待状態

- 全 agent が参照するスキルが `.claude/skills/` に実在する
- 全 agent に統一フォーマットの Context7 セクションがある
- opus:sonnet 比率が 8:5（現行 11:2 から是正）
- `.cursorignore` と `.codex/config.toml` routing が存在する

### スコープ外

- HTTP/prompt/agent handler types の新規追加（運用ニーズ不明のため見送り）
- `sync-pipeline.mjs` のスキャン対象拡張（長期検討事項）
- Cursor rules の全面整備（H-2c は本計画では対象外）

---

## 2. 事前準備チェックリスト

- [ ] ブランチ作成: `feature/harness-improvement`
- [ ] 現在の agent 一覧を確認: `ls .claude/agents/*.md | wc -l` → 13 であること
- [ ] 現在の skill 一覧を確認: `ls .claude/skills/ | wc -l`
- [ ] `npm run test:agent-pipeline` が PASS すること（ベースライン取得）

---

## 3. タスク一覧

| ID | タスク名 | 対象ファイル | 推定工数 | 依存 | blast radius |
|----|---------|-------------|---------|------|-------------|
| H-1a | user-scope skill を project scope にコピー | `.claude/skills/` | 15min | なし | 低 (開発環境のみ) |
| H-1b | symlink 管理を AI_HARNESS.md に記載 | `docs/ops/AI_HARNESS.md` | 15min | なし | 低 (ドキュメントのみ) |
| H-1c | 13 agent の Context7 セクション統一 | `.claude/agents/*.md` (13件) | 30min | なし | 低 (開発環境のみ) |
| H-1d | Notion MCP ステータス解決 | `.mcp.json` | 15min | なし | 低 |
| H-2a | `.cursorignore` 更新 | `.cursorignore` | 10min | なし | 低 |
| H-2b | `.codex/config.toml` routing 追加 | `.codex/config.toml` | 15min | なし | 低 |
| H-3a | 5 agent を opus → sonnet にダウングレード | `.claude/agents/*.md` (5件) | 15min | なし | 低 |

**全タスク独立**: 依存関係なし。任意の順序で実行可能。

---

## 4. 各タスクの詳細手順

### Task H-1a: user-scope skill を project scope にコピー

> **2026-04-17 現状: 完了済み**。`.claude/skills/{ai-product, better-auth-best-practices, security-review, frontend-design, codex-review}` が `.agents/skills/` 配下を指す symlink として存在し、壊れた symlink はゼロ。以降の手順は歴史的記録。

#### 4.1a.1 目的

別環境でも agent が意図通りスキルを参照できるように、user scope (`~/.claude/skills/`) にのみ存在する 5 スキルを project scope (`.claude/skills/`) にコピーする。

#### 4.1a.2 対象ファイル

| ファイル | 操作 | 概要 |
|---------|------|------|
| `.claude/skills/ai-product/` | 新規 (symlink) | `.agents/skills/ai-product` が存在する場合は symlink |
| `.claude/skills/better-auth-best-practices/` | 新規 (symlink) | `.agents/skills/better-auth-best-practices` が存在する場合は symlink |
| `.claude/skills/security-review/` | 新規 (symlink) | `.agents/skills/security-review` が存在する場合は symlink |
| `.claude/skills/frontend-design/` | 新規 (symlink) | `.agents/skills/frontend-design` が存在する場合は symlink |
| `.claude/skills/codex-review/` | 新規 (symlink) | `.agents/skills/codex-review` → `../../.agents/skills/codex-review` |

#### 4.1a.3 手順

**Step 1: canonical ソースの存在確認**
- コマンド: `ls .agents/skills/ | grep -E "ai-product|better-auth|security-review|frontend-design|codex-review"`
- 存在するものは symlink で対応。存在しないものは `~/.claude/skills/` からディレクトリごとコピー

**Step 2: symlink 作成（canonical に存在するスキル）**
- 作業ディレクトリ: `.claude/skills/`
- 各スキルについて: `ln -s ../../.agents/skills/<skill-name> <skill-name>`
- 例: `cd .claude/skills && ln -s ../../.agents/skills/codex-review codex-review`

**Step 3: コピー（canonical に存在しないスキル）**
- `~/.claude/skills/<skill-name>/` から `.claude/skills/<skill-name>/` にディレクトリごとコピー
- `cp -r ~/.claude/skills/<skill-name> .claude/skills/<skill-name>`
- コピー後、`.agents/skills/` にも同じ内容をコピーして canonical ソースを作成

**Step 4: symlink の有効性確認**
- コマンド: `ls -la .claude/skills/ | grep "^l"` で symlink を確認
- 各 symlink のリンク先が存在することを確認: `find .claude/skills -type l -exec test ! -e {} \; -print` → 出力が空であること

#### 4.1a.4 受入基準

- [ ] AC-1: `.claude/skills/ai-product/` が存在する
- [ ] AC-2: `.claude/skills/better-auth-best-practices/` が存在する
- [ ] AC-3: `.claude/skills/security-review/` が存在する
- [ ] AC-4: `.claude/skills/frontend-design/` が存在する
- [ ] AC-5: `.claude/skills/codex-review/` が存在する
- [ ] AC-6: 壊れた symlink がゼロ: `find .claude/skills -type l -exec test ! -e {} \; -print` が空

#### 4.1a.5 テスト仕様

| テスト種別 | コマンド / 手順 | 期待結果 |
|-----------|----------------|---------|
| 検証スクリプト | `ls .claude/skills/ \| wc -l` | 42 以上 (37 + 5 追加) |
| 検証スクリプト | `find .claude/skills -type l -exec test ! -e {} \; -print` | 出力なし (壊れた symlink ゼロ) |
| パイプライン | `npm run test:agent-pipeline` | PASS |

#### 4.1a.6 リスク評価

| リスク | 影響度 | 発生確率 | 対策 |
|--------|-------|---------|------|
| user scope にスキルが存在しない | 低 | 低 | `.agents/skills/` から作成。なければ空ディレクトリ + SKILL.md を作成 |
| 相対パスの誤り | 低 | 中 | Step 4 で壊れた symlink を検出 |

#### 4.1a.7 ロールバック手順

```bash
# 追加した symlink/ディレクトリを削除するだけ
cd .claude/skills
rm -rf ai-product better-auth-best-practices security-review frontend-design codex-review
```

---

### Task H-1b: symlink 管理を AI_HARNESS.md に記載

> **2026-04-17 現状: 完了済み**。`docs/ops/AI_HARNESS.md` 1.2.1 節に手動管理 10 スキルの表あり。

#### 4.1b.1 目的

`sync-pipeline.mjs` の管轄外である symlink スキルを AI_HARNESS.md に手動管理対象として明記し、運用上の見落としを防ぐ。

#### 4.1b.2 対象ファイル

| ファイル | 操作 | 概要 |
|---------|------|------|
| `docs/ops/AI_HARNESS.md` | 変更 | 手動管理スキル一覧セクションに追記 |

#### 4.1b.3 手順

**Step 1: AI_HARNESS.md を開く**
- ファイル: `docs/ops/AI_HARNESS.md`
- セクション「1.2.1」付近の「non-canonical skills」一覧を見つける

**Step 2: 手動管理スキル一覧を更新**
- 以下の 10 スキルを「手動管理スキル」として一覧に記載:
  - symlink 管理 (5件): `prompt-engineer`, `rag-engineer`, `ui-ux-pro-max`, `vercel-react-best-practices`, `hybrid-search-implementation`
  - 新規追加 (5件): `ai-product`, `better-auth-best-practices`, `security-review`, `frontend-design`, `codex-review`
- 各スキルに「ソースパス」「管理方法 (symlink / copy)」「最終確認日」を記載

**Step 3: sync-pipeline との関係を注記**
- 「これらのスキルは `sync-pipeline.mjs` のスキャン対象外。追加・変更時は手動で `.claude/skills/` を更新すること」と注記

#### 4.1b.4 受入基準

- [ ] AC-1: `docs/ops/AI_HARNESS.md` に 10 スキルの手動管理一覧がある
- [ ] AC-2: 各スキルにソースパスと管理方法が記載されている

#### 4.1b.5 テスト仕様

| テスト種別 | コマンド / 手順 | 期待結果 |
|-----------|----------------|---------|
| 検証スクリプト | `grep -c "手動管理" docs/ops/AI_HARNESS.md` | 1 以上 |
| 目視確認 | AI_HARNESS.md の該当セクションを読む | 10 スキルが一覧されている |

#### 4.1b.6 リスク評価

| リスク | 影響度 | 発生確率 | 対策 |
|--------|-------|---------|------|
| ドキュメントと実態の乖離 | 低 | 中 | H-1a 完了後に記載する |

#### 4.1b.7 ロールバック手順

```bash
git checkout -- docs/ops/AI_HARNESS.md
```

---

### Task H-1c: 13 agent の Context7 セクション統一

> **2026-04-17 現状: 完了済み**。`grep -l "Context7" .claude/agents/*.md | wc -l` = 13。`release-engineer.md` に「Context7 は不要」の明記あり。

#### 4.1c.1 目的

全 13 agent 定義に統一フォーマットの Context7 セクションを追加し、ライブラリドキュメント参照の一貫性を確保する。

#### 4.1c.2 対象ファイル

| ファイル | 操作 | 概要 |
|---------|------|------|
| `.claude/agents/architect.md` | 変更 | Context7 セクション追加/統一 |
| `.claude/agents/code-reviewer.md` | 変更 | 同上 |
| `.claude/agents/database-engineer.md` | 変更 | 同上 |
| `.claude/agents/fastapi-developer.md` | 変更 | 同上 |
| `.claude/agents/nextjs-developer.md` | 変更 | 同上 |
| `.claude/agents/product-strategist.md` | 変更 | 同上 |
| `.claude/agents/prompt-engineer.md` | 変更 | 同上 |
| `.claude/agents/rag-engineer.md` | 変更 | 同上 |
| `.claude/agents/release-engineer.md` | 変更 | 「Context7 は不要」を明記 |
| `.claude/agents/search-quality-engineer.md` | 変更 | Context7 セクション追加/統一 |
| `.claude/agents/security-auditor.md` | 変更 | 同上 |
| `.claude/agents/test-automator.md` | 変更 | 同上 |
| `.claude/agents/ui-designer.md` | 変更 | 同上 |

#### 4.1c.3 手順

**Step 1: 統一フォーマットを確認**
- 以下のテキストブロックを全 agent に追加する（既存の Context7 記述は削除して置き換え）:

```markdown
## Context7 の使い方
1. `mcp__context7__resolve-library-id` でライブラリ ID を取得
2. `mcp__context7__query-docs` で関連セクションを取得
Context7 は user scope MCP で提供される。利用不可の場合はスキップしてよい。
```

**Step 2: 12 agent に統一フォーマットを適用**
- `release-engineer.md` 以外の 12 ファイルを開く
- 既存の Context7 関連記述を検索: ファイル内で `Context7` または `context7` を grep
- 既存記述があれば削除し、Step 1 のフォーマットに置き換え
- 既存記述がなければ、ファイル末尾に追加
- 挿入位置: ファイルの最後のセクション（`## ` で始まる行）の後

**Step 3: release-engineer に例外記述を適用**
- `release-engineer.md` を開く
- 以下を追加:
```markdown
## Context7
Context7 は不要（CLI 操作のみのため）。
```

**Step 4: 一括検証**
- コマンド: `grep -l "Context7" .claude/agents/*.md | wc -l` → 13 であること
- コマンド: `grep -L "Context7" .claude/agents/*.md` → 出力なし

#### 4.1c.4 受入基準

- [ ] AC-1: `grep -l "Context7" .claude/agents/*.md | wc -l` が 13
- [ ] AC-2: `grep -L "Context7" .claude/agents/*.md` の出力が空
- [ ] AC-3: `release-engineer.md` に「不要」と記載されている

#### 4.1c.5 テスト仕様

| テスト種別 | コマンド / 手順 | 期待結果 |
|-----------|----------------|---------|
| 検証スクリプト | `grep -l "Context7" .claude/agents/*.md \| wc -l` | 13 |
| 検証スクリプト | `grep -L "Context7" .claude/agents/*.md` | 出力なし |
| 検証スクリプト | `grep "不要" .claude/agents/release-engineer.md` | 1行以上ヒット |
| パイプライン | `npm run test:agent-pipeline` | PASS |

#### 4.1c.6 リスク評価

| リスク | 影響度 | 発生確率 | 対策 |
|--------|-------|---------|------|
| 既存の Context7 記述を誤って一部残す | 低 | 中 | Step 4 の grep で漏れを検出 |
| agent 定義の Markdown 構造を崩す | 低 | 低 | 各ファイルの ## 見出し構造を確認してから挿入 |

#### 4.1c.7 ロールバック手順

```bash
git checkout -- .claude/agents/
```

---

### Task H-1d: Notion MCP ステータス解決

> **2026-04-17 現状: 完了済み**（Notion は active 利用の判定）。`.mcp.json` / `.cursor/mcp.json` に `notion` サーバー残存、`prompt-engineer.md` に利用手順記載。移行完了判定は当面 revisit せず。

#### 4.1d.1 目的

Notion MCP が `.mcp.json` に定義されているが、実際の利用状況を確認し、不要なら削除する。

#### 4.1d.2 対象ファイル

| ファイル | 操作 | 概要 |
|---------|------|------|
| `.mcp.json` | 変更 (条件付き) | Notion サーバー削除 or 利用手順追記 |
| `.cursor/mcp.json` | 変更 (条件付き) | `.mcp.json` と同期 |
| `.claude/agents/prompt-engineer.md` | 変更 (条件付き) | Notion 利用手順追記 or Notion 不要を明記 |

#### 4.1d.3 手順

**Step 1: Notion の利用状況を確認**
- `backend/app/prompts/notion_registry.py` が存在するか確認
- `backend/app/prompts/notion_sync.py` が存在するか確認
- git status で `D` (deleted) になっていれば、Notion からコードへの移行完了済み

**Step 2-A: Notion 不要の場合（移行完了済み）**
- `.mcp.json` から `"notion"` サーバーブロックを削除
- `.cursor/mcp.json` も同様に削除
- `docs/ops/AI_HARNESS.md` に「Notion MCP は 2026-04-14 に削除。プロンプトはコード内 (`backend/app/prompts/`) で管理」と追記

**Step 2-B: Notion 必要の場合**
- `prompt-engineer.md` に Notion MCP の利用手順セクションを追加:
  - どのデータベースを参照するか
  - どのプロパティをフィルタリングするか
  - 取得したデータの使い方

#### 4.1d.4 受入基準

- [ ] AC-1: `.mcp.json` の Notion 設定と実際の利用状況が一致している
- [ ] AC-2: 判断の根拠が `AI_HARNESS.md` に記録されている

#### 4.1d.5 テスト仕様

| テスト種別 | コマンド / 手順 | 期待結果 |
|-----------|----------------|---------|
| 検証スクリプト | Notion 削除時: `grep -c "notion" .mcp.json` | 0 |
| 検証スクリプト | Notion 残存時: `grep -c "Notion" .claude/agents/prompt-engineer.md` | 1 以上 |

#### 4.1d.6 リスク評価

| リスク | 影響度 | 発生確率 | 対策 |
|--------|-------|---------|------|
| 誤って必要な MCP を削除 | 中 | 低 | Step 1 で利用状況を必ず確認してから判断 |

#### 4.1d.7 ロールバック手順

```bash
git checkout -- .mcp.json .cursor/mcp.json
```

---

### Task H-2a: `.cursorignore` 更新

> **2026-04-17 現状: 完了**。`secrets/`, `*.key`, `codex-company/` を追記。`grep -c "codex-company/" .cursorignore` = 1 等すべて満たす。

#### 4.2a.1 目的

Cursor IDE が機密ファイルをインデックスしないよう、`.cursorignore` に除外パターンを追加する。

#### 4.2a.2 対象ファイル

| ファイル | 操作 | 概要 |
|---------|------|------|
| `.cursorignore` | 変更 | 除外パターン追加 |

#### 4.2a.3 手順

**Step 1: 現在の `.cursorignore` を確認**
- ファイルが存在するか確認: `cat .cursorignore`
- 既存の内容を確認

**Step 2: 除外パターンを追加**
- 以下のパターンが含まれていない場合に追加:
  ```
  secrets/
  private/
  .env
  .env.*
  *.pem
  *.key
  codex-company/
  ```

**Step 3: `.gitignore` との整合確認**
- `.gitignore` に同様の除外がないか確認（重複は問題ないが意図を理解するため）

#### 4.2a.4 受入基準

- [ ] AC-1: `.cursorignore` に `secrets/` が含まれる
- [ ] AC-2: `.cursorignore` に `private/` が含まれる
- [ ] AC-3: `.cursorignore` に `.env` が含まれる
- [ ] AC-4: `.cursorignore` に `codex-company/` が含まれる

#### 4.2a.5 テスト仕様

| テスト種別 | コマンド / 手順 | 期待結果 |
|-----------|----------------|---------|
| 検証スクリプト | `grep -c "secrets/" .cursorignore` | 1 以上 |
| 検証スクリプト | `grep -c "private/" .cursorignore` | 1 以上 |
| 検証スクリプト | `grep -c "codex-company/" .cursorignore` | 1 以上 |

#### 4.2a.6 リスク評価

| リスク | 影響度 | 発生確率 | 対策 |
|--------|-------|---------|------|
| 過剰な除外でCursorの補完が効かなくなる | 低 | 低 | secrets/private のみ除外。ソースコードは除外しない |

#### 4.2a.7 ロールバック手順

```bash
git checkout -- .cursorignore
```

---

### Task H-2b: `.codex/config.toml` routing 追加

> **2026-04-17 現状: 完了**。`[routing]` 6 ルールと `[security] deny_patterns = ["*.env","*.pem","*.key","secrets/**"]` を追加。`python3 -c "import tomllib; tomllib.load(open('.codex/config.toml','rb'))"` でパースエラーなし。

#### 4.2b.1 目的

Codex IDE でもサブエージェント routing が動作するよう、`config.toml` に CLAUDE.md の Subagent Routing 表を Codex 形式で追記する。

#### 4.2b.2 対象ファイル

| ファイル | 操作 | 概要 |
|---------|------|------|
| `.codex/config.toml` | 変更 | `[routing]` セクション追加 |

#### 4.2b.3 手順

**Step 1: 現在の config.toml を確認**
- ファイル: `.codex/config.toml`
- 既存セクション: `[agents]`, `[setup]`, `[verification]`, `[mcp_servers]`

**Step 2: routing セクションを追加**
- `[routing]` セクションを新規追加
- CLAUDE.md の Subagent Routing 表をキーバリュー形式に変換
- 最低限、以下のルーティングを記載:
  - `backend/app/prompts/**` → `prompt-engineer`
  - `backend/app/routers/**` → `fastapi-developer`
  - `src/components/**` → `ui-designer`
  - `src/app/**/page.tsx` → `nextjs-developer`
  - `src/lib/db/schema.ts` → `database-engineer`
  - `src/lib/auth/**` → `security-auditor`

**Step 3: security guard 設定を追加**
- `[security]` セクションを追加
- `deny_patterns = ["*.env", "*.pem", "*.key", "secrets/**"]` を設定

#### 4.2b.4 受入基準

- [ ] AC-1: `.codex/config.toml` に `[routing]` セクションが存在する
- [ ] AC-2: routing に 6 件以上のルールが定義されている
- [ ] AC-3: `[security]` セクションに deny_patterns が定義されている

#### 4.2b.5 テスト仕様

| テスト種別 | コマンド / 手順 | 期待結果 |
|-----------|----------------|---------|
| 検証スクリプト | `grep -c "\[routing\]" .codex/config.toml` | 1 |
| 検証スクリプト | `grep -c "\[security\]" .codex/config.toml` | 1 |
| 構文チェック | TOML として有効か（Python: `import tomllib; tomllib.load(open(..., "rb"))` でパースエラーなし） | パース成功 |

#### 4.2b.6 リスク評価

| リスク | 影響度 | 発生確率 | 対策 |
|--------|-------|---------|------|
| TOML 構文エラー | 低 | 中 | Step 3 後に TOML パーサーで検証 |
| Codex がカスタム routing を無視 | 低 | 中 | Codex のドキュメントで設定キーを事前確認 |

#### 4.2b.7 ロールバック手順

```bash
git checkout -- .codex/config.toml
```

---

### Task H-3a: 5 agent を opus → sonnet にダウングレード

> **2026-04-17 判断: スキップ**。ユーザー方針で opus 11 / sonnet 2 の現行配分を維持。memory の 2026-04-11 記録（7 agent を opus 昇格）と当初計画の「opus→sonnet ダウングレード」が矛盾していたが、最終方針として昇格後の状態を維持することで合意。後続の運用レビュー（コスト / 品質トレードオフ観察）次第で再評価する。

#### 4.3a.1 目的

コスト最適化のため、実装タスク中心の 5 agent を opus から sonnet にダウングレードする。

#### 4.3a.2 対象ファイル

| ファイル | 操作 | 概要 |
|---------|------|------|
| `.claude/agents/fastapi-developer.md` | 変更 | `model: opus` → `model: sonnet` |
| `.claude/agents/nextjs-developer.md` | 変更 | 同上 |
| `.claude/agents/ui-designer.md` | 変更 | 同上 |
| `.claude/agents/database-engineer.md` | 変更 | 同上 |
| `.claude/agents/product-strategist.md` | 変更 | 同上 |
| `docs/ops/AI_HARNESS.md` | 変更 | モデル変更の根拠を記録 |

#### 4.3a.3 手順

**Step 1: 現在のモデル配分を確認**
- コマンド: `grep "model:" .claude/agents/*.md`
- opus と sonnet の数を数える

**Step 2: 5 ファイルの model 行を変更**
- 各ファイルの frontmatter（先頭の `---` で囲まれた部分）内の `model:` 行を見つける
- `model: opus` → `model: sonnet` に変更
- 対象ファイル:
  1. `.claude/agents/fastapi-developer.md`
  2. `.claude/agents/nextjs-developer.md`
  3. `.claude/agents/ui-designer.md`
  4. `.claude/agents/database-engineer.md`
  5. `.claude/agents/product-strategist.md`

**Step 3: 変更根拠を AI_HARNESS.md に記録**
- `docs/ops/AI_HARNESS.md` のモデル配分セクションに以下を追記:
  - 変更日: 2026-04-14
  - 変更内容: 5 agent を opus → sonnet
  - 根拠: 実装タスク中心の agent は sonnet で十分な品質。2026-04-12 レビュー推奨に基づく
  - 変更後の配分: opus 8 / sonnet 5

**Step 4: 変更後のモデル配分を確認**
- コマンド: `grep "model:" .claude/agents/*.md | grep -c "opus"` → 8
- コマンド: `grep "model:" .claude/agents/*.md | grep -c "sonnet"` → 5

#### 4.3a.4 受入基準

- [ ] AC-1: `grep "model:" .claude/agents/*.md | grep -c "opus"` が 8
- [ ] AC-2: `grep "model:" .claude/agents/*.md | grep -c "sonnet"` が 5
- [ ] AC-3: `docs/ops/AI_HARNESS.md` にモデル変更の根拠が記載されている

#### 4.3a.5 テスト仕様

| テスト種別 | コマンド / 手順 | 期待結果 |
|-----------|----------------|---------|
| 検証スクリプト | `grep "model:" .claude/agents/*.md \| sort \| uniq -c` | opus 8, sonnet 5 |
| パイプライン | `npm run test:agent-pipeline` | PASS |

#### 4.3a.6 リスク評価

| リスク | 影響度 | 発生確率 | 対策 |
|--------|-------|---------|------|
| sonnet で品質が不十分な場合 | 中 | 低 | 1 週間運用して品質を観察。問題あれば個別に opus に戻す |
| AI_HARNESS.md との不整合 | 低 | 低 | Step 3 で同時に更新 |

#### 4.3a.7 ロールバック手順

```bash
# 個別の agent を opus に戻す場合
# 例: fastapi-developer を戻す
# .claude/agents/fastapi-developer.md の model: sonnet → model: opus

# 全体を戻す場合
git checkout -- .claude/agents/
```

---

### Task H-1e: hooks 整備の再点検（2026-04-17 追加）

#### 4.1e.1 目的

2026-04-16 時点で `.claude/hooks/` 配下に orphan hook 2 本（`permission-request-guard.sh`, `post-tool-failure-triage.sh`）が存在し、さらに `lib/skill-recommender.sh` の共通ライブラリ化や `post-edit-dispatcher.sh` / `stop-summary.sh` の機能拡張が `docs/ops/AI_HARNESS.md` に未反映だった。本タスクでこれを解消する。

#### 4.1e.2 対象ファイル

| ファイル | 操作 | 概要 |
|---------|------|------|
| `.claude/settings.json` | 変更 | `PermissionRequest` / `PostToolUseFailure` の 2 イベントを追加配線 |
| `docs/ops/AI_HARNESS.md` | 変更 | hook 一覧の更新、`lib/skill-recommender.sh` の記載、post-edit-dispatcher / stop-summary の拡張記載、orphan 解消の記録 |

#### 4.1e.3 手順

1. orphan hook 2 本の本体を読み、既存 hook と機能が重複していないかを評価する。`permission-request-guard.sh` は user 確認プロンプトの手前で deny を出せる defense-in-depth の役割、`post-tool-failure-triage.sh` は tool 失敗時に `additionalContext` で LLM に次アクションを注入する役割。いずれも独立価値があると判断し配線する。
2. Context7 (`/ericbuess/claude-code-docs`) で `PermissionRequest` / `PostToolUseFailure` が v1 系公式イベント名であることを確認する（確認済み）。
3. `.claude/settings.json` の `hooks` に 2 イベントエントリを追加する。
    ```json
    "PermissionRequest": [
      { "matcher": "Read|Bash", "hooks": [{ "type": "command", "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/permission-request-guard.sh" }] }
    ],
    "PostToolUseFailure": [
      { "matcher": "Bash|Read|WebFetch", "hooks": [{ "type": "command", "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/post-tool-failure-triage.sh" }] }
    ]
    ```
4. `docs/ops/AI_HARNESS.md` の以下を更新する。
    - 1.2 節の tree 記述で hook 数を `9 → 12 top-level + lib/` に更新
    - 5.1 節の hook 一覧表に `permission-request-guard.sh`, `post-tool-failure-triage.sh`, `user-prompt-submit-router.sh` を追加し、`post-edit-dispatcher.sh` / `stop-summary.sh` の目的を拡張後の表現に更新
    - 5.1.1 小節を新設し `lib/skill-recommender.sh` の提供関数と hotspot 正本ポリシーを記載
    - 5.2 節の settings.json サンプルに 3 イベント（PermissionRequest, PostToolUseFailure, UserPromptSubmit）を追加
    - 5.3.4 の post-edit-dispatcher 詳細を 7 系統リマインダ（hotspot / 500 行超 / cross-dir を含む）に更新
    - 5.3.8 の stop-summary に大規模変更検出（≥10 files / ≥500 lines / hotspot）を追記
    - 5.3.9 / 5.3.10 / 5.3.11 に orphan 2 本と `user-prompt-submit-router.sh` の詳細を新設、`session-end-cleanup.sh` は 5.3.12 へ繰り下げ
    - 7.4 節の件数ドリフト確認コマンドを 2026-04-17 の実数に更新

#### 4.1e.4 受入基準

- [ ] AC-1: `python3 -c "import json; json.load(open('.claude/settings.json'))"` でパースエラーなし
- [ ] AC-2: `jq -r '.hooks | keys' .claude/settings.json` に `PermissionRequest` と `PostToolUseFailure` が含まれる
- [ ] AC-3: `grep -c "skill-recommender" docs/ops/AI_HARNESS.md` が 1 以上
- [ ] AC-4: `find .claude/hooks -maxdepth 1 -name '*.sh' -type f | wc -l` = 12、`.claude/hooks/lib/skill-recommender.sh` が存在
- [ ] AC-5: AI_HARNESS.md の hook 節が 2026-04-17 状態（12 top-level + lib、大規模変更検出、orphan 解消）を反映

#### 4.1e.5 ロールバック

```bash
git checkout -- .claude/settings.json docs/ops/AI_HARNESS.md
```

---

## 5. 実行順序と依存関係図

```
全タスクは独立 — 任意の順序で実行可能

推奨順序（作業効率重視）:

1. H-1a (skill コピー)     ─── 他タスクの前提ではないが最初にやると見通しが良い
2. H-1c (Context7 統一)    ─── 13 ファイル一括編集、まとめてやると効率的
3. H-3a (opus→sonnet)      ─── H-1c と同じファイルを編集するため続けて実施
4. H-1d (Notion MCP)       ─── 調査→判断が必要なため独立して実施
5. H-1b (AI_HARNESS 更新)  ─── H-1a, H-3a の結果を反映するため後半に
6. H-2a (.cursorignore)    ─── 独立、いつでも可
7. H-2b (config.toml)      ─── 独立、いつでも可
```

---

## 6. 全体の完了条件

- [ ] 全 7 タスクの受入基準が満たされている
- [ ] `npm run test:agent-pipeline` が PASS
- [ ] `find .claude/skills -type l -exec test ! -e {} \; -print` が空（壊れた symlink ゼロ）
- [ ] `grep -L "Context7" .claude/agents/*.md` が空（全 agent に Context7 記載）
- [ ] `grep "model:" .claude/agents/*.md | grep -c "opus"` が 8
- [ ] コードレビュー完了

---

## 7. 全体リスク評価とロールバック戦略

### リスク総評

全タスクがテキスト/設定ファイルの変更のみ。本番ユーザーへの影響ゼロ。blast radius は開発環境に限定。

### ロールバック戦略

- **単一タスクの問題**: 該当ファイルのみ `git checkout` で復元
- **全体の問題**: `git revert <commit>` で PR 全体を取り消し
- **DB マイグレーションなし**: データ損失リスクゼロ
- **feature flag 不要**: 設定ファイルのため即座に有効/無効が切り替え可能

---

## 8. 用語集

| 用語 | 説明 |
|------|------|
| **agent** | Claude Code のサブエージェント。`.claude/agents/*.md` で定義される AI アシスタントの役割 |
| **skill** | agent が参照できる専門スキル定義。`.claude/skills/` または `.agents/skills/` に配置 |
| **symlink** | シンボリックリンク。ファイルの実体を別の場所から参照するファイルシステムの仕組み |
| **user scope** | `~/.claude/` 配下。ユーザー固有の設定で、他環境に共有されない |
| **project scope** | プロジェクトルート直下の `.claude/` 配下。Git で管理され他環境と共有される |
| **canonical** | 正規のソース。`.agents/skills/` がスキルの正規ソース |
| **Context7** | ライブラリドキュメントを MCP 経由で参照する仕組み |
| **MCP** | Model Context Protocol。外部ツール/データを AI に接続する標準プロトコル |
| **opus / sonnet** | Claude のモデルグレード。opus は高精度・高コスト、sonnet は標準精度・低コスト |
| **sync-pipeline** | `.agents/` から `.claude/`, `.cursor/`, `.codex/` へスキルや設定を同期するスクリプト |
| **blast radius** | 変更が影響する範囲。低 = 開発環境のみ、高 = 本番ユーザーに影響 |

---

## 9. v4 次アクション（2026-04-18 完了）

v3 完了後の監査で発見された残課題を v4 として実装済み。詳細は `.claude/plans/harness-improvement-plan-md-web-askuserq-stateless-avalanche.md`。

- **H4-1**: `.claude/settings.json` に project-root anchored な `permissions.deny` を 10 件追加（Claude Code 公式 deny で hook と二重化）
- **H4-2**: `.codex/config.toml` `deny_patterns` を 8 件に拡張（`codex-company/.secrets/**` 等を追加し `.cursorignore` と意味論を一致）
- **H4-4**: `sync-pipeline.test.mjs` に件数ドリフト detector（agent / hook / skill / Context7 coverage / model 配分 / 壊れた symlink）を追加
- **H4-5**: `docs/ops/AI_HARNESS.md` §4.1 / §7.4 の stale 数値を実測に更新、§8「ハーネス観測性」を新設
- **H4-6**: `release-engineer` / `security-auditor` agent の自然文同義語を補強
- **H4-7**: 本ドキュメントを `status: 完了` にクローズ

v5 以降の候補（対象外）: OpenTelemetry 連携、gitleaks CI job、skill canonicalization、MCP サーバー権限の granular scoping。
