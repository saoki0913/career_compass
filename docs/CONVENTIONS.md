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
| `operations/` | 開発運用・プラットフォーム運用・本番 runbook | AI 開発者・運用者・リリース担当 | 運用手順と運用リファレンスの正本 |
| `release/` | 本番初期構築・リリース入口 | リリース・本番初期構築を行う人 | 本番 setup 入口の正本 |
| `plan/` | 改善計画（進行中 + `completed/` アーカイブ、`plan-tasks.json` がタスク状態 SSOT） | 改善計画を進める開発者 | 計画の正本（タスク状態は JSON が SSOT） |
| `review/` | レビュー記録アーカイブ（観測スナップショット、`REVIEW_POLICY.md` 準拠） | 過去レビューを参照する人 | 参照（作成時点のスナップショット、現状はコードで裏取り） |

### operations/ と release/ の役割分担

- **`operations/development/`** = AI 開発ハーネス、Codex / Claude / Cursor harness、CLI guardrails、test harness、dead code removal。
- **`operations/platform/`** = 環境変数 SSOT、security、observability、monitoring、SEO Search Console、Stripe CLI、Grafana dashboard。
- **`operations/production/`** = 本番 runbook、通常リリース、DB migration、secret sync / rotation、incident rollback、hook safety map。
- **`release/setup/`** = 初回本番構築。Vercel / Railway / Supabase / Stripe / domain など provider 初期設定だけを書く。
- **`release/README.md` / `release/PRODUCTION.md`** = 互換入口。日常運用の正本は `operations/production/`、環境変数の正本は `operations/platform/ENVIRONMENT_VARIABLES.md`。

旧 `ops` ディレクトリと旧 `release` 配下の運用ディレクトリは使いません。新規文書・リンク・計画の出力先に旧パスを書かず、上記 `operations/` 配下のどれかへ分類してください。

---

## 2. 命名規約

| 種別 | 規約 | 例 |
|---|---|---|
| 仕様・運用 doc | `SCREAMING_SNAKE_CASE.md` | `ARCHITECTURE.md`, `ENVIRONMENT_VARIABLES.md` |
| 改善計画 | `kebab-case-plan.md` | `security-vulnerability-hardening-plan.md` |
| 計画のレポート | `kebab-case-report.md` | `billing-credit-integrity-report.md` |
| レビュー記録 | `<topic>-YYYY-MM-DD.md` | `es-review-model-comparison-2026-05-07.md` |
| プロンプト doc | `kebab-case.md` | `query-expansion.md`, `deepdive-question.md` |
| ディレクトリ | 小文字 | `architecture/`, `operations/production/` |

---

## 3. 新規文書の置き場所判断フロー

新しい文書を追加するとき、上から順に質問に答えて置き場所を決めます。

1. **本番の日常運用手順か？**（リリース手順、シークレット運用、DB 移行、障害対応） → `operations/production/`
2. **本番初期構築か？**（provider dashboard 初期設定、domain、Stripe 初期構築） → `release/setup/`
3. **AI 開発ハーネス・ローカル運用・CLI guardrails の話か？** → `operations/development/`
4. **監視・SECURITY・環境変数・SEO Search Console の話か？** → `operations/platform/`（環境変数は `operations/platform/ENVIRONMENT_VARIABLES.md` が SSOT）
5. **ローカル開発環境のセットアップか？** → `setup/`
6. **特定機能の実装参照付き仕様か？** → `features/`（上位仕様だけなら `SPEC.md`）
7. **システム設計・モジュール間契約か？** → `architecture/`
8. **改善計画・ロードマップか？** → `plan/`（完了したら `plan/completed/`、タスク状態は `plan/plan-tasks.json` を更新）
9. **品質ゲート・監査のレビュー記録か？** → `review/`（`REVIEW_POLICY.md` のサブディレクトリ規約に従う）
10. **LLM プロンプトの人間評価スナップショットか？** → `prompts/`（runtime 非連携であることを明記）
11. **参考 ES ヒントのキュレーション入力か？** → `reference/`
12. **テスト方針か？** → `testing/`
13. **LP・SEO 戦略か？** → `marketing/`

迷う場合は「一次情報（正本）はどこか」を基準にします。コードが正本なら doc は参照入口に留め、SSOT が既にあるなら新規作成せず既存 SSOT を更新します。

---

## 4. 原則

- **一次情報はコード**: 正しい動作の一次情報は常にコード本体です。仕様書と実装が食い違う場合はコードを優先し、ドキュメント修正の issue を立てます。`prompts/` と `reference/` と `review/` は runtime 非連携または作成時点のスナップショットであり、必ず最新コードで裏取りします。
- **secret は読まない**: secret の実値は直接 Read せず、`zsh scripts/release/sync-career-compass-secrets.sh --check` 等の `--check` 系コマンドで key set のみ確認します。
- **AGENTS.md と CLAUDE.md は同内容で保つ**: 一方を更新したら他方も同じ内容に揃えます。
- **言語**: ドキュメント本文は日本語を基本にします。コマンド、パス、識別子、型名、ライブラリ名は英語のまま保ちます。
- **SSOT を複製しない**: 環境変数は `operations/platform/ENVIRONMENT_VARIABLES.md`、計画タスク状態は `plan/plan-tasks.json` が唯一の正本です。互換のための入口（例: `release/setup/ENV_REFERENCE.md`）は内容を持たず SSOT へリダイレクトします。

---

## 関連

- [INDEX.md](./INDEX.md) — ドキュメント一覧（地図）。どの項目でどの文書を見ればよいかはこちら。
- [review/REVIEW_POLICY.md](./review/REVIEW_POLICY.md) — レビュー記録のサブディレクトリ規約と書き込み元。
