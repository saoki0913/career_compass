# ドキュメント規約

**最終更新**: 2026-05-19

**この文書の目的**: `docs/` 配下の構造・命名・置き場所の規約をまとめます。`INDEX.md` が「どの項目でどの文書を見ればよいか」を示す**地図**、本書 `CONVENTIONS.md` が「文書をどこにどう置くか」を示す**規約**です。新規文書を追加・移動する前に本書を確認してください。

---

## 1. ディレクトリ役割表

各ディレクトリには明確な役割と「対象読者」「正本/参照の別」があります。正本（SSOT = Single Source of Truth）は唯一の真実の置き場所、参照はそこへ導く入口やスナップショットです。

| ディレクトリ | 役割 | 対象読者 | 正本/参照の別 |
|---|---|---|---|
| `setup/` | ローカル開発環境（Quick Start、ローカル DB、MCP） | 新規参加者・ローカル開発者 | ローカル開発手順の正本 |
| `architecture/` | システム設計・契約（BFF/FastAPI 境界、課金状態機械、会話モデル、エラー方針、性能ガードレール） | 設計変更・横断実装をする開発者 | 設計・契約の正本 |
| `features/` | 機能別の実装参照付き仕様（`SPEC.md` が上位仕様、`features/*` が実装参照付き詳細） | 機能を変更する開発者 | 機能仕様の正本（一次情報はコード） |
| `prompts/` | LLM プロンプトの人間評価用スナップショット。**runtime 非連携**（変更してもアプリ挙動に影響しない） | プロンプト品質をレビューする人 | 参照（正本は `backend/app/prompts/**`） |
| `reference/` | 参考 ES ヒントの手動キュレーション入力（offline・runtime 非参照） | ES 添削ヒントをキュレーションする人 | 参照（runtime 正本は `backend/app/prompts/es_reference_guidance.py`） |
| `testing/` | テスト方針（E2E、AI Live、RAG 評価、UI Playwright、ES 品質評価） | テストを書く・実行する開発者 | テスト方針の正本 |
| `marketing/` | LP・SEO 戦略・チャネル・分析 | マーケ LP を変更する人 | マーケ戦略の正本（訴求の裏取りは `features/*`） |
| `ops/` | AI 開発ハーネス・監視・SECURITY・SEO・デッドコード・**環境変数 SSOT** | AI 開発を行う開発者・運用者 | 開発ハーネス/監視/環境変数の正本 |
| `release/` | 本番リリース・本番運用手順 | リリース・本番運用を行う人 | **本番リリース/運用手順の唯一の正本** |
| `plan/` | 改善計画（進行中 + `completed/` アーカイブ、`plan-tasks.json` がタスク状態 SSOT） | 改善計画を進める開発者 | 計画の正本（タスク状態は JSON が SSOT） |
| `review/` | レビュー記録アーカイブ（観測スナップショット、`REVIEW_POLICY.md` 準拠） | 過去レビューを参照する人 | 参照（作成時点のスナップショット、現状はコードで裏取り） |

### ops/ と release/ の役割分担

- **`ops/`** = 開発・参照系。AI 開発ハーネス（AI_HARNESS / CODEX_HARNESS / CURSOR_HARNESS / AI_AGENT_PIPELINE / AI_DEVELOPMENT_PRINCIPLES / CLI_GUARDRAILS / TEST_HARNESS）、監視（OBSERVABILITY / MONITORING_SETUP + grafana/rag-dashboard.json）、SECURITY、SEO、DEAD_CODE_REMOVAL、**環境変数 SSOT（ENVIRONMENT_VARIABLES.md）**、Stripe CLI ツール（STRIPE_CODEX_CLI.md）。
- **`release/`** = 本番リリース・本番運用手順の唯一の正本。`release/ops/`（運用シナリオ。RUNBOOK が入口）と `release/setup/`（本番初期構築）。

旧 `ops/` 運用スタブ（`DB_MIGRATION` / `SECRETS_MANAGEMENT` / `PRODUCTION_RUNBOOK` / `STRIPE_PRODUCTION` / `DOMAIN_AND_HOSTING_AUDIT`）は `release/` 正本へ統合済み・削除済みです。本番運用手順を探すときは必ず `release/` を見てください。

---

## 2. 命名規約

| 種別 | 規約 | 例 |
|---|---|---|
| 仕様・運用 doc | `SCREAMING_SNAKE_CASE.md` | `ARCHITECTURE.md`, `ENVIRONMENT_VARIABLES.md` |
| 改善計画 | `kebab-case-plan.md` | `security-vulnerability-hardening-plan.md` |
| 計画のレポート | `kebab-case-report.md` | `billing-credit-integrity-report.md` |
| レビュー記録 | `<topic>-YYYY-MM-DD.md` | `es-review-model-comparison-2026-05-07.md` |
| プロンプト doc | `kebab-case.md` | `query-expansion.md`, `deepdive-question.md` |
| ディレクトリ | 小文字 | `architecture/`, `release/ops/` |

---

## 3. 新規文書の置き場所判断フロー

新しい文書を追加するとき、上から順に質問に答えて置き場所を決めます。

1. **本番リリース・本番運用の手順か？**（リリース手順、本番セットアップ、シークレット運用、DB 移行、障害対応） → `release/`（運用は `release/ops/`、初期構築は `release/setup/`）
2. **AI 開発ハーネス・監視・SECURITY・環境変数の話か？** → `ops/`（環境変数は `ops/ENVIRONMENT_VARIABLES.md` が SSOT）
3. **ローカル開発環境のセットアップか？** → `setup/`
4. **特定機能の実装参照付き仕様か？** → `features/`（上位仕様だけなら `SPEC.md`）
5. **システム設計・モジュール間契約か？** → `architecture/`
6. **改善計画・ロードマップか？** → `plan/`（完了したら `plan/completed/`、タスク状態は `plan/plan-tasks.json` を更新）
7. **品質ゲート・監査のレビュー記録か？** → `review/`（`REVIEW_POLICY.md` のサブディレクトリ規約に従う）
8. **LLM プロンプトの人間評価スナップショットか？** → `prompts/`（runtime 非連携であることを明記）
9. **参考 ES ヒントのキュレーション入力か？** → `reference/`
10. **テスト方針か？** → `testing/`
11. **LP・SEO 戦略か？** → `marketing/`

迷う場合は「一次情報（正本）はどこか」を基準にします。コードが正本なら doc は参照入口に留め、SSOT が既にあるなら新規作成せず既存 SSOT を更新します。

---

## 4. 原則

- **一次情報はコード**: 正しい動作の一次情報は常にコード本体です。仕様書と実装が食い違う場合はコードを優先し、ドキュメント修正の issue を立てます。`prompts/` と `reference/` と `review/` は runtime 非連携または作成時点のスナップショットであり、必ず最新コードで裏取りします。
- **secret は読まない**: secret の実値は直接 Read せず、`zsh scripts/release/sync-career-compass-secrets.sh --check` 等の `--check` 系コマンドで key set のみ確認します。
- **AGENTS.md と CLAUDE.md は同内容で保つ**: 一方を更新したら他方も同じ内容に揃えます。
- **言語**: ドキュメント本文は日本語を基本にします。コマンド、パス、識別子、型名、ライブラリ名は英語のまま保ちます。
- **SSOT を複製しない**: 環境変数は `ops/ENVIRONMENT_VARIABLES.md`、計画タスク状態は `plan/plan-tasks.json` が唯一の正本です。互換のための入口（例: `release/setup/ENV_REFERENCE.md`）は内容を持たず SSOT へリダイレクトします。

---

## 関連

- [INDEX.md](./INDEX.md) — ドキュメント一覧（地図）。どの項目でどの文書を見ればよいかはこちら。
- [review/REVIEW_POLICY.md](./review/REVIEW_POLICY.md) — レビュー記録のサブディレクトリ規約と書き込み元。
