# 企業RAGシステム

ES添削時に企業固有のコンテキストを提供するRAG（Retrieval-Augmented Generation）システム。

**参照実装**: `backend/app/utils/vector_store.py`, `backend/app/utils/hybrid_search.py`

---

## 1. 概要

| 項目 | 内容 |
|------|------|
| **目的** | ES添削時に企業情報を参照し、「企業接続」軸の評価を可能にする |
| **ベクトルDB** | ChromaDB（永続化） |
| **キーワード検索** | BM25（bm25sライブラリ） |
| **検索方式** | ハイブリッド検索（Dense 60% + Sparse 40%）+ 強化パイプライン |

### ES添削での活用

- **「企業接続」軸のスコアリング**: 企業の求める人材像とESの内容の一致度を評価
- **企業キーワードの抽出**: 企業固有のキーワードをES添削フィードバックに反映

---

## 2. アーキテクチャ

```
┌──────────────────────────────────────────────────┐
│  データ取り込み                                    │
│  (企業情報検索 → Chunking → Embedding → Storage)  │
│  ※ docs/COMPANY_INFO_FETCH.md 参照               │
└──────────────────────────────────────────────────┘
                    ↓
┌──────────────────────────────────────────────────┐
│  永続化ストレージ                                  │
│  ChromaDB (backend/data/chroma)                  │
│  BM25 Index (backend/data/bm25)                  │
└──────────────────────────────────────────────────┘
                    ↓
┌──────────────────────────────────────────────────┐
│  ハイブリッド検索パイプライン                       │
│  Dense強化 (Multi-Query + HyDE + RRF + MMR)      │
│       +                                          │
│  Sparse (BM25)                                   │
│       ↓                                          │
│  重み付け融合 (semantic 60% + keyword 40%)        │
│       ↓                                          │
│  [LLM Rerank]（品質スコア < 0.7 の場合のみ）       │
└──────────────────────────────────────────────────┘
                    ↓
┌──────────────────────────────────────────────────┐
│  コンテキスト生成                                  │
│  ES添削プロンプトに企業情報を注入                   │
└──────────────────────────────────────────────────┘
```

---

## 3. 検索アルゴリズム

### 3.1 ハイブリッド検索パイプライン

Dense検索（セマンティック）とSparse検索（BM25）を組み合わせた検索。

```
クエリ（ESコンテンツ）
       ↓
┌─ Dense検索パイプライン ─────────────────┐
│  クエリ拡張（Multi-Query）               │
│       ↓                                │
│  [HyDE]（短いクエリのみ）                │
│       ↓                                │
│  Semantic Search（ChromaDB）           │
│       ↓                                │
│  RRF（クエリ間融合）                     │
│       ↓                                │
│  MMR（多様性確保）                       │
└─────────────────────────────────────────┘
       ↓
┌─ Sparse検索 ────────────────────────────┐
│  BM25（日本語トークナイズ + キーワード）   │
└─────────────────────────────────────────┘
       ↓
┌─ 融合 ──────────────────────────────────┐
│  スコア正規化 + 重み付け加算              │
│  semantic: 0.6, keyword: 0.4           │
│  重複除去（source_url + chunk_index）    │
└─────────────────────────────────────────┘
       ↓
[LLM Rerank]（上位スコア < 0.7 の場合のみ）
       ↓
Top N 結果
```

### 3.2 クエリ拡張（Multi-Query）

LLMで同義・別表現のクエリを生成し、検索の網羅性を向上。

| パラメータ | 値 | 説明 |
|-----------|-----|------|
| max_queries | 3 | 生成する最大クエリ数 |
| total_queries | 4 | 元クエリ + バリエーション |
| max_query_chars | 1200 | これ以上はクエリ拡張スキップ |
| model | Claude優先 | OpenAIはフォールバック |

**参照実装**: `hybrid_search.py` - `expand_queries_with_llm()`

### 3.3 HyDE（仮想文書生成）

短いクエリに対して、検索に有効な仮想文書を生成してリコールを改善。

| パラメータ | 値 | 説明 |
|-----------|-----|------|
| max_chars | 600 | クエリ長がこれ以下なら使用 |
| output_length | 300-500文字 | 生成する仮想文書の長さ |

**参照実装**: `hybrid_search.py` - `generate_hypothetical_document()`

### 3.4 Reciprocal Rank Fusion (RRF)

複数クエリの検索結果を順位ベースで融合。

```
RRFスコア = Σ(1 / (k + rank + 1))
- k = 60（定数）
```

### 3.5 MMR（多様性の確保）

関連性と多様性をバランス。

```
score = λ * sim(query, doc) - (1 - λ) * max(sim(doc, selected))
- λ = 0.5
```

### 3.6 LLMリランキング

検索結果をLLMで関連度スコアリングし、順位を最適化。

| パラメータ | 値 | 説明 |
|-----------|-----|------|
| max_candidates | 20 | リランキング対象の最大数 |
| threshold | 0.7 | この閾値未満でリランキング実行 |
| model | Claude優先 | OpenAIはフォールバック |

**参照実装**: `hybrid_search.py` - `rerank_results_with_llm()`

### 3.7 BM25キーワード検索

日本語に最適化したキーワードベースの検索。

| 設定 | 値 |
|------|-----|
| ライブラリ | bm25s（Pure Python） |
| 永続化 | `backend/data/bm25/{company_id}.pkl` |
| トークナイザー | MeCab (fugashi) + UniDic |

**参照実装**: `backend/app/utils/bm25_store.py`

### 3.8 ハイブリッド融合

```python
hybrid_score = semantic_norm * 0.6 + keyword_norm * 0.4

# スコア正規化: 各検索結果内で0-1に正規化
# 重複除去: (source_url, chunk_index, content_type) でユニーク化
```

---

## 4. Embeddingプロバイダー

| プロバイダー | モデル | 次元数 | 用途 |
|------------|-------|-------|------|
| **OpenAI** | text-embedding-3-small | 1536 | 本番環境（推奨） |
| **Local** | paraphrase-multilingual-MiniLM-L12-v2 | 384 | フォールバック |

**環境変数**:
- `EMBEDDINGS_PROVIDER`: `auto` / `openai` / `local`（デフォルト: `auto`）
- `OPENAI_EMBEDDING_MODEL`: モデル名（デフォルト: `text-embedding-3-small`）
- `EMBEDDING_MAX_INPUT_CHARS`: 最大入力文字数（デフォルト: 8000）

**自動フォールバック**: OpenAI → Local（quota/rate limit/API error時）

---

## 5. テキストチャンキング

### 5.1 コンテンツタイプ別チャンクサイズ

| コンテンツタイプ | チャンクサイズ |
|-----------------|--------------|
| new_grad_recruitment | 300文字 |
| midcareer_recruitment | 300文字 |
| employee_interviews | 400文字 |
| corporate_site | 500文字 |
| ceo_message | 500文字 |
| ir_materials | 700文字 |
| midterm_plan | 800文字 |

※ コンテンツタイプの詳細は `docs/COMPANY_INFO_FETCH.md` を参照

### 5.2 共通パラメータ

| パラメータ | 値 |
|-----------|-----|
| chunk_overlap | 100文字 |
| min_chunk_size | 50文字 |

### 5.3 分割優先順位

1. `\n\n` - 段落区切り
2. `\n` - 改行
3. `。` - 句点
4. `！` `？` - 感嘆符・疑問符
5. `、` - 読点
6. 強制分割（文字単位）

**参照実装**: `backend/app/utils/text_chunker.py`

---

## 6. 日本語トークナイザー

BM25検索用の日本語トークナイザー。

### 6.1 実装階層

```
① MeCab (fugashi) - 形態素解析、品詞フィルタリング
    ↓（MeCab未インストール時）
② フォールバック - 文字ベース分割（日本語）/ 空白ベース分割（英語）
```

### 6.2 MeCab設定

| 設定項目 | 値 |
|---------|-----|
| 辞書 | UniDic |
| 品詞フィルタ | 名詞, 動詞, 形容詞 |
| 最小トークン長 | 2文字 |
| ストップワード | 52語（助詞、助動詞、指示詞等） |

**参照実装**: `backend/app/utils/japanese_tokenizer.py`

---

## 7. コンテキストフォーマット

ES添削プロンプトに注入される形式：

```
【締切情報】（採用ホームページ）[S1]
エントリーシート提出期限：2024年3月31日

【企業情報】（企業HP）[S2]
当社は〇〇業界でトップシェアを誇り...
```

### ソース追跡

- ソース識別子: S1〜S5（最大5件）
- URL重複除去: 同一URLは1つのソースIDにまとめる
- excerpt: 最大150文字

**参照実装**: `hybrid_search.py` - `format_context_with_sources()`

---

## 8. 動的コンテキスト長

ESの文字数に応じてコンテキスト長を動的に調整。

| ESコンテンツ長 | コンテキスト上限 |
|--------------|----------------|
| < 500文字 | 1500トークン |
| 500〜1000文字 | 2500トークン |
| >= 1000文字 | 3000トークン |

---

## 9. キャッシュ戦略

| 項目 | 内容 |
|------|------|
| バックエンド | Redis（オプション） |
| キャッシュキー | `company_id + content_hash + context_length` |
| 無効化 | RAGデータ更新/削除時 |

**参照実装**: `vector_store.py` - `get_rag_cache()`

---

## 10. 検索コンテキスト別ブースト

RAG検索時、検索コンテキストに応じて各コンテンツタイプに異なるブースト係数が適用される。

| コンテキスト | 最優先タイプ | ブースト |
|------------|-------------|---------|
| ES添削 | new_grad_recruitment | 1.5 |
| スケジュール取得 | new_grad_recruitment | 2.0 |
| 企業情報取得 | corporate_site | 1.3 |

**参照実装**: `hybrid_search.py` - `CONTENT_TYPE_BOOSTS`

---

## 11. APIエンドポイント一覧

### RAG構築

| エンドポイント | 説明 |
|---------------|------|
| `POST /company-info/rag/build` | 企業情報をベクトル化して保存 |
| `POST /company-info/rag/crawl-corporate` | コーポレートページをクロールしてRAG構築 |

### コンテキスト取得

| エンドポイント | 説明 |
|---------------|------|
| `POST /company-info/rag/context` | ES添削用のコンテキストを取得 |

### ステータス・管理

| エンドポイント | 説明 |
|---------------|------|
| `GET /company-info/rag/status/{company_id}` | 簡易ステータス |
| `GET /company-info/rag/status-detailed/{company_id}` | 詳細ステータス |
| `DELETE /company-info/rag/{company_id}` | RAGデータ全削除 |
| `DELETE /company-info/rag/{company_id}/{content_type}` | 特定タイプのみ削除 |

---

## 12. データ構造

### ChromaDBコレクション

```
コレクション名: company_info__{provider}__{model}
例: company_info__openai__text-embedding-3-small
```

### メタデータ

| フィールド | 説明 |
|-----------|------|
| company_id | 企業UUID |
| company_name | 企業名 |
| source_url | 元URL |
| chunk_type | full_text / deadline / recruitment_type 等 |
| content_type | new_grad_recruitment / corporate_site 等 |
| chunk_index | チャンク番号 |
| heading_path | 見出しパス |
| fetched_at | 取得日時 |

---

## 13. LLMモデル設定

RAGパイプライン内の各機能で使用するLLM。**既定はClaude優先**。

| 機能 | 用途 | フォールバック |
|-----|------|---------------|
| rag_query | クエリ拡張 | gpt-5-mini |
| rag_hyde | HyDE生成 | gpt-5-mini |
| rag_rerank | リランキング | gpt-5-mini |
| rag_classify | コンテンツ分類 | gpt-5-mini |

### コスト最適化

| 最適化項目 | 実装 |
|-----------|------|
| HyDE | クエリ < 600文字の場合のみ |
| クエリ拡張 | クエリ > 1200文字ならスキップ |
| リランキング | 品質スコア < 0.7 の場合のみ |
| Multi-Query | 最大3クエリ、総数4件以内 |

---

## 14. トリガー条件

RAG構築は以下のタイミングで自動実行：

1. **AI選考スケジュール取得 成功時**
   - 抽出データ + フルテキストを保存
   - 非同期・ノンブロッキング

2. **コーポレートページクロール実行時**
   - IR・事業紹介ページを追加保存

### 構造化データとフルテキストの二重保存

| データ種別 | chunk_type | 内容 |
|-----------|-----------|------|
| 構造化データ | deadline, recruitment_type 等 | 抽出された項目を個別チャンク |
| フルテキスト | full_text | 元テキスト全体をチャンキング |

---

## 15. 関連ファイル

| ファイル | 役割 |
|---------|------|
| `backend/app/utils/vector_store.py` | ChromaDB操作、RAG構築・検索 |
| `backend/app/utils/hybrid_search.py` | ハイブリッド検索、RRF、クエリ拡張、HyDE、リランキング |
| `backend/app/utils/bm25_store.py` | BM25インデックス管理 |
| `backend/app/utils/embeddings.py` | Embedding生成 |
| `backend/app/utils/text_chunker.py` | テキストチャンキング |
| `backend/app/utils/japanese_tokenizer.py` | 日本語トークナイズ |
| `backend/app/utils/llm.py` | LLM呼び出しユーティリティ |
| `backend/app/routers/company_info.py` | RAG関連APIエンドポイント |
| `backend/app/routers/es_review.py` | ES添削でのRAG活用 |

**企業情報検索**: `docs/COMPANY_INFO_FETCH.md` を参照
