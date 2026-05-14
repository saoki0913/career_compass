---
name: production-doctor
description: 本番環境 (www.shupass.jp) の 5 ソース（health check, secret drift, Sentry API, Railway logs, SSL/DNS）からエラーを並列収集・トリアージ・修正・再検証する完全自動化ループ。scripts/release/production-doctor.sh を正規入口として使う。
language: ja
---

# Production Doctor

本番環境のエラーを自動検出 -> 分析 -> 修正 -> テスト -> デプロイ -> 再検証する。全 P0/P1 が解消するか、最大 3 イテレーションに達するまでループする。

## トリガー

ユーザーが「run doctor」「production doctor」「diagnose production」「fix production」「本番診断」「本番修復」と言った場合に実行する。

## 環境情報

| コンポーネント | URL |
|---|---|
| Frontend (Vercel) | `https://www.shupass.jp` |
| Frontend Staging | `https://stg.shupass.jp` |
| Backend (Railway) | `https://shupass-backend-production.up.railway.app` |
| Backend Staging | `https://stg-api.shupass.jp` |
| Sentry Org | `japan-qs` |
| Sentry Frontend Project | `career-compass-frontend` |
| Sentry Backend Project | `career-compass-backend` |

## 正規スクリプト

```
scripts/release/production-doctor.sh [--collect-only] [--fix-loop] [--max-iterations N]
```

Makefile ショートカット:
- `make doctor`       — collect + triage + summary (default)
- `make doctor-check` — collect-only (triage.json を出力して終了)

## フェーズ概要

```
Phase 1: 5 ソース並列収集 (background jobs + wait)
    |
Phase 2: Triage -> P0/P1/P2 分類 -> triage.json 生成
    |
Phase 3: 出力 + Claude skill による判断
```

---

## Phase 1: Collect

```bash
bash scripts/release/production-doctor.sh --collect-only
```

スクリプトが以下を並列実行する:

| Collector | 出力ファイル | スクリプト |
|---|---|---|
| Health check | `health.txt` | `verify-health.sh` (存在すれば) / `verify-production.sh` (fallback) |
| Secret drift | `secret-drift.txt` | `sync-career-compass-secrets.sh --check --target all` |
| Sentry errors | `sentry.json` | `.claude/skills/production-doctor/fetch-sentry-errors.sh` (存在すれば) |
| Railway logs | `railway.txt` | `.claude/skills/production-doctor/fetch-railway-logs.sh` (存在すれば) |
| SSL/DNS check | `ssl-check.txt` | `curl -sI https://www.shupass.jp` |

全ファイルは `.doctor-reports/<timestamp>/` に保存される (gitignored)。

報告されたパス (`TRIAGE_PATH=...`) の `triage.json` を Read する。

---

## Phase 2: Assess

triage.json を読んで、AskUserQuestion でユーザーに提示する:

**提示フォーマット:**
```
本番環境の診断結果:

P0 (Critical - 即時対応必要):
  - [health] Production health check failed: ...
  - [sentry] Sentry backend: 3 unresolved error/fatal issues

P1 (Important - 今サイクルで対応):
  - [secrets] Secret drift detected

P2 (Low - 後回し可):
  (なし)

対応方針を選んでください:
```

**選択肢:**
- 「Auto-fix all P0/P1 (自動修復)」
- 「Fix P0 only (P0 のみ修復)」
- 「Manual investigation (手動調査)」
- 「Dismiss — no action needed (アクション不要)」

---

## Phase 3: Fix (承認時のみ)

承認された優先度の各 issue に対して:

1. `report_dir` 内の対応する collector ファイルを Read してルートコースを特定する
2. CLAUDE.md のルーティングテーブルに従いサブエージェントを使い分ける:

| 変更対象 | サブエージェント |
|---|---|
| `src/components/**`, `src/app/**/page.tsx` | `ui-designer` |
| `src/app/api/**`, `src/hooks/` | `nextjs-developer` |
| `backend/app/routers/**` | `fastapi-developer` |
| `src/lib/auth/**`, セキュリティ | `security-auditor` |
| `src/lib/db/schema.ts` | `database-engineer` |
| Secret drift | `sync-career-compass-secrets.sh --apply --target all` |

3. Secret drift 修復: `zsh scripts/release/sync-career-compass-secrets.sh --apply --target all 2>&1 | redact_output`
4. コード修正: 既存パターン (`createApiErrorResponse()` 等) に従う。band-aid パターン禁止。

---

## Phase 4: Verify (修正後)

```bash
bash scripts/release/production-doctor.sh --collect-only
```

新しい `triage.json` と直前のものを比較:
- 全 P0/P1 解消 -> Phase 5 (Deploy) へ
- 同じ issue が残存 -> SAME_SIGNATURE_REPEATED でエスカレート
- 新しい P0/P1 が出現 -> NEW_ISSUE_INTRODUCED でロールバック提案

---

## Phase 5: Deploy (コード修正があった場合のみ)

**常に AskUserQuestion でデプロイ内容をユーザーに確認してから実行する。**

1. AskUserQuestion でデプロイ確認 (修正サマリ + `make deploy` 実行予定を明示)
2. release checkpoint を作成:
   ```bash
   node scripts/harness/diff-snapshot.mjs checkpoint \
     --kind release --decision approved --release-mode release \
     --project "$(pwd)" > ~/.claude/sessions/career_compass/release-approved-$SESSION_ID
   ```
3. 既存リリースパイプライン経由で実行:
   ```bash
   make ops-release-check
   make deploy-stage-all
   make deploy
   ```
4. デプロイ出力は必ず `2>&1 | redact_output` で処理する

Secret drift のみの場合は `make deploy` は不要 (`--apply` で完結)。

---

## Phase 6: Re-verification

デプロイ完了後 60 秒待機してから再診断:

```bash
bash scripts/release/production-doctor.sh --collect-only
```

- P0/P1 全解消 -> 完了レポートを出力
- 残存あり -> 次の iteration へ (max 3)
- Sentry 新規エラー確認: `bash .claude/skills/production-doctor/fetch-sentry-errors.sh --since=5m --project=both`

---

## Phase 7: Loop Control

| Exit Code | 定数 | 状況 | アクション |
|---|---|---|---|
| 0 | P0_P1_RESOLVED | 全 P0/P1 解消 | 完了レポートを出力 |
| 2 | SAME_SIGNATURE_REPEATED | 同じ signature が繰り返し | AskUserQuestion でエスカレート |
| 3 | NEW_ISSUE_INTRODUCED | 修正で新 P0/P1 が出現 | ロールバック提案 + AskUserQuestion |
| 4 | MAX_ITERATIONS_REACHED | 3 イテレーション超過 | 残存 issues を報告して終了 |
| 5 | MANUAL_ESCALATION_REQUESTED | ユーザーが手動介入を選択 | ユーザーに引き渡し |

**ロールバック手順** (NEW_ISSUE_INTRODUCED 時):
1. AskUserQuestion: 「修正で新たな P0 エラーが発生しました。ロールバックしますか？」
2. 承認時: `git revert HEAD --no-edit` + `make deploy` 経由で再デプロイ

---

## 最終レポート形式

```
## Production Doctor Report
Date: YYYY-MM-DD HH:MM JST
Iterations: N/3
Exit: P0_P1_RESOLVED

### Issues Found
| # | Priority | Source | Description | Status |
|---|----------|--------|-------------|--------|
| 1 | P0 | health | Production health check failed | Fixed |
| 2 | P1 | secrets | Secret drift detected | Fixed |

### Fixes Applied
| # | Issue | Fix | Commit SHA |
|---|-------|-----|------------|
| 1 | health | Redeployed Railway backend | abc1234 |

### Remaining Issues
(none)

### Health Status
- Frontend: OK
- Backend: OK
- Triage: .doctor-reports/20260511T100000Z/triage.json
```

---

## 安全制約

1. **最大 3 イテレーション** — 無限ループ防止
2. **修正前確認** — AskUserQuestion でエラーサマリと修正方針を確認
3. **デプロイ前確認** — AskUserQuestion でデプロイ内容を確認。自動デプロイ禁止
4. **既存パイプライン経由** — デプロイは `make deploy` / `release-career-compass.sh` のみ
5. **provider CLI ガード** — `railway` CLI 使用前に release-provider checkpoint 作成が必要
6. **secrets 保護** — `.env` ファイルは絶対に直接読まない。インベントリ確認は `sync-career-compass-secrets.sh --check` のみ
7. **redact_output 必須** — deploy / secret sync の出力は必ず `2>&1 | redact_output` でパイプする
8. **develop ブランチ** — 作業は develop で行う。新規ブランチは作成しない
9. **push 確認** — `git push` は必ず AskUserQuestion で確認
10. **Codex レビュー** — 大規模変更は CLAUDE.md Section B の閾値チェックに従う
