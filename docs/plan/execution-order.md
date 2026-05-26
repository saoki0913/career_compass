# docs/plan 実行順序

> **Task state SSOT**: 実装フェーズのタスク状態は `docs/plan/plan-tasks.json` を正本とする。更新は `node scripts/plan/update-plan-task-status.mjs --id <task-id> --status <status> --source-plan <plan.md>` で行う。

最終更新: 2026-05-26 JST

## 1. 目的

`docs/plan` 配下の計画書を実行する順序と依存関係を示す索引。各計画書本文の Task Board / Task Tracker は履歴・説明であり、完了判定には使わない。

`scripts/plan/sync-plan-tasks.mjs` は移行用であり、通常運用では Markdown から `plan-tasks.json` を再生成しない。

## 2. 現在の基本方針

- 新規外部サービスを導入しない。
- 未完了状態のタスクに Better Stack、Healthchecks.io、Grafana Cloud / Loki、UptimeRobot、Render、Neon、Slack などの新規導入前提を残さない。
- Sentry、Vercel、Railway、Supabase、Stripe、GitHub Actions、Cloudflare DNS、既存 repo scripts の範囲で運用する。
- DB/RLS は破壊的変更を急がず、準備、local 実装、機能凍結後の確定・reset に分ける。
- `Done` は受け入れ条件と検証が完了した状態に限定する。実装済みでも検証不足なら `Review` または `Doing` とする。

## 3. 実行フェーズ

| Phase | 優先 | 対象計画 | 目的 |
|---|---:|---|---|
| 0 | P0 | `plan-tasks.json`, 本ファイル | 状態正本と実行順序を同期し、外部サービス衝突タスクを `Superseded` 化する |
| 1 | P0 | Release / Monitoring | Sentry-first、provider logs、既存 release scripts へ運用計画を統一する |
| 2 | P0 | DB/RLS / Reset | RLS の段階分け、table owner bypass、`FORCE ROW LEVEL SECURITY`、Stripe webhook 停止中イベント照合を明記する |
| 3 | P0 | Security / Personal Data / LLM-RAG | raw error、private material、退会時残存、RAG deletion receipt など公開前リスクを整理する |
| 4 | P1 | Test / UI / SEO | coverage 導入済み前提、ローカル UI 検証、SEO の公開 URL / 競合語彙を更新する |
| 5 | P1 | Backend config / Performance / Maintainability | 検証不足の実装済み項目を `Review` に分け、保守性改善へ接続する |

## 4. 依存関係

| 先行 | 後続 | 理由 |
|---|---|---|
| `plan-tasks.json` 同期 | 全計画書更新 | 状態正本が古いと Markdown 更新だけでは完了判定できない |
| 外部サービス衝突整理 | Release / Monitoring | 新規導入禁止方針に反するタスクを先に除外する |
| DB/RLS 準備 | production reset | reset は機能凍結後のみ。RLS policy / role / manifest が先 |
| DB/RLS role 検証 | RLS release gate | table owner bypass と `FORCE ROW LEVEL SECURITY` を確認する必要がある |
| Stripe webhook 照合手順 | production reset | 停止中 event の再送・重複・順序未保証に備える |
| Personal Data 公開前条件 | Release Gate | 退会・削除・外部送信最小化は公開後送りにしない |
| UI / SEO local 検証 | 新規 LP 展開 | title、robots、sitemap、UI guardrail を先に整える |

## 5. Release Gate

本番公開前に最低限確認するもの。

- `node scripts/plan/validate-plan-tasks.mjs` が通る。
- `plan-tasks.json` の `Todo / Doing / Blocked / Review` に新規外部サービス導入前提のタスクが残っていない。
- `docs/plan` の必須タスク表に、新規外部サービス導入前提の未完了行が残っていない。
- DB/RLS の reset 手順に、project ref 確認、backup / restore rehearsal、`pending: 0`、`supabasePending: 0`、remote-only なし確認がある。
- RLS 検証に table owner bypass と `FORCE ROW LEVEL SECURITY` 確認がある。
- Stripe webhook 停止中イベントの照合手順がある。
- 個人情報削除、RAG 実体削除、外部送信最小化、ログ redaction の公開前必須条件が分離されている。
- 「成功時のみ消費」ビジネスルールが ES / 志望動機 / ガクチカ / 面接 / 企業情報取得 / RAG で確認可能。

## 6. 検証コマンド

文書更新で必須:

```bash
node scripts/plan/validate-plan-tasks.mjs
git diff --check -- docs/plan
```

外部サービス衝突の必須確認:

```bash
node -e "const fs=require('fs');const d=JSON.parse(fs.readFileSync('docs/plan/plan-tasks.json','utf8'));const banned=/Better Stack|Healthchecks|Grafana Cloud|Loki|UptimeRobot|Render|Fly\\.io|Neon|Axiom|Logtail|PagerDuty|Slack/;const active=new Set(['Todo','Doing','Blocked','Review']);const hits=d.tasks.filter(function(t){return active.has(t.status)&&banned.test([t.task].concat(t.acceptanceCriteria||[],[t.notes||'']).join('\n'))});if(hits.length){console.error(hits.map(function(t){return t.id+'\t'+t.status+'\t'+t.task}).join('\n'));process.exit(1)}"
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
```

## 7. 注意点

- 既存の未コミット差分を上書きしない。
- `docs/plan` に一時 JSON を置かない。一時棚卸しは `/private/tmp` または `.codex/state` に置き、完了後に削除する。
- 禁止語が説明文や `Superseded` の理由として残ることは許容する。未完了状態や必須タスク表に残ることを禁止する。
- Search Console、GA4 DebugView、SNS デバッガー、WebAIM Checker は任意確認とし、完了条件はローカルで再現可能な検証へ寄せる。
- 公式参照は Supabase RLS、PostgreSQL Row Security、Stripe Webhooks、OWASP LLM Top 10 に限定する。
