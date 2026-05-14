# 監視・ログ・障害対応 設計計画書

> **Task state SSOT**: 実装フェーズのタスク状態は `docs/plan/plan-tasks.json` を正本とする。更新は `node scripts/plan/update-plan-task-status.mjs --id <task-id> --status <status> --source-plan <plan.md>`（または統合 JSON の完全な `id`）で行う。Markdown 内の Task Board / Task Tracker は計画本文として残すが、最新状態は統合 JSON を優先する。

> **現状同期メモ（2026-05-13）**: FastAPI principal / internal JWT / SSE lease は導入済みだが、SSE actor key は feature 間で不一致があり、client disconnect → provider abort → lease release → billing cancel の end-to-end contract と FastAPI error envelope は未統一。`plan-sync:fastapi-sse-contract` を優先する。


作成日: 2026-05-05 JST
ステータス: 設計完了（実装待ち）
対象: 就活Pass 全サービス（Next.js / FastAPI / Supabase / 外部 API）
成果物: 本計画書 1 本（10 領域の設計方針 + 10 ランブック + フェーズ別ロードマップ）

---

## 1. 目的

就活Pass の本番運用に向けて、監視・ログ・障害対応の全領域を設計する。

現状は構造化ログ（秘密値マスク済み）と Railway 自動リスタートのみで、APM・分散トレーシング・ランブック・自動ロールバックが未導入。本計画書は無料枠中心・1 人運用・リリース前の段階で、以下の 10 領域をカバーする。

| # | 領域 | 概要 |
|---|------|------|
| T1 | APM / Error Tracking | Sentry Free 導入（Next.js + FastAPI） |
| T2 | Log Aggregation | 構造化ログ集約（Sentry + Grafana Cloud Loki） |
| T3 | Alert System | アラート体系（メール通知 + UptimeRobot） |
| T4 | Distributed Tracing | Sentry tracing（OTel は延期） |
| T5 | Incident Runbooks | サービス別障害対応手順書 10 本 |
| T6 | Rollback | 手動ロールバック自動化 |
| T7 | Frontend Monitoring | ブラウザクラッシュ報告・Web Vitals |
| T8 | Private Dashboard | 自分用運用ダッシュボード |
| T9 | DB Monitoring | クエリ性能監視（Drizzle + pg_stat） |
| T10 | Background Job Monitoring | Cron ジョブ監視・リトライ |

### ユーザー確認済み方針

- **コスト**: 無料枠中心（Sentry Free, Grafana Cloud Free, UptimeRobot Free）
- **通知チャネル**: メールのみ（Slack / Discord / LINE 不使用）
- **OTel**: 延期。Sentry tracing で十分（Phase 2 再評価）
- **ロールバック**: 手動判断のみ
- **ステータスページ**: 公開不要。自分用ダッシュボードのみ
- **ユーザー規模**: リリース前 / 数人
- **深夜対応**: 現時点不要。Phase 2 でモバイル push 検討

---

## 2. 完了条件

1. `docs/plan/monitoring-logging-incident-response-plan.md` に 10 領域すべての設計方針・ツール選定理由・既存コード接続点が記載されている
2. Phase 0 / 1 / 2 のフェーズ分けと工数見積もりが明確
3. Task Tracker が実装フェーズでそのまま使える粒度になっている
4. ランブック 10 本のテンプレートと主要 3 本（Vercel Down / Railway Down / LLM Outage）の完成版が含まれている
5. Codex plan review の findings が反映済み

---

## 3. タスク状態更新ルール

本計画書を実装フェーズで使う場合、以下の反復で進める。

1. Task Tracker から未完了タスクを 1 件選ぶ
2. 対象コードを読み、必要ならテストを先に追加する
3. 実装・検証の進捗に合わせて Status と Updated At を更新する
4. 受け入れ条件を満たしたら Review → レビュー後 Done にする
5. Done 以外が残っている場合は 1 に戻る

Status は以下のみを使う:

- `Todo`: 未着手
- `In Progress`: 実装中
- `Blocked`: 外部判断または環境要因待ち
- `Review`: 実装済み、検証またはレビュー待ち
- `Done`: 受け入れ条件を満たした

---

## 4. Task Tracker

| Status | Priority | Area | Task | Evidence | Acceptance Criteria | Updated At |
|---|---:|---|---|---|---|---|
| Todo | P0 | APM/Error Tracking | Sentry Free 導入（Next.js + FastAPI 両方） | `src/lib/logger.ts`, `backend/app/main.py`, `next.config.ts` | @sentry/nextjs + sentry-sdk[fastapi] が導入済み。beforeSend で PII scrub。source maps 自動アップロード。新規 error が Sentry dashboard に到達する | 2026-05-05 |
| Todo | P0 | Sanitizer | 共有 sanitizer module 切り出し | `src/lib/logger.ts:6` (SENSITIVE_PATTERNS private) | `src/lib/sanitize.ts` と `backend/app/utils/sanitizer.py` が存在し、logger と Sentry 両方から使用。既存テストが pass | 2026-05-05 |
| Todo | P0 | Alerting | UptimeRobot 外部監視 8 monitors 設定 | `backend/app/routers/health.py` | 本番 FE/BE/ready + staging + SSL cert がメール通知で監視される。downtime 検知メールが届く | 2026-05-05 |
| Todo | P1 | Log Aggregation | FastAPI → Grafana Cloud Loki push handler | `backend/app/utils/secure_logger.py:63` | production で JSON format ログが Loki に到達。request_id は structured field（label でない） | 2026-05-05 |
| Todo | P1 | Frontend | error.tsx 強化 + global-error.tsx 新規作成 | `src/app/(product)/error.tsx:15` | captureException で Sentry に送信。global-error.tsx がルートレベル error を捕捉 | 2026-05-05 |
| Todo | P1 | Rollback | rollback-career-compass.sh の実装化 | `scripts/release/rollback-career-compass.sh:47` | --confirm で Vercel/Railway rollback 実行可能。前後 health check、DB migration 判定付き | 2026-05-05 |
| Todo | P1 | Runbooks | インシデントランブック 10 本作成 | `docs/ops/OBSERVABILITY.md` | `docs/ops/runbooks/` に 10 ファイル。主要 3 本は copy-paste 可能な diagnosis commands 付き | 2026-05-05 |
| Todo | P1 | Cron Monitoring | Sentry Crons + GHA retry 設定 | `.github/workflows/calendar-sync-cron.yml` | 3 cron jobs が Sentry Crons で監視。calendar-sync に 3 回リトライ。missed execution でメール通知 | 2026-05-05 |
| Todo | P2 | DB Monitoring | Drizzle custom logger + slow query 検出 | `src/lib/db/index.ts:58` | query duration 計測。200ms 超で structured log 出力。`make db:slow-queries` ターゲット追加 | 2026-05-05 |
| Todo | P2 | Dashboard | Grafana Cloud ダッシュボード構築 | `backend/app/rag/telemetry.py` | backend ログ + RAG メトリクスの可視化。weekly review で使用可能 | 2026-05-05 |

---

## 5. 現状の既存基盤

### 5.1 構造化ログ（実装済み）

**Frontend**: `src/lib/logger.ts`

```
SENSITIVE_PATTERNS (7 patterns) → redactSensitive() → sanitizeError()
↓
logError(context, error, extra) → console.error(JSON.stringify(payload))
```

- 91 ファイルで import 済み
- 秘密値自動マスク（OpenAI key, Anthropic key, Stripe secret, Bearer token, session token, email）
- production では stack trace 省略

**Backend**: `backend/app/utils/secure_logger.py`

```
_SENSITIVE_PATTERNS → _RedactingFormatter → get_logger(name)
↓
log_error(context, error, extra) → structured log to stdout
```

- 263 箇所で logger 使用
- production は INFO レベル、development は DEBUG レベル
- 現状は text format（JSON format は未実装）

### 5.2 Request ID 伝播（実装済み）

```
Browser → Next.js BFF → FastAPI
         X-Request-Id    X-Request-Id
         (生成 or 継承)   (継承 or 生成)
```

- `src/bff/api/error-response.ts:23` — UUID 生成、レスポンスヘッダーに付与
- `backend/app/main.py:34` — RequestIdMiddleware で `request.state.request_id` に保存
- エラーレスポンスの `requestId` フィールドでクライアントまで到達

### 5.3 Server-Timing ヘッダー（実���済み）

`src/bff/api/server-timing.ts` — 20+ API routes で identity / db / serialize ステージの計測。ブラウザ DevTools で即座に確認可能。

### 5.4 RAG Prometheus メトリクス��実装済み）

`backend/app/rag/telemetry.py` — 9 メトリクス（Counter / Histogram）。内部ポート `127.0.0.1:9464` で export。

| メトリク��� | 種別 | 用途 |
|---|---|---|
| `rag_retrieval_requests_total` | Counter | 検索リクエスト成否 |
| `rag_retrieval_duration_seconds` | Histogram | ステージ別レイテンシ |
| `rag_expansion_cache_hits_total` | Counter | キャッシュ効率 |
| `rag_rerank_invocations_total` | Counter | Reranker 呼び出し数 |
| `rag_rerank_duration_seconds` | Histogram | Reranker レイテンシ |
| `rag_bm25_resync_total` | Counter | BM25 再同期頻度 |
| `rag_principal_missing_total` | Counter | テナント principal 欠落 |
| `rag_principal_mismatch_total` | Counter | テナント境界違反（セキュリティ） |
| `rag_tenant_key_filter_miss_total` | Counter | テナントフィルタ miss |

### 5.5 Health Check（実装済み）

- `/health` — liveness（`backend/app/routers/health.py:11`）
- `/health/ready` — readiness: settings / imports / LLM key 検証（`backend/app/routers/health.py:16`）
- Railway: `healthcheckPath=/health`, `restartPolicyType=ON_FAILURE`, `maxRetries=3`

### 5.6 エラーレスポンス統一（実装済み）

- `createApiErrorResponse()`: 348 箇所で使用。`userMessage` + `action` + `requestId` + dev 限定 `debug`
- `AppUiError`: クライアントサイドの構造化エラー。ネットワーク障害検出、メッセージフィルタリング付き
- `src/lib/client-error-ui.ts`: snackbar 通知 + 5 秒クールダウン

### 5.7 その他の既存防御

- **Circuit Breaker**: LLM プロバイダー向け（threshold=3, reset=5min）`backend/app/utils/llm_client_registry.py`
- **Rate Limiting**: Upstash Redis + in-memory fallback `src/lib/rate-limit.ts`
- **LLM Cost Tracking**: X-LLM-Tokens-Used ヘッダー `backend/app/utils/llm_usage_cost.py`
- **Error Boundary**: `src/app/(product)/error.tsx` — console.error のみ（Sentry 未連携）

### 5.8 重大なギャップ

| ギャップ | 影響 | 本計画での対応 |
|---|---|---|
| APM / エラートラッキングなし | 障害に気づけない。エラー分析不可 | T1: Sentry Free |
| 分散トレーシングなし | 遅延の根本原因特定が困難 | T4: Sentry tracing |
| フロントエンド crash reporting なし | ユーザー側エラーが見えない | T7: Sentry Browser SDK |
| ログ集約なし | Railway/Vercel ログが散在。横断検索不可 | T2: Sentry + Loki |
| ランブックなし | 障害時に場当たり対応。復旧遅延 | T5: 10 ランブック |
| 自動ロールバック未実装 | rollback script が dry-run のみ | T6: script 実装化 |
| 外部死活監視なし | ダウンに気づくのがユーザー苦情のみ | T3: UptimeRobot |
| Cron ジョブ監視なし | 実行失敗・未実行に気づけない | T10: Sentry Crons |
| DB クエリ監視なし | slow query が放置される | T9: Drizzle logger |

---

## 6. T1 — APM / Error Tracking: Sentry Free

### 6.1 ツール選定

| 候補 | 無料枠 | 判定 |
|---|---|---|
| Sentry Free | 5K errors/mo, 10K transactions/mo, 50 replays/mo | **採用**: Next.js App Router + FastAPI first-class 対応。Source map, release tracking 付き |
| Bugsnag Free | 250 errors/mo | 却下: 枠が小さすぎる |
| LogRocket Free | 1,000 sessions/mo | 却下: セッション録画寄り |

### 6.2 アーキテクチャ

```
Browser (React 19)                Next.js Server (Vercel)           FastAPI (Railway)
  |                                  |                                |
  | @sentry/nextjs                   | @sentry/nextjs                 | sentry-sdk[fastapi]
  | (Browser SDK)                    | (Node/Edge SDK)                | (Python SDK)
  |                                  |                                |
  | captureException                 | logError() →                   | log_error() →
  | via error.tsx                    |   条件付き captureException    |   条件付き capture_exception
  |                                  |                                |
  +----------------------------------+--------------------------------+
                                     |
                                Sentry Cloud (Free 5K errors/mo)
                                     |
                              Email Alerts →  Gmail
```

### 6.3 既存コードとの接続

**二重送信防止戦略** (Codex review F2 反映):

`console.error` 自動捕捉に依存せず、`logError()` に明示的 Sentry transport を集約する。

```
[変更] src/lib/logger.ts
  logError(context, error, extra)
    1. 既存: console.error(JSON.stringify(payload))
    2. 追加: if (Sentry.isInitialized() && isUnexpectedError(error))
                 Sentry.captureException(error, { tags: { context }, extra })
    3. dedup: requestId + context + code で同一エラーの重複排除
```

`createApiErrorResponse()` には Sentry 呼び出しを追加しない（logError 経由で集約済み）。

**共有 Sanitizer** (Codex review F1 反映):

```
[新規] src/lib/sanitize.ts
  export const SENSITIVE_PATTERNS = [...];
  export function redactSensitive(text: string): string;
  export function scrubObject(obj: unknown): unknown;  // 再帰的 scrub

[変更] src/lib/logger.ts
  import { SENSITIVE_PATTERNS, redactSensitive } from "@/lib/sanitize";
  // 既存の private SENSITIVE_PATTERNS を削除

[新規] backend/app/utils/sanitizer.py
  SENSITIVE_PATTERNS = [...]
  def redact_sensitive(text: str) -> str
  def scrub_dict(d: dict) -> dict  // 再帰的 scrub

[変更] backend/app/utils/secure_logger.py
  from app.utils.sanitizer import SENSITIVE_PATTERNS, redact_sensitive
```

**FastAPI Sentry Init** (Codex review F5 反映):

```
[新規] backend/app/observability/sentry_setup.py
  def init_sentry(settings):
    sentry_sdk.init(
      dsn=settings.sentry_dsn,
      environment=settings.environment,
      release=settings.sentry_release,
      traces_sample_rate=0.05,
      send_default_pii=False,
      before_send=_scrub_event,
    )

[変更] backend/app/main.py
  from app.observability.sentry_setup import init_sentry
  # startup event で init_sentry(settings)
```

### 6.4 PII Scrubbing

- `sendDefaultPii: false` 明示
- IP アドレス送信無効
- request body 原則送信しない
- `event.request.headers` から Authorization, Cookie, X-Device-Token 除去
- ES 本文・メールアドレス・cookie・token は event に含めない
- `userId` / `guestId`（UUID）は安定識別子として使用可（privacy policy に明記）

### 6.5 Sampling 設定

| 項目 | 値 | 理由 |
|---|---|---|
| tracesSampleRate (FE) | 0.1 (10%) | 500 req/day x 10% = 50/day = 1,500/mo < 10K |
| tracesSampleRate (BE) | 0.05 (5%) | LLM 呼び出しが長時間。低サンプリングで十分 |
| replaysSessionSampleRate | 0 | 通常セッションは録画しない |
| replaysOnErrorSampleRate | 1.0 | エラー時は 100% 録画（50 replays/mo 上限） |

### 6.6 Source Map / Release

- `next.config.ts` を `withSentryConfig()` でラップ
- `hideSourceMaps: true` で公開防止
- `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT` を Vercel env に設定
- release: `VERCEL_GIT_COMMIT_SHA`（FE）、`RAILWAY_GIT_COMMIT_SHA`（BE）

---

## 7. T2 — Log Aggregation

### 7.1 Vercel Hobby 制約

Vercel Log Drains は Pro プラン（$20/mo）以上が必要。Hobby では利用不可。

### 7.2 設計方針

| レベル | 集約先 | Phase |
|---|---|---|
| Error | Sentry（T1 で自動集約） | Phase 0 |
| Warn / Info (FastAPI) | Grafana Cloud Loki（直接 push） | Phase 1 |
| Warn / Info (Next.js) | 未集約（Sentry のみ） | Phase 2 (Vercel Pro 移行時) |

### 7.3 FastAPI → Loki 連携

```
[変更] backend/app/utils/secure_logger.py
  production: _RedactingFormatter → JSON formatter に切り���え
  development: 既存の text format 維持

[新規] backend/app/observability/loki_handler.py
  class LokiHandler(logging.Handler):
    # HTTP push to Grafana Cloud Loki
    # Batch buffer (10 entries or 5s) → async push
    # Fail-soft: push 失敗時は stderr に fallback
```

### 7.4 Loki Labels 設計 (Codex review F3 反映)

高 cardinality label を避け、structured field で詳細情報を保持:

| Labels (低 cardinality) | Fields (JSON body) |
|---|---|
| `service=frontend\|backend` | `request_id` |
| `env=production\|staging` | `user_id`, `guest_id` |
| `level=error\|warn\|info` | `context`, `code` |
| | `duration_ms`, `extra` |

### 7.5 Grafana Cloud Free

- 50 GB ログ / 14 日 retention
- 推定使用量: FastAPI ~3 MB/mo（500 req/day）→ 上限の 0.006%
- Upgrade trigger: 10,000 アクティブユーザー超過時

---

## 8. T3 — Alert System

### 8.1 重大度定義

| Level | Name | 説明 | 応答 SLA | 夜間 (23:00-07:00 JST) |
|---|---|---|---|---|
| P0 | Critical | サービス全停 / データ漏洩 | 15 分 | 現時点は翌朝対応（Phase 2 でモバイル push 検討） |
| P1 | High | 主要機能障害 / 決済異常 | 1 時間 | 翌朝対応 |
| P2 | Medium | 非主要���能障害 / エラー率上昇 | 4 時間 | 翌朝対応 |
| P3 | Low | 軽微 / パフォーマンス劣化 | 翌営業日 | 翌営業日 |

### 8.2 通知チャネル

| ソース | P0/P1 | P2/P3 |
|---|---|---|
| Sentry | 即時メール（新規 issue） | Weekly digest |
| UptimeRobot | 即時メール（downtime） | — |
| Grafana (Phase 1) | メール alert rule | — |

### 8.3 UptimeRobot 外部監視

UptimeRobot Free（50 monitors, 5 分間隔）:

| # | Monitor | URL / Check | Type | Alert |
|---|---------|-------------|------|-------|
| 1 | 本番 Frontend | `https://www.shupass.jp` | HTTP(s) 200 | P0 |
| 2 | 本番 Backend Health | `https://shupass-backend-production.up.railway.app/health` | HTTP(s) 200 | P0 |
| 3 | 本番 Backend Ready | `.../health/ready` | HTTP(s) 200 | P1 |
| 4 | Staging Frontend | `https://stg.shupass.jp` | HTTP(s) 200 | P2 |
| 5 | Staging Backend | `https://stg-api.shupass.jp/health` | HTTP(s) 200 | P2 |
| 6 | Apex Redirect | `https://shupass.jp` | HTTP(s) 301/302 | P2 |
| 7 | robots.txt | `https://www.shupass.jp/robots.txt` keyword "shupass" | Keyword | P3 |
| 8 | SSL 証明書 | `https://www.shupass.jp` cert >14d | SSL | P1 |

### 8.4 Alert Taxonomy

**Infrastructure**:

| Alert | Condition | Severity |
|---|---|---|
| Frontend down | UptimeRobot: non-2xx x 2 checks (10min) | P0 |
| Backend down | UptimeRobot: /health non-2xx x 2 checks | P0 |
| Backend not ready | /health/ready 503 | P1 |
| Supabase connection | DB timeout >5s or connection refused | P0 |
| SSL cert expiry <14d | UptimeRobot SSL check | P1 |

**Application**:

| Alert | Condition | Severity |
|---|---|---|
| 5xx spike | >5 server errors / 5min | P1 |
| SSE streaming timeout | >10 drops / 5min | P2 |
| Auth failure spike | >10 failures / 5min | P1 |
| LLM circuit open | CircuitBreaker opens | P1 |

**Business**:

| Alert | Condition | Severity |
|---|---|---|
| Stripe webhook failure | Webhook 5xx or idempotency error | P1 |
| Credit system anomaly | >20 token limit errors / hour | P2 |
| LLM provider outage (both) | Anthropic AND OpenAI circuits open | P0 |

**Security**:

| Alert | Condition | Severity |
|---|---|---|
| Tenant boundary violation | `rag_principal_mismatch_total > 0` / 1h | P0 |
| Tenant filter miss | miss rate >1% / 5min | P1 |
| CSRF failure spike | >5 failures / 5min | P1 |

### 8.5 Fatigue Prevention

- Sentry issue grouping で同一エラーの重複を自動集約
- Sentry digest: P2/P3 は weekly digest にまとめて配信
- UptimeRobot: 2 回連続失敗でアラート（1 回のみの瞬断は無視）
- 週次レビュー: 10 回以上 fire したが対応不要だったアラートは閾値調整 or 降格

---

## 9. T4 — Distributed Tracing

### 9.1 方針: OTel 延期、Sentry tracing で代替

| 項目 | OpenTelemetry | Sentry Tracing | 判定 |
|---|---|---|---|
| パッケージ数 | 8+ packages | 0 (T1 に含む) | Sentry |
| 設定ファイル | 4+ config files | 0 (T1 で完了) | Sentry |
| BFF→FastAPI 越境 | 手動設定必要 | 自動 (fetch patch) | Sentry |
| Vendor lock-in | なし | Sentry に依存 | OTel |
| Solo 保守コスト | 高 | 低 | Sentry |

### 9.2 Trace Propagation

Sentry SDK 導入時、`@sentry/nextjs` は `fetch()` を自動パッチして `sentry-trace` / `baggage` ヘッダーを付与。FastAPI 側の `sentry-sdk[fastapi]` が自動で受け取る。

既存の `X-Request-Id` は human-readable correlator として維持。

### 9.3 Server-Timing との関係

`src/bff/api/server-timing.ts` は維持。目的が異なる:

- Server-Timing: ブラウザ DevTools で即座にステージ別計測（外部依存なし）
- Sentry tracing: 集約・分析・アラート（Sentry Cloud 依存）

Phase 2 で OTel 移行時に、`measure()` を OTel span 生成にも拡張可能。

### 9.4 Phase 2 再評価条件

- Sentry tracing で trace の欠落が頻発する場合
- vendor-neutral export が必要になった場合
- Grafana Cloud Tempo を活用したい場合

---

## 10. T5 — Incident Runbooks

### 10.1 ランブックテンプレート

```markdown
# Runbook: [INCIDENT NAME]
## Severity: P0 / P1 / P2
## Last Reviewed: YYYY-MM-DD

### Symptoms
- 観察可能な兆候

### Detection
- どのアラートが発火するか

### Diagnosis (Copy-Paste Commands)
1. step-by-step で実行するコマンド

### Remediation
- リスクの低い順に並べた復旧手順

### Escalation
- ベンダーサポート連絡先

### Post-Incident
- フォローアップチェックリスト
```

### 10.2 Runbook 1: Vercel Frontend Down (P0)

**Symptoms**: UptimeRobot alert; ブランクページ / 500。

**Diagnosis**:

```bash
curl -I https://www.shupass.jp
curl -I https://shupass.jp
vercel ls --prod 2>&1 | head -5
dig www.shupass.jp @1.1.1.1
dig www.shupass.jp @8.8.8.8
```

**Remediation**:

1. **Vercel プラットフォーム障害** → `vercel-status.com` 確認。復旧待ち
2. **不良デプロイ** → Vercel Dashboard > Deployments > 前回成功デプロイの "Promote to Production"。CLI: `vercel rollback`
3. **ビルド失敗が main に入った** → CI バイパスを調査。Vercel から rollback
4. **Cloudflare DNS 障害** → `cloudflarestatus.com` 確認。復旧待ち

### 10.3 Runbook 2: Railway Backend Down (P0)

**Symptoms**: UptimeRobot alert; API エラー; SSE 失敗。

**Diagnosis**:

```bash
curl -s https://shupass-backend-production.up.railway.app/health
curl -s https://shupass-backend-production.up.railway.app/health/ready
railway status
railway logs --tail 200
railway logs --tail 500 | grep -iE "OOM|killed|error|traceback|memory"
```

**Remediation**:

1. **OOM** → Railway Settings > Memory >= 2GB 確認。再デプロイ
2. **Health check timeout** → `healthcheckTimeout` 延長
3. **Volume corruption** → Runbook 7 参照
4. **アプリバグ** → Railway Dashboard > 前回成���デプロイを Redeploy
5. **Railway 障害** → `status.railway.com` ��認。復旧��ち

### 10.4 Runbook 4: LLM Provider Outage (P1/P0)

**Symptoms**: AI 機能エラー; SSE 途中終了; circuit breaker open。

**Diagnosis**:

```bash
railway logs --tail 200 | grep "llm.circuit"
railway logs --tail 100 | grep "circuit.open"
# Anthropic: https://status.anthropic.com/
# OpenAI: https://status.openai.com/
```

**Remediation**:

1. **単一プロバイダー障害** → CircuitBreaker が自動代替ルーティング
2. **両プロバイダー同時障害 (P0)** → AI 機能全停止。非 AI 機能は利用可能。復旧待ち
3. **Rate limit** → billing 確認。SSE 同時接続数を一��的に制限
4. **Billing 問題** → クレジットカード有効性確認

### 10.5 残り 7 ランブック（実装時作成）

| # | Runbook | Severity | 概要 |
|---|---------|----------|------|
| 3 | Supabase Database Issues | P1 | Connection pool, slow queries, RLS, migration drift |
| 5 | Stripe Webhook Failure | P1 | Signature mismatch, missed events, plan mismatch |
| 6 | SSE Streaming Failure | P2 | Function timeout, Redis down, LLM slow |
| 7 | ChromaDB/BM25 Corruption | P1 | Index corruption, volume lost, re-ingest |
| 8 | Security Incident | P0 | Tenant breach, CSRF exploit, credential exposure |
| 9 | Cron Job Failure | P2 | GHA not running, CRON_SECRET mismatch |
| 10 | DNS/SSL Issue | P1 | Cloudflare outage, cert expired, domain expired |

### 10.6 Post-Mortem テンプレ��ト

```markdown
# Post-Mortem: [TITLE]
Date: YYYY-MM-DD | Severity: P0/P1/P2 | Duration: XX min

## Timeline (JST)
| Time | Event |
|------|-------|

## Root Cause
5-Whys 分析。

## Impact
影響ユーザー / 機能 / 収益。

## Prevention
| Action | Deadline | Status |
|--------|----------|--------|
```

---

## 11. T6 — Rollback

### 11.1 コンポーネント別

| Component | 方法 | 所要時間 | リスク |
|---|---|---|---|
| Vercel | `vercel rollback <deployment>` | <30 秒 | なし（stateless） |
| Railway | Dashboard > Redeploy previous | 1-3 分 | DB migration が destructive なら不可 |
| Database | 手動 reverse migration SQL | 5-30 分 | destructive 後は forward-fix |

### 11.2 判断ツリー

```
障害検知（デプロイ後）
├── サイト完全停止? → 即時 rollback
│   └── DB migration destructive? → forward-fix 必須
├── Frontend のみ? → Vercel rollback のみ
├── Backend のみ? → Railway redeploy previous
├── 間欠的 / <5%? → 15 分監視 → forward-fix
└── 30 分以上経過? → forward-fix 優先
```

### 11.3 Script 実装方針

`scripts/release/rollback-career-compass.sh`:

1. `release_die` 削除
2. `--confirm` フラグ追加（明示的承認必須）
3. ガードレール:
   - release-engineer 管轄であること
   - 直近 migration に destructive 操作がな��こと
   - 実行前後 health check (`wait_for_http_ok`)
   - repo script 経由限定
4. Vercel rollback + Railway redeploy 実行
5. Post-rollback health check

---

## 12. T7 — Frontend Monitoring

### 12.1 Error Boundary 強化

```
[変更] src/app/(product)/error.tsx:15
  Before: console.error("[ProductError]", error.message, error.digest)
  After:  Sentry.captureException(error, { tags: { digest, boundary: "product" } })

[新規] src/app/global-error.tsx
  Root layout エラー捕捉 → Sentry 送信
```

### 12.2 Session Replay / Web Vitals

- Session Replay: on-error only（50 replays/mo free）
- Web Vitals: `@sentry/nextjs` 自動報告（CLS, LCP, INP, FCP, TTFB）
- Privacy: `maskAllInputs: true`

### 12.3 SSE Custom Breadcrumbs

対象: `useESReview.ts`, `useMotivationConversationController.ts`, `useInterviewConversationController.ts`

- Stream start / complete / error を breadcrumb に記録
- エラー trace に SSE ライフサイクルが含まれるようになる

### 12.4 User Context

```typescript
Sentry.setUser({ id: userId || guestId || 'anonymous' });
Sentry.setTag('plan', userPlan); // 'guest' | 'free' | 'standard' | 'pro'
```

---

## 13. T8 — Private Dashboard

| ツール | 用途 | Phase |
|---|---|---|
| Sentry Issues Dashboard | エラー一覧・トレンド | Phase 0 |
| UptimeRobot Dashboard | uptime 履歴 | Phase 0 |
| Grafana Cloud | Backend ログ・RAG メトリクス | Phase 1 |

### 運用ルーティン

| 頻度 | タスク | 所要時間 |
|---|---|---|
| 毎朝 | Sentry + UptimeRobot メール確認 | 5 分 |
| 毎週 | Sentry Issues レビュー | 10 分 |
| 毎週 | `make db:slow-queries` | 10 分 |
| 毎月 | Sentry quota + Grafana volume 確認 | 15 分 |

---

## 14. T9 — DB Monitoring

### 14.1 Drizzle Custom Logger

`src/lib/db/index.ts` に追加。query duration 計測、200ms 超で slow query ログ。

### 14.2 pg_stat_statements

```sql
SELECT query, calls, mean_exec_time, total_exec_time
FROM pg_stat_statements
WHERE mean_exec_time > 100
ORDER BY total_exec_time DESC LIMIT 20;
```

`make db:slow-queries` で週次実行。

### 14.3 N+1 Detection (Phase 2)

AsyncLocalStorage で request scope 保持 → query count tracking (>10 queries = warning)。serverless 互換性を Phase 2 で検証。

---

## 15. T10 — Background Job Monitoring

### 15.1 設計判断

Bull/BullMQ は導入しない（Upstash Free 10K commands/day では不足。別 worker = コスト増）。HTTP cron 維持。

### 15.2 Retry

`.github/workflows/calendar-sync-cron.yml` に 3 回リトライ（15s / 30s / 45s backoff）。

### 15.3 Heartbeat

Sentry Crons（3 monitors free）:

| Monitor | Schedule | Grace |
|---|---|---|
| calendar-sync | `*/30 * * * *` | 10 min |
| daily-notifications | `0 0 * * *` | 30 min |
| hourly-daily-summary | `0 * * * *` | 15 min |

### 15.4 Duration Tracking

各 cron endpoint に `durationMs` 追加。30s 超過で Sentry event。

### 15.5 Idempotency / DLQ

- daily-notifications: JST 日付ベース重複防止
- Phase 2: `failed_background_jobs` テーブルで失敗ジョブ可視化

---

## 16. Phase Plan

### Phase 0: Quick Wins (Day 1-2, ~4h)

| Task | Effort | Impact |
|---|---|---|
| @sentry/nextjs 導入 + 4 config files | 1.5h | Error tracking + CWV + Replay |
| sentry-sdk[fastapi] + init helper | 1h | Backend error tracking |
| Vercel + Railway env vars 設定 | 15min | 有効化 |
| UptimeRobot 8 monitors | 30min | 外部死活監視 |
| Drizzle custom logger | 30min | Slow query 検出 |
| GHA calendar-sync retry | 15min | Cron 耐障害性 |

### Phase 1: Core (Week 1-3, ~12h)

| Task | Effort | Impact |
|---|---|---|
| 共有 sanitizer module (TS + Python) | 1.5h | PII 保護基盤 |
| Sentry beforeSend 調整 | 1h | Noise 削減 |
| error.tsx + global-error.tsx | 1h | Crash 完全捕捉 |
| User context 設定 | 30min | Debug context |
| secure_logger.py JSON formatter | 1h | Log 構造化 |
| Loki push handler | 2h | Backend ログ集約 |
| Rollback script 実装 | 1.5h | 復旧高速化 |
| Sentry Crons | 30min | Cron 監視 |
| Runbook 10 本 | 2h | 障害対応標準化 |
| `make db:slow-queries` | 30min | DB 週次レビュー |

### Phase 2: Enhancement (Month 2+, ~8h)

| Task | Effort | Impact |
|---|---|---|
| SSE custom breadcrumbs | 1.5h | Stream error debug |
| Per-request query counting | 1.5h | Query 最適化 |
| Grafana dashboard | 1.5h | 集中可視化 |
| DLQ テーブル + digest | 1.5h | DLQ 可視性 |
| OTel 再評価 | 30min | Architecture decision |
| モバイル push 検討 | 1h | 深夜対応改善 |

**総工数: ~24 時間**

---

## 17. 検証方法

```bash
# Phase 0
SENTRY_DSN=xxx npm run build        # source map upload
# ブラウザで意図的エラー → Sentry dashboard 確認
# UptimeRobot dashboard: 8 monitors green
npm run test:unit -- src/lib/db      # Drizzle logger

# Phase 1
npm run test:unit -- src/lib/sanitize
# Grafana > Explore > {service="backend"} でログ到達確認
make rollback-prod TARGET=<staging-id> --dry-run
# Sentry > Crons > 3 monitors OK
ls docs/ops/runbooks/                # 10 files
```

---

## 18. Codex Plan Review Findings

| # | Severity | Finding | Resolution |
|---|----------|---------|-----------|
| F1 | Medium | SENSITIVE_PATTERNS は private | 共有 sanitizer module に切り出し |
| F2 | Medium | console.error 自動捕捉は不確実 | logError() に明示的 Sentry transport |
| F3 | Medium | request_id Loki label は高 cardinality | JSON structured field に変更 |
| F4 | Medium | Rollback --confirm だけでは不十分 | health check / DB migration 判定追加 |
| F5 | Low | FastAPI Sentry init が main.py 肥大化 | 専用 helper に分離 |
| F6 | Low | Per-request query counting の scope 問題 | AsyncLocalStorage。Phase 2 で検証 |

---

## 19. 変更対象ファイル一覧

### 新規

| File | Phase |
|---|---|
| `src/instrumentation.ts` | 0 |
| `sentry.client.config.ts` | 0 |
| `sentry.server.config.ts` | 0 |
| `sentry.edge.config.ts` | 0 |
| `src/lib/sanitize.ts` | 1 |
| `src/app/global-error.tsx` | 1 |
| `backend/app/observability/sentry_setup.py` | 0 |
| `backend/app/utils/sanitizer.py` | 1 |
| `backend/app/observability/loki_handler.py` | 1 |
| `docs/ops/runbooks/*.md` (10 files) | 1 |

### 変更

| File | Phase |
|---|---|
| `next.config.ts` | 0 |
| `backend/app/main.py` | 0 |
| `backend/requirements.txt` | 0 |
| `src/lib/logger.ts` | 1 |
| `src/app/(product)/error.tsx` | 1 |
| `src/lib/db/index.ts` | 0 |
| `backend/app/utils/secure_logger.py` | 1 |
| `scripts/release/rollback-career-compass.sh` | 1 |
| `.github/workflows/calendar-sync-cron.yml` | 1 |
| `Makefile` | 1 |

---

## 20. Progress Log

| Date | Actor | Update |
|------|-------|--------|
| 2026-05-05 | Claude | 3 Explore agents で現状調査。10 ギャップ特定 |
| 2026-05-05 | User | スコープ・コスト・通知・OTel・Rollback 方針確定 |
| 2026-05-05 | Claude | 2 Plan agents で設計案作成 |
| 2026-05-05 | Codex | Plan Review PASS_WITH_CONCERNS。6 findings 反映 |
| 2026-05-05 | Claude | 計画書作成完了 |
