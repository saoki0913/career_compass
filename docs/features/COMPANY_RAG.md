# 企業RAGシステム

ES添削時に、ユーザーが選択して保存した企業ソースだけを使う RAG（Retrieval-Augmented Generation）システム。添削セッション中に URL を自動取得してコーパスを補強したりインデックスを更新したりはしない。保存戦略は **新規 URL は追加、同じ URL の再取得はその URL の既存チャンクだけを安全に置換** である。

---

## 入口

| 項目 | 内容 |
|------|------|
| **実装** | `backend/app/utils/vector_store.py`, `backend/app/utils/hybrid_search.py` |
| **API** | `backend/app/routers/company_info.py` |
| **ベクトルDB** | ChromaDB（永続化） |
| **キーワード検索** | BM25（bm25sライブラリ） |
| **検索方式** | ハイブリッド検索（Dense 60% + Sparse 40%）+ 強化パイプライン |

---

## 仕様

### 1. 目的と活用

ES添削時に企業情報を参照し、「企業接続」軸の評価を可能にする。

- **「企業接続」軸のスコアリング**: 企業の求める人材像とESの内容の一致度を評価
- **企業キーワードの抽出**: 企業固有のキーワードをES添削フィードバックに反映
- **職種依存クエリの補強**: `設問 + 企業名 + primary role + 元回答要点` を検索語に使い、role-sensitive な設問で職種向けページを優先する
- **grounding mode 判定**: 職種向け根拠が弱い場合は `company_general` に降格し、企業固有の職種断定を抑える
- **user-selected source only**: 企業RAG はユーザーが選択して保存した公開ソースだけで構成する
- **family-aligned retrieval boost**: `user_provided_corporate_urls` は同一家族の retrieval を強める補助入力として扱い、本文へ直前 prepend しない
- **NotebookLM-like grounding**: 添削では保存済みソースを軸に grounding し、企業根拠の追加は明示的なソース選択に限定する
- **インターン設問の優先 family**: `intern_reason` / `intern_goals` では intern 文脈を retrieval query に含めつつ、family 優先で募集ページや社員インタビューを取りに行く
- **same-company 検証**: ES 添削に使う根拠は official domain として検証できた source だけを採用する
- **短社名ガード**: `Sky` のような短社名は dotted domain 明示登録を優先し、foreign domain や shared token domain を同一企業根拠として使わない
- **二次情報の扱い**: 高信頼な二次情報は検索語補助には使うが、出典表示や本文根拠には使わない
- **coverage-driven 補強**: 既存 coverage が薄い content type を優先し、broad role では `事業理解 / 成長機会 / 価値観 / 将来接続` の theme を増やす

### 2. 料金と上限

料金・上限の詳細は [CREDITS.md](./CREDITS.md) §2.2, §5 を参照。

- URL 取込の月次カウントは **クロールした HTML ページ数**。無料超過分は **1ページ = 1クレジット**。
- PDF は **無料 PDF 枠内なら 0 クレジット**。超過時だけ **1-20p=2 / 21-60p=6 / 61-120p=12 credits** を課金する。課金・月次カウントに使うページ数は **実際に取り込んだページ数**。
- PDF 本文は **ページ単位で** `local / Google OCR / Mistral OCR` を混在させる。OCR provider は **Google Document AI** が既定で、`ir_materials` / `midterm_plan` の難ページだけ **Mistral OCR** に昇格する。
- `crawl-corporate` は source ごとに `html / pdf / unsupported binary` を分岐し、PDF URL も手動 upload と同じ ingest policy に統一する。

### 3. テナント分離

企業RAGの保存・検索・削除は、実体ストア側では主に `company_id` を境界にしている。Next API では `companies` の owner を確認してから FastAPI を呼ぶため、通常運用で他ユーザーの RAG が混ざる前提ではない。ただし ChromaDB / BM25 自体は `userId` / `guestId` / `tenant_key` を持たず、分離保証は `company_id` の一意性と Next API の owner check に依存している。

詳細は [docs/architecture/TENANT_ISOLATION_AUDIT.md](../architecture/TENANT_ISOLATION_AUDIT.md) を参照。

### 4. コンテンツタイプ優先順位

role-sensitive / intern-sensitive な設問では、次の順を優先する。

| 優先度 | コンテンツタイプ | チャンクサイズ | 用途 |
|-------|----------------|--------------|------|
| 1 | new_grad_recruitment | 300文字 | 新卒採用情報（最優先） |
| 2 | employee_interviews | 400文字 | 社員インタビュー |
| 3 | corporate_site | 500文字 | コーポレートサイト |
| 補助 | midterm_plan | 800文字 | 中期経営計画 |
| 補助 | ir_materials | 700文字 | IR資料 |
| 補助 | press_release | — | プレスリリース |

※ コンテンツタイプの詳細は [COMPANY_INFO_FETCH.md](./COMPANY_INFO_FETCH.md) を参照

### 5. employee_interviews 候補ルール

`employee_interviews` の補強候補は、公式ドメインであっても次を満たさないと採らない。

| 条件 | 詳細 |
|------|------|
| **path** | root path ではない |
| **signal** | URL / title / snippet のいずれかに `interview`, `voice`, `people`, `member`, `staff`, `先輩社員`, `社員の声`, `働く人` の強い signal がある |
| **除外 signal** | `Investors`, `IR`, `統合報告`, `会社概要`, `企業データ` などの signal があるページは採らない |

したがって、`career-mc.com/` のような generic root 採用トップは `employee_interviews` 候補から除外する。

### 6. same-company coverage ルール

- `evidence_coverage_level` は件数ベースではなく、same-company 検証済み evidence card だけで判定する
- `employee_interviews` から弾かれた official page でも、`ir_materials` や `midterm_plan` として検証済みなら company evidence に使える
- company mismatch source が混ざった場合は rewrite 前に安全弁を適用する
  - safe evidence が残る: `effective_grounding_level=light` かつ `effective_company_grounding_policy=assistive`
  - safe evidence が残らない: `effective_grounding_mode=none`
- evidence card は prompt へそのまま生転写せず、`value_orientation / business_characteristics / work_environment / role_expectation` に正規化して使う

---

## アーキテクチャ

```
┌──────────────────────────────────────────────────┐
│  データ取り込み                                    │
│  (企業情報検索 → ユーザー選択 → Chunking → Embedding → Storage) │
│  ※ docs/features/COMPANY_INFO_FETCH.md 参照      │
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
│  重み付け融合 (semantic 60% + keyword 40%)※デフォルト│
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

## 技術メモ

### 1. 検索パイプライン概要

| 段階 | 技術 | 主要パラメータ | 実装 |
|-----|------|--------------|------|
| クエリ拡張 | Multi-Query（LLM） | max_queries=3, total=4, min_chars=5, max_chars=1200 | `hybrid_search.py::expand_queries_with_llm()` |
| クエリ拡張キャッシュ | ハッシュベース | TTL=7日, max=500エントリ | `hybrid_search.py::_get_cached_expansion()` |
| HyDE | 仮想文書生成（LLM） | max_chars=600, output=300-500文字 | `hybrid_search.py::generate_hypothetical_document()` |
| Dense検索 | ChromaDB | embedding provider=OpenAI/Local | `vector_store.py` |
| Sparse検索 | BM25（MeCab） | tokenizer=UniDic, min_token=2文字 | `bm25_store.py` |
| RRF | 順位ベース融合 | k=30+(num_queries×10) | `hybrid_search.py::adaptive_rrf_k()` |
| MMR | 多様性確保 | λ=0.5 | `hybrid_search.py` |
| ハイブリッド融合 | スコア正規化 | semantic=0.6, keyword=0.4 | `hybrid_search.py` |
| リランク | CrossEncoder | model=mmarco-mMiniLMv2-L12-H384-v1, max_candidates=20 | `reranker.py::CrossEncoderReranker` |

### 2. リランク実行判定

| 条件 | 動作 | 理由 |
|------|------|------|
| top-3平均 ≥ 0.7 | スキップ | 高信頼度の結果 |
| top-3平均 < 0.3 | スキップ | 低品質データではリランク効果薄 |
| 中間帯（0.3-0.7） | 分散 ≥ 0.02 でリランク実行 | 不確実性が高い場合のみ |

実装: `hybrid_search.py::_should_rerank()`

### 3. コンテキストブーストプロファイル

`select_boost_profile(query)` でクエリ内のキーワードに基づき自動選択。

| プロファイル | トリガーキーワード例 | 最優先タイプ |
|------------|---------------------|-------------|
| **es_review**（デフォルト） | — | new_grad_recruitment (1.5x) |
| **deadline** | 締切、期限、スケジュール、選考日程 | new_grad_recruitment (1.8x), press_release (1.2x) |
| **culture** | 社風、雰囲気、働き方、人物像、カルチャー | employee_interviews (1.6x), ceo_message (1.4x) |
| **business** | 事業、戦略、売上、成長、市場、中期経営 | midterm_plan (1.5x), ir_materials (1.4x) |

実装: `hybrid_search.py::CONTENT_TYPE_BOOSTS, select_boost_profile()`

### 4. Embeddingプロバイダー

| プロバイダー | モデル | 次元数 | 用途 |
|------------|-------|-------|------|
| **OpenAI** | text-embedding-3-small | 1536 | 本番環境（推奨） |
| **Local** | paraphrase-multilingual-MiniLM-L12-v2 | 384 | フォールバック |

自動フォールバック: OpenAI → Local（quota/rate limit/API error時）

環境変数: `EMBEDDINGS_PROVIDER`, `OPENAI_EMBEDDING_MODEL`, `EMBEDDING_MAX_INPUT_CHARS`

実装: `backend/app/utils/embeddings.py`

### 5. テキストチャンキング

| パラメータ | 値 | 説明 |
|-----------|-----|------|
| chunk_overlap | 100文字 | 前後チャンクとの重複 |
| min_chunk_size | 50文字 | 最小チャンクサイズ |
| 分割優先順位 | `\n\n` > `\n` > `。` > `！？` > `、` > 強制分割 | 段落・文境界を優先 |

実装: `backend/app/utils/text_chunker.py`

### 6. 日本語トークナイザー（BM25用）

| 設定項目 | 値 |
|---------|-----|
| 形態素解析 | MeCab (fugashi) + UniDic |
| 品詞フィルタ | 名詞, 動詞, 形容詞 |
| 最小トークン長 | 2文字 |
| ストップワード | 52語（助詞、助動詞、指示詞等） |
| フォールバック | 文字ベース分割（日本語）/ 空白ベース分割（英語） |

実装: `backend/app/utils/japanese_tokenizer.py`

### 7. LLMモデル設定

RAG パイプラインで **LLM を使う**のは主にクエリ拡張・HyDE・取り込み時のコンテンツ分類。**候補の並べ替えは cross-encoder**（`reranker.py`）であり、LLM の `rag_rerank` 経路は廃止済み。

| 機能 | 既定モデル | 環境変数 |
|-----|-----------|----------|
| クエリ拡張 | GPT-5.4 mini (`gpt-mini`) | `MODEL_RAG_QUERY_EXPANSION` |
| HyDE | GPT-5.4 mini (`gpt-mini`) | `MODEL_RAG_HYDE` |
| コンテンツ分類 | GPT-5.4 nano (`gpt-nano`) | `MODEL_RAG_CLASSIFY` |
| 再ランキング | （LLM 不使用） | —（`sentence-transformers` CrossEncoder） |

### 8. 動的コンテキスト長

ESの文字数に応じてコンテキスト長を動的に調整。

| ESコンテンツ長 | コンテキスト上限 |
|--------------|----------------|
| < 500文字 | 1500トークン |
| 500〜1000文字 | 2500トークン |
| >= 1000文字 | 3000トークン |

### 9. コンテキストフォーマット

ES添削プロンプトに注入される形式：

```
【締切情報】（採用ホームページ）[S1]
エントリーシート提出期限：2024年3月31日

【企業情報】（企業HP）[S2]
当社は〇〇業界でトップシェアを誇り...
```

- ソース識別子: S1〜S5（最大5件）
- URL重複除去: 同一URLは1つのソースIDにまとめる
- excerpt: 最大150文字

実装: `hybrid_search.py::format_context_with_sources()`

### 10. データ構造

| 項目 | 内容 |
|------|------|
| **ChromaDBコレクション名** | `company_info__{provider}__{model}`<br>例: `company_info__openai__text-embedding-3-small` |
| **BM25永続化** | `backend/data/bm25/{company_id}.json` |
| **主要メタデータ** | `company_id`, `company_name`, `source_url`, `ingest_session_id`, `chunk_type`, `content_type`, `chunk_index`, `heading_path`, `fetched_at` |
| **PDF routing summary** | `total_pages`, `ingest_pages`, `local_pages`, `google_ocr_pages`, `mistral_ocr_pages`, `truncated_pages`, `planned_route`, `actual_route` |

### 11. URL単位の保存ルール

- URL A, B を保存済みの状態で URL C を追加しても、A, B は残る
- URL A を再取得したときは、**URL A に紐づく既存チャンクだけ** を新しい取得結果で置き換える
- 同じ URL の再取得結果で `content_type` が変わった場合は、URL A の旧分類チャンクを消し、新分類へ移す
- 再取得が失敗した場合は旧データを残す。失敗で既存RAGが空になることは避ける

### 12. APIエンドポイント

| エンドポイント | 説明 |
|---------------|------|
| **RAG構築** | |
| `POST /company-info/rag/crawl-corporate` | ユーザーが選択したコーポレートページをクロールしてRAG保存 |
| `POST /company-info/rag/upload-pdf` | 手動 upload PDF を取り込んで RAG 保存 |
| **preflight / estimate** | |
| Next: `POST /api/companies/[id]/fetch-corporate/estimate` | URL 見積: `estimatedFreeHtmlPages`, `estimatedFreePdfPages`, `estimatedCredits`, `estimated_google_ocr_pages`, `estimated_mistral_ocr_pages`, `will_truncate` 等 |
| Next: `POST /api/companies/[id]/fetch-corporate-upload/estimate` | PDF 見積: `estimated_free_pdf_pages`, `estimated_credits`, `estimated_google_ocr_pages`, `estimated_mistral_ocr_pages`, `will_truncate`, `requires_confirmation` 等 |
| **コンテキスト取得** | |
| `POST /company-info/rag/context` | ES添削用のコンテキストを取得 |
| **ステータス・管理** | |
| `GET /company-info/rag/status/{company_id}` | 簡易ステータス |
| `GET /company-info/rag/status-detailed/{company_id}` | 詳細ステータス |
| `DELETE /company-info/rag/{company_id}` | RAGデータ全削除 |
| `DELETE /company-info/rag/{company_id}/{content_type}` | 特定タイプのみ削除 |

### 13. キャッシュ戦略

| 項目 | 内容 |
|------|------|
| バックエンド | Redis（オプション） |
| キャッシュキー | `company_id + content_hash + context_length` |
| 無効化 | RAGデータ更新/削除時 |

実装: `vector_store.py::get_rag_cache()`

### 14. チューニング設定（環境変数）

主要なパラメータは `.env` で上書き可能（デフォルト値は `.env.example` を参照）。

- `RAG_SEMANTIC_WEIGHT` / `RAG_KEYWORD_WEIGHT`
- `RAG_RERANK_THRESHOLD`
- `RAG_USE_QUERY_EXPANSION` / `RAG_USE_HYDE` / `RAG_USE_MMR` / `RAG_USE_RERANK`
- `RAG_MMR_LAMBDA`
- `RAG_FETCH_K`
- `RAG_MAX_QUERIES` / `RAG_MAX_TOTAL_QUERIES`
- `RAG_CONTEXT_*` / `RAG_MIN_CONTEXT_CHARS`

### 15. コスト最適化

| 最適化項目 | 実装 |
|-----------|------|
| HyDE | クエリ < 600文字の場合のみ |
| クエリ拡張 | クエリ > 1200文字ならスキップ、5文字未満はスキップ |
| クエリ拡張キャッシュ | ハッシュベース完全一致、TTL 7日、コスト -20〜30% |
| リランキング | スコア分散ベースの3段階判定 |
| Multi-Query | 最大3クエリ、総数4件以内 |
| BM25更新 | バックグラウンド非同期（schedule_bm25_update） |

---

## 関連ドキュメント

| ドキュメント | 説明 |
|------------|------|
| [COMPANY_INFO_FETCH.md](./COMPANY_INFO_FETCH.md) | 企業情報取得・クロール・PDF取込の詳細 |
| [CREDITS.md](./CREDITS.md) | クレジット料金体系・無料枠・月次上限（§2.2, §5） |
| [TENANT_ISOLATION_AUDIT.md](../architecture/TENANT_ISOLATION_AUDIT.md) | テナント分離の詳細 |

### 関連ファイル

| ファイル | 役割 |
|---------|------|
| `backend/app/utils/vector_store.py` | ChromaDB操作、RAG保存・検索 |
| `backend/app/utils/hybrid_search.py` | ハイブリッド検索、RRF、クエリ拡張、HyDE、リランキング |
| `backend/app/utils/bm25_store.py` | BM25インデックス管理 |
| `backend/app/utils/embeddings.py` | Embedding生成 |
| `backend/app/utils/text_chunker.py` | テキストチャンキング |
| `backend/app/utils/japanese_tokenizer.py` | 日本語トークナイズ |
| `backend/app/utils/reranker.py` | CrossEncoderリランキング |
| `backend/app/utils/llm.py` | LLM呼び出しユーティリティ |
| `backend/app/routers/company_info.py` | RAG関連APIエンドポイント |
| `backend/app/routers/es_review.py` | ES添削でのRAG活用 |
