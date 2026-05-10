# ドキュメント一覧（地図）

**最終更新**: 2026-05-04

**この文書の目的**: `docs/` 配下にある現行 Markdown 文書への入口です。初めて読む人は「最初に読む」から入り、変更作業をする人は「作業別入口」から該当カテゴリへ進んでください。

**正しい動作の一次情報はコード**です。仕様書と実装が食い違う場合はコードを優先し、ドキュメントの修正 issue を立てるとよいです。secret 実値は読まず、環境変数の棚卸しは repo script の `--check` 系コマンドで key set のみ確認します。

---

## 最初に読む

| 文書 | 説明 |
|------|------|
| [README.md](../README.md) | リポジトリの顔。Quick Start と全体入口 |
| [SPEC.md](./SPEC.md) | 機能・非機能の上位仕様。ユーザー、価値、事業ルールの確認入口 |
| [architecture/ARCHITECTURE.md](./architecture/ARCHITECTURE.md) | システム全体構成、Next.js BFF と FastAPI の役割 |
| [setup/DEVELOPMENT_AND_ENV.md](./setup/DEVELOPMENT_AND_ENV.md) | ローカル開発の Quick Start、コマンド、環境変数・外部サービス |
| [AGENTS.md](../AGENTS.md) / [CLAUDE.md](../CLAUDE.md) | AI エージェント向けのプロジェクト指示 |

## 作業別入口

| やりたいこと | 入口 |
|--------------|------|
| 新規参加・環境構築 | [setup/DEVELOPMENT_AND_ENV.md](./setup/DEVELOPMENT_AND_ENV.md) → [SPEC.md](./SPEC.md) → [architecture/ARCHITECTURE.md](./architecture/ARCHITECTURE.md) |
| UI / App Router を変更する | [architecture/FRONTEND_UI_GUIDELINES.md](./architecture/FRONTEND_UI_GUIDELINES.md) → 該当 [features/](#機能-features) → [testing/UI_PLAYWRIGHT_VERIFICATION.md](./testing/UI_PLAYWRIGHT_VERIFICATION.md) |
| Next.js API / BFF を変更する | [architecture/BFF_FASTAPI_CONTRACT.md](./architecture/BFF_FASTAPI_CONTRACT.md) → [architecture/ERROR_HANDLING.md](./architecture/ERROR_HANDLING.md) → 該当 [features/](#機能-features) |
| FastAPI / AI / RAG を変更する | [architecture/FASTAPI_MODULE_LAYOUT.md](./architecture/FASTAPI_MODULE_LAYOUT.md) → [features/COMPANY_RAG.md](./features/COMPANY_RAG.md) → [testing/BACKEND_TESTS.md](./testing/BACKEND_TESTS.md) |
| DB / migration を変更する | [architecture/DATABASE.md](./architecture/DATABASE.md) → [setup/DB_SUPABASE.md](./setup/DB_SUPABASE.md) |
| 認証・ゲスト・課金を変更する | [features/AUTH.md](./features/AUTH.md) → [features/CREDITS.md](./features/CREDITS.md) → [architecture/BILLING_STATE_MACHINE.md](./architecture/BILLING_STATE_MACHINE.md) |
| プロンプト・AI 品質を確認する | [features/AI_PROMPTS.md](./features/AI_PROMPTS.md) → [prompts/](#プロンプト--ai-品質-prompts-quality) → [testing/ES_REVIEW_QUALITY.md](./testing/ES_REVIEW_QUALITY.md) |
| マーケティング LP を変更する | [marketing/LP.md](./marketing/LP.md) → [marketing/README.md](./marketing/README.md) → 実装済み [features/](#機能-features) |
| リリース・本番運用をする | [release/PRODUCTION.md](./release/PRODUCTION.md) → [release/ENV_REFERENCE.md](./release/ENV_REFERENCE.md) → provider 別 release docs → [ops/CLI_GUARDRAILS.md](./ops/CLI_GUARDRAILS.md) |
| テスト・commit gate を確認する | [testing/E2E.md](./testing/E2E.md) → [ops/TEST_HARNESS.md](./ops/TEST_HARNESS.md) |
| デッドコードを削除する | [ops/DEAD_CODE_REMOVAL.md](./ops/DEAD_CODE_REMOVAL.md) → [architecture/REFACTORING_TEST_CONTRACTS.md](./architecture/REFACTORING_TEST_CONTRACTS.md) |
| 本番リリース前の完成項目を確認する | [plan/execution-order.md](./plan/execution-order.md) → [release/PRODUCTION.md](./release/PRODUCTION.md) → [ops/SECURITY.md](./ops/SECURITY.md) |

---

## 開発・環境 (setup/)

| 文書 | 説明 |
|------|------|
| [setup/DEVELOPMENT_AND_ENV.md](./setup/DEVELOPMENT_AND_ENV.md) | Quick Start、コマンド、環境変数・外部サービス（旧 DEVELOPMENT + ENV_SETUP） |
| [setup/DB_SUPABASE.md](./setup/DB_SUPABASE.md) | Supabase / PostgreSQL、マイグレーション、RLS、ローカル・本番（旧 SUPABASE_SETUP + DB_OPERATIONS） |
| [setup/DB_REBUILD_CHECKLIST.md](./setup/DB_REBUILD_CHECKLIST.md) | ローカル開発 DB を破棄・再作成するときの判断基準、schema drift 回避、再作成後チェックリスト |
| [setup/MCP_SETUP.md](./setup/MCP_SETUP.md) | 現在有効な MCP サーバー（playwright / notion / context7）と Notion 参考 ES / Prompt Registry の取り込み手順 |

**統合・廃止したファイル**: `DEVELOPMENT.md` → `DEVELOPMENT_AND_ENV.md`。`ENV_SETUP.md` → 同ファイル後半。`SUPABASE_SETUP.md` / `DB_OPERATIONS.md` → `DB_SUPABASE.md`。

---

## アーキテクチャ (architecture/)

| 文書 | 説明 |
|------|------|
| [architecture/ARCHITECTURE.md](./architecture/ARCHITECTURE.md) | システム全体構成、Next.js と FastAPI の役割 |
| [architecture/BFF_FASTAPI_CONTRACT.md](./architecture/BFF_FASTAPI_CONTRACT.md) | Next.js BFF と FastAPI 間の principal、owner check、SSE、課金境界の契約 |
| [architecture/BILLING_STATE_MACHINE.md](./architecture/BILLING_STATE_MACHINE.md) | クレジット reserve / confirm / cancel と「成功時のみ消費」の状態遷移 |
| [architecture/CANONICAL_CONVERSATION_MODEL.md](./architecture/CANONICAL_CONVERSATION_MODEL.md) | Motivation / Gakuchika / Interview にまたがる会話モデルの正本 |
| [architecture/FASTAPI_MODULE_LAYOUT.md](./architecture/FASTAPI_MODULE_LAYOUT.md) | `backend/app` のモジュール配置、router / service / utils 境界 |
| [architecture/GAKUCHIKA_SSE_CONTRACT.md](./architecture/GAKUCHIKA_SSE_CONTRACT.md) | ガクチカ deep dive の SSE イベント、完了、失敗、課金契約 |
| [architecture/REFACTORING_TEST_CONTRACTS.md](./architecture/REFACTORING_TEST_CONTRACTS.md) | リファクタ時に守るテスト契約と回帰確認観点 |
| [architecture/DATABASE.md](./architecture/DATABASE.md) | DB スキーマの説明（詳細は `src/lib/db/schema.ts`） |
| [architecture/TENANT_ISOLATION_AUDIT.md](./architecture/TENANT_ISOLATION_AUDIT.md) | `companyId` と企業 RAG の tenant 分離監査メモ |
| [architecture/TECH_STACK.md](./architecture/TECH_STACK.md) | 使用ライブラリ・バージョンの目安 |
| [architecture/ERROR_HANDLING.md](./architecture/ERROR_HANDLING.md) | API エラーとユーザー向け文言の方針 |
| [architecture/FRONTEND_UI_GUIDELINES.md](./architecture/FRONTEND_UI_GUIDELINES.md) | フロントの UI ガイドライン |

---

## 機能 (features/)

各ファイルは `## 入口`（参照実装テーブル）→ `## 仕様` → `## 技術メモ` → `## 関連ドキュメント` の統一フォーマット。`SPEC.md` が上位仕様、`features/*` が実装参照付き詳細仕様です。

| 文書 | 説明 |
|------|------|
| [features/AUTH.md](./features/AUTH.md) | 認証・ゲスト。Better Auth session と `guest_device_token` cookie の扱い |
| [features/CREDITS.md](./features/CREDITS.md) | クレジット・課金・プラン。成功時のみ消費の業務ルール |
| [features/COMPANY_INFO_FETCH.md](./features/COMPANY_INFO_FETCH.md) | 企業情報取得（選考スケジュール・RAG 取込） |
| [features/COMPANY_INFO_SEARCH.md](./features/COMPANY_INFO_SEARCH.md) | 企業情報の Web 検索（Hybrid / Legacy） |
| [features/COMPANY_RAG.md](./features/COMPANY_RAG.md) | 企業 RAG・ハイブリッド検索パイプライン |
| [features/AI_PROMPTS.md](./features/AI_PROMPTS.md) | 本番 LLM 呼び出しの system / user 連結順、固定追記、fallback、backend 参照の追跡。実装正本は `backend/app/prompts/**` と `backend/app/utils/llm.py` |
| [features/ES_REVIEW.md](./features/ES_REVIEW.md) | ES 添削 |
| [features/GAKUCHIKA_DEEP_DIVE.md](./features/GAKUCHIKA_DEEP_DIVE.md) | ガクチカ作成・深掘り |
| [features/MOTIVATION.md](./features/MOTIVATION.md) | 志望動機作成 |
| [features/INTERVIEW.md](./features/INTERVIEW.md) | 面接対策（企業特化模擬面接） |
| [features/DEADLINES.md](./features/DEADLINES.md) | 締切管理。自動抽出結果はユーザー承認後に確定 |
| [features/TASKS.md](./features/TASKS.md) | タスク管理 |
| [features/NOTIFICATIONS.md](./features/NOTIFICATIONS.md) | 通知 |
| [features/CALENDAR.md](./features/CALENDAR.md) | Google カレンダー連携 |

---

## プロンプト / AI 品質 (prompts/, quality/)

`docs/prompts/*` は人間が LLM プロンプトをレビューし、改善方針を考えるための runtime 非連携スナップショットです。アプリ内 LLM プロンプトの正本ではなく、この配下を変更してもアプリ挙動には直接影響しません。参考 ES 本文や固有表現、secrets、PII、private fixture は転載せず、本番挙動は [features/AI_PROMPTS.md](./features/AI_PROMPTS.md) と backend 実装を確認してください。

| 文書 | 説明 |
|------|------|
| [prompts/README.md](./prompts/README.md) | `docs/prompts/` の役割。人間評価用でありアプリ非連携であることの明記 |
| [prompts/es-review/README.md](./prompts/es-review/README.md) | ES 添削評価ドキュメントの構成 |
| [prompts/gakuchika/README.md](./prompts/gakuchika/README.md) | ガクチカ作成・深掘りプロンプト |
| [prompts/motivation/README.md](./prompts/motivation/README.md) | 志望動機作成プロンプト |
| [prompts/interview/README.md](./prompts/interview/README.md) | 模擬面接プロンプト |
| [prompts/company-info/README.md](./prompts/company-info/README.md) | 企業情報・締切抽出プロンプト |
| [prompts/rag-search/README.md](./prompts/rag-search/README.md) | RAG 検索補助プロンプト |
| [prompts/common/README.md](./prompts/common/README.md) | JSON 修復、provider 追記、漏洩防止などの共通プロンプト面 |
| [prompts/es-review/templates/gakuchika.md](./prompts/es-review/templates/gakuchika.md) | ES 添削のガクチカ設問向け評価観点 |
| [prompts/es-review/templates/intern-goals.md](./prompts/es-review/templates/intern-goals.md) | ES 添削のインターン目標設問向け評価観点 |
| [prompts/es-review/support/length-fix.md](./prompts/es-review/support/length-fix.md) | ES 添削の字数調整向け評価観点 |
| [prompts/es-review/support/explanation.md](./prompts/es-review/support/explanation.md) | ES 添削の改善説明向け評価観点 |
| [quality/es-review-quality-assessment-2026-04-30.md](./quality/es-review-quality-assessment-2026-04-30.md) | ES 添削品質の評価結果・改善観点 |

---

## テスト (testing/)

| 文書 | 説明 |
|------|------|
| [testing/BACKEND_TESTS.md](./testing/BACKEND_TESTS.md) | pytest、検索まわり |
| [testing/E2E.md](./testing/E2E.md) | E2E Functional、AI Live、commit gate、Playwright 前提の運用入口 |
| [testing/AI_LIVE.md](./testing/AI_LIVE.md) | AI Live の定時実行、artifact、朝の確認手順 |
| [testing/RAG_EVAL.md](./testing/RAG_EVAL.md) | RAG オフライン評価 |
| [testing/ES_REVIEW_QUALITY.md](./testing/ES_REVIEW_QUALITY.md) | ES 添削の品質評価 |
| [testing/UI_PLAYWRIGHT_VERIFICATION.md](./testing/UI_PLAYWRIGHT_VERIFICATION.md) | UI 変更後の Playwright 確認 |

---

## リリース (release/)

`release/` は本番作業の手順正本です。provider CLI の手打ち操作ではなく、repo の Makefile / scripts と各 provider 文書の順に確認します。

| 文書 | 説明 |
|------|------|
| [release/PRODUCTION.md](./release/PRODUCTION.md) | 本番リリースの全体フロー（一覧表あり） |
| [release/DOMAIN_OPERATIONS.md](./release/DOMAIN_OPERATIONS.md) | `shupass.jp` のドメイン運用正本。Web、Google Workspace メール運用、解約判断を統合 |
| [release/DOMAIN.md](./release/DOMAIN.md) | 旧分割文書の案内。Web ドメイン接続の旧入口 |
| [release/EMAIL_GOOGLE_WORKSPACE.md](./release/EMAIL_GOOGLE_WORKSPACE.md) | 旧分割文書の案内。Google Workspace メール運用の旧入口 |
| [release/SUPABASE.md](./release/SUPABASE.md) | 本番 Supabase |
| [release/STRIPE.md](./release/STRIPE.md) | Stripe 本番 |
| [release/RAILWAY.md](./release/RAILWAY.md) | Railway（FastAPI） |
| [release/VERCEL.md](./release/VERCEL.md) | Vercel（Next.js） |
| [release/EXTERNAL_SERVICES.md](./release/EXTERNAL_SERVICES.md) | OAuth、CORS 等 |
| [release/ENV_REFERENCE.md](./release/ENV_REFERENCE.md) | 環境変数クイックリファレンス。secret 実値ではなく key set と配置先の確認入口 |
| [release/INDIVIDUAL_BUSINESS_COMPLIANCE.md](./release/INDIVIDUAL_BUSINESS_COMPLIANCE.md) | 特商法・個人事業、Stripe 審査・公開表記の確認入口 |

---

## マーケティング (marketing/)

公開訴求は実装済み機能と `features/*` で裏取りしてください。内定率・通過率・無制限無料・AggregateRating など、実装や根拠のない表現は使いません。

| 文書 | 説明 |
|------|------|
| [marketing/LP.md](./marketing/LP.md) | 現行 LP の構成、訴求、実装・表現方針 |
| [marketing/README.md](./marketing/README.md) | 戦略・チャネル・SEO・LP・メディア・分析の母艦。古い施策メモは実装・現状確認が必要 |

---

## 運用 (ops/)

`ops/` は開発ハーネス、監視、安全運用の入口です。`docs/ops/grafana/rag-dashboard.json` は [ops/OBSERVABILITY.md](./ops/OBSERVABILITY.md) の付属 artifact として扱い、ログファイルは索引対象外です。

| 文書 | 説明 |
|------|------|
| [ops/AI_HARNESS.md](./ops/AI_HARNESS.md) | Claude Code ハーネス（agents / skills / hooks / MCP / commands）の詳細リファレンスと運用ガイド |
| [ops/CODEX_HARNESS.md](./ops/CODEX_HARNESS.md) | Codex custom agent / config / wrapper の詳細リファレンス |
| [ops/CURSOR_HARNESS.md](./ops/CURSOR_HARNESS.md) | Cursor rules / MCP / prompt template の詳細リファレンス |
| [ops/AI_AGENT_PIPELINE.md](./ops/AI_AGENT_PIPELINE.md) | Codex / Claude / Cursor 共通の AI 開発 pipeline |
| [ops/AI_DEVELOPMENT_PRINCIPLES.md](./ops/AI_DEVELOPMENT_PRINCIPLES.md) | AI 継続開発で負債を増やさないための設計原則 |
| [ops/DEAD_CODE_REMOVAL.md](./ops/DEAD_CODE_REMOVAL.md) | Web アプリ構成に合わせたデッドコード調査・反証・削除手順 |
| [ops/CLI_GUARDRAILS.md](./ops/CLI_GUARDRAILS.md) | CLI の安全な使い方 |
| [ops/SECURITY.md](./ops/SECURITY.md) | セキュリティの注意事項 |
| [ops/OBSERVABILITY.md](./ops/OBSERVABILITY.md) | RAG / FastAPI の運用監視メトリクス、アラート、Grafana dashboard の正本 |
| [ops/TEST_HARNESS.md](./ops/TEST_HARNESS.md) | unit / backend deterministic / E2E / AI Functional / commit gate の運用メモ |
| [ops/STRIPE_CODEX_CLI.md](./ops/STRIPE_CODEX_CLI.md) | Codex 向け Stripe CLI の inspect / audit / sync / readiness 確認手順 |
| [ops/SEO_GOOGLE_SEARCH_CONSOLE.md](./ops/SEO_GOOGLE_SEARCH_CONSOLE.md) | Google Search Console の所有権確認、sitemap 送信、URL 検査、月次モニタリング手順 |
| [ops/DOMAIN_AND_HOSTING_AUDIT.md](./ops/DOMAIN_AND_HOSTING_AUDIT.md) | 旧分割文書の案内。ops から `release/DOMAIN_OPERATIONS.md` へ辿るための入口 |

---

## リポジトリ直下（docs 外）

| ファイル | 説明 |
|----------|------|
| [AGENTS.md](../AGENTS.md) / [CLAUDE.md](../CLAUDE.md) | AI エージェント向けのプロジェクト指示 |
| [Makefile](../Makefile) | `make` ターゲット一覧 |
| [README.md](../README.md) | リポジトリの顔（クイックスタート） |
