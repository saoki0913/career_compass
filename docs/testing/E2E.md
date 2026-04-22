# Playwright E2E

## 前提

- フロント: `http://localhost:3000`（`PLAYWRIGHT_BASE_URL` で上書き可）
- ゲスト系・書き込み API は CSRF が必須。E2E ヘルパー（`e2e/fixtures/auth.ts`）は `GET /api/csrf` でトークン取得後に `POST /api/auth/guest` する。

## よく使うコマンド

| 目的 | コマンド |
|------|----------|
| 既に `npm run dev` 起動中 | `PLAYWRIGHT_SKIP_WEBSERVER=1 npm run test:e2e` |
| UI レビュー用スペックを **含めて** 全件実行 | `PLAYWRIGHT_UI_PATHS=/dashboard` などカンマ区切りでルートを渡す（未設定だと `e2e/ui-review.spec.ts` 読み込み時に失敗） |
| 主要フローだけ | `npm run test:e2e:major` |
| Live AI（別設定・FastAPI 要） | `npm run test:e2e:major:live`（`playwright.live.config.ts`） |

## `PLAYWRIGHT_UI_PATHS`

`npm run test:e2e` は `e2e/ui-review.spec.ts` も対象に含むため、環境変数 `PLAYWRIGHT_UI_PATHS` にレビュー対象パス（例: `/dashboard`）を渡すか、`e2e/ui-review.spec.ts` を除外したプロジェクト用の設定を別途用意する。

## トラブルシュート

- **ゲスト `POST /api/auth/guest` が 403**: CSRF 不足。`loginAsGuest` / `ensureGuestSession` が `x-csrf-token` と CSRF Cookie を付けているか確認。
- **並列実行で不安定**: 一時的に `npx playwright test --workers=1` で切り分け。
