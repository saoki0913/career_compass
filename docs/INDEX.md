# 就活Compass (シューパス) - ドキュメント

就活支援アプリ「就活Pass」のドキュメント一覧

---

## 📋 仕様書

| ドキュメント | 説明 |
|------------|------|
| [SPEC.md](./SPEC.md) | 機能仕様書（全機能の詳細仕様） |
| [PROGRESS.md](./PROGRESS.md) | 実装進捗（機能別の実装状況） |

---

## 🚀 環境構築 (setup/)

開発環境のセットアップに関するドキュメント

| ドキュメント | 説明 |
|------------|------|
| [DEVELOPMENT.md](./setup/DEVELOPMENT.md) | 開発ガイド（Quick Start、コマンド一覧） |
| [ENV_SETUP.md](./setup/ENV_SETUP.md) | 環境変数設定（Supabase, OAuth, Stripe等） |
| [SUPABASE_SETUP.md](./setup/SUPABASE_SETUP.md) | Supabase セットアップ（DB作成〜起動までコマンド付き） |
| [MCP_SETUP.md](./setup/MCP_SETUP.md) | MCPサーバー設定（Claude Code連携） |

---

## 🏗️ アーキテクチャ (architecture/)

システム構成・技術スタックに関するドキュメント

| ドキュメント | 説明 |
|------------|------|
| [ARCHITECTURE.md](./architecture/ARCHITECTURE.md) | システムアーキテクチャ（全体構成図） |
| [DATABASE.md](./architecture/DATABASE.md) | データベース設計（テーブル定義、ER図） |
| [ERROR_HANDLING.md](./architecture/ERROR_HANDLING.md) | エラー表示方針（ユーザー向け文言と開発者向け詳細の分離） |
| [TECH_STACK.md](./architecture/TECH_STACK.md) | 使用技術一覧（バージョン、依存関係） |

---

## ⚡ 機能ドキュメント (features/)

個別機能の詳細仕様と実装ガイド

| ドキュメント | 説明 |
|------------|------|
| [COMPANY_INFO_FETCH.md](./features/COMPANY_INFO_FETCH.md) | 企業情報検索（採用ページ検索、スケジュール抽出） |
| [COMPANY_RAG.md](./features/COMPANY_RAG.md) | 企業RAGシステム（ハイブリッド検索、ベクトルDB） |
| [ES_REVIEW.md](./features/ES_REVIEW.md) | ES添削機能（改善ポイント先行の2段階生成、設問別 pre-stream 企業補強、全標準モデル共通の結論ファースト品質 gate、右パネル自動追尾） |
| [GAKUCHIKA_DEEP_DIVE.md](./features/GAKUCHIKA_DEEP_DIVE.md) | ガクチカ深掘り（対話形式、サマリー生成、面接品質基準） |
| [MOTIVATION.md](./features/MOTIVATION.md) | 志望動機作成（AI対話形式、ES下書き生成、企業根拠の品質基準） |

---

## 🧪 テスト (testing/)

テストコードとテスト戦略に関するドキュメント

| ドキュメント | 説明 |
|------------|------|
| [BACKEND_TESTS.md](./testing/BACKEND_TESTS.md) | バックエンドテスト（pytest、検索精度テスト） |
| [RAG_EVAL.md](./testing/RAG_EVAL.md) | RAG評価（ES添削向けオフライン評価） |
| [ES_REVIEW_QUALITY.md](./testing/ES_REVIEW_QUALITY.md) | ES添削の固定 rubric 評価（company evidence / user facts / conclusion-first / weak evidence 通知） |

---

## 🚀 リリース (release/)

| ドキュメント | 説明 |
|------------|------|
| [PRODUCTION.md](./release/PRODUCTION.md) | 本番リリース手順書（Vercel + Railway + Supabase） |

## 🛡️ 運用ガードレール (ops/)

| ドキュメント | 説明 |
|------------|------|
| [CLI_GUARDRAILS.md](./ops/CLI_GUARDRAILS.md) | 安全ラッパー付き CLI 運用（git / gh / Vercel / Railway / Supabase / Stripe / HF / Modal / gcloud） |

---

## 関連ファイル

- [CLAUDE.md](../CLAUDE.md) - Claude Codeへの指示（プロジェクトルート）
- [Makefile](../Makefile) - 開発コマンド一覧
