---
name: quality-gate-audit
description: AI開発品質ゲートの包括的監査。変更差分に基づき17カテゴリのチェックリストを実行し、サブエージェント並列委譲で深い分析を行う。
---

# Quality Gate Audit

AI 開発品質ゲートの包括的監査スキル。変更差分に基づき17カテゴリのチェックリストを実行し、サブエージェント並列委譲で深い分析を行う。

## Trigger

- ユーザーが `/quality-gate-audit` を実行
- `stop-summary.sh` が大規模変更検出時に推奨
- PR 作成前の最終品質チェックとして

## Workflow

### Step 1: Scope Analysis

```bash
node tools/quality-gate-check.mjs --mode=full
```

静的チェックを全カテゴリで実行し、findings を取得。

### Step 2: Category Determination

static findings + file pattern matching から、深いレビューが必要なカテゴリを特定:
- findings > 0 のカテゴリ
- critical/high severity のカテゴリ
- hotspot ファイルを含むカテゴリ

### Step 3: Subagent Parallel Delegation

該当カテゴリに応じてサブエージェントを並列起動:

| Category Group | Agent | Scope |
|---|---|---|
| security, auth, payment | `security-auditor` | OWASP Top 10, auth flow, webhook verification, IDOR |
| correctness, performance, maintainability, apiDesign | `code-reviewer` | Logic, N+1, SRP, HTTP method/status |
| aiLlm, cost | `prompt-engineer` | Prompt injection, token efficiency, model selection |
| frontend | `ui-designer` | Loading/error/empty states, a11y, responsive |
| database | `database-engineer` | Migration, index, constraint, transaction |

各サブエージェントへの指示:
- 変更ファイル一覧と diff を提供
- カテゴリ固有のチェック項目リストを提供
- findings を `{id, severity, file, line, message_ja, remediation_ja}` 形式で返却

### Step 4: Findings Merge & Dedup

サブエージェントの結果を統合:
- 同一 file:line への重複 findings を統合
- severity の最大値を採用
- カテゴリごとに pass/warn/fail を判定

### Step 5: Report Generation

`docs/review/quality-gate/YYYY-MM-DD-<branch>.md` に出力:

```yaml
---
topic: quality-gate
review_date: YYYY-MM-DD
category: quality-gate
status: active
gate_verdict: PASS | PASS_WITH_WARNINGS | BLOCK
scope: develop..HEAD
---
```

### Step 6: Verdict & Presentation

Codex では AskUserQuestion を呼べないため、結果サマリと推奨判断を最終出力に明示する:
- PASS: 全カテゴリ pass
- PASS_WITH_WARNINGS: medium 以下の findings のみ
- BLOCK: critical/high findings が存在

## Output Format

```
📋 Quality Gate Audit Report
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Scope: 12 files, 340 lines (+220 -120)
Categories: 8 / 17 checked

🔴 Blockers (2):
  SEC-07 | owner判定未実装 | src/app/api/new/route.ts:45
  PAY-02 | webhook署名未検証 | src/app/api/webhooks/stripe/route.ts:12

⚠️ Warnings (3):
  PERF-01 | N+1 クエリの可能性 | src/app/api/documents/route.ts:78
  TST-01 | 対応テストなし | src/app/api/new/route.ts
  DT-01 | JST/UTC混在 | src/lib/deadline-check.ts:23

✅ Passed: apiDesign(5/5), frontend(4/4), cost(3/3), maintainability(5/5)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Verdict: BLOCK (2 critical findings)
```

## Configuration

`.claude/quality-gate.json` の設定に従う:
- `rollout_phase`: A (warn-only) / B (critical block) / C (high block)
- `categories_enabled`: "all" または有効カテゴリ配列
- `blocking_threshold`: "critical" | "high" | "medium"

## Integration

- `docs/review/TRACKER.md` に quality-gate エントリを追加
- `docs/review/quality-gate/` にレポートを永続化
- 既存の `quality-review` skill とは独立（complementary、not replacement）
