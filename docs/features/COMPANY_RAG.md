# 企業RAGシステム

ES添削時に、ユーザーが選択して保存した企業ソースだけを使う RAG（Retrieval-Augmented Generation）システム。添削セッション中に URL を自動取得してコーパスを補強したりインデックスを更新したりはしない。保存戦略は **新規 URL は追加、同じ URL の再取得はその URL の既存チャンクだけを安全に置換** である。

**参照実装**: `backend/app/utils/vector_store.py`, `backend/app/utils/hybrid_search.py`

---

## 1. 概要

| 項目 | 内容 |
|------|------|
| **目的** | ES添削時に企業情報を参照し、「企業接続」軸の評価を可能にする |
| **ベクトルDB** | ChromaDB（永続化） |
| **キーワード検索** | BM25（bm25sライブラリ） |
| **検索方式** | ハイブリッド検索（Dense 60% + Sparse 40% ※デフォルト）+ 強化パイプライン |

### 料金と上限

| 項目 | Free | Standard | Pro |
|------|------|----------|-----|
| 月次無料枠（URL/HTML ページ） | 10 | 100 | 300 |
| 月次無料枠（PDF ページ） | 40 | 200 | 600 |
| 1社あたり保存上限 | 3 source | 100 source | 500 source |
| PDF 1ファイルあたり取込ページ上限（超過は先頭から切り詰め） | 20 | 60 | 120 |
| PDF Google OCR 最大ページ | 5 | 30 | 60 |
| PDF Mistral OCR 最大ページ | 0 | 10 | 20 |

- URL 取込の月次カウントは **クロールした HTML ページ数**。無料超過分は **1ページ = 1クレジット**。
- PDF は **無料 PDF 枠内なら 0 クレジット**。超過時だけ **1-20p=2 / 21-60p=6 / 61-120p=12 credits** を課金する。課金・月次カウントに使うページ数は **実際に取り込んだページ数**。
- PDF 本文は **ページ単位で** `local / Google OCR / Mistral OCR` を混在させる。OCR provider は **Google Document AI** が既定で、`ir_materials` / `midterm_plan` の難ページだけ **Mistral OCR** に昇格する。
- `company_info_monthly_usage` は URL/HTML と PDF の無料枠消化を別カラムで持つ。旧 `rag_ingest_units` は後方互換の合算カウンタ。
- `crawl-corporate` は source ごとに `html / pdf / unsupported binary` を分岐し、PDF URL も手動 upload と同じ ingest policy に統一する。

### ES添削での活用

- **「企業接続」軸のスコアリング**: 企業の求める人材像とESの内容の一致度を評価
- **企業キーワードの抽出**: 企業固有のキーワードをES添削フィードバックに反映
- **職種依存クエリの補強**: `設問 + 企業名 + primary role + 元回答要点` を検索語に使い、role-sensitive な設問で職種向けページを優先する
- **grounding mode 判定**: 職種向け根拠が弱い場合は `company_general` に降格し、企業固有の職種断定を抑える
- **user-selected source only**: 企業RAG はユーザーが選択して保存した公開ソースだけで構成する
- **family-aligned retrieval boost**: `user_provided_corporate_urls` は同一家族の retrieval を強める補助入力として扱い、本文へ直前 prepend しない
- **NotebookLM-like grounding**: 添削では保存済みソースを軸に grounding し、企業根拠の追加は明示的なソース選択に限定する
- **インターン設問の優先 family**: `intern_reason` / `intern_goals` では intern 文脈を retrieval query に含めつつ、family 優先で募集ページや社員インタビューを取りに行く
- **employee_interviews の候補制御**: official root 採用トップは社員インタビュー候補に入れない
- **same-company 検証**: ES 添削に使う根拠は official domain として検証できた source だけを採用する
- **短社名ガード**: `Sky` のような短社名は dotted domain 明示登録を優先し、foreign domain や shared token domain を同一企業根拠として使わない
- **二次情報の扱い**: 高信頼な二次情報は検索語補助には使うが、出典表示や本文根拠には使わない
- **coverage-driven 補強**: 既存 coverage が薄い content type を優先し、broad role では `事業理解 / 成長機会 / 価値観 / 将来接続` の theme を増やす

### tenant 分離の現状

- 企業RAGの保存・検索・削除は、実体ストア側では主に `company_id` を境界にしている
- Next API では `companies` の owner を確認してから FastAPI を呼ぶため、通常運用で他ユーザーの RAG が混ざる前提ではない
- ただし ChromaDB / BM25 自体は `userId` / `guestId` / `tenant_key` を持たず、分離保証は `company_id` の一意性と Next API の owner check に依存している
- 詳細は `docs/architecture/TENANT_ISOLATION_AUDIT.md` を参照

### ES添削で優先する content type

role-sensitive / intern-sensitive な設問では、次の順を優先する。

1. `new_grad_recruitment`
2. `employee_interviews`
3. `corporate_site`

補助として使うもの:

- `midterm_plan`
- `press_release`
- `ir_materials`

root の採用トップや generic page しか取れていない場合は、`grounding_mode=company_general` に留める。

### employee_interviews 候補ルール

`employee_interviews` の補強候補は、公式ドメインであっても次を満たさないと採らない。

- root path ではない
- URL / title / snippet のいずれかに `interview`, `voice`, `people`, `member`, `staff`, `先輩社員`, `社員の声`, `働く人` の強い signal がある
- `Investors`, `IR`, `統合報告`, `会社概要`, `企業データ` などの signal があるページは採らない

したがって、`career-mc.com/` のような generic root 採用トップは `employee_interviews` 候補から除外する。

### same-company coverage ルール

- `evidence_coverage_level` は件数ベースではなく、same-company 検証済み evidence card だけで判定する
- `employee_interviews` から弾かれた official page でも、`ir_materials` や `midterm_plan` として検証済みなら company evidence に使える
- company mismatch source が混ざった場合は rewrite 前に安全弁を適用する
  - safe evidence が残る: `effective_grounding_level=light` かつ `effective_company_grounding_policy=assistive`
  - safe evidence が残らない: `effective_grounding_mode=none`
- evidence card は prompt へそのまま生転写せず、`value_orientation / business_characteristics / work_environment / role_expectation` に正規化して使う

---

## 2. アーキテクチャ

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
│  semantic: 0.6, keyword: 0.4（デフォルト） │
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
| EXPANSION_MIN_QUERY_CHARS | 5 | これ未満はクエリ拡張スキップ |
| SHORT_QUERY_THRESHOLD | 10 | 5-10文字は軽量拡張テンプレート使用 |
| max_query_chars | 1200 | これ以上はクエリ拡張スキップ |
| model | Claude優先 | OpenAIはフォールバック |

**参照実装**: `hybrid_search.py` - `expand_queries_with_llm()`

### 3.2.1 クエリ拡張キャッシュ

同一クエリのLLM呼び出しを削減するインメモリキャッシュ。

| パラメータ | 値 | 説明 |
|-----------|-----|------|
| TTL | 7日 | キャッシュの有効期限 |
| 最大エントリ数 | 500 | 超過時は古い半分を削除 |
| キー生成 | SHA-256ハッシュ | クエリを正規化（小文字化・trim）後にハッシュ |

**効果**: LLMコスト -20〜30%、レイテンシ改善

**参照実装**: `hybrid_search.py` - `_get_cached_expansion()`, `_set_cached_expansion()`

### 3.3 HyDE（仮想文書生成）

短いクエリに対して、検索に有効な仮想文書を生成してリコールを改善。

| パラメータ | 値 | 説明 |
|-----------|-----|------|
| max_chars | 600 | クエリ長がこれ以下なら使用 |
| output_length | 300-500文字 | 生成する仮想文書の長さ |

**プロンプト最適化**: 日本企業の採用ページスタイルで仮想文書を生成。学生向けの視点で、実際の企業HPと同様のトーンを使用。

**参照実装**: `hybrid_search.py` - `generate_hypothetical_document()`

### 3.4 Reciprocal Rank Fusion (RRF)

複数クエリの検索結果を順位ベースで融合。

```
RRFスコア = Σ(1 / (k + rank + 1))
- k = adaptive_rrf_k(num_queries) = 30 + (num_queries × 10)
- 例: 2クエリ → k=50、4クエリ → k=70
```

**参照実装**: hybrid_search.py - adaptive_rrf_k()

### 3.5 MMR（多様性の確保）

関連性と多様性をバランス。

```
score = λ * sim(query, doc) - (1 - λ) * max(sim(doc, selected))
- λ = 0.5
```

### 3.6 リランキング

#### クロスエンコーダーリランク（デフォルト）

クロスエンコーダーモデルで query-document ペアを直接スコアリング。

| パラメータ | 値 | 説明 |
|-----------|-----|------|
| モデル | `cross-encoder/mmarco-mMiniLMv2-L12-H384-v1` | 多言語対応（日本語ネイティブサポート） |
| max_candidates | 20 | リランキング対象の最大数 |
| テキスト切り詰め | 512文字 | OOM防止 |

**参照実装**: `backend/app/utils/reranker.py` - `CrossEncoderReranker`

#### リランク実行判定

スコア分散ベースの3段階判定:

| 条件 | 動作 | 理由 |
|------|------|------|
| top-3平均 ≥ 0.7 | スキップ | 高信頼度の結果 |
| top-3平均 < 0.3 | スキップ | 低品質データではリランク効果薄 |
| 中間帯（0.3-0.7） | 分散 ≥ 0.02 でリランク実行 | 不確実性が高い場合のみ |

**参照実装**: `hybrid_search.py` - `_should_rerank()`

#### LLMリランキング（フォールバック）

クロスエンコーダーが利用不可の場合、LLMで関連度スコアリング。

| パラメータ | 値 | 説明 |
|-----------|-----|------|
| model | Claude優先 | OpenAIはフォールバック |

### 3.7 BM25キーワード検索

日本語に最適化したキーワードベースの検索。

| 設定 | 値 |
|------|-----|
| ライブラリ | bm25s（Pure Python） |
| 永続化 | `backend/data/bm25/{company_id}.json` |
| トークナイザー | MeCab (fugashi) + UniDic |

**インデックス更新**: `schedule_bm25_update()` でバックグラウンド非同期更新（レイテンシ -500〜1000ms）

**参照実装**: `backend/app/utils/bm25_store.py`

### 3.8 ハイブリッド融合

```python
hybrid_score = semantic_norm * 0.6 + keyword_norm * 0.4

# スコア正規化: 各検索結果内で0-1に正規化
# 重複除去: (source_url, chunk_index, content_type) でユニーク化
```

### 3.9 チューニング設定（環境変数）

主要なパラメータは `.env` で上書き可能です（デフォルト値は `.env.example` を参照）。

- `RAG_SEMANTIC_WEIGHT` / `RAG_KEYWORD_WEIGHT`
- `RAG_RERANK_THRESHOLD`
- `RAG_USE_QUERY_EXPANSION` / `RAG_USE_HYDE` / `RAG_USE_MMR` / `RAG_USE_RERANK`
- `RAG_MMR_LAMBDA`
- `RAG_FETCH_K`
- `RAG_MAX_QUERIES` / `RAG_MAX_TOTAL_QUERIES`
- `RAG_CONTEXT_*` / `RAG_MIN_CONTEXT_CHARS`

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

※ コンテンツタイプの詳細は `docs/features/COMPANY_INFO_FETCH.md` を参照

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

## ES添削向けの role-aware 補強

ES添削では、`role_course_reason` など required-centered な設問で first pass retrieval 後も `grounding_mode=company_general` の場合、retrieval 結果を増やすよりも validator の `grounding` 判定と focused retry の `grounding_focus` で本文を修正する。

- query: `company_name + role_name + section_title`
- 優先 content type:
  - `new_grad_recruitment`
  - `employee_interviews`
  - `corporate_site`
- `short_circuit=False`

2nd pass で source が増えれば、ES添削側で grounding を再評価する。
それでも職種根拠が弱い場合は `company_general` のまま返し、企業固有の強い断定は prompt で抑制する。

Next.js 側の `fetch-corporate` は `contentChannel: "corporate_general"` を送る。
`ir_materials` / `midterm_plan` だけ `corporate_ir` を使い、旧 `contentChannel: "url"` は使わない。
backend 非 2xx の場合は `status`, `body`, `contentType`, `contentChannel`, `urls` をログへ残し、`crawl-corporate` の 400 を追えるようにする。

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

RAG検索時、クエリ意図に応じて各コンテンツタイプに異なるブースト係数が適用される。

### 4つのブーストプロファイル

`select_boost_profile(query)` でクエリ内のキーワードに基づき自動選択。

| プロファイル | トリガーキーワード例 | 最優先タイプ |
|------------|---------------------|-------------|
| **es_review**（デフォルト） | — | new_grad_recruitment (1.5x) |
| **deadline** | 締切、期限、スケジュール、選考日程 | new_grad_recruitment (1.8x), press_release (1.2x) |
| **culture** | 社風、雰囲気、働き方、人物像、カルチャー | employee_interviews (1.6x), ceo_message (1.4x) |
| **business** | 事業、戦略、売上、成長、市場、中期経営 | midterm_plan (1.5x), ir_materials (1.4x) |

**参照実装**: `hybrid_search.py` - `CONTENT_TYPE_BOOSTS`, `select_boost_profile()`

---

## 11. APIエンドポイント一覧

### RAG構築

| エンドポイント | 説明 |
|---------------|------|
| `POST /company-info/rag/crawl-corporate` | ユーザーが選択したコーポレートページをクロールしてRAG保存 |
| `POST /company-info/rag/upload-pdf` | 手動 upload PDF を取り込んで RAG 保存 |

### preflight / estimate

- Next API は実行前に estimate route を持つ。
- URL は `src/app/api/companies/[id]/fetch-corporate/estimate/route.ts`。
- PDF は `src/app/api/companies/[id]/fetch-corporate-upload/estimate/route.ts`。
- URL 見積では `estimatedFreeHtmlPages`, `estimatedFreePdfPages`, `estimatedCredits`, `remainingHtmlFreeUnits`, `remainingPdfFreeUnits`, `requiresConfirmation` に加えて backend 由来の `estimated_google_ocr_pages`, `estimated_mistral_ocr_pages`, `will_truncate` などを返す。
- PDF 見積では `estimated_free_pdf_pages`, `estimated_credits`, `estimated_google_ocr_pages`, `estimated_mistral_ocr_pages`, `will_truncate`, `requires_confirmation` などを返す。

### URL単位の保存ルール

- URL A, B を保存済みの状態で URL C を追加しても、A, B は残る
- URL A を再取得したときは、**URL A に紐づく既存チャンクだけ** を新しい取得結果で置き換える
- 同じ URL の再取得結果で `content_type` が変わった場合は、URL A の旧分類チャンクを消し、新分類へ移す
- 再取得が失敗した場合は旧データを残す。失敗で既存RAGが空になることは避ける

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
| ingest_session_id | 同一URLの再取得を識別する保存セッションID |
| chunk_type | full_text / deadline / recruitment_type 等 |
| content_type | new_grad_recruitment / corporate_site 等 |
| chunk_index | チャンク番号 |
| heading_path | 見出しパス |
| fetched_at | 取得日時 |

### PDF routing summary

PDF 取り込みでは debug / telemetry 用に `page_routing_summary` を持つ。主な項目は次のとおり。

- `total_pages`
- `ingest_pages`
- `local_pages`
- `google_ocr_pages`
- `mistral_ocr_pages`
- `truncated_pages`
- `planned_route`
- `actual_route`

通常 UI では source 単位の route 詳細を常時表示しない。開発ログ、estimate payload、debug 情報で追う。

---

## 13. LLMモデル設定

RAG パイプラインで **LLM を使う**のは主にクエリ拡張・HyDE・取り込み時のコンテンツ分類。**候補の並べ替えは cross-encoder**（`reranker.py`）であり、LLM の `rag_rerank` 経路は廃止済み。

| 機能 | 既定モデル | 環境変数 |
|-----|-----------|----------|
| クエリ拡張 | GPT-5.4 mini (`gpt-fast`) | `MODEL_RAG_QUERY_EXPANSION` |
| HyDE | GPT-5.4 mini (`gpt-fast`) | `MODEL_RAG_HYDE` |
| コンテンツ分類 | GPT-5.4 nano (`gpt-nano`) | `MODEL_RAG_CLASSIFY` |
| 再ランキング | （LLM 不使用） | —（`sentence-transformers` CrossEncoder） |

RAG 周辺の LLM で **nano を既定にしているのはコンテンツ分類のみ**（クエリ拡張・HyDE は mini）。

### コスト最適化

| 最適化項目 | 実装 |
|-----------|------|
| HyDE | クエリ < 600文字の場合のみ |
| クエリ拡張 | クエリ > 1200文字ならスキップ、5文字未満はスキップ |
| クエリ拡張キャッシュ | ハッシュベース完全一致、TTL 7日、コスト -20〜30% |
| リランキング | スコア分散ベースの3段階判定 |
| Multi-Query | 最大3クエリ、総数4件以内 |
| BM25更新 | バックグラウンド非同期（schedule_bm25_update） |

---

## 14. トリガー条件

RAG構築は、ユーザーが公開ソースを選択して保存したタイミングで実行する。

1. **コーポレートページクロール実行時**
   - ユーザーが選択した公開ページを保存する
   - 非同期・ノンブロッキング

### 構造化データとフルテキストの二重保存

| データ種別 | chunk_type | 内容 |
|-----------|-----------|------|
| 構造化データ | deadline, recruitment_type 等 | 抽出された項目を個別チャンク |
| フルテキスト | full_text | 元テキスト全体をチャンキング |

---

## 14.1 セカンダリタイプ検索の最適化

コンテンツタイプフィルタ検索は、1回のワイドクエリ（`n_results × 3`）で取得後、Python側でprimary/secondaryに振り分ける方式に最適化済み。

**参照実装**: `vector_store.py` - `search_company_context_by_type()`

---

## 15. 関連ファイル

| ファイル | 役割 |
|---------|------|
| `backend/app/utils/vector_store.py` | ChromaDB操作、RAG保存・検索 |
| `backend/app/utils/hybrid_search.py` | ハイブリッド検索、RRF、クエリ拡張、HyDE、リランキング |
| `backend/app/utils/bm25_store.py` | BM25インデックス管理 |
| `backend/app/utils/embeddings.py` | Embedding生成 |
| `backend/app/utils/text_chunker.py` | テキストチャンキング |
| `backend/app/utils/japanese_tokenizer.py` | 日本語トークナイズ |
| `backend/app/utils/llm.py` | LLM呼び出しユーティリティ |
| `backend/app/routers/company_info.py` | RAG関連APIエンドポイント |
| `backend/app/routers/es_review.py` | ES添削でのRAG活用 |

**企業情報取得**: `docs/features/COMPANY_INFO_FETCH.md` を参照

---

## 16. 品質拡張と受け入れ条件

### 参考資料反映

対象資料: `/Users/saoki/work/references/gakuchika_QA_guide.md`

- 検索意図に応じた RAG 取得最適化:
  `backend/app/utils/hybrid_search.py`, `backend/app/utils/vector_store.py` で意図とクエリ長に応じた adaptive retrieval を導入し、weight, fetch_k, query 数, rerank 閾値, HyDE の有効化を切り替える
- 出典抜粋の可読性改善:
  `backend/app/utils/hybrid_search.py` で見出し付与と文境界トリムを行う excerpt 整形を導入

### 受け入れチェック
- 長文クエリ、短文クエリ、事実照会クエリで retrieval profile が変化する
- `sources.excerpt` に見出しが付与され、極端な文途中切断が減る
- 既存の RAG 取得が空になる退行がない

### 実施済み静的検証
- `python -m compileall`（関連 backend ファイル）: 成功
- `pnpm -s tsc --noEmit`: 成功
