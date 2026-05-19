# ドキュメント一覧（地図）

**最終更新**: 2026-05-19

**この文書の目的**: `docs/` 配下にある現行 Markdown 文書への入口です。初めて読む人は「最初に読む」から入り、変更作業をする人は「作業別入口」から該当カテゴリへ進んでください。文書の構造・命名・置き場所の規約は [CONVENTIONS.md](./CONVENTIONS.md) を参照してください。

**正しい動作の一次情報はコード**です。仕様書と実装が食い違う場合はコードを優先し、ドキュメントの修正 issue を立てるとよいです。secret 実値は読まず、環境変数の棚卸しは repo script の `--check` 系コマンドで key set のみ確認します。

**`ops/` と `release/` の役割分担**: `ops/` は AI 開発ハーネス・監視・SECURITY・SEO・**環境変数 SSOT** など開発／参照系の正本です。`release/` は本番リリース・本番運用手順の唯一の正本（運用シナリオは `release/ops/`、本番初期構築は `release/setup/`）です。本番運用手順を探すときは必ず `release/` を見てください。

---

## 最初に読む

| 文書 | 説明 |
|------|------|
| [README.md](../README.md) | リポジトリの顔。Quick Start と全体入口 |
| [SPEC.md](./SPEC.md) | 機能・非機能の上位仕様。ユーザー、価値、事業ルールの確認入口 |
| [CONVENTIONS.md](./CONVENTIONS.md) | docs/ の構造・命名・置き場所の規約。新規文書を追加する前に |
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
| DB / migration を変更する | [architecture/DATABASE.md](./architecture/DATABASE.md) → [setup/DB_SUPABASE.md](./setup/DB_SUPABASE.md) → [release/ops/DB_MIGRATION.md](./release/ops/DB_MIGRATION.md) |
| 認証・ゲスト・課金を変更する | [features/AUTH.md](./features/AUTH.md) → [features/CREDITS.md](./features/CREDITS.md) → [architecture/BILLING_STATE_MACHINE.md](./architecture/BILLING_STATE_MACHINE.md) |
| プロンプト・AI 品質を確認する | [features/AI_PROMPTS.md](./features/AI_PROMPTS.md) → [prompts/README.md](./prompts/README.md) → [testing/ES_REVIEW_QUALITY.md](./testing/ES_REVIEW_QUALITY.md) |
| 性能・コストを確認する | [architecture/PERFORMANCE_COST_GUARDRAILS.md](./architecture/PERFORMANCE_COST_GUARDRAILS.md) → [plan/performance-cost-optimization-plan.md](./plan/performance-cost-optimization-plan.md) |
| マーケティング LP を変更する | [marketing/LP.md](./marketing/LP.md) → [marketing/README.md](./marketing/README.md) → 実装済み [features/](#機能-features) |
| リリース・本番運用をする | [release/README.md](./release/README.md) → [release/ops/RUNBOOK.md](./release/ops/RUNBOOK.md) → [ops/ENVIRONMENT_VARIABLES.md](./ops/ENVIRONMENT_VARIABLES.md) → [ops/CLI_GUARDRAILS.md](./ops/CLI_GUARDRAILS.md) |
| テスト・commit gate を確認する | [testing/E2E.md](./testing/E2E.md) → [ops/TEST_HARNESS.md](./ops/TEST_HARNESS.md) |
| デッドコードを削除する | [ops/DEAD_CODE_REMOVAL.md](./ops/DEAD_CODE_REMOVAL.md) → [architecture/REFACTORING_TEST_CONTRACTS.md](./architecture/REFACTORING_TEST_CONTRACTS.md) |
| 本番リリース前の完成項目を確認する | [plan/execution-order.md](./plan/execution-order.md) → [release/ops/RUNBOOK.md](./release/ops/RUNBOOK.md) → [ops/SECURITY.md](./ops/SECURITY.md) |
| AI 開発レビュー観点を確認する | [ai_agent_development_review_checklist_priority.md](./ai_agent_development_review_checklist_priority.md) → [ops/AI_DEVELOPMENT_PRINCIPLES.md](./ops/AI_DEVELOPMENT_PRINCIPLES.md) |

---

## 最上位 (docs/ 直下)

| 文書 | 説明 |
|------|------|
| [SPEC.md](./SPEC.md) | 機能・非機能の上位仕様。`features/*` の上位にあたる |
| [CONVENTIONS.md](./CONVENTIONS.md) | docs/ の構造・命名・置き場所の規約 |
| [ai_agent_development_review_checklist_priority.md](./ai_agent_development_review_checklist_priority.md) | AI エージェント開発レビュー・チェックリスト（P0〜P4 優先度順） |

---

## 開発・環境 (setup/)

ローカル開発環境のセットアップが対象。本番初期構築は [release/setup/](#初期セットアップ-releasesetup) を見てください。

| 文書 | 説明 |
|------|------|
| [setup/DEVELOPMENT_AND_ENV.md](./setup/DEVELOPMENT_AND_ENV.md) | Quick Start、コマンド、環境変数・外部サービス |
| [setup/DB_SUPABASE.md](./setup/DB_SUPABASE.md) | Supabase / PostgreSQL、マイグレーション、RLS、ローカル・本番 |
| [setup/DB_REBUILD_CHECKLIST.md](./setup/DB_REBUILD_CHECKLIST.md) | ローカル開発 DB を破棄・再作成するときの判断基準、schema drift 回避、再作成後チェックリスト |
| [setup/MCP_SETUP.md](./setup/MCP_SETUP.md) | 現在有効な MCP サーバー（playwright / notion / context7）と Notion 参考 ES / Prompt Registry の取り込み手順 |

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
| [architecture/PERFORMANCE_COST_GUARDRAILS.md](./architecture/PERFORMANCE_COST_GUARDRAILS.md) | 高コスト経路のデフォルトガードレール（DB/payload、rate limit、retry） |
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
| [features/ES_REVIEW.md](./features/ES_REVIEW.md) | ES 添削（機能全体の正本） |
| [features/ES_REVIEW_DEEP_DIVE.md](./features/ES_REVIEW_DEEP_DIVE.md) | ES Review の rewrite pipeline / validation / retry の内部を記録した手動監査用資料 |
| [features/GAKUCHIKA_DEEP_DIVE.md](./features/GAKUCHIKA_DEEP_DIVE.md) | ガクチカ作成・深掘り |
| [features/MOTIVATION.md](./features/MOTIVATION.md) | 志望動機作成 |
| [features/INTERVIEW.md](./features/INTERVIEW.md) | 面接対策（企業特化模擬面接） |
| [features/DEADLINES.md](./features/DEADLINES.md) | 締切管理。自動抽出結果はユーザー承認後に確定 |
| [features/TASKS.md](./features/TASKS.md) | タスク管理 |
| [features/NOTIFICATIONS.md](./features/NOTIFICATIONS.md) | 通知 |
| [features/CALENDAR.md](./features/CALENDAR.md) | Google カレンダー連携 |

---

## プロンプト (prompts/)

`docs/prompts/*` は人間が LLM プロンプトをレビューし、改善方針を考えるための **runtime 非連携**スナップショットです。アプリ内 LLM プロンプトの正本ではなく、この配下を変更してもアプリ挙動には直接影響しません。参考 ES 本文や固有表現、secrets、PII、private fixture は転載せず、本番挙動は [features/AI_PROMPTS.md](./features/AI_PROMPTS.md) と backend 実装を確認してください。

| 文書 | 説明 |
|------|------|
| [prompts/README.md](./prompts/README.md) | `docs/prompts/` の役割。人間評価用でありアプリ非連携であることの明記 |

### es-review

| 文書 | 説明 |
|------|------|
| [prompts/es-review/README.md](./prompts/es-review/README.md) | ES 添削評価ドキュメントの構成 |
| [prompts/es-review/repair-strategies.md](./prompts/es-review/repair-strategies.md) | ES 添削の修復戦略 |
| [prompts/es-review/rewrite-prompt-structure.md](./prompts/es-review/rewrite-prompt-structure.md) | rewrite プロンプトの構造 |
| [prompts/es-review/short-answer-variant.md](./prompts/es-review/short-answer-variant.md) | 短答設問バリアント |
| [prompts/es-review/validation-architecture.md](./prompts/es-review/validation-architecture.md) | validation アーキテクチャ |
| [prompts/es-review/support/draft-generation.md](./prompts/es-review/support/draft-generation.md) | 下書き生成の評価観点 |
| [prompts/es-review/support/explanation.md](./prompts/es-review/support/explanation.md) | 改善説明の評価観点 |
| [prompts/es-review/support/fallback-rewrite.md](./prompts/es-review/support/fallback-rewrite.md) | fallback rewrite の評価観点 |
| [prompts/es-review/support/reference-quality-profile.md](./prompts/es-review/support/reference-quality-profile.md) | 参考品質プロファイル |
| [prompts/es-review/support/rewrite.md](./prompts/es-review/support/rewrite.md) | rewrite の評価観点 |
| [prompts/es-review/templates/basic.md](./prompts/es-review/templates/basic.md) | 汎用設問の評価観点 |
| [prompts/es-review/templates/company-motivation.md](./prompts/es-review/templates/company-motivation.md) | 志望動機設問の評価観点 |
| [prompts/es-review/templates/gakuchika.md](./prompts/es-review/templates/gakuchika.md) | ガクチカ設問の評価観点 |
| [prompts/es-review/templates/intern-goals.md](./prompts/es-review/templates/intern-goals.md) | インターン目標設問の評価観点 |
| [prompts/es-review/templates/intern-reason.md](./prompts/es-review/templates/intern-reason.md) | インターン志望理由設問の評価観点 |
| [prompts/es-review/templates/post-join-goals.md](./prompts/es-review/templates/post-join-goals.md) | 入社後目標設問の評価観点 |
| [prompts/es-review/templates/role-course-reason.md](./prompts/es-review/templates/role-course-reason.md) | 職種・コース志望理由設問の評価観点 |
| [prompts/es-review/templates/self-pr.md](./prompts/es-review/templates/self-pr.md) | 自己PR設問の評価観点 |
| [prompts/es-review/templates/work-values.md](./prompts/es-review/templates/work-values.md) | 仕事観設問の評価観点 |

### gakuchika

| 文書 | 説明 |
|------|------|
| [prompts/gakuchika/README.md](./prompts/gakuchika/README.md) | ガクチカ作成・深掘りプロンプトの構成 |
| [prompts/gakuchika/initial-question.md](./prompts/gakuchika/initial-question.md) | 初回質問プロンプト |
| [prompts/gakuchika/deepdive-question.md](./prompts/gakuchika/deepdive-question.md) | 深掘り質問プロンプト |
| [prompts/gakuchika/es-build-question.md](./prompts/gakuchika/es-build-question.md) | ES 構築質問プロンプト |
| [prompts/gakuchika/structured-summary.md](./prompts/gakuchika/structured-summary.md) | 構造化要約プロンプト |
| [prompts/gakuchika/draft-generation.md](./prompts/gakuchika/draft-generation.md) | 下書き生成プロンプト |

### motivation

| 文書 | 説明 |
|------|------|
| [prompts/motivation/README.md](./prompts/motivation/README.md) | 志望動機作成プロンプトの構成 |
| [prompts/motivation/question.md](./prompts/motivation/question.md) | 質問プロンプト |
| [prompts/motivation/deepdive-question.md](./prompts/motivation/deepdive-question.md) | 深掘り質問プロンプト |
| [prompts/motivation/conversation-summary.md](./prompts/motivation/conversation-summary.md) | 会話要約プロンプト |
| [prompts/motivation/evaluation.md](./prompts/motivation/evaluation.md) | 評価プロンプト |
| [prompts/motivation/draft-generation.md](./prompts/motivation/draft-generation.md) | 下書き生成プロンプト |

### interview

| 文書 | 説明 |
|------|------|
| [prompts/interview/README.md](./prompts/interview/README.md) | 模擬面接プロンプトの構成 |
| [prompts/interview/plan.md](./prompts/interview/plan.md) | 面接プランプロンプト |
| [prompts/interview/opening-question.md](./prompts/interview/opening-question.md) | 冒頭質問プロンプト |
| [prompts/interview/turn-question.md](./prompts/interview/turn-question.md) | ターン質問プロンプト |
| [prompts/interview/continue-question.md](./prompts/interview/continue-question.md) | 継続質問プロンプト |
| [prompts/interview/weakness-drill.md](./prompts/interview/weakness-drill.md) | 弱点ドリルプロンプト |
| [prompts/interview/feedback.md](./prompts/interview/feedback.md) | フィードバックプロンプト |

### company-info

| 文書 | 説明 |
|------|------|
| [prompts/company-info/README.md](./prompts/company-info/README.md) | 企業情報・締切抽出プロンプトの構成 |
| [prompts/company-info/recruitment-extraction.md](./prompts/company-info/recruitment-extraction.md) | 採用情報抽出プロンプト |
| [prompts/company-info/schedule-extraction.md](./prompts/company-info/schedule-extraction.md) | 選考スケジュール抽出プロンプト |

### rag-search

| 文書 | 説明 |
|------|------|
| [prompts/rag-search/README.md](./prompts/rag-search/README.md) | RAG 検索補助プロンプトの構成 |
| [prompts/rag-search/content-classification.md](./prompts/rag-search/content-classification.md) | コンテンツ分類プロンプト |
| [prompts/rag-search/hyde.md](./prompts/rag-search/hyde.md) | HyDE プロンプト |
| [prompts/rag-search/query-expansion.md](./prompts/rag-search/query-expansion.md) | クエリ拡張プロンプト |

### common

| 文書 | 説明 |
|------|------|
| [prompts/common/README.md](./prompts/common/README.md) | 共通プロンプト面の構成 |
| [prompts/common/json-repair.md](./prompts/common/json-repair.md) | JSON 修復プロンプト |
| [prompts/common/provider-append.md](./prompts/common/provider-append.md) | provider 固定追記 |
| [prompts/common/safety-and-leakage.md](./prompts/common/safety-and-leakage.md) | 漏洩防止・安全面 |

---

## 参考ES (reference/)

参考 ES ヒントの手動キュレーション入力（offline）。**runtime からは読みません**（runtime 正本は `backend/app/prompts/es_reference_guidance.py`）。

| 文書 | 説明 |
|------|------|
| [reference/es-review/README.md](./reference/es-review/README.md) | 参考ESヒントの手動キュレーション入力（offline・runtime 非参照） |
| [reference/es-review/USED_LOGIC_HINTS.md](./reference/es-review/USED_LOGIC_HINTS.md) | 実際に ES 添削で使用中の参考ES論理構成ヒント一覧（SSOT から再生成・レビュー用） |
| [reference/es-review/company_motivation.md](./reference/es-review/company_motivation.md) | 志望動機設問の作成ヒント |
| [reference/es-review/gakuchika.md](./reference/es-review/gakuchika.md) | ガクチカ設問の作成ヒント |
| [reference/es-review/intern_goals.md](./reference/es-review/intern_goals.md) | インターン目標設問の作成ヒント |
| [reference/es-review/intern_reason.md](./reference/es-review/intern_reason.md) | インターン志望理由設問の作成ヒント |
| [reference/es-review/post_join_goals.md](./reference/es-review/post_join_goals.md) | 入社後目標設問の作成ヒント |
| [reference/es-review/role_course_reason.md](./reference/es-review/role_course_reason.md) | 職種・コース志望理由設問の作成ヒント |
| [reference/es-review/self_pr.md](./reference/es-review/self_pr.md) | 自己PR設問の作成ヒント |
| [reference/es-review/work_values.md](./reference/es-review/work_values.md) | 仕事観設問の作成ヒント |

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

## マーケティング (marketing/)

公開訴求は実装済み機能と `features/*` で裏取りしてください。内定率・通過率・無制限無料・AggregateRating など、実装や根拠のない表現は使いません。

| 文書 | 説明 |
|------|------|
| [marketing/LP.md](./marketing/LP.md) | 現行 LP の構成、訴求、実装・表現方針 |
| [marketing/README.md](./marketing/README.md) | 戦略・チャネル・SEO・LP・メディア・分析の母艦。古い施策メモは実装・現状確認が必要 |

---

## 運用 (ops/)

`ops/` は AI 開発ハーネス、監視、安全運用、環境変数 SSOT の入口です。本番リリース・本番運用手順は [release/](#リリース-release) を見てください。`docs/ops/grafana/rag-dashboard.json` は [ops/OBSERVABILITY.md](./ops/OBSERVABILITY.md) 付属の Grafana Cloud import 用正本 artifact として扱い、ログファイルは索引対象外です。

| 文書 | 説明 |
|------|------|
| [ops/AI_HARNESS.md](./ops/AI_HARNESS.md) | Claude Code ハーネス（agents / skills / hooks / MCP / commands）の詳細リファレンスと運用ガイド |
| [ops/CODEX_HARNESS.md](./ops/CODEX_HARNESS.md) | Codex custom agent / config / wrapper の詳細リファレンス |
| [ops/CURSOR_HARNESS.md](./ops/CURSOR_HARNESS.md) | Cursor rules / MCP / prompt template の詳細リファレンス |
| [ops/AI_AGENT_PIPELINE.md](./ops/AI_AGENT_PIPELINE.md) | Codex / Claude / Cursor 共通の AI 開発 pipeline |
| [ops/AI_DEVELOPMENT_PRINCIPLES.md](./ops/AI_DEVELOPMENT_PRINCIPLES.md) | AI 継続開発で負債を増やさないための設計原則 |
| [ops/DEAD_CODE_REMOVAL.md](./ops/DEAD_CODE_REMOVAL.md) | Web アプリ構成に合わせたデッドコード調査・反証・削除手順 |
| [ops/CLI_GUARDRAILS.md](./ops/CLI_GUARDRAILS.md) | CLI の安全な使い方 |
| [ops/ENVIRONMENT_VARIABLES.md](./ops/ENVIRONMENT_VARIABLES.md) | 環境変数 SSOT（唯一の正本。A 環境別早見表・B 環境判定モデル・C 判断フロー・D 変数索引・E drift 不変条件・F 保守） |
| [ops/SECURITY.md](./ops/SECURITY.md) | セキュリティの注意事項 |
| [ops/OBSERVABILITY.md](./ops/OBSERVABILITY.md) | RAG / FastAPI の運用監視メトリクス、アラート、Grafana dashboard の正本 |
| [ops/MONITORING_SETUP.md](./ops/MONITORING_SETUP.md) | 本番リリース前の Phase 0 監視セットアップ。送信可否、PII scrub |
| [ops/TEST_HARNESS.md](./ops/TEST_HARNESS.md) | unit / backend deterministic / E2E / AI Functional / commit gate の運用メモ |
| [ops/STRIPE_CODEX_CLI.md](./ops/STRIPE_CODEX_CLI.md) | Codex 向け Stripe CLI の inspect / audit / sync / readiness 確認手順 |
| [ops/SEO_GOOGLE_SEARCH_CONSOLE.md](./ops/SEO_GOOGLE_SEARCH_CONSOLE.md) | Google Search Console の所有権確認、sitemap 送信、URL 検査、月次モニタリング手順 |
| [ops/grafana/rag-dashboard.json](./ops/grafana/rag-dashboard.json) | OBSERVABILITY.md 付属の Grafana Cloud import 用正本 dashboard 定義 |

---

## リリース (release/)

`release/` は**本番リリース・本番運用手順の唯一の正本**です。日常運用と本番環境変数の SSOT は `docs/ops/ENVIRONMENT_VARIABLES.md` にあります（`release/setup/ENV_REFERENCE.md` はその互換入口）。

| 文書 | 説明 |
|------|------|
| [release/README.md](./release/README.md) | ナビゲーションインデックス。セットアップ / 運用の入口 |
| [release/PRODUCTION.md](./release/PRODUCTION.md) | 旧本番手順書。再構成済みで setup/ops/README への案内入口 |

### 運用手順書 (release/ops/)

| 文書 | 説明 |
|------|------|
| [release/ops/RUNBOOK.md](./release/ops/RUNBOOK.md) | 全シナリオの概要・判断フロー・共通前提条件（シナリオ入口） |
| [release/ops/REGULAR_RELEASE.md](./release/ops/REGULAR_RELEASE.md) | 通常リリース（develop → main）9ステップ |
| [release/ops/DB_MIGRATION.md](./release/ops/DB_MIGRATION.md) | DB 移行の 4 フェーズ + ドリフト検出 |
| [release/ops/INCIDENT_ROLLBACK.md](./release/ops/INCIDENT_ROLLBACK.md) | 障害対応トリアージ + ロールバック手順 |
| [release/ops/SECRETS_MANAGEMENT.md](./release/ops/SECRETS_MANAGEMENT.md) | シークレット追加・更新・ローテーション |
| [release/ops/HOOK_SAFETY_MAP.md](./release/ops/HOOK_SAFETY_MAP.md) | Hook → 操作のマッピング表 |

### 初期セットアップ (release/setup/)

| 文書 | 説明 |
|------|------|
| [release/setup/PRODUCTION_SETUP.md](./release/setup/PRODUCTION_SETUP.md) | 本番環境の初期構築手順（アーキテクチャ図あり） |
| [release/setup/SUPABASE.md](./release/setup/SUPABASE.md) | 本番 Supabase |
| [release/setup/STRIPE.md](./release/setup/STRIPE.md) | Stripe 本番 |
| [release/setup/RAILWAY.md](./release/setup/RAILWAY.md) | Railway（FastAPI） |
| [release/setup/VERCEL.md](./release/setup/VERCEL.md) | Vercel（Next.js） |
| [release/setup/EXTERNAL_SERVICES.md](./release/setup/EXTERNAL_SERVICES.md) | OAuth、CORS 等 |
| [release/setup/DOMAIN_OPERATIONS.md](./release/setup/DOMAIN_OPERATIONS.md) | `shupass.jp` のドメイン運用正本 |
| [release/setup/ENV_REFERENCE.md](./release/setup/ENV_REFERENCE.md) | 環境変数の互換入口。正本は [ops/ENVIRONMENT_VARIABLES.md](./ops/ENVIRONMENT_VARIABLES.md)（tooling 互換のため存置） |
| [release/setup/INDIVIDUAL_BUSINESS_COMPLIANCE.md](./release/setup/INDIVIDUAL_BUSINESS_COMPLIANCE.md) | 特商法・個人事業、Stripe 審査・公開表記 |

---

## 改善計画 (plan/)

品質改善計画。タスク状態の SSOT は [plan/plan-tasks.json](./plan/plan-tasks.json)、依存を踏まえた実行順は [plan/execution-order.md](./plan/execution-order.md)。完了した計画は `plan/completed/` にアーカイブします。

| 文書 | 説明 |
|------|------|
| [plan/execution-order.md](./plan/execution-order.md) | 19 カテゴリ計画書の実行順序（依存順、Codex レビュー反映版） |
| [plan/plan-tasks.json](./plan/plan-tasks.json) | 実装フェーズのタスク状態 SSOT |
| [plan/auth-guest-ownership-api-boundary-plan.md](./plan/auth-guest-ownership-api-boundary-plan.md) | 認証・ゲスト所有権 API 境界の改善計画 |
| [plan/backend-config-env-consolidation-improvement-plan.md](./plan/backend-config-env-consolidation-improvement-plan.md) | backend config / env 統合の改善計画 |
| [plan/company-info-deadline-extraction-improvement-plan.md](./plan/company-info-deadline-extraction-improvement-plan.md) | 企業情報・締切抽出の改善計画 |
| [plan/db-design-optimization-rls.md](./plan/db-design-optimization-rls.md) | DB 設計最適化・RLS の改善計画 |
| [plan/legal-commercial-support-plan.md](./plan/legal-commercial-support-plan.md) | 法務・特商法対応の計画 |
| [plan/llm-rag-security-owasp-audit.md](./plan/llm-rag-security-owasp-audit.md) | LLM / RAG セキュリティ OWASP 監査計画 |
| [plan/maintainability-clean-architecture-roadmap.md](./plan/maintainability-clean-architecture-roadmap.md) | 保守性・クリーンアーキテクチャのロードマップ |
| [plan/monitoring-logging-incident-response-plan.md](./plan/monitoring-logging-incident-response-plan.md) | 監視・ログ・障害対応の計画 |
| [plan/performance-cost-optimization-plan.md](./plan/performance-cost-optimization-plan.md) | 性能・コスト最適化の計画 |
| [plan/personal-data-confidential-information-protection-plan.md](./plan/personal-data-confidential-information-protection-plan.md) | 個人データ・機密情報保護の計画 |
| [plan/release-infrastructure-operations-plan.md](./plan/release-infrastructure-operations-plan.md) | リリース基盤・運用の計画 |
| [plan/security-vulnerability-hardening-plan.md](./plan/security-vulnerability-hardening-plan.md) | セキュリティ脆弱性ハードニングの計画 |
| [plan/seo-public-page-quality-plan.md](./plan/seo-public-page-quality-plan.md) | SEO・公開ページ品質の計画 |
| [plan/task-deadline-calendar-integration-plan.md](./plan/task-deadline-calendar-integration-plan.md) | タスク・締切・カレンダー連携の計画 |
| [plan/test-quality-gate-plan.md](./plan/test-quality-gate-plan.md) | テスト品質ゲートの計画 |
| [plan/ui-ux-responsive-quality-plan.md](./plan/ui-ux-responsive-quality-plan.md) | UI/UX・レスポンシブ品質の計画 |

### 完了アーカイブ (plan/completed/)

| 文書 | 説明 |
|------|------|
| [plan/completed/billing-credit-integrity-report.md](./plan/completed/billing-credit-integrity-report.md) | クレジット整合性の完了レポート |
| [plan/completed/supabase-environment-separation-plan.md](./plan/completed/supabase-environment-separation-plan.md) | Supabase 環境分離の完了計画 |

---

## レビュー記録 (review/)

`docs/review/` は品質ゲート系スキル・サブエージェントが生成したレビュー記録のアーカイブです。作成時点のスナップショットなので、実装判断には必ず最新コードで裏取りします。サブディレクトリの用途と書き込み元は [review/REVIEW_POLICY.md](./review/REVIEW_POLICY.md) を入口に確認してください。

| 文書 | 説明 |
|------|------|
| [review/REVIEW_POLICY.md](./review/REVIEW_POLICY.md) | レビュー記録ポリシー（入口）。サブディレクトリ用途と書き込み元 |
| [review/feature/es-review-model-comparison-2026-05-07.md](./review/feature/es-review-model-comparison-2026-05-07.md) | ES 添削モデル比較のレビュー記録 |

サブディレクトリ `architecture/` `company-info-search/` `harness/` `maintainability/` `rag-architecture/` `security/` は今後のレビュー記録の置き場所（現在は `.gitkeep` のみ）。

---

## 規約 (CONVENTIONS.md)

| 文書 | 説明 |
|------|------|
| [CONVENTIONS.md](./CONVENTIONS.md) | docs/ の構造・命名・置き場所の規約。ディレクトリ役割表、命名規約、新規文書の置き場所判断フロー、原則 |

---

## リポジトリ直下（docs 外）

| ファイル | 説明 |
|----------|------|
| [AGENTS.md](../AGENTS.md) / [CLAUDE.md](../CLAUDE.md) | AI エージェント向けのプロジェクト指示 |
| [Makefile](../Makefile) | `make` ターゲット一覧 |
| [README.md](../README.md) | リポジトリの顔（クイックスタート） |
