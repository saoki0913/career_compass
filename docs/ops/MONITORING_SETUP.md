# 監視セットアップ

最終更新: 2026-05-09

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

### Vercel env

| 変数 | 用途 |
|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` | browser SDK |
| `SENTRY_DSN` | server / edge SDK |
| `SENTRY_ORG` | source map upload |
| `SENTRY_PROJECT` | source map upload |
| `SENTRY_AUTH_TOKEN` | source map upload |
| `SENTRY_ENVIRONMENT` | `production` / `staging` |
| `SENTRY_RELEASE` | release id。未設定時は Vercel commit SHA |

### Railway env

| 変数 | 用途 |
|---|---|
| `SENTRY_DSN` | FastAPI SDK |
| `SENTRY_ENVIRONMENT` | `production` / `staging` |
| `SENTRY_RELEASE` | release id。未設定時は Railway commit SHA |
| `SENTRY_TRACES_SAMPLE_RATE` | 既定 `0.05` |

## UptimeRobot

Free plan は 5 分間隔の外部 HTTP/keyword 監視として使う。SSL expiry と heartbeat/dead-man は Free plan では満たせない可能性があるため、後続で Sentry Crons か paid monitor を選ぶ。

| # | Monitor | URL | Type | 期待値 |
|---:|---|---|---|---|
| 1 | 本番 Frontend | `https://www.shupass.jp` | HTTP(s) | 200 |
| 2 | 本番 Backend Health | `https://shupass-backend-production.up.railway.app/health` | HTTP(s) | 200 |
| 3 | 本番 Backend Ready | `https://shupass-backend-production.up.railway.app/health/ready` | HTTP(s) | 200 |
| 4 | Staging Frontend | `https://stg.shupass.jp` | HTTP(s) | 200 |
| 5 | Staging Backend | `https://stg-api.shupass.jp/health` | HTTP(s) | 200 |
| 6 | Apex Redirect | `https://shupass.jp` | HTTP(s) | 3xx（2026-05-09 実測: 307） |
| 7 | robots.txt | `https://www.shupass.jp/robots.txt` | Keyword | `shupass` |
| 8 | Backend request id | `https://shupass-backend-production.up.railway.app/health` | HTTP(s) | `X-Request-Id` response header |

通知先はメールのみ。1 回の瞬断は無視し、2 回連続失敗を P0/P1 として扱う。

## リリース前 CLI 確認結果 (2026-05-09 JST)

repo 内の監視リリース最低ラインは確認済み。外部 dashboard 操作は手作業で完了証跡を残す。

| 確認 | コマンド | 結果 |
|---|---|---|
| Vercel auth | `vercel whoami` | `saoki0913` で認証済み |
| Vercel deploy list | `vercel ls` | local link は `career-compass-staging`。Ready deployment あり。本番 project の確認は release script / dashboard 側で行う |
| Sentry projects | `sentry projects list` / `sentry project view ...` | `career-compass-frontend` / `career-compass-backend` は active。frontend は First Event あり、backend は No events yet |
| Secrets drift | `zsh scripts/release/sync-career-compass-secrets.sh --check` | check 完了。provider 自動注入キーと追加 provider key の warning は意図確認が必要 |
| Frontend | `curl -I https://www.shupass.jp` | 200 |
| Apex redirect | `curl -I https://shupass.jp` | 307 → `https://www.shupass.jp/` |
| Production backend health | `curl -sS -i https://shupass-backend-production.up.railway.app/health` | 200 + `X-Request-Id` |
| Production backend ready | `curl -sS -i https://shupass-backend-production.up.railway.app/health/ready` | 200 |
| Staging frontend | `curl -I https://stg.shupass.jp` | 200 |
| Staging backend health | `curl -sS -i https://stg-api.shupass.jp/health` | 200 + `X-Request-Id` |
| robots / sitemap | `curl -sS -i https://www.shupass.jp/robots.txt`, `curl -sS -i https://www.shupass.jp/sitemap.xml` | 200 |

### 手作業で残す確認

1. UptimeRobot に上記 8 monitors を登録し、email alert を確認する。
2. Sentry backend にテストイベントまたは実エラーが届くことを確認する。
3. `sync-career-compass-secrets.sh --check` の warning が provider 自動注入または意図した追加 key だけであることを確認する。
4. rollback は `make rollback-prod TARGET=<deployment-id-or-commit-sha>` の dry-run rehearsal に留める。provider rollback 実行は release-engineer 承認下で個別に行う。

## 後続タスク

- Sentry Crons で `calendar-sync`, `daily-notifications`, `hourly-daily-summary` を監視する。
- SSL expiry monitor は paid UptimeRobot または別サービスで導入する。
- Loki / Grafana log aggregation は PII scrub と Sentry 安定運用後に実施する。
- `/health/deep` は ChromaDB/BM25 volume に触れるため、Phase 0 では追加しない。
