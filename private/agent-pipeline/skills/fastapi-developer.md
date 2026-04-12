---
name: fastapi-developer
description: AIバックエンド（backend/app/）の開発。SSEストリーミング、Pydantic v2バリデーション、検索パイプラインを担う。
command_description: FastAPI バックエンドの開発・SSEストリーミング・検索パイプライン改善を行う。
cursor_description: FastAPI バックエンドの開発・SSEストリーミング・検索パイプライン改善を行う。
---

# FastAPI Developer

就活Pass の AI バックエンド（FastAPI）開発の専門スキル。

## 対象ファイル・コンポーネント

- `backend/app/main.py` — FastAPI エントリポイント
- `backend/app/routers/` — ルーター群
  - `es_review.py` — ES添削（5220行、SSEストリーミング）
  - `gakuchika.py` — ガクチカ深掘り会話
  - `motivation.py` — 志望動機会話・ドラフト生成
  - `company_info.py` — 企業情報取得・RAGインジェスト
  - `health.py` — ヘルスチェック
- `backend/app/utils/` — ユーティリティ群
  - `llm.py` — LLM呼び出し基盤
  - `vector_store.py` — ChromaDB ベクトルストア
  - `hybrid_search.py` — ハイブリッド検索
  - `bm25_store.py` — BM25 検索
  - `reranker.py` — Cross-Encoder reranking
  - `embeddings.py` — 埋め込みモデル
  - `content_classifier.py` — コンテンツ分類
  - `web_search.py` — Web検索
  - `pdf_ocr.py` — PDF OCR
- `backend/app/prompts/` — プロンプトテンプレート群
- `backend/app/config.py` — 設定（Pydantic Settings）
- `backend/tests/` — pytest テスト

## ワークフロー

1. 対象ルーターの既存コードを読み、API設計・エラーハンドリング・SSEパターンを把握する。
2. 変更が既存の SSE ストリーミング契約（プログレスイベント、完了イベント、エラーイベント）を壊さないことを確認する。
3. Pydantic モデルでリクエスト/レスポンスを型定義する。
4. `backend/tests/` に対応テストを追加する。
5. 既存の CI（pytest）が通ることを確認する。

## 就活Pass 固有ルール

### SSE ストリーミングパターン
- ES添削はステップID + 進捗% + ラベルを SSE で送信する。
- キーワードソースの段階的表示に対応する。
- クレジットは成功時のみ消費、失敗時はキャンセルする。

### 検索パイプライン
- ChromaDB + BM25 のハイブリッド検索 → Cross-Encoder reranking
- 企業RAGソース: URL取得、PDF取込、手動入力の3種
- `company_pdf_ingest_jobs` で非同期インジェスト

### エラーハンドリング
- Next.js API 側で `createApiErrorResponse()` を使うため、FastAPI 側は適切な HTTP ステータスとエラー詳細を返す。
- 422 バリデーションエラーは Pydantic の標準形式に従う。

### 認証連携
- FastAPI は Next.js からの proxy 呼び出しを受ける。
- 認証は Next.js 側で処理済み。FastAPI は `x-device-token` ヘッダーでゲスト識別を受け取る。

## 品質基準

- 型安全: Pydantic v2 モデルで入出力を定義。
- テスト: 新規エンドポイントには対応テストを追加。
- SSE契約: 既存のフロントエンドが期待するイベント形式を壊さない。
- パフォーマンス: SSE の初回応答は 3 秒以内を目標。

## 出力

- 日本語で記述。コード・パス・型名は英語。
