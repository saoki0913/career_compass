---
name: codex-delegation-workflow
description: Codex への作業委譲の判断基準とオーケストレーション手順。Plugin + MCP を primary、delegate.sh を fallback とする 2+1 チャネル体制。
language: ja
---

# Codex Delegation Workflow

Claude Code (Opus 4.6) から Codex (GPT-5.5) へ作業を委譲するためのオーケストレーション指針。

## 2+1 チャネル体制

| チャネル | 用途 | ツール |
|---|---|---|
| **Plugin** (primary) | レビュー、軽量委譲、ジョブ管理 | `/codex:review`, `/codex:adversarial-review`, `/codex:rescue`, `/codex:status`, `/codex:result`, `/codex:cancel` |
| **MCP** (primary) | 対話的マルチターン実装 | `mcp__codex__codex` + `codex-reply` |
| **delegate.sh** (fallback) | バッチ実行（全 4 モード維持） | `scripts/codex/delegate.sh` |

## チャネル選択ガイド

| シナリオ | Primary | Fallback |
|---|---|---|
| コードレビュー | Plugin `/codex:review` | delegate.sh post_review |
| 設計レビュー | Plugin `/codex:adversarial-review` | delegate.sh plan_review |
| 重い実装（ステアリング必要） | MCP `codex(heavy_impl)` | delegate.sh implementation |
| 軽量実装（fire-and-forget） | Plugin `/codex:rescue --background` | delegate.sh implementation |
| 並列サブエージェント | Plugin `/codex:rescue --background` × N | MCP `codex(review_only)` × N |
| 軽微修正 | MCP `codex(small_auto)` | — |
| 画像生成 | delegate.sh imagegen（exclusive） | — |
| ジョブ監視 | Plugin `/codex:status` | `ls -td .codex/state/handoffs/` |

## いつ Codex に委譲するか

### 委譲閾値
- 変更ファイル数 ≥ 3
- 変更行数 ≥ 50
- ユーザーが明示的に「Codex に任せたい」と示唆

### レビュー委譲
- 大規模変更（ファイル数 >= 10 or 行数 >= 500）の commit 前レビュー → `/codex:review`
- hotspot ファイルの変更 → `/codex:review`
- architect-routed ファイル変更 → `/codex:adversarial-review` も追加
- security-sensitive ファイル変更 → 両方実行推奨

### imagegen モード
- LP/UI 用の画像アセットを GPT Image 2 (`$imagegen`) で生成したいとき
- delegate.sh imagegen 経由のみ（Plugin/MCP に同等機能なし）

## 委譲しないケース
- release / deploy / provider CLI 操作（release-engineer の領域）
- secrets へのアクセスが必要な作業
- scope の再定義が必要な設計判断（architect の領域）
- 既存の Claude agent / skill で十分対応可能な局所的修正
- ユーザーが明示的に Claude のみでの作業を求めている場合

## 実行手順

### Plugin 経由
1. `/codex:review` or `/codex:rescue [--background]` を実行
2. `/codex:status` で進捗確認
3. `/codex:result` で結果取得
4. Claude が結果を判断する

code-reviewer を含むレビューは blocking。`/codex:status` が pending / running / timeout の状態では、結果未取得として扱い、計画確定・commit / push・最終回答に進まない。ユーザーが明示的に「code-reviewer を待たずに続行」と指示した場合のみ例外。

### MCP 経由
1. `mcp__codex__codex(prompt, cwd, profile=heavy_impl)` を実行
2. 結果確認 → `codex-reply` で追加指示（最大 3 ターン）
3. Claude が結果を検証する

### delegate.sh 経由（fallback）
1. `/codex-plan-review` or `/codex-implement` or `/codex-post-review` or `/codex-imagegen` を実行
2. 内部で `scripts/codex/delegate.sh <mode>` が Codex CLI を非対話実行する
3. 結果は `.codex/state/handoffs/<request_id>/result.md` に保存される
4. Claude が結果を Read で読み込み、内容を判断する

## checkpoint 作成

| レビュー経路 | checkpoint decision |
|---|---|
| Plugin `/codex:review` | `plugin-reviewed` |
| delegate.sh post_review → 続行 | `reviewed-proceed` |
| delegate.sh post_review → 修正委譲 | `delegate-fixes` |
| Claude fallback review | `fallback-reviewed` |

## 失敗時フォールバック

| 失敗状態 | 標準動作 |
|---|---|
| TIMEOUT (default 3600s / max 7200s) | Claude が自身で作業を続行 |
| CODEX_ERROR (非ゼロ exit) | meta.json に記録、Claude が続行 |
| PARSE_FAILURE (result.md が空) | Claude が続行 |
| Plugin コマンド失敗 | delegate.sh fallback → それも失敗なら Claude 続行 |
| plan_review 失敗 | Claude 単独レビューへフォールバック |
| implementation 失敗 | Claude がスコープを縮めて自力実装 |
| post_review 失敗 | code-reviewer / security-auditor skill へ戻す |
| imagegen 失敗 | `$imagegen` 不可なら `image_gen.py` CLI へ fallback |

注意: 上表の TIMEOUT は実装・plan_review のフォールバック用。code-reviewer / post_review の TIMEOUT は approve ではないため、Claude 自身の code-reviewer skill で同等レビューを完了してから次工程へ進む。

## 制約
- Codex に release, provider CLI, secret access, scope 再定義は持たせない
- AGENTS.md が正本（.codex/ 側のファイルは source of truth にしない）
- Codex が行った変更は Claude が検証してから commit する
- 並列実行中は Claude はファイル編集を行わない（競合防止）
