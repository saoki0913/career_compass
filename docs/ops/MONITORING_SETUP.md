# 監視セットアップ

最終更新: 2026-05-10

本番リリース前の Phase 0 監視は、外部送信する情報を最小化してから有効化する。PII scrub の正本は `src/lib/sanitize.ts` と `backend/app/utils/sanitizer.py`。

## 送信してよい情報

| 種別 | 許可 |
|---|---|
| 識別 | `requestId`, `service`, `environment`, `release` |
| 経路 | `route`, `method`, `statusCode`, `feature` |
| 性能 | `durationMs`, `elapsed_ms`, 件数 |
| エラー | sanitizer 済み `name`, `message`, `code` |

## 送信禁止

- ES 本文、志望動機、ガクチカ、面接回答、プロンプト、LLM 出力全文
- `Authorization`, `Cookie`, `guest_device_token`, `x-device-token`, `X-Career-Principal`, CSRF token
- Stripe signature、API key、OAuth token、raw request body、raw response body、raw headers
- email、電話番号、住所などのユーザー直接識別情報

## Sentry

### 方針

- Replay は完全 OFF。
- `sendDefaultPii` は false。
- `beforeSend` で event 全体を recursive scrub する。
- DSN 未設定時は no-op とし、local/test を壊さない。
- Phase 0 では trace sampling は `0` に固定し、error event のみ送信する。trace 再開時は transaction/span の PII scrub テストを追加してから有効化する。

### Vercel env

| 変数 | 用途 |
|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` | browser SDK |
| `SENTRY_NEXTJS_DSN` | server / edge SDK。未設定時のみ legacy `SENTRY_DSN` を fallback |
| `SENTRY_ORG` | source map upload |
| `SENTRY_PROJECT` | source map upload |
| `SENTRY_AUTH_TOKEN` | source map upload |
| `SENTRY_ENVIRONMENT` | `production` / `staging` |
| `SENTRY_RELEASE` | release id。未設定時は Vercel commit SHA |

### Railway env

| 変数 | 用途 |
|---|---|
| `SENTRY_FASTAPI_DSN` | FastAPI SDK。frontend project の DSN と混ぜない |
| `BACKEND_SENTRY_DSN` | FastAPI SDK の互換 alias |
| `SENTRY_DSN` | legacy fallback。新規設定では使わない |
| `SENTRY_ENVIRONMENT` | `production` / `staging` |
| `SENTRY_RELEASE` | release id。未設定時は Railway commit SHA |
| `SENTRY_TRACES_SAMPLE_RATE` | Phase 0 では無視され、runtime 側で `0` 固定 |

## Sentry-first 外部監視

本番リリース前の外部監視は Sentry を正とする。Sentry CLI `0.31.0` には monitor 作成コマンドがないため、Uptime / Monitor の作成は Sentry Dashboard で行い、CLI は project / event / issue の確認に使う。

### 必須 Sentry monitor

| # | Monitor | URL | Type | 期待値 |
|---:|---|---|---|---|
| 1 | 本番 Frontend | `https://www.shupass.jp` | Uptime / HTTP | 200 |
| 2 | 本番 Backend Health | `https://api.shupass.jp/health` | Uptime / HTTP | 200 |
| 3 | 本番 Backend Ready | `https://api.shupass.jp/health/ready` | Uptime / HTTP | 200 |

通知先は email alert を最低 1 つ有効化する。1 回の瞬断は観測に留め、2 回連続失敗または 5 分以上の失敗継続を P0/P1 として扱う。Sentry 側で body / header assertion を設定できる場合は、backend health に `X-Request-Id`、ready に `ready` 相当の body を追加確認する。

### 2026-05-10 時点の進捗と制限

- Frontend uptime monitor は Sentry Dashboard で作成済み。`https://www.shupass.jp` の Recent Check-Ins は `Uptime` / `200` を確認済み。
- Frontend email alert は Sentry Dashboard の connected alert / test notification で最終確認する。
- Backend の Railway 生成ドメイン `*.railway.app` は Sentry Uptime 側の domain-wide limit に達しており、`https://shupass-backend-production.up.railway.app/health` と `/health/ready` の monitor は作成できない。
- Backend Sentry uptime monitor は最後に回す。Railway production backend に `api.shupass.jp` などの独自ドメインを割り当て、`https://api.shupass.jp/health` と `https://api.shupass.jp/health/ready` が 200 になることを確認してから作成する。
- Backend project は active だが、Sentry CLI では First Event が `No events yet`。backend event / trace 到達確認も最後の手作業に残す。

### 任意監視

以下は release blocker ではない。運用余力がある場合に Sentry monitor または別サービスへ追加する。

| Monitor | URL | 期待値 | 目的 |
|---|---|---|---|
| Staging Frontend | `https://stg.shupass.jp` | 200 | staging release 監視 |
| Staging Backend | `https://stg-api.shupass.jp/health` | 200 + `X-Request-Id` | staging backend 監視 |
| Apex Redirect | `https://shupass.jp` | 3xx（2026-05-09 実測: 307） | SEO / canonical 導線確認 |
| robots.txt | `https://www.shupass.jp/robots.txt` | 200 + `shupass` | SEO release 確認 |
| sitemap.xml | `https://www.shupass.jp/sitemap.xml` | 200 | SEO release 確認 |

UptimeRobot を使う場合も任意の冗長監視とし、最小構成は `https://www.shupass.jp` と production backend health の 2 monitors とする。網羅的な monitor 登録は本番リリースの必須条件にしない。

## リリース前 CLI 確認結果 (2026-05-09 JST)

repo 内の監視リリース最低ラインは確認済み。外部 dashboard 操作は手作業で完了証跡を残す。

| 確認 | コマンド | 結果 |
|---|---|---|
| Vercel auth | `vercel whoami` | `saoki0913` で認証済み |
| Vercel deploy list | `vercel ls` | local link は `career-compass-staging`。Ready deployment あり。本番 project の確認は release script / dashboard 側で行う |
| Sentry projects | `sentry projects list` / `sentry project view ...` | `career-compass-frontend` / `career-compass-backend` は active。frontend は First Event あり、backend は No events yet。Dashboard では frontend uptime check-in 200 を確認済み。backend uptime は `*.railway.app` 制限により独自ドメイン設定後へ deferred |
| Secrets drift | `zsh scripts/release/sync-career-compass-secrets.sh --check` | check 完了。provider 自動注入キーと追加 provider key の warning は意図確認が必要 |
| Frontend | `curl -I https://www.shupass.jp` | 200 |
| Apex redirect | `curl -I https://shupass.jp` | 307 → `https://www.shupass.jp/` |
| Production backend health | `curl -sS -i https://shupass-backend-production.up.railway.app/health` | 200 + `X-Request-Id` |
| Production backend ready | `curl -sS -i https://shupass-backend-production.up.railway.app/health/ready` | 200 |
| Staging frontend | `curl -I https://stg.shupass.jp` | 200 |
| Staging backend health | `curl -sS -i https://stg-api.shupass.jp/health` | 200 + `X-Request-Id` |
| robots / sitemap | `curl -sS -i https://www.shupass.jp/robots.txt`, `curl -sS -i https://www.shupass.jp/sitemap.xml` | 200 |

### 手作業で残す確認

1. Sentry Dashboard で frontend uptime monitor の connected alert と test notification を確認する。
2. Backend Sentry uptime monitor は最後に回す。Railway production backend に独自ドメインを設定後、`https://api.shupass.jp/health` と `/health/ready` の 2 monitors を作成し、email alert と green 状態を確認する。
3. Sentry backend にテストイベントまたは実エラーが届くことを確認する。
4. `sync-career-compass-secrets.sh --check` の warning が provider 自動注入または意図した追加 key だけであることを確認する。
5. rollback は `make rollback-prod TARGET=<deployment-id-or-commit-sha>` の dry-run rehearsal に留める。provider rollback 実行は release-engineer 承認下で個別に行う。

## 後続タスク

- Sentry Crons で `calendar-sync`, `daily-notifications`, `hourly-daily-summary` を監視する。
- SSL expiry monitor は Sentry monitor / paid UptimeRobot / 別サービスのいずれかで導入する。
- Loki / Grafana log aggregation は PII scrub と Sentry 安定運用後に実施する。
- `/health/deep` は ChromaDB/BM25 volume に触れるため、Phase 0 では追加しない。
