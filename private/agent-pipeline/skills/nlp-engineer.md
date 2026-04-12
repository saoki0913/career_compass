---
name: nlp-engineer
description: BM25+Cross-Encoder reranking、企業情報テキスト分類、embeddings最適化を担う検索・NLPの専門スキル。
command_description: 検索品質改善・テキスト分類・埋め込みモデル最適化を行う。
cursor_description: 検索品質改善・テキスト分類・埋め込みモデル最適化を行う。
---

# NLP Engineer

就活Pass の検索パイプライン・テキスト処理の専門スキル。企業情報 RAG の検索品質とテキスト分類の精度を改善する。

## 対象ファイル・コンポーネント

- `backend/app/utils/vector_store.py` — ChromaDB ベクトルストア
- `backend/app/utils/hybrid_search.py` — ハイブリッド検索（ベクトル + BM25 統合）
- `backend/app/utils/bm25_store.py` — BM25 検索エンジン
- `backend/app/utils/reranker.py` — Cross-Encoder reranking
- `backend/app/utils/embeddings.py` — 埋め込みモデル呼び出し
- `backend/app/utils/content_classifier.py` — コンテンツ分類（企業情報のカテゴリ判定）
- `backend/app/utils/web_search.py` — Web検索（企業情報取得）
- `backend/app/routers/company_info.py` — 企業情報検索API

## ワークフロー

1. 検索品質の現状を把握する（recall/precision の課題特定）。
2. ハイブリッド検索のスコア統合方式を確認する。
3. reranker のモデルと閾値を確認する。
4. 改善仮説を立て、テスト方法を提案する。
5. `backend/tests/company_info/` の既存テストを活用・拡張する。

## 就活Pass 固有ルール

### 検索パイプライン
- ChromaDB でベクトル検索 + BM25 でキーワード検索 → スコア統合 → Cross-Encoder reranking
- 企業情報のソース: URL取得、PDF取込、手動入力
- RAG グラウンディングレベル: `none` / `light` / `standard` / `deep`

### コンテンツ分類
- `content_classifier.py` で企業情報のカテゴリ（事業内容、選考情報、企業文化等）を判定
- 分類結果は RAG のソースファミリー優先順位に影響

### 日本語処理
- 企業名の表記揺れ（略称、英語名、カタカナ）への対応
- `backend/data/company_mappings.json` で企業名マッピング管理

## 品質基準

- 検索結果の関連度: 上位5件に正解が含まれる率を追跡。
- reranking 後のスコア分布が適切であること。
- 新規インデックス追加時に既存検索結果が劣化しないこと。
- テスト: `backend/tests/company_info/` のスイートがパスすること。

## 出力

- 日本語で記述。コード・パス・型名は英語。
- 検索品質の定量評価を含む場合はテーブル形式で提示。
