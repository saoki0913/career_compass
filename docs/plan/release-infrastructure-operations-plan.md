# リリース・インフラ運用 計画書

> **Task state SSOT**: 実装フェーズのタスク状態は `docs/plan/plan-tasks.json` を正本とする。更新は `node scripts/plan/update-plan-task-status.mjs --id <task-id> --status <status> --source-plan <plan.md>` で行う。Markdown の表は説明・履歴であり、最新状態の判定には使わない。

作成日: 2026-05-05 JST
最終更新: 2026-05-26 JST

## 1. 目的

就活Pass の本番リリース準備に向けて、1 人運用で安全に戻せること、異常に気づけること、秘密情報を壊さないことを中心に整理する。

新規外部サービスは導入しない。運用計画は既存の Vercel / Railway / Supabase / Sentry / Stripe / GitHub Actions / Cloudflare DNS と repo scripts に限定する。

## 2. 完了条件

1. `docs/plan/plan-tasks.json` の未完了状態に、新規外部サービス導入を前提にしたタスクが残っていない。
2. リリース判定は `make ops-release-check`、`make deploy-check`、`make doctor-check`、既存 release scripts に寄っている。
3. rollback、secrets、monitoring、backup、incident 対応の残タスクが既存サービス前提で整理されている。
4. Stripe webhook を停止する可能性がある DB reset / release 作業では、停止中イベントの照合・再取得・重複処理が手順化されている。

## 3. タスク状態更新ルール

作業対象は `docs/plan/plan-tasks.json` から選ぶ。状態は `Todo` / `Doing` / `Blocked` / `Review` / `Done` / `Superseded` のみ使う。

旧 `Task Tracker` 由来の表がある場合も、実行可否は JSON を正とする。`sync-plan-tasks.mjs` は移行用であり、通常運用では Markdown から JSON を再生成しない。

## 4. 現状評価

| 領域 | 現状 | 方針 |
|---|---|---|
| リリース | `make ops-release-check`、`make deploy-stage-all`、`make deploy-production` が存在 | repo scripts を正本にする |
| rollback | `rollback-career-compass.sh` は dry-run 中心 | 自動実行化より、復旧判断・health 確認・監査ログを優先 |
| secrets | sync script と bundle 管理がある | 実 secret は読まず、`--check` と監査ログ方針を強化 |
| monitoring | Sentry-first の方針が既にある | Sentry と provider logs に集約 |
| backup / DR | Supabase と RAG rebuild 手順が分散 | Supabase backup / PITR 評価、RAG rebuild 手順を明文化 |

## 5. 外部サービス方針

次のサービスは新規導入しない。過去計画に残る必須タスクは `Superseded` とし、既存サービスへ置き換える。

| 旧前提 | 今回の扱い | 代替 |
|---|---|---|
| Better Stack | 必須タスクから除外 | Sentry、Vercel/Railway health、`make deploy-check` |
| Healthchecks.io | 必須タスクから除外 | Sentry Crons または既存 cron ログ確認 |
| Grafana Cloud / Loki | 必須タスクから除外 | Sentry、provider logs、既存 structured logs |
| UptimeRobot | 任意の冗長監視に限定 | Sentry uptime / existing health checks |
| Render / Fly.io / Neon | failover 必須案から除外 | 既存 Vercel / Railway / Supabase の復旧手順 |
| Slack / PagerDuty | 通知必須案から除外 | Sentry email、GitHub Issues、provider email |

Cloudflare は既存 DNS 運用として扱う。ただし WAF / Turnstile など新機能導入は今回の必須タスクにしない。

## 6. Release Gate

文書更新後の release gate は次の既存コマンドへ寄せる。

```bash
make ops-release-check
make doctor-check
HEALTH_TARGET=staging make deploy-check
HEALTH_TARGET=production make deploy-check
```

DB 接続や provider 認証が必要な確認はリリース直前にだけ実行する。文書更新の必須確認には含めない。

## 7. Stripe Webhook 停止を伴う作業

DB reset や production maintenance で Stripe webhook endpoint、cron、deploy を止める場合は、次を作業手順に含める。

1. 停止開始時刻と再開時刻を JST と UTC で記録する。
2. 対象 event type を明記する。
   `checkout.session.completed`、`customer.subscription.updated`、`customer.subscription.deleted`、`invoice.payment_succeeded`、`invoice.payment_failed`、`charge.refunded`、`charge.dispute.created`、`charge.dispute.closed`。
3. 再開後、Stripe API で停止期間中の event を確認する。
4. `processed_stripe_events` の `processing` / `succeeded` / `failed` 状態を照合する。
5. Stripe の subscription / invoice / charge / dispute の現状態を再取得し、DB の plan、credit、billing hold と突き合わせる。
6. Stripe webhook は再送・重複・順序未保証を前提にし、既に `succeeded` の event は重複処理せず、`failed` または stale `processing` は再処理候補として扱う。
7. 照合結果を release log または incident log に残す。

## 8. 残タスク

| Priority | Area | Task | Acceptance Criteria |
|---|---|---|---|
| P0 | Release | rollback 手順を dry-run 正本として整理する | 実行前確認、health check、監査ログ、DB migration 互換確認が手順化されている |
| P0 | Secrets | secrets sync の監査ログ方針を文書化する | secret 値を読まず、キー名・対象・実行者・時刻だけを記録する |
| P0 | Monitoring | Sentry-first monitoring を release gate に接続する | frontend/backend event 到達、alert、PII scrub が手順化されている |
| P0 | DB/Stripe | production reset 時の Stripe webhook 照合を追加する | 停止中 event、processed state、subscription / invoice 再取得が手順化されている |
| P1 | DR | Supabase backup / PITR 評価を更新する | RPO/RTO、費用、復元 rehearsal の有無が明確 |
| P1 | RAG | RAG rebuild 手順を文書化する | Chroma/BM25 はバックアップではなく再構築可能な導出物として扱う |

## 9. 検証

```bash
node scripts/plan/validate-plan-tasks.mjs
make ops-release-check
make doctor-check
```

`make ops-release-check` と `make doctor-check` は provider 認証や外部到達性に依存するため、文書更新時は任意、リリース直前は必須とする。
