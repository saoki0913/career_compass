# ドキュメント一覧（地図）

**最終更新**: 2026-03-21

**この文書の目的**: `docs/` 配下の全ファイルへの入口です。初めての方は先に [OVERVIEW.md](./OVERVIEW.md) を読んでください。

**正しい動作の一次情報はコード**です。仕様書と実装が食い違う場合はコードを優先し、ドキュメントの修正 issue を立てるとよいです。

---

## 入口・仕様・進捗

| 文書 | 説明 |
|------|------|
| [OVERVIEW.md](./OVERVIEW.md) | 読み方ガイド（5分／30分／深掘り） |
| [SPEC.md](./SPEC.md) | 機能・非機能の仕様（冒頭に人向け要約あり） |
| [PROGRESS.md](./PROGRESS.md) | 実装進捗（冒頭に人向け要約あり） |

---

## 開発・環境 (setup/)

| 文書 | 説明 |
|------|------|
| [setup/DEVELOPMENT_AND_ENV.md](./setup/DEVELOPMENT_AND_ENV.md) | Quick Start、コマンド、環境変数・外部サービス（旧 DEVELOPMENT + ENV_SETUP） |
| [setup/DB_SUPABASE.md](./setup/DB_SUPABASE.md) | Supabase / PostgreSQL、マイグレーション、RLS、ローカル・本番（旧 SUPABASE_SETUP + DB_OPERATIONS） |
| [setup/MCP_SETUP.md](./setup/MCP_SETUP.md) | MCP サーバー（Stripe / GitHub 等）の設定 |

**統合・廃止したファイル**: `DEVELOPMENT.md` → `DEVELOPMENT_AND_ENV.md`。`ENV_SETUP.md` → 同ファイル後半。`SUPABASE_SETUP.md` / `DB_OPERATIONS.md` → `DB_SUPABASE.md`。

---

## アーキテクチャ (architecture/)

| 文書 | 説明 |
|------|------|
| [architecture/ARCHITECTURE.md](./architecture/ARCHITECTURE.md) | システム全体構成、Next.js と FastAPI の役割 |
| [architecture/DATABASE.md](./architecture/DATABASE.md) | DB スキーマの説明（詳細は `src/lib/db/schema.ts`） |
| [architecture/TECH_STACK.md](./architecture/TECH_STACK.md) | 使用ライブラリ・バージョンの目安 |
| [architecture/ERROR_HANDLING.md](./architecture/ERROR_HANDLING.md) | API エラーとユーザー向け文言の方針 |
| [architecture/FRONTEND_UI_GUIDELINES.md](./architecture/FRONTEND_UI_GUIDELINES.md) | フロントの UI ガイドライン |

---

## 機能 (features/)

| 文書 | 説明 |
|------|------|
| [features/AUTH.md](./features/AUTH.md) | 認証・ゲスト |
| [features/CREDITS.md](./features/CREDITS.md) | クレジット消費 |
| [features/COMPANY_INFO_FETCH.md](./features/COMPANY_INFO_FETCH.md) | 企業情報取得（採用ページ等） |
| [features/COMPANY_INFO_SEARCH.md](./features/COMPANY_INFO_SEARCH.md) | 企業情報の検索ロジック仕様 |
| [features/COMPANY_RAG.md](./features/COMPANY_RAG.md) | 企業 RAG・ハイブリッド検索 |
| [features/ES_REVIEW.md](./features/ES_REVIEW.md) | ES 添削 |
| [features/GAKUCHIKA_DEEP_DIVE.md](./features/GAKUCHIKA_DEEP_DIVE.md) | ガクチカ深掘り |
| [features/MOTIVATION.md](./features/MOTIVATION.md) | 志望動機 |
| [features/DEADLINES.md](./features/DEADLINES.md) | 締切 |
| [features/TASKS.md](./features/TASKS.md) | タスク |
| [features/NOTIFICATIONS.md](./features/NOTIFICATIONS.md) | 通知 |
| [features/CALENDAR.md](./features/CALENDAR.md) | Google カレンダー連携 |

---

## テスト (testing/)

| 文書 | 説明 |
|------|------|
| [testing/BACKEND_TESTS.md](./testing/BACKEND_TESTS.md) | pytest、検索まわり |
| [testing/RAG_EVAL.md](./testing/RAG_EVAL.md) | RAG オフライン評価 |
| [testing/ES_REVIEW_QUALITY.md](./testing/ES_REVIEW_QUALITY.md) | ES 添削の品質評価 |
| [testing/UI_PLAYWRIGHT_VERIFICATION.md](./testing/UI_PLAYWRIGHT_VERIFICATION.md) | UI 変更後の Playwright 確認 |

---

## リリース (release/)

| 文書 | 説明 |
|------|------|
| [release/PRODUCTION.md](./release/PRODUCTION.md) | 本番リリースの全体フロー（一覧表あり） |
| [release/DOMAIN.md](./release/DOMAIN.md) | ドメイン |
| [release/SUPABASE.md](./release/SUPABASE.md) | 本番 Supabase |
| [release/STRIPE.md](./release/STRIPE.md) | Stripe 本番 |
| [release/RAILWAY.md](./release/RAILWAY.md) | Railway（FastAPI） |
| [release/VERCEL.md](./release/VERCEL.md) | Vercel（Next.js） |
| [release/EXTERNAL_SERVICES.md](./release/EXTERNAL_SERVICES.md) | OAuth、CORS 等 |
| [release/ENV_REFERENCE.md](./release/ENV_REFERENCE.md) | 環境変数クイックリファレンス |
| [release/INDIVIDUAL_BUSINESS_COMPLIANCE.md](./release/INDIVIDUAL_BUSINESS_COMPLIANCE.md) | 特商法・個人事業 |

---

## マーケティング (marketing/)

| 文書 | 説明 |
|------|------|
| [marketing/README.md](./marketing/README.md) | 戦略・チャネル・SEO・LP・メディア・分析（旧 STRATEGY / TACTICS / SEO_ROLLOUT / LP_CURRENT_STATE / LANDING_MEDIA / ANALYTICS を統合） |

---

## 運用 (ops/)

| 文書 | 説明 |
|------|------|
| [ops/CLI_GUARDRAILS.md](./ops/CLI_GUARDRAILS.md) | CLI の安全な使い方 |
| [ops/SECURITY.md](./ops/SECURITY.md) | セキュリティの注意事項 |

---

## リポジトリ直下（docs 外）

| ファイル | 説明 |
|----------|------|
| [CLAUDE.md](../CLAUDE.md) / [AGENTS.md](../AGENTS.md) | AI エージェント向けのプロジェクト指示 |
| [Makefile](../Makefile) | `make` ターゲット一覧 |
| [README.md](../README.md) | リポジトリの顔（クイックスタート） |
