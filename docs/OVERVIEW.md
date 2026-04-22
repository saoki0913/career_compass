# ドキュメントの読み方（はじめに）

**最終更新**: 2026-04-07

**この文書の目的**: 就活Pass の `docs/` を初めて開く人が、どれをどの順で読めばよいかを示します。

**誰が読むか**: プロダクトオーナー、開発者、ドキュメントを整理したい人。

---

## プロダクトの一言

就活Pass（読み：しゅうかつパス）は、ES添削・志望動機・ガクチカ支援、企業・締切・通知・Google カレンダー連携などをまとめた就活支援 Web アプリです。フロントは Next.js（App Router）、AI・検索基盤は Python FastAPI が担います。

**正しい動作の一次情報は常にコード**です。仕様書（SPEC）や進捗（PROGRESS）は人が読むための整理であり、実装と食い違う場合はコードを優先してください。

---

## 読む順（目安）

| 時間 | おすすめ |
|------|----------|
| 約5分 | この OVERVIEW → [INDEX.md](./INDEX.md) で全体地図を眺める |
| 約30分 | [SPEC.md](./SPEC.md) 冒頭の「人向け要約」→ 関心のある [features/](./features/) の1ファイル |
| 深掘り | [architecture/ARCHITECTURE.md](./architecture/ARCHITECTURE.md)、[SPEC.md](./SPEC.md) 本文、各機能ドキュメント |

---

## SPEC と PROGRESS の使い分け

| ファイル | 役割 |
|----------|------|
| [SPEC.md](./SPEC.md) | 機能・非機能の仕様の整理。冒頭に要約あり。詳細は実装と照合しながら読む。 |
| [PROGRESS.md](./PROGRESS.md) | 実装状況の一覧。完了表記はコード上の有無と照合して更新する。 |

エージェント向けのプロジェクト全体ルールはリポジトリ直下の `CLAUDE.md` / `AGENTS.md` を参照してください。人向けの長文説明は `docs/` に寄せています。

---

## フォルダの意味

| フォルダ | 内容 |
|----------|------|
| [setup/](./setup/) | 開発環境・DB・環境変数（統合後はファイル数が少なくなっています） |
| [architecture/](./architecture/) | システム構成、DB、エラー方針、UI ガイドライン、技術スタック |
| [features/](./features/) | 機能ごとの詳細（全14ファイル。`入口` → `仕様` → `技術メモ` の統一フォーマット） |
| [testing/](./testing/) | テストの種類と手順（pytest、RAG評価、Playwright など） |
| [release/](./release/) | 本番デプロイ、Stripe、ドメイン、各クラウドの手順 |
| [marketing/](./marketing/) | マーケ・LP・SEO・分析のメモ（統合ファイルあり） |
| [ops/](./ops/) | CLI 安全運用、AI 開発 pipeline、設計原則、セキュリティ関連 |

詳細な一覧は [INDEX.md](./INDEX.md) へ。
