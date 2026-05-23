# Sentry の本番設定

[← インデックス](./README.md)

---

## 1. Sentry 設定（エラー追跡）

Phase 0 では Replay と tracing を使わず、error tracking のみ有効化する。設定前に `docs/operations/platform/MONITORING_SETUP.md` の送信禁止項目を確認する。

### Vercel

| 変数 | 用途 |
|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` | browser SDK |
| `SENTRY_NEXTJS_DSN` | server / edge SDK。未設定時のみ legacy `SENTRY_DSN` を fallback |
| `SENTRY_ORG` | source map upload |
| `SENTRY_PROJECT` | source map upload |
| `SENTRY_AUTH_TOKEN` | source map upload |
| `SENTRY_ENVIRONMENT` | `production` / `staging` |
| `SENTRY_RELEASE` | release id |

### Railway

| 変数 | 用途 |
|---|---|
| `SENTRY_FASTAPI_DSN` | FastAPI SDK。frontend project の DSN と混ぜない |
| `BACKEND_SENTRY_DSN` | FastAPI SDK の互換 alias |
| `SENTRY_DSN` | legacy fallback。新規設定では使わない |
| `SENTRY_ENVIRONMENT` | `production` / `staging` |
| `SENTRY_RELEASE` | release id |
| `SENTRY_TRACES_SAMPLE_RATE` | 既定 `0.05` |

## 2. Sentry-first 外部監視

本番リリース前の外部死活監視は Sentry を正とする。Sentry Dashboard で必須 3 monitors を作成し、email alert が有効であることを確認する。

| # | Monitor | URL | Type |
|---:|---|---|---|
| 1 | 本番 Frontend | `https://www.shupass.jp` | Uptime / HTTP 200 |
| 2 | 本番 Backend Health | `https://api.shupass.jp/health` | Uptime / HTTP 200 |
| 3 | 本番 Backend Ready | `https://api.shupass.jp/health/ready` | Uptime / HTTP 200 |

Sentry 側で body / header assertion を設定できる場合は、backend health に `X-Request-Id`、ready に `ready` 相当の body を追加確認する。staging、apex redirect（2026-05-09 実測: 307）、robots.txt、sitemap.xml は release blocker ではなく任意監視とする。

`*.railway.app` は Sentry Uptime の domain-wide limit に達しており、Railway 生成ドメインでは backend monitor を作成できない。backend uptime は最後に回し、Railway production backend に `api.shupass.jp` などの独自ドメインを設定してから作成する。

UptimeRobot を併用する場合は任意の冗長監視として扱う。最小構成は本番 Frontend と production backend health の 2 monitors で十分であり、網羅的な monitor 登録は本番リリース条件にしない。
