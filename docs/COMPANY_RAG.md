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
┌─────────────────────────────────────────────────────────────────┐
│                      データ取り込み                              │
│  (AI選考スケジュール取得 → Text Chunking → Embedding → Storage) │
│  ※ docs/COMPANY_INFO_FETCH.md 参照                             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      永続化ストレージ                            │
│  ┌────────────────────┐  ┌────────────────────┐                │
│  │  ChromaDB          │  │  BM25 Index        │                │
│  │  (ベクトル検索)      │  │  (キーワード検索)   │                │
│  │  backend/data/chroma│  │  backend/data/bm25 │                │
│  └────────────────────┘  └────────────────────┘                │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                     ハイブリッド検索                             │
│  Dense強化 (Multi-Query + HyDE + RRF + MMR + Rerank)            │
│         +                                                       │
│  Sparse (BM25 キーワード検索)                                    │
│         ↓                                                       │
│  重み付け融合: semantic_weight=0.6, keyword_weight=0.4          │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                     コンテキスト生成                             │
│  ES添削プロンプトに企業情報を注入                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. コンテンツタイプ（新分類）

| タイプ | 説明 | 典型的に入る内容 |
|-------|------|------------------|
| `new_grad_recruitment` | 新卒採用ホームページ | 新卒向け募集要項、選考フロー、エントリー情報、福利厚生、研修 |
| `midcareer_recruitment` | 中途採用ホームページ | 中途・キャリア採用情報、経験者向け職種、転職者向け情報 |
| `corporate_site` | 企業HP | 会社概要、沿革、拠点、事業内容、製品/サービス、公式ニュース |
| `ir_materials` | IR資料 | 有価証券報告書、決算短信、決算説明資料、統合報告書 |
| `ceo_message` | 社長メッセージ | トップメッセージ、社長挨拶、CEOインタビュー |
| `employee_interviews` | 社員インタビュー | 社員紹介、公式ブログ、カルチャー記事、職種紹介インタビュー |
| `press_release` | プレスリリース | リリース本文、発表、提携、受賞、サービス提供開始 |
| `csr_sustainability` | CSR/サステナ | サステナビリティ方針、ESGデータ、CSR活動 |
| `midterm_plan` | 中期経営計画 | 中計資料、経営方針説明、KPI、事業ポートフォリオ |
| `structured` | 構造化データ | 抽出済み締切・募集情報 |

**注意**: 旧 `recruitment_homepage` は `new_grad_recruitment` に移行。既存データは自動マッピングされる。

---

## 4. 検索アルゴリズム

### 4.1 ハイブリッド検索パイプライン

Dense検索（セマンティック）とSparse検索（BM25キーワード）を組み合わせた検索。

```
クエリ（ESコンテンツ）
         ↓
┌────────────────────────────────────────┐
│  Dense検索パイプライン                    │
│  Multi-Query / HyDE                      │
│         ↓                               │
│  Semantic Search（ChromaDB）             │
│         ↓                               │
│  RRF（クエリ間融合）                      │
│         ↓                               │
│  MMR（多様性）                           │
│         ↓                               │
│  LLM Rerank（品質スコア < 0.7 の場合）   │
└────────────────────────────────────────┘
         ↓
┌────────────────────────────────────────┐
│  Sparse検索（BM25）                      │
│  - 日本語トークナイズ（MeCab）            │
│  - キーワードマッチング                   │
└────────────────────────────────────────┘
         ↓
┌────────────────────────────────────────┐
│  ハイブリッド融合                         │
│  - semantic_weight: 0.6                 │
│  - keyword_weight: 0.4                  │
│  - スコア正規化 + 重み付け加算            │
│  - 重複除去（source_url + chunk_index）  │
└────────────────────────────────────────┘
         ↓
Top N 結果
```

### 4.2 Reciprocal Rank Fusion (RRF)

複数クエリの検索結果を順位ベースで融合。

```
RRFスコア = Σ(1 / (k + rank + 1))

- k = 60（定数）
- クエリ間の順位情報を統合
```

### 4.3 クエリ拡張（Multi-Query）

LLMで同義・別表現のクエリを生成し、検索の網羅性を向上。

**処理フロー**:
```
元クエリ
    ↓
LLM (expand_queries_with_llm)
    ↓
最大3つのクエリバリエーション生成
    ↓
各クエリで並列検索 → RRF融合
```

**設定**:
| パラメータ | 値 | 説明 |
|-----------|-----|------|
| max_queries | 3 | 生成する最大クエリ数 |
| total_queries | 4 | 元クエリ + バリエーション |
| model | Claude優先（`rag_query`） | OpenAIはフォールバック |
| max_tokens | 300 | 最大出力トークン数 |
| max_query_chars | 1200 | この長さ以上はクエリ拡張スキップ |

**参照実装**: `backend/app/utils/hybrid_search.py` - `expand_queries_with_llm()`

### 4.4 HyDE（仮想文書生成）

短いクエリに対して、検索に有効な仮想文書を生成してリコールを改善。

**設定**:
| パラメータ | 値 | 説明 |
|-----------|-----|------|
| max_chars | 600 | クエリ長がこれ以下ならHyDEを使用 |
| output_length | 300-500文字 | 生成する仮想文書の長さ |
| model | Claude優先（`rag_query`） | OpenAIはフォールバック |

**参照実装**: `backend/app/utils/hybrid_search.py` - `generate_hypothetical_document()`

### 4.5 MMR（多様性の確保）

関連性と多様性をバランスするためにMMRを適用。

```
score = λ * sim(query, doc) - (1 - λ) * max(sim(doc, selected))

- λ (lambda_mult) = 0.5
- 類似度: コサイン類似度
```

### 4.6 LLMリランキング

検索結果をLLMで関連度スコアリングし、順位を最適化。

**トリガー条件**:
- 上位3件のスコアが閾値（0.7）未満の場合のみ実行
- スコアが高い場合はスキップしてコスト削減

**処理フロー**:
```
検索結果（最大20件）
    ↓
品質チェック（top-3 scores < 0.7?）
    ↓ Yes
LLM (rerank_results_with_llm)
    ↓
各候補に0-100の関連度スコア付与
    ↓
スコア順で並び替え → Top N返却
```

**設定**:
| パラメータ | 値 | 説明 |
|-----------|-----|------|
| max_candidates | 20 | リランキング対象の最大数 |
| threshold | 0.7 | この閾値未満でリランキング実行 |
| model | Claude優先（`rag_rerank`） | OpenAIはフォールバック |
| max_tokens | 1500 | 最大出力トークン数（20候補対応） |

**出力形式（JSON Schema検証）**:
```json
{
  "ranked": [
    {"id": "chunk_id_1", "score": 95},
    {"id": "chunk_id_2", "score": 82}
  ]
}
```

**参照実装**: `backend/app/utils/hybrid_search.py` - `rerank_results_with_llm()`

### 4.7 BM25キーワード検索

日本語に最適化したキーワードベースの検索。

**処理フロー**:
```
クエリ
    ↓
日本語トークナイズ（MeCab / フォールバック）
    ↓
BM25インデックス検索
    ↓
(doc_id, score) タプルのリスト
```

**設定**:
| パラメータ | 値 | 説明 |
|-----------|-----|------|
| ライブラリ | bm25s | Pure Python BM25実装 |
| 永続化 | `backend/data/bm25/{company_id}.pkl` | pickle形式 |
| トークナイザー | MeCab (fugashi) | UniDic辞書 |

**参照実装**: `backend/app/utils/bm25_store.py`

### 4.8 ハイブリッド融合

Dense検索とSparse検索の結果を重み付けで統合。

```python
hybrid_score = semantic_norm * semantic_weight + keyword_norm * keyword_weight

# デフォルト重み
semantic_weight = 0.6
keyword_weight = 0.4

# スコア正規化: 各検索結果内で0-1に正規化
# 重複除去: (source_url, chunk_index, content_type) でユニーク化
```

**参照実装**: `backend/app/utils/hybrid_search.py` - `hybrid_search_company_context_enhanced()`

---

## 5. Embeddingプロバイダー

| プロバイダー | モデル | 次元数 | 用途 |
|------------|-------|-------|------|
| **OpenAI** | text-embedding-3-small | 1536 | 本番環境（推奨） |
| **Local** | paraphrase-multilingual-MiniLM-L12-v2 | 384 | フォールバック |

**環境変数**:
- `EMBEDDINGS_PROVIDER`: `auto` / `openai` / `local`（デフォルト: `auto`）
- `OPENAI_EMBEDDING_MODEL`: OpenAIモデル名（デフォルト: `text-embedding-3-small`）
- `LOCAL_EMBEDDING_MODEL`: ローカルモデル名（デフォルト: `paraphrase-multilingual-MiniLM-L12-v2`）
- `EMBEDDING_MAX_INPUT_CHARS`: 最大入力文字数（デフォルト: 8000）

**自動フォールバック機構**:
1. `auto`モード時、まずOpenAIを試行
2. quota/rate limit/API errorが発生した場合、自動的にLocalに切り替え
3. Localでもエラー時は例外をスロー

---

## 6. テキストチャンキング

日本語に最適化したチャンキング戦略。

### 6.1 コンテンツタイプ別チャンクサイズ

| コンテンツタイプ | チャンクサイズ | 説明 |
|-----------------|--------------|------|
| new_grad_recruitment | 300文字 | 新卒採用情報は細かく分割 |
| midcareer_recruitment | 300文字 | 中途採用情報は細かく分割 |
| employee_interviews | 400文字 | インタビューは中程度 |
| corporate_site | 500文字 | デフォルト |
| ceo_message | 500文字 | デフォルト |
| ir_materials | 700文字 | 財務情報は文脈を広く |
| midterm_plan | 800文字 | 経営計画は長い文脈が必要 |

### 6.2 共通パラメータ

| パラメータ | 値 | 説明 |
|-----------|-----|------|
| chunk_overlap | 100文字 | オーバーラップ（約20%） |
| min_chunk_size | 50文字 | 最小サイズ（これ以下はマージ） |

### 6.3 分割優先順位

1. `\n\n` - 段落区切り
2. `\n` - 改行
3. `。` - 句点
4. `！` `？` - 感嘆符・疑問符
5. `、` - 読点
6. ` ` - スペース
7. 強制分割（文字単位）

### 6.4 HTML対応チャンキング

HTMLからのテキスト抽出時、構造を保持したチャンキングを実行。

**処理フロー**:
```
HTML入力
    ↓
BeautifulSoup解析
    ↓
h1-h4見出しをセクションとして抽出
    ↓
script, style, nav, footer要素を除去
    ↓
セクション単位でチャンキング
    ↓
heading_path メタデータを付与
```

**参照実装**: `backend/app/utils/text_chunker.py`

---

## 7. 日本語トークナイザー

BM25検索用の日本語トークナイザー。

### 7.1 実装階層

```
トークン化リクエスト
    ↓
┌───────────────────────────────┐
│ ① MeCab (fugashi)            │
│   - 形態素解析                │
│   - 品詞フィルタリング         │
│   - ストップワード除去         │
└───────────────────────────────┘
    ↓ （MeCab未インストール時）
┌───────────────────────────────┐
│ ② フォールバック              │
│   - 文字ベース分割（日本語）   │
│   - 空白ベース分割（英語）     │
└───────────────────────────────┘
    ↓
トークンリスト
```

### 7.2 MeCab設定

| 設定項目 | 値 | 説明 |
|---------|-----|------|
| 辞書 | UniDic | 汎用日本語辞書 |
| 品詞フィルタ | 名詞, 動詞, 形容詞 | 意味のある品詞のみ抽出 |
| 最小トークン長 | 2文字 | 1文字トークンを除外 |

### 7.3 ストップワード（52語）

```python
JAPANESE_STOPWORDS = {
    # 助詞
    "の", "に", "は", "を", "が", "と", "で", "て", "から", "より",
    # 助動詞・接続詞
    "です", "ます", "である", "ない", "ある", "いる", "する", "なる",
    "た", "れ", "さ", "も", "な", "し", "や", "など",
    # 指示詞
    "これ", "それ", "あれ", "この", "その", "あの", "ここ", "そこ",
    # 副詞
    "また", "さらに", "特に", "非常に", "とても", "かなり", "より", "ほど",
    # 一般的すぎる語
    "こと", "もの", "ため", "よう", "等", "方", "様",
    ...
}
```

**参照実装**: `backend/app/utils/japanese_tokenizer.py`

---

## 8. APIエンドポイント

### 8.1 RAG構築

**`POST /company-info/rag/build`**

企業情報をベクトル化して保存

**リクエスト**:
```json
{
  "company_id": "uuid",
  "company_name": "株式会社〇〇",
  "source_url": "https://...",
  "raw_content": "...",
  "raw_content_format": "html",
  "store_full_text": true,
  "content_type": "recruitment_homepage",
  "content_channel": "recruitment",
  "extracted_data": {
    "deadlines": [...],
    "required_documents": [...],
    "application_method": {...},
    "selection_process": {...}
  }
}
```

**パラメータ説明**:
| パラメータ | 必須 | 説明 |
|-----------|------|------|
| `content_type` | No | 新分類システム（new_grad_recruitment, midcareer_recruitment, corporate_site, ir_materials等） |
| `content_channel` | No | レガシー分類（recruitment, corporate_ir, corporate_business, corporate_general） |

**注意**: `content_type`が指定されない場合、自動分類器がURLとコンテンツから推定します。

**レスポンス**:
```json
{
  "success": true,
  "company_id": "uuid",
  "chunks_stored": 15,
  "structured_chunks": 5,
  "full_text_chunks": 10,
  "embedding_provider": "openai",
  "embedding_model": "text-embedding-3-small"
}
```

### 8.2 コンテキスト取得

**`POST /company-info/rag/context`**

ES添削用のコンテキストを取得

**リクエスト**:
```json
{
  "company_id": "uuid",
  "es_content": "私は学生時代...",
  "max_context_length": 3000
}
```

**レスポンス**:
```json
{
  "success": true,
  "company_id": "uuid",
  "context": "【採用要項】（採用ホームページ）\n...\n\n【企業情報】（企業HP）\n...",
  "has_rag": true,
  "sources": [
    {
      "source_id": "S1",
      "source_url": "https://...",
      "content_type": "recruitment_homepage",
      "excerpt": "..."
    }
  ]
}
```

**注意**: `has_rag`がfalseの場合、`context`は空文字列になります。

### 8.3 RAGステータス確認

**`GET /company-info/rag/status/{company_id}`**

簡易ステータス確認

```json
{
  "has_rag": true
}
```

**`GET /company-info/rag/status-detailed/{company_id}`**

詳細ステータス

```json
{
  "has_rag": true,
  "total_chunks": 25,
  "recruitment_chunks": 15,
  "corporate_ir_chunks": 5,
  "corporate_business_chunks": 3,
  "corporate_general_chunks": 2,
  "structured_chunks": 0,
  "new_grad_recruitment_chunks": 6,
  "midcareer_recruitment_chunks": 2,
  "corporate_site_chunks": 6,
  "ir_materials_chunks": 4,
  "ceo_message_chunks": 1,
  "employee_interviews_chunks": 2,
  "press_release_chunks": 2,
  "csr_sustainability_chunks": 1,
  "midterm_plan_chunks": 1,
  "recruitment_homepage_chunks": 0,
  "last_updated": "2024-01-15T10:00:00Z"
}
```

**注意**: `recruitment_homepage_chunks` はレガシー互換用。新規データは `new_grad_recruitment_chunks` / `midcareer_recruitment_chunks` に分類される。

### 8.4 RAG削除

**`DELETE /company-info/rag/{company_id}`**

企業のRAGデータを全削除

**`DELETE /company-info/rag/{company_id}/{content_type}`**

特定コンテンツタイプのみ削除

### 8.5 コーポレートページクロール

**`POST /company-info/rag/crawl-corporate`**

IR・事業紹介ページをクロールしてRAG構築

**リクエスト**:
```json
{
  "company_id": "uuid",
  "company_name": "株式会社〇〇",
  "urls": [
    "https://example.com/ir",
    "https://example.com/about"
  ],
  "content_type": "corporate_site"
}
```

**レスポンス**:
```json
{
  "success": true,
  "company_id": "uuid",
  "pages_crawled": 2,
  "chunks_stored": 25,
  "errors": []
}
```

**`POST /company-info/search-corporate-pages`**

コーポレートページ候補を検索

**リクエスト**:
```json
{
  "company_name": "株式会社〇〇",
  "page_types": ["ir", "about", "business"]
}
```

**レスポンス**:
```json
{
  "candidates": [
    {
      "url": "https://example.com/ir",
      "title": "IR情報｜株式会社〇〇",
      "page_type": "ir",
      "confidence": "high"
    }
  ]
}
```

---

## 9. データ構造

### 9.1 ChromaDBコレクション

```
コレクション名: company_info__{provider}__{model}
例: company_info__openai__text-embedding-3-small
```

### 9.2 メタデータ

```json
{
  "company_id": "uuid",
  "company_name": "株式会社〇〇",
  "source_url": "https://...",
  "chunk_type": "full_text",
  "content_type": "recruitment_homepage",
  "content_channel": "recruitment",
  "chunk_index": 0,
  "heading_path": "採用情報 > 募集要項",
  "embedding_provider": "openai",
  "embedding_model": "text-embedding-3-small",
  "fetched_at": "2024-01-15T10:00:00Z"
}
```

### 9.3 BM25インデックス

```
保存先: backend/data/bm25/{company_id}.pkl
形式: pickle（bm25sライブラリ形式）
更新: RAGデータ変更時に自動更新
```

---

## 10. コンテキストフォーマット

ES添削プロンプトに注入される形式：

```
【締切情報】（採用ホームページ）[S1]
エントリーシート提出期限：2024年3月31日

【企業情報】（企業HP）[S2]
当社は〇〇業界でトップシェアを誇り...

【募集区分】（採用ホームページ）[S1]
総合職、技術職
```

**ラベル一覧**:
| chunk_type | ラベル |
|------------|--------|
| deadline | 締切情報 |
| recruitment_type | 募集区分 |
| required_documents | 提出物 |
| application_method | 応募方法 |
| selection_process | 選考プロセス |
| full_text | 企業情報 |
| general | 企業情報 |

### 10.1 ソース追跡システム

RAG検索結果の出典を追跡し、ユーザーに提示。

**ソース識別子**:
```
S1, S2, S3, S4, S5（最大5件）
```

**sources配列の構造**:
```json
{
  "sources": [
    {
      "source_id": "S1",
      "source_url": "https://example.com/recruit",
      "content_type": "recruitment_homepage",
      "excerpt": "エントリーシート提出期限は2024年3月31日です。総合職、技術職..."
    },
    {
      "source_id": "S2",
      "source_url": "https://example.com/about",
      "content_type": "corporate_site",
      "excerpt": "当社は1950年創業、〇〇業界でシェア1位を誇る..."
    }
  ]
}
```

**フィールド説明**:
| フィールド | 説明 | 制限 |
|-----------|------|------|
| `source_id` | ソース識別子（S1〜S5） | 最大5件 |
| `source_url` | 元ページのURL | 重複除去済み |
| `content_type` | コンテンツ分類 | 9種類から1つ |
| `excerpt` | 抜粋テキスト | 最大150文字 |

**URL重複除去**:
複数チャンクが同一URLから取得された場合、1つのソースIDにまとめる：

```
検索結果:
- chunk1 (url: https://a.com/recruit)  → S1
- chunk2 (url: https://a.com/recruit)  → S1（重複、IDを共有）
- chunk3 (url: https://a.com/about)    → S2
- chunk4 (url: https://b.com/ir)       → S3
```

**参照実装**: `backend/app/utils/hybrid_search.py` - `format_context_with_sources()`

---

## 11. 動的コンテキスト長

ES添削時、ESの文字数に応じてコンテキスト長を動的に調整。

| ESコンテンツ長 | コンテキスト上限 | 説明 |
|--------------|----------------|------|
| < 500文字 | 1500トークン | 短いESには簡潔なコンテキスト |
| 500〜1000文字 | 2500トークン | 中程度 |
| >= 1000文字 | 3000トークン | 長いESには詳細なコンテキスト |

**参照実装**: `backend/app/utils/hybrid_search.py` - `get_dynamic_context_length()`

---

## 12. キャッシュ戦略

RAG検索結果のキャッシュによりレイテンシとコストを削減。

### 12.1 キャッシュ構成

| 項目 | 内容 |
|------|------|
| バックエンド | Redis（オプション、未設定時はスキップ） |
| キャッシュキー | `company_id + content_hash + context_length` |
| TTL | 設定可能（デフォルト: 1時間） |

### 12.2 キャッシュ対象

- 拡張コンテキスト生成結果（HyDE、MMR、リランキング適用後）
- ソース追跡情報

### 12.3 キャッシュ無効化

- RAGデータ更新時（`/rag/build`、`/rag/crawl-corporate`）
- RAGデータ削除時

**参照実装**: `backend/app/utils/vector_store.py` - `get_rag_cache()`, `cache.invalidate_company()`

---

## 13. トリガー条件

RAG構築は以下のタイミングで自動実行される：

1. **AI選考スケジュール取得 成功時**（完全成功・部分成功）
   - 抽出データ + フルテキストを保存
   - 非同期・ノンブロッキング
   - Next.js API (`fetch-info/route.ts`) から自動トリガー

2. **コーポレートページクロール実行時**
   - IR・事業紹介ページを追加保存

### 13.1 構造化データとフルテキストの二重保存

RAG構築時、以下の2種類のデータが保存される：

| データ種別 | chunk_type | 内容 |
|-----------|-----------|------|
| **構造化データ** | deadline, recruitment_type, required_documents等 | 抽出された項目を個別チャンクとして保存 |
| **フルテキスト** | full_text | 元のHTMLから抽出したテキスト全体をチャンキングして保存 |

これにより、特定の情報（締切等）の精密検索と、文脈を含む広範な検索の両方が可能。

---

## 14. コンテンツ自動分類

`content_type`が指定されない場合、自動分類器がURLとコンテンツから推定。

### 14.1 二段階分類システム

```
コンテンツ入力
    ↓
┌───────────────────────────────┐
│ ① ルールベース分類（高速）     │
│   - URLパターンマッチング      │
│   - テキストキーワードマッチング │
└───────────────────────────────┘
    ↓ （分類不能の場合）
┌───────────────────────────────┐
│ ② LLMフォールバック（高精度）  │
│   - コンテンツ内容をLLM分析    │
│   - JSON Schema検証           │
└───────────────────────────────┘
    ↓
分類結果（content_type）
```

### 14.2 URLパターンマッチング

| パターン | 分類結果 | 優先度 |
|---------|---------|-------|
| `/shinsotsu`, `/newgrad`, `/graduate`, `/entry`, `/recruit/new` | new_grad_recruitment | 高 |
| `/career`, `/midcareer`, `/experienced`, `/tenshoku`, `/recruit/career` | midcareer_recruitment | 高 |
| `/ir`, `/investor`, `/kabunushi` | ir_materials | 高 |
| `/csr`, `/sustainability`, `/esg` | csr_sustainability | 高 |
| `/press`, `/news/release` | press_release | 中 |
| `/about`, `/company`, `/corporate` | corporate_site | 中 |
| `/ceo`, `/president`, `/message` | ceo_message | 低 |
| `/interview`, `/people`, `/staff` | employee_interviews | 低 |

### 14.3 テキストキーワードマッチング

ルールベース分類で使用する日本語キーワード（コンテンツ内での出現をチェック）：

| 分類結果 | キーワード例 |
|---------|------------|
| new_grad_recruitment | 新卒採用, 25卒, 26卒, 27卒, エントリー, 卒業予定, 選考フロー |
| midcareer_recruitment | 中途採用, キャリア採用, 経験者採用, 転職, 即戦力 |
| ceo_message | 社長メッセージ, 代表挨拶, CEOメッセージ, トップメッセージ |
| employee_interviews | 社員インタビュー, 先輩社員, 社員紹介, 働く人 |
| midterm_plan | 中期経営計画, 中計, 経営方針, 事業戦略 |
| ir_materials | 有価証券報告書, 決算短信, 決算説明, 統合報告書 |

### 14.4 LLMフォールバック分類

ルールベースで分類できない場合、LLMを使用：

**設定**:
| パラメータ | 値 | 説明 |
|-----------|-----|------|
| model | Claude優先（`rag_classify`） | OpenAIはフォールバック |
| temperature | 0.1 | 確定的な出力 |
| max_tokens | 100 | 最大出力トークン数 |
| max_retries | 2 | リトライ回数 |

**プロンプト**:
```
以下のコンテンツを適切なカテゴリに分類してください:

{content_excerpt}

カテゴリ一覧:
- new_grad_recruitment: 新卒採用ホームページ
- midcareer_recruitment: 中途採用ホームページ
- corporate_site: 企業HP
- ir_materials: IR資料
- ceo_message: 社長メッセージ
- employee_interviews: 社員インタビュー
- press_release: プレスリリース
- csr_sustainability: CSR/サステナビリティ
- midterm_plan: 中期経営計画

JSON形式で出力: {"content_type": "..."}
```

**参照実装**: `backend/app/utils/content_classifier.py`

---

## 15. 関連ファイル

| ファイル | 役割 |
|---------|------|
| `backend/app/utils/vector_store.py` | ChromaDB操作、RAG構築・検索 |
| `backend/app/utils/hybrid_search.py` | ハイブリッド検索、RRF融合、クエリ拡張、HyDE、リランキング |
| `backend/app/utils/bm25_store.py` | BM25インデックス管理 |
| `backend/app/utils/embeddings.py` | Embedding生成（OpenAI/Local） |
| `backend/app/utils/text_chunker.py` | 日本語テキストチャンキング |
| `backend/app/utils/japanese_tokenizer.py` | 日本語トークナイズ（MeCab/フォールバック） |
| `backend/app/utils/content_classifier.py` | コンテンツ自動分類（ルールベース + LLM） |
| `backend/app/utils/content_types.py` | コンテンツタイプ定義・変換 |
| `backend/app/utils/llm.py` | LLM呼び出しユーティリティ |
| `backend/app/routers/company_info.py` | RAG関連APIエンドポイント |
| `backend/app/routers/es_review.py` | ES添削でのRAG活用 |

---

## 16. RAG用LLMモデル設定

RAGパイプライン内の各機能で使用するLLMモデル設定。**既定はClaude（Anthropic）優先**。

### 16.1 環境変数（OpenAIはフォールバック用途）

| 環境変数 | 用途 | 推奨モデル | 備考 |
|---------|------|-----------|------|
| `OPENAI_RAG_QUERY_MODEL` | クエリ拡張 | gpt-5-mini | Claude未使用時のフォールバック |
| `OPENAI_RAG_RERANK_MODEL` | リランキング | gpt-5-mini | Claude未使用時のフォールバック |
| `OPENAI_RAG_CLASSIFY_MODEL` | コンテンツ分類 | gpt-5-mini | Claude未使用時のフォールバック |

### 16.2 各機能のLLM要件

| 機能 | 入力サイズ | 出力サイズ | 精度要件 | 既定 |
|-----|-----------|-----------|---------|------|
| クエリ拡張 | 小（クエリのみ） | 小（3クエリ） | 中 | Claude Sonnet |
| リランキング | 中（20候補） | 中（20スコア） | 高 | Claude Sonnet |
| コンテンツ分類 | 小（抜粋） | 小（1分類） | 中 | Claude Sonnet |

### 16.3 フォールバック機構

```
Claude (既定)
    ↓ （APIキー未設定/エラー時）
OpenAI
    ↓ （billing / rate_limit など）
Claude に再フォールバック（可能な場合）
    ↓
エラー返却
```

**参照実装**: `backend/app/utils/llm.py` - `call_llm_with_error()`

### 16.4 コスト最適化

RAG機能は高頻度で呼び出されるため、コスト最適化が重要：

| 最適化項目 | 実装 |
|-----------|------|
| max_tokens制限 | 各機能で最小限に設定 |
| HyDE条件実行 | クエリ長が短い場合（< 600文字）のみ実行 |
| クエリ拡張条件 | クエリ長が長い場合（> 1200文字）はスキップ |
| リランキング条件 | 品質スコア < 0.7 の場合のみ実行 |
| Multi-Query上限 | 最大3クエリ、総数は4件以内 |
| キャッシュ | コンテキスト生成結果をキャッシュ |

---

## 17. 精度検証（ハイブリッド検索の評価）

ハイブリッド検索パイプラインの精度を、既存ログから評価する。

### 17.1 入力データ（JSONL）

1行1サンプル。`gold_chunk_ids` か `gold_sources` のどちらかを必須とする。

```json
{"company_id":"uuid","query":"ES本文...","gold_chunk_ids":["..."],"gold_sources":["https://..."],"baseline_topk":[{"id":"...","source_url":"https://..."}]}
```

### 17.2 評価スクリプト

```
python backend/scripts/rag_eval.py --input data/rag_eval.jsonl --top-k 5 --output data/rag_eval_out.jsonl
```

**オプション**
- `--no-expand` / `--no-hyde` / `--no-rerank` / `--no-mmr`
- `--no-bm25`: BM25をスキップ（Denseのみ）
- `--limit 50`（サンプル数制限）
- `--sleep 0.5`（レート制限回避）

### 17.3 指標

- Precision@k / Recall@k（IDs & Sources）
- ベースライン比較がある場合は差分を表示
