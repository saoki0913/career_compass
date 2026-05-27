# docs/plan 実行順序

> **Task state SSOT**: 実装フェーズのタスク状態は `docs/plan/plan-tasks.json` を正本とする。更新は `node scripts/plan/update-plan-task-status.mjs --id <task-id> --status <status> --source-plan <plan.md>` で行う。

最終更新: 2026-05-27 JST

## 1. 目的

`docs/plan` 配下の計画書を実行する順序と依存関係を示す索引。各計画書本文の Task Board / Task Tracker は履歴・説明であり、完了判定には使わない。

`scripts/plan/sync-plan-tasks.mjs` は移行用であり、通常運用では Markdown から `plan-tasks.json` を再生成しない。実行する場合も `--check` は読み取り専用、書き込みは `--write` 明示時のみとする。

## 2. 現在の基本方針

- 新規外部サービスを導入しない。
- 未完了状態のタスクに Better Stack、Healthchecks.io、Grafana Cloud / Loki、UptimeRobot、Render、Neon、Slack、Qdrant Cloud などの新規導入前提を残さない。
- Sentry、Vercel、Railway、Supabase、Stripe、GitHub Actions、Cloudflare DNS、既存 repo scripts の範囲で運用する。
- DB/RLS は破壊的変更を急がず、準備、local 実装、機能凍結後の確定・reset に分ける。
- ChromaDB HTTPServer 分離は中期タスクとし、公開前 gate は現行 ChromaDB の単一 writer 前提、RAG 実動確認、削除 receipt、失敗時の縮退動作を確認する。
- Qdrant は長期検討に限定し、公開前または中期の未完了必須タスクにはしない。
- `Done` は受け入れ条件と検証が完了した状態に限定する。実装済みでも検証不足なら `Review` または `Doing` とする。

## 3. 実行フェーズ

| Phase | 優先 | 対象計画 | 目的 |
|---|---:|---|---|
| 0 | P0 | `plan-tasks.json`, 本ファイル | 状態正本と実行順序を同期する。**今回完了したのは文書・状態同期であり、本番公開可否ではない** |
| 1 | P0 | Release blocker / data boundary | Billing 検証、DB/RLS pre-release、Personal Data P0、LLM/RAG P0、Task/Calendar 整合性、UI/Accessibility P0、Release/Ops P0 最小条件、Legal の外部送信・削除・Cookie 関連を完了する |
| 2 | P0/P1 | AI / RAG / Search と品質ゲート | LLM/RAG P1、主要 API / BFF テスト、成功時のみ消費テスト、Search/RAG 品質、SEO 既存ページ品質を確認する |
| 3 | P1/P2 | Company / SEO / UX polish | Company P1-P3、SEO 本実装、Backend config / Monitoring の軽量実装、UI/Accessibility 残タスクを進める |
| 4 | P0/P1 | Pre-release hardening | Legal P1/P2、Release/Ops P1/P2、Test P2、DB/RLS Phase A、staging reset、production reset 前提確認、`make ops-release-check` 前提の統合確認を行う |
| 5 | P1+ | Post-release / long-term | Performance、Maintainability P1+、DB/RLS Phase B、ChromaDB HTTPServer 分離の運用強化へ接続する |
| 6 | P2+ | 長期検討 | Qdrant は検索遅延、RAG データ量、削除保証、運用費、移行 rehearsal が揃った段階で別 RFC として検討する |

Phase 0 の `Done` は、計画状態の整合と検証入口の整理が完了したことだけを意味する。本番公開判定は Phase 1 から Phase 4 の完了と、本書の Release Gate 通過後に限定する。

## 4. 依存関係

| 先行 | 後続 | 理由 |
|---|---|---|
| `plan-tasks.json` 同期 | 全計画書更新 | 状態正本が古いと Markdown 更新だけでは完了判定できない |
| 外部サービス衝突整理 | Release / Monitoring | 新規導入禁止方針に反するタスクを先に除外する |
| DB/RLS 準備 | production reset | reset は機能凍結後のみ。RLS policy / role / manifest が先 |
| DB/RLS role 検証 | RLS release gate | table owner bypass と `FORCE ROW LEVEL SECURITY` を確認する必要がある |
| Stripe webhook 照合手順 | production reset | 停止中 event の再送・重複・順序未保証に備える |
| Personal Data 公開前条件 | Release Gate | 退会・削除・外部送信最小化は公開後送りにしない |
| LLM/RAG P0 | RAG 公開判定 | RAG context 無害化、出力漏洩ブロック、ブロック時 credit cancel、private material gate が先 |
| RAG 削除 receipt / tenant isolation | Release Gate | URL 削除、会社削除、退会で Chroma / BM25 / Redis の残存確認が必要 |
| UI / SEO local 検証 | 新規 LP 展開 | title、robots、sitemap、UI guardrail を先に整える |
| 公開前品質 gate | ChromaDB HTTPServer 分離 | ChromaDB HTTPServer 分離は中期改善。公開前は単一 writer 前提と RAG 実動確認を優先する |

## 5. Release Gate

### 5.1 文書更新時の検証

文書更新時は、外部 provider の認証状態や本番到達性に依存しない検証だけを必須にする。

- `node scripts/plan/validate-plan-tasks.mjs` が通る。
- `node scripts/plan/sync-plan-tasks.mjs --check` が通る。
- `node --test scripts/plan/sync-plan-tasks.test.mjs scripts/plan/validate-plan-tasks.test.mjs` が通る。
- `git diff --check -- docs/plan scripts/plan` が通る。
- `docs/plan` 配下の JSON は `plan-tasks.json` のみである。
- `plan-tasks.json` の `Done` タスクには証跡または検証コマンドがある。
- `plan-tasks.json` の `Todo / Doing / Blocked / Review` に、新規外部サービス導入や Qdrant 移行を release-blocking とするタスクが残っていない。

### 5.2 本番公開判定

本番公開前に最低限確認するもの。

- DB/RLS の reset 手順に、project ref 確認、backup / restore rehearsal、`pending: 0`、`supabasePending: 0`、remote-only なし確認がある。
- RLS 検証に table owner bypass と `FORCE ROW LEVEL SECURITY` 確認がある。
- Stripe webhook 停止中イベントの照合手順がある。
- 個人情報削除、RAG 実体削除、外部送信最小化、ログ redaction の公開前必須条件が分離されている。
- 「成功時のみ消費」ビジネスルールが ES / 志望動機 / ガクチカ / 面接 / 企業情報取得 / RAG で確認可能。
- RAG 公開条件として、単一 worker / 単一 writer 運用条件、RAG 取り込み実動確認、URL 削除・会社削除・退会時の deletion receipt、失敗時の構造化エラーまたは縮退動作が確認されている。
- 公開前確認は repo scripts を正本とし、provider CLI を直接実行しない。

本番公開判定で使う標準入口:

```bash
make ops-release-check
make doctor-check
HEALTH_TARGET=staging make deploy-check
HEALTH_TARGET=production make deploy-check
```

公開操作は通常 `make deploy-stage-all` を使う。staged-only が明示された場合のみ `make deploy`、production-only が明示された場合のみ `make deploy-production` を使う。

## 6. 検証コマンド

文書更新で必須:

```bash
node scripts/plan/validate-plan-tasks.mjs
node scripts/plan/sync-plan-tasks.mjs --check
node --test scripts/plan/sync-plan-tasks.test.mjs scripts/plan/validate-plan-tasks.test.mjs
git diff --check -- docs/plan scripts/plan
```

関連単体確認:

```bash
node scripts/security/check-api-route-csrf.mjs
node scripts/security/check-raw-error-responses.mjs
npm run test:unit -- marketing-metadata
npm run lint:ui:guardrails
```

認証情報あり、またはリリース直前に確認:

```bash
bash scripts/ci/validate-migrations.sh
node scripts/release/run-migrations.mjs --env staging --dry-run --json
node scripts/release/run-migrations.mjs --env production --dry-run --json
make ops-release-check
make doctor-check
HEALTH_TARGET=staging make deploy-check
HEALTH_TARGET=production make deploy-check
make test-e2e-functional-rag-ingest
```

## 7. 注意点

- 既存の未コミット差分を上書きしない。
- `docs/plan` に一時 JSON を置かない。一時棚卸しは `/private/tmp` または `.codex/state` に置き、完了後に削除する。
- `sync-plan-tasks.mjs --check` は読み取り専用。`--write` は明示時のみ使い、`--fresh` は破壊的再生成として通常運用では使わない。
- 禁止語が説明文や `Superseded` の理由として残ることは許容する。未完了状態や必須タスク表に残ることを禁止する。
- Search Console、GA4 DebugView、SNS デバッガー、WebAIM Checker は任意確認とし、完了条件はローカルで再現可能な検証へ寄せる。
- 公式参照は Supabase RLS、PostgreSQL Row Security、Stripe Webhooks、OWASP LLM Top 10、ChromaDB Clients / System Constraints、Qdrant Pricing に限定する。
