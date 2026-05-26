# 監視・ログ・障害対応 設計計画書

> **Task state SSOT**: 実装フェーズのタスク状態は `docs/plan/plan-tasks.json` を正本とする。更新は `node scripts/plan/update-plan-task-status.mjs --id <task-id> --status <status> --source-plan <plan.md>` で行う。Markdown の Task Tracker は説明・履歴であり、最新状態は JSON を優先する。

作成日: 2026-05-05 JST
最終更新: 2026-05-26 JST

## 1. 目的

就活Pass の本番運用に向けて、監視、ログ、障害対応、ロールバック判断を既存サービスの範囲で整理する。

新規外部サービスは導入しない。監視の正本は Sentry、Vercel / Railway / Supabase / Stripe の provider logs、既存 release scripts とする。

## 2. 完了条件

1. `docs/plan/plan-tasks.json` の未完了状態に、新規外部監視・ログ集約サービス導入を前提にしたタスクが残っていない。
2. Sentry-first の監視方針と PII scrub が明記されている。
3. 障害対応は既存 provider logs と repo scripts で追える。
4. 外部画面確認は任意確認とし、文書更新の完了条件はローカル検証で閉じる。

## 3. 状態更新ルール

作業対象は `docs/plan/plan-tasks.json` から選ぶ。状態は `Todo` / `Doing` / `Blocked` / `Review` / `Done` / `Superseded` のみ使う。

旧 `Task Tracker` に残る `In Progress` 表記や外部サービス前提は履歴扱いとし、実行判断には使わない。

## 4. 現状の既存基盤

| 領域 | 既存実装 | 方針 |
|---|---|---|
| Frontend logging | `src/lib/logger.ts` | Sentry beforeSend と同じ redaction 方針に寄せる |
| Backend logging | `backend/app/utils/secure_logger.py` | provider logs で確認できる structured log を維持 |
| Request ID | Next.js BFF と FastAPI で伝播済み | incident 調査の主キーにする |
| Health check | `/health`、`/health/ready` | deploy check と provider health に接続 |
| Sentry | privacy-first init 済み | error tracking / alert / frontend uptime の正本 |
| RAG telemetry | `backend/app/rag/telemetry.py` | 新規 Grafana 前提にせず、必要な範囲で provider logs とテストへ寄せる |

## 5. 外部サービス方針

次の過去計画は必須タスクから外す。

| 旧計画 | 今回の扱い | 代替 |
|---|---|---|
| UptimeRobot 8 monitors | `Superseded` | Sentry uptime、`make deploy-check` |
| Grafana Cloud Loki push | `Superseded` | Sentry、Railway/Vercel logs |
| Grafana Cloud dashboard | `Superseded` | Sentry dashboard、provider logs、repo reports |
| Better Stack status page | `Superseded` | 公開ステータスページは作らない |
| Slack / PagerDuty 通知 | `Superseded` | Sentry email、GitHub Issues |

説明文や履歴にサービス名が残ることは許容する。ただし `Todo` / `Doing` / `Blocked` / `Review` の必須タスクには残さない。

## 6. 監視設計

| Priority | Area | Task | Acceptance Criteria |
|---|---|---|---|
| P0 | Sentry | frontend / backend event 到達確認を release 手順に入れる | PII scrub 後の test event が Sentry に届き、本文・token・email が送信されない |
| P0 | Health | deploy check を監視手順の入口にする | `HEALTH_TARGET=staging make deploy-check` と production 版の役割が文書化されている |
| P0 | Incident | requestId で provider logs を追う手順を作る | Vercel / Railway / Supabase / Stripe の確認順が明確 |
| P1 | Cron | Sentry Crons または既存 cron logs で missed execution を確認する | 新規 dead-man service なしで missed execution の確認手順がある |
| P1 | DB | slow query は provider logs / local profiling で確認する | 新規 Grafana 前提にしない |

## 7. 障害対応ランブックの範囲

最低限、次の手順を既存 provider 前提で整備する。

- Frontend down: Vercel deployment、domain、Sentry event、`make deploy-check`
- Backend down: Railway deployment、`/health`、`/health/ready`、Sentry event
- DB issue: Supabase status、migration pending、connection error、RLS / owner integrity
- Stripe issue: webhook delivery、`processed_stripe_events`、subscription / invoice current state
- LLM outage: provider error rate、fallback model、success-only credit consumption
- RAG issue: tenant key、Chroma/BM25 state、rebuild 手順

## 8. 検証

文書更新時の必須確認:

```bash
node scripts/plan/validate-plan-tasks.mjs
git diff --check -- docs/plan
```

リリース直前または provider 認証ありで確認:

```bash
make ops-release-check
make doctor-check
HEALTH_TARGET=staging make deploy-check
HEALTH_TARGET=production make deploy-check
```

## 9. 残タスク

- `plan-tasks.json` の外部監視・ログ集約サービス前提タスクを `Superseded` にする。
- `docs/operations/platform/MONITORING_SETUP.md` と `docs/release/SENTRY.md` の Sentry-first 方針と矛盾しないように保つ。
- Sentry event 到達、frontend uptime、backend event 到達の手作業確認を release runbook へ寄せる。
- Provider logs の保持期間と調査手順を `release-infrastructure-operations-plan.md` と整合させる。
