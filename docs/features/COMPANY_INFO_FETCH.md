# 企業情報取得機能

採用ページから選考情報を抽出する機能と、企業の公開ページや PDF を取り込んで企業 RAG を構築する機能を扱う。選考スケジュール取得と企業 RAG 取り込みは別機能であり、**選考スケジュール取得では RAG を構築しない**。

---

## 1. 概要

| 項目 | 内容 |
|------|------|
| 選考スケジュール取得 | 採用ページ 1 URL から締切・提出物・選考フローを抽出する |
| コーポレート情報取得 | ユーザーが選んだ公開 URL / PDF を取り込み、RAG 用に保存する |
| LLM | 選考スケジュール抽出は `MODEL_SELECTION_SCHEDULE`、企業情報関連は `MODEL_COMPANY_INFO` を使う |
| ログイン要件 | 選考スケジュール取得、企業 RAG 取込ともにログイン必須（ゲスト不可） |
| 検索エンジン | Hybrid Search (RRF + Cross-Encoder Reranking) を標準、DuckDuckGo Legacy をフォールバック |
| 認証 | BFF は Better Auth session で認証。FastAPI は `CareerPrincipal` + `require_tenant_key` |

---

## 2. アーキテクチャ

### 2.1 3層構成図

```
+-------------------------------------------------------------+
|  Frontend (React)                                           |
|  FetchInfoButton / CorporateInfoSection                     |
|  候補表示 -> URL選択/PDF upload -> 見積確認 -> 実行 -> 結果  |
+----------------------------+--------------------------------+
                             | POST /api/companies/[id]/fetch-*
+----------------------------v--------------------------------+
|  BFF (Next.js API Route)                                    |
|  認証検証 -> 所有権確認 -> SSRF検証 -> 課金予約              |
|  -> FastAPI proxy -> 使用量計上 -> 応答整形                  |
+----------------------------+--------------------------------+
                             | POST /company-info/*
+----------------------------v--------------------------------+
|  Backend (FastAPI)                                          |
|  services/company_info/ (fetch_schedule, build_rag_source,  |
|  extract_deadlines) + routers/company_info_*.py             |
|  Web取得 -> LLM抽出 / OCR -> chunk化 -> ChromaDB保存        |
+-------------------------------------------------------------+
```

### 2.2 サービスレイヤー

Backend のビジネスロジックは `services/company_info/` の 3 モジュールに集約される。ルーターモジュールとの依存注入は `configure_dependencies()` で行い、循環 import を回避する。

| サービス | 責務 |
|----------|------|
| `fetch_schedule` | 選考スケジュール取得の全フロー。Firecrawl → フォローリンク → LLM 抽出 → 複数パートのマージ |
| `build_rag_source` | RAG 構築・削除・GAP 分析。URL crawl と PDF upload の共通処理。chunk/embedding/保存 |
| `extract_deadlines` | スケジュール抽出のプロンプト構築・JSON パース・OCR 要否判定 |

### 2.3 ルーター群

| ルーター | 責務 |
|----------|------|
| `company_info.py` | エントリポイント。全ルートの APIRouter 定義。依存注入の起点 |
| `company_info_candidate_scoring.py` | 採用・コーポレート候補のスコアリング。DuckDuckGo キャッシュ。卒年判定 |
| `company_info_corporate_search.py` | コーポレートページ検索。Hybrid / Legacy 分岐。クエリ構築 |
| `company_info_recruit_search.py` | 採用ページ検索。Hybrid / Legacy 分岐 |
| `company_info_url_utils.py` | URL 正規化・ドメイン分類・企業名マッチング・信頼度キャップ |
| `company_info_config.py` | 定数・キーワード・JSON Schema・除外リスト |
| `company_info_llm_extraction.py` | LLM / Firecrawl による構造化抽出 |
| `company_info_models.py` | Pydantic モデル定義 |
| `company_info_pdf.py` | PDF ページ単位 OCR routing・ingest テレメトリ・見積レスポンス構築 |

### 2.4 主要ファイル配置テーブル

| 層 | パス | 責務 | 行数 |
|---|---|---|---|
| **Backend Service** | `backend/app/services/company_info/build_rag_source.py` | RAG構築・crawl・PDF upload | ~1,010 |
| | `backend/app/services/company_info/fetch_schedule.py` | 選考スケジュール取得フロー | ~826 |
| | `backend/app/services/company_info/extract_deadlines.py` | プロンプト構築・抽出パース | ~199 |
| **Backend Router** | `backend/app/routers/company_info.py` | 全エンドポイント定義 | ~415 |
| | `backend/app/routers/company_info_candidate_scoring.py` | 候補スコアリング | ~1,014 |
| | `backend/app/routers/company_info_corporate_search.py` | コーポレート検索 | ~678 |
| | `backend/app/routers/company_info_recruit_search.py` | 採用ページ検索 | ~414 |
| | `backend/app/routers/company_info_url_utils.py` | URL分類・正規化 | ~324 |
| | `backend/app/routers/company_info_config.py` | 定数・Schema | ~602 |
| | `backend/app/routers/company_info_llm_extraction.py` | LLM抽出 | ~283 |
| | `backend/app/routers/company_info_models.py` | モデル定義 | ~290 |
| | `backend/app/routers/company_info_pdf.py` | PDF処理 | ~503 |
| **BFF** | `src/app/api/companies/[id]/fetch-info/route.ts` | 選考スケジュール取得 | ~594 |
| | `src/app/api/companies/[id]/fetch-corporate/route.ts` | URL crawl | ~659 |
| | `src/app/api/companies/[id]/fetch-corporate-upload/route.ts` | PDF upload | ~470 |
| **Billing** | `src/bff/billing/company-fetch-policy.ts` | Schedule Reserve/Confirm/Cancel | ~109 |
| | `src/lib/company-info/pricing.ts` | プラン別上限・クレジット計算 | ~103 |
| | `src/lib/company-info/usage.ts` | 月次使用量管理・RAG課金 | ~447 |
| | `src/lib/company-info/pdf-ingest-limits.ts` | PDF ingest上限 | ~50 |

---

## 3. 選考スケジュール取得

### 3.1 処理フロー

1. `POST /api/companies/[id]/fetch-info` を呼ぶ（BFF）
2. BFF: 認証 -> ゲスト拒否 -> 所有権確認 -> SSRF 検証 -> `checkPublicSourceCompliance()` -> 課金予約
3. FastAPI `POST /company-info/fetch-schedule` へ proxy
4. `fetch_schedule_response()` が以下を順に実行:
   a. `fetch_page_content()` で primary URL をバイト取得
   b. `_build_schedule_source_metadata()` で source_type / year_matched を判定
   c. Firecrawl 有効時: Firecrawl で構造化抽出を試行
   d. 締切が不十分なら follow link を探索（HTML + PDF 各最大 1 件）
   e. follow link からも LLM 抽出を試行
   f. Firecrawl なし / 抽出不十分の場合: LLM fallback で primary URL から抽出
   g. 複数パートの結果を `_merge_schedule_info_parts()` で統合（重複除去 + 高信頼度優先）
5. BFF: 成功判定 -> `saveExtractedDeadlines()` で Postgres 保存 -> 課金確定/キャンセル

### 3.2 fetch_schedule.py: クエリ構築・信頼度ランク・フォローリンク

**クエリ構築** (`_build_recruit_queries`):
- 企業名 + 卒年 + 選考タイプ（本選考 / インターン / 汎用）で最大 6 クエリを生成
- `COMPANY_QUERY_ALIASES` に登録されたエイリアス名があれば先頭に追加
- 業界名があれば末尾に追加

**信頼度ランク** (`_schedule_confidence_rank`):
- `high`=3, `medium`=2, `low`=1 の数値順
- マージ時に同一締切の重複は高信頼度側を優先

**source type 判定** (`_build_schedule_source_metadata`):
- `_classify_company_relation()` で official / parent / subsidiary / other を判定
- `_normalize_recruitment_source_type()` で job_site を追加判定
- `_detect_other_graduation_years()` で年度不一致を検出

**フォローリンク** (`_extract_schedule_follow_links`):
- primary URL の HTML からアンカーを抽出
- `SCHEDULE_FOLLOW_LINK_KEYWORDS` でスコアリング（締切=6, エントリー=5, 募集要項=5 など）
- `SCHEDULE_FOLLOW_LINK_NEGATIVE_KEYWORDS` でフィルタ（privacy, news, ir など）
- 同じ source_type のリンクのみ許可（official -> official のみ）
- HTML 最大 1 件 + PDF 最大 1 件

**LLM テキスト圧縮** (`_compress_schedule_page_text_for_llm`):
- 通常ページ: キーワード近傍行を抽出し最大 6,000 文字
- 巨大ページ (80,000 文字超): 末尾 400 行 + キーワード近傍で最大 4,000 文字
- マッチなし: フォールバック最大 4,500 文字（巨大ページは 3,200 文字）

**信頼度キャップ** (`_apply_schedule_source_confidence_caps`):
- official + year_matched=false: high -> medium
- job_site: high -> medium に制限
- parent / subsidiary / other: 一律 low

### 3.3 抽出対象

| 項目 | 内容 |
|------|------|
| deadlines | ES 提出、Web テスト、適性検査、面接（1次-最終）、説明会、インターン、内定承諾、その他 |
| required_documents | ES、成績証明書、ポートフォリオなど（必須/任意フラグ付き） |
| application_method | マイページ登録、エントリー方法など |
| selection_process | ES -> Web テスト -> 面接、など |

### 3.4 抽出経路

- Firecrawl 有効時は `scrape_url_with_schema()` で structured extraction を優先
- PDF は `_extract_schedule_text_from_bytes()` でローカル抽出 → OCR 要否判定 → Google OCR（schedule 用は固定 `billing_plan="free"`）
- HTML 取得や LLM 抽出に失敗時は fallback（ページテキスト + LLM 直接抽出）
- OCR 呼び出しは全体で最大 1 回（`SCHEDULE_MAX_OCR_CALLS = 1`）

### 3.5 クレジット消費

| 結果 | 条件 | 消費 |
|------|------|------|
| 完全成功 | 月次無料回数内 | 0 credits、無料回数を 1 消費 |
| 完全成功 | 月次無料回数外 | 1 credit |
| 重複のみ | 抽出した締切が全件既存と重複 | 0 credits |
| 部分成功 | 締切なし、他データあり | 0 credits |
| 失敗 | データなし | 0 credits |

BFF は Reserve -> Confirm/Cancel パターンで実装。`companyFetchPolicy` が月次無料枠を先に試し、枯渇時のみクレジットを予約する。

---

## 4. コーポレート情報取得

### 4.1 処理フロー

1. `POST /api/companies/[id]/search-corporate-pages` で候補 URL を探す
2. ユーザーが URL を選ぶ、または PDF をアップロードする
3. 実行前に estimate API を呼ぶ
4. 必要時だけ確認ダイアログを表示する
5. 実行 API で HTML / PDF を取り込む
6. chunk / embedding / BM25 更新まで行い、企業 RAG に保存する

### 4.2 Next API

| エンドポイント | 用途 |
|------|------|
| `POST /api/companies/[id]/fetch-corporate/estimate` | URL 取込の実行前見積 |
| `POST /api/companies/[id]/fetch-corporate` | URL 取込の実行 |
| `POST /api/companies/[id]/fetch-corporate-upload/estimate` | PDF upload の実行前見積 |
| `POST /api/companies/[id]/fetch-corporate-upload` | PDF upload の実行 |

### 4.3 FastAPI 内部エンドポイント

| エンドポイント | 用途 |
|------|------|
| `POST /company-info/rag/estimate-crawl-corporate` | URL 取込の backend preflight |
| `POST /company-info/rag/crawl-corporate` | URL 取込の backend 実行 |
| `POST /company-info/rag/estimate-upload-pdf` | PDF の backend preflight |
| `POST /company-info/rag/upload-pdf` | PDF の backend 実行 |

### 4.4 URL crawl の分岐

`_process_crawl_source()` は source ごとに次を判定する:

- `_looks_like_pdf_payload()`: URL 末尾 `.pdf` または先頭 5 バイトが `%PDF-`
- `_looks_like_html_payload()`: 先頭 512 バイトに `<html`, `<!doctype html`, `<body` を含む
- `_is_garbled_text()`: U+FFFD 置換文字が 5% 超で文字化け判定

判定結果:

| 種別 | 処理 |
|------|------|
| HTML | `extract_text_from_html()` -> 100 文字未満 or 文字化けならスキップ -> `store_full_text_content()` |
| PDF | `_extract_text_from_pdf_with_page_routing()` -> 100 文字未満ならスキップ -> 保存 |
| unsupported binary | スキップ（エラー記録） |

**PDF URL は手動 upload と同じ品質・同じ上限・同じ課金ルール**になる。

### 4.5 PDF ingest のページ単位 routing

PDF は資料単位で一律 OCR せず、**ページ単位で route を混在**させる（`_extract_text_from_pdf_with_page_routing`）。

1. `_get_pdf_page_count()` で全ページ数を取得
2. `_rag_pdf_max_ingest_pages()` で上限を取得し、超過分は先頭から切り詰め
3. `_extract_text_pages_from_pdf_locally()` で全ページのローカルテキスト抽出
4. `_plan_pdf_page_routes()` でページごとに route を決定:

| route | 条件 |
|------|------|
| `local` | `_is_local_pdf_page_readable()` = true（テキスト層が十分、非文字化け、最低文字数超過） |
| `google` | local で読めない + Google OCR 予算が残っている |
| `mistral` | `ir_materials` / `midterm_plan` かつ画像中心 + Mistral OCR 予算が残っている + standard/pro プラン |

5. Google OCR 対象ページを `_slice_pdf_bytes_to_page_indexes()` でスライスし一括 OCR
6. Mistral OCR 対象ページも同様にスライスし一括 OCR
7. 元のページ順で再構成して 1 本の本文として結合

### 4.6 見積・実行レスポンス

見積（estimate）と実行の両方が、ページ数・無料枠消化・クレジット消費・OCR route 内訳・切り詰め有無を返す。

| API | 主な返却フィールド |
|-----|------------------|
| URL estimate | `estimatedFreeHtmlPages`, `estimatedFreePdfPages`, `estimatedCredits`, `requiresConfirmation`, `page_routing_summaries` |
| URL 実行 | `pagesCrawled`, `freeUnitsApplied`, `actualCreditsDeducted`, `chunksStored`, `pageRoutingSummaries` |
| PDF estimate | `estimated_free_pdf_pages`, `estimated_credits`, `estimated_google_ocr_pages`, `estimated_mistral_ocr_pages`, `requires_confirmation` |
| PDF 実行 | `items[]`（各 source の `ingestUnits`, `freeUnitsApplied`, `actualCreditsDeducted`, `pageRoutingSummary`）, `totalUnits` |

`pageRoutingSummary` は `total_pages / ingest_pages / local_pages / google_ocr_pages / mistral_ocr_pages / truncated_pages` を含む。source ごとの詳細 route は通常 UI に常設せず、debug / log で追う。

---

## 5. 候補スコアリング

### 5.1 recruit 候補スコアリング

`_score_recruit_candidate()` / `_score_recruit_candidate_with_breakdown()` が採用ページ候補のスコアを算出する。

| スコア要素 | 加点/減点 |
|------------|-----------|
| 企業名がタイトルに一致 | +3.0 |
| 企業名がスニペットに一致 | +2.0 |
| 登録公式ドメインに一致 | +4.0 |
| ASCII 名がドメインに一致 | +3.0 |
| 採用サブドメイン (recruit. / saiyo. / entry. / career.) | +3.0 |
| 採用 URL キーワード一致 | +3.0 |
| 採用タイトルキーワード一致 | +2.0 |
| 卒年一致 | +1.0 |
| 他年度検出ペナルティ | -2.0 |
| TLD 品質 (.co.jp +2.0 / .jp +1.5 / .com +1.0) | 可変 |
| アグリゲーターペナルティ | -3.0 |
| 個人ブログペナルティ | -5.0 |
| 公式ブログ | -1.0 |

**source_type の分類**: recruit 検索では `official` / `job_site` / `parent` / `subsidiary` のみ許可。`other` は除外される。

### 5.2 corporate 候補スコアリング

`_score_corporate_candidate_with_breakdown()` がコーポレートページ候補をスコアリングする。recruit と共通の基盤スコア（ドメイン・企業名・TLD）に加えて:

- `content_type` 指定時: `CONTENT_TYPE_KEYWORDS` で URL パターン / タイトル / スニペット一致を加点
- `content_type` 未指定時: `CORP_KEYWORDS` (ir / business / about) で加点
- 優先ドメイン一致: +3.0 / 不一致: -1.0
- IR 検索で PDF: +1.5
- `IR_DOC_KEYWORDS` 一致: +2.5
- 最低スコア閾値: `CORP_SEARCH_MIN_SCORE = 3.5`

### 5.3 信頼度レベル変換

score を `high` / `medium` / `low` の confidence に変換する関数群:

| 関数 | 用途 |
|------|------|
| `_score_to_confidence()` | Legacy corporate 検索用 |
| `_hybrid_score_to_confidence()` | Hybrid corporate 検索用 |
| `_recruitment_score_to_confidence()` | Legacy recruit 検索用 |
| `_recruitment_hybrid_score_to_confidence()` | Hybrid recruit 検索用 |

共通ルール:
- official + score >= 閾値 + year_matched -> `high`
- official + year_matched=false -> `medium` に制限
- job_site -> `medium` 上限
- parent / subsidiary -> `low` 固定

---

## 6. 検索パイプライン

### 6.1 corporate_search: コーポレートページ発見

`_search_corporate_pages_impl()` が 2 つのパスを持つ:

**Hybrid Search パス** (RRF + Cross-Encoder Reranking):
1. `generate_query_variations()` でクエリバリエーション生成
2. `hybrid_web_search()` で RRF + Reranking 実行
3. `_should_include_corporate_candidate()` で content_type に応じたフィルタ
4. `_candidate_sort_key()` で source_type -> confidence -> score の優先順でソート

**Legacy Search パス** (DuckDuckGo):
1. `_build_corporate_queries()` で content_type 別クエリ生成（9 タイプ + 3 legacy タイプ）
2. `_search_with_ddgs()` で検索（キャッシュ TTL 30 分、最大 200 件）
3. strict match → 結果不足なら relaxed → さらにアグリゲーター fallback
4. 競合ドメイン検出・企業名不一致・不適切サイトを除外

### 6.2 recruit_search: 採用ページ検索

`_search_company_pages_impl()` も同様に Hybrid / Legacy の 2 パスを持つ。

recruit 検索固有のルール:
- アグリゲーターは常に除外 (`allow_aggregators=False`)
- source_type が `other` の場合は除外（official / job_site / parent / subsidiary のみ許可）
- 卒年不一致の候補はスコアから -2.0
- 親会社サイトは 0.5 倍、子会社サイトは 0.3 倍のペナルティ

### 6.3 URL utilities: ドメイン分類と正規化

`company_info_url_utils.py` が URL レベルの共通判定を提供する:

| 関数 | 用途 |
|------|------|
| `_normalize_url()` | 重複排除用の正規化（scheme + netloc + path、末尾 / 除去） |
| `_classify_company_relation()` | official / parent / subsidiary / other の判定 |
| `_company_name_matches()` | タイトル・スニペット・ドメインでの企業名マッチ |
| `_is_excluded_url()` | 強除外サイト（OpenWork, Wikipedia, SNS, ニュースなど） |
| `_is_irrelevant_url()` | 不適切サイト（ショッピング, PDFビューア, LinkedIn など） |
| `_sanitize_preferred_domain()` | 優先ドメインの公式性検証 |
| `_apply_schedule_source_confidence_caps()` | 選考スケジュール用の信頼度キャップ適用 |

---

## 7. RAGソース構築 (build_rag_source.py)

### 7.1 チャンク化とembedding

`build_company_rag_impl()` が RAG 構築の中核:

1. `resolve_embedding_backend()` で embedding バックエンド取得（OpenAI or sentence-transformers）
2. `store_full_text_content()` でフルテキスト保存:
   - HTML: `extract_sections_from_html()` -> `chunk_sections_with_metadata()` (セクション認識チャンク)
   - text: `JapaneseTextChunker` (chunk_size=500, overlap=100)
3. `_extracted_data_to_chunks()` で構造化データ（締切・提出物・応募方法・選考プロセス）をチャンク化
4. `store_company_info()` で ChromaDB に保存

content_type に応じてチャンクサイズが変わる（`get_chunk_settings()`）。

### 7.2 ソース置換ロジック

- 新しい URL を追加取得した時は既存 URL の RAG を消さずに蓄積する
- 既存 URL を再取得した時は、その URL に紐づくチャンクだけを置き換える
- 同じ URL の分類結果が変わった場合は、旧 `content_type` 側のチャンクを消して新しい分類へ移す
- 再取得失敗時は旧データを残す
- PDF upload も URL crawl も、保存 metadata は `corporateInfoUrls` に寄せて管理する

### 7.3 RAG 削除 API

| エンドポイント | 用途 |
|------|------|
| `DELETE /company-info/rag/{company_id}` | 全 RAG 削除 |
| `DELETE /company-info/rag/{company_id}/{content_type}` | content_type 別削除 |
| `POST /company-info/rag/{company_id}/delete-by-urls` | URL 別削除 |

削除時は RAG キャッシュも `invalidate_company()` で無効化する。

### 7.4 GAP 分析

`POST /company-info/rag/gap-analysis` で query-aware の RAG 品質分析を実行:
- facet 別 coverage / chunk_count / source_diversity を算出
- missing_facets / stale_sources / duplicate_ratio を返す
- `next_fetch_targets` で次に取得すべき content_type とクエリヒントを提案
- `needs_enrichment` で RAG 充実が必要かを判定

---

## 8. コンテンツタイプと分類

企業情報は 9 種類に分類し、検索や retrieval boost に使う。

| タイプ | 日本語ラベル |
|------|------|
| `new_grad_recruitment` | 新卒採用 HP |
| `midcareer_recruitment` | 中途採用 HP |
| `corporate_site` | 企業 HP |
| `ir_materials` | IR 資料 |
| `ceo_message` | 社長メッセージ |
| `employee_interviews` | 社員インタビュー |
| `press_release` | プレスリリース |
| `csr_sustainability` | CSR / サステナ |
| `midterm_plan` | 中期経営計画 |

`content_type` が未指定の時は、URL pattern、keyword、LLM fallback の順で推定する。

`employee_interviews` は特別なフィルタを持ち、`EMPLOYEE_INTERVIEW_POSITIVE_SIGNALS`（社員紹介、先輩社員 等）のシグナルが必要で、`EMPLOYEE_INTERVIEW_NEGATIVE_SIGNALS`（IR、決算、有価証券 等）があると除外する。

---

## 9. 保存ルールと上限制御

### 保存ルール

- 新しい URL を追加取得した時は既存 URL の RAG を消さずに蓄積する
- 既存 URL を再取得した時は、その URL に紐づくチャンクだけを置き換える
- 同じ URL の分類結果が変わった場合は、旧 `content_type` 側のチャンクを消して新しい分類へ移す
- 再取得失敗時は旧データを残す
- PDF upload も URL crawl も、保存 metadata は `corporateInfoUrls` に寄せて管理する

### PDF upload 制限

- 1 ファイル最大 20 MiB (`MAX_PDF_UPLOAD_BYTES`)
- 1 リクエスト最大 10 ファイル
- 1 リクエスト合計最大 50 MiB
- private_material_consent 必須チェック（私的資料の場合）

### source 数の制御

- 企業 RAG は 1 社ごとに source 上限を持つ
- 新しい URL や PDF を追加する時だけ上限にカウントする
- 同じ URL の再取得は既存 source を安全に置換する

---

## 10. プラン別制限と課金

### 10.1 プラン別制限テーブル

| プラン | 選考スケジュール月次無料回数 | RAG URL/HTML 月次無料ページ | RAG PDF 月次無料ページ | 1社あたり source 上限 | PDF ingest 上限 | Google OCR 上限 | Mistral OCR 上限 |
|--------|------:|------:|------:|------:|------:|------:|------:|
| guest | 0 (API拒否) | 0 | 0 | 0 | 0 | 0 | 0 |
| free | 10 | 20 | 60 | 3 | 20 | 5 | 0 |
| standard | 100 | 200 | 250 | 100 | 100 | 50 | 15 |
| pro | 200 | 500 | 600 | 500 | 200 | 100 | 30 |

正本:
- 選考スケジュール月次無料回数: `src/lib/company-info/pricing.ts` の `MONTHLY_SCHEDULE_FETCH_FREE_LIMITS`
- RAG URL/HTML 月次無料ページ: `src/lib/company-info/pricing.ts` の `MONTHLY_RAG_HTML_FREE_PAGES`
- RAG PDF 月次無料ページ: `src/lib/company-info/pricing.ts` の `MONTHLY_RAG_PDF_FREE_PAGES`
- 1社あたり source 上限: `src/lib/company-info/pricing.ts` の `COMPANY_RAG_SOURCE_LIMITS`
- PDF ingest 上限: `src/lib/company-info/pdf-ingest-limits.ts` の `RAG_PDF_MAX_PAGES`
- Google OCR 上限: `src/lib/company-info/pdf-ingest-limits.ts` の `RAG_PDF_GOOGLE_OCR_MAX_PAGES`
- Mistral OCR 上限: `src/lib/company-info/pdf-ingest-limits.ts` の `RAG_PDF_MISTRAL_OCR_MAX_PAGES`

### 10.2 企業 RAG の課金ルール

- URL/HTML と PDF は**無料枠を分離**して管理する（`ragHtmlFreeUnits` / `ragPdfFreeUnits`）
- URL/HTML は無料枠を超えたページだけ `1 page = 1 credit`
- PDF は無料枠内なら `0 credits`
- PDF は無料枠超過時のみ次の tier を課金する

| PDF 超過ページ数 | credits |
|------|------:|
| 1-20 | 2 |
| 21-60 | 6 |
| 61+ | 12 |

正本: `src/lib/company-info/pricing.ts` の `calculatePdfIngestCredits()`

### 10.3 確認ダイアログの表示条件

実行前見積は常に表示するが、確認ダイアログを出すのは次の時だけ:

- credits 見積が 0 を超える
- Mistral OCR を使う見込みがある
- 上限の都合で一部ページが切り捨てられる

正本: `_build_pdf_estimate_response()` の `requires_confirmation` 算出ロジック。

### 10.4 Reserve/Confirm/Cancel フロー

**選考スケジュール取得** (`companyFetchPolicy`):
1. **Precheck**: 月次無料枠 OR 1 credit の残高確認
2. **Reserve**: `reserveMonthlyScheduleFreeUse()` -> 失敗なら `reserveCredits()` で 1 credit 予約
3. **Confirm**: 締切保存成功時に `confirmReservation()`
4. **Cancel**: 失敗・abort・重複のみ時に `cancelReservation()` or `cancelMonthlyScheduleFreeUse()`

**企業 RAG 取込** (`applyCompanyRagUsage`):
1. 月次使用量テーブル (`companyInfoMonthlyUsage`) を `FOR UPDATE` でロック
2. 無料枠分を先に消費（HTML/PDF 別カウンタ）
3. 超過分のクレジットを `consumeCredits()` で課金
4. 課金失敗時は無料枠カウンタをロールバック

---

## 11. エラーパス

### BFF 層

| 段階 | 条件 | 結果 |
|------|------|------|
| 認証 | 未認証 | 401 AUTHENTICATION_REQUIRED |
| 認証 | ゲスト | 401 LOGIN_REQUIRED_FOR_SCHEDULE_FETCH |
| 所有権 | 企業不存在 / 他ユーザー所有 | 404 COMPANY_NOT_FOUND |
| URL | 未指定 | 400 RECRUITMENT_URL_REQUIRED |
| SSRF | プライベートIP / 非 HTTPS | 400 INVALID_RECRUITMENT_URL |
| Source | ログイン必須ページ | 400 PUBLIC_SOURCE_BLOCKED |
| 課金 | クレジット不足 | 402 INSUFFICIENT_CREDITS |
| Backend | FastAPI エラー | 503 SCHEDULE_FETCH_FAILED |

### Backend 層

| 段階 | 条件 | 結果 |
|------|------|------|
| LLM | API キー未設定 | 503 (error_type: no_api_key) |
| LLM | 応答パース失敗 | 503 (error_type: parse) |
| PDF | テキスト 100 文字未満 | エラー応答（十分な本文を抽出できません） |
| PDF | embedding backend なし | エラー応答 |
| crawl | HTML テキスト不足 or 文字化け | ページスキップ |
| crawl | unsupported binary | ページスキップ |

---

## 12. フロントエンド

### FetchInfoButton.tsx

- 採用ページ候補を表示する
- source_type (公式/就活サイト/親会社/子会社) と confidence を明示する
- year_matched 状態を表示する
- 締切の承認導線を持つ
- 選考スケジュール取得では企業 RAG を作らない

### CorporateInfoSection.tsx

- コンテンツタイプ別に source を管理する
- URL 検索、URL 取込、PDF upload を扱う
- 実行前見積を表示する
- `credits > 0` / `Mistral 使用` / `truncation` の時だけ確認を出す
- 公開ページ判定で取得可否を確認できない URL は候補から除外せず、`warning` として表示し、取得実行前にユーザー確認を必須にする
- 連携状況 API が一時的に確認できない場合は `ragStatusUnavailable` / `statusReason` を返し、画面では「確認中」の固定表示ではなく再読み込み可能な警告として表示する

### ユーザー向けエラー表示

- AI / FastAPI の認証・設定不足は一般ユーザーへ内部設定名を出さず、「AI機能を利用できませんでした。」に正規化する
- 画面上の一般ユーザー向け失敗は `parseApiErrorResponse()` / `toAppUiError()` で `AppUiError` に変換し、`notifyUserFacingAppError()` でスナックバー通知する
- `robots.txt` など取得判定の内部処理名は UI 文言に出さず、「取得前にページ内容の確認が必要です。」として表示する

---

## 13. テスト

### テスト層

| 層 | コマンド | 内容 |
|---|---|---|
| Unit (Backend) | `python -m pytest backend/tests/company_info -q` | スコアリング・検索・PDF ingest・ドメインマッチ |
| Architecture | `python -m pytest backend/tests/architecture/test_company_info_ca4_boundaries.py -q` | ルーター/サービス層の依存方向 |
| Integration | `python -m pytest backend/tests/company_info/integration/ -q` | ライブ検索・RAG ingest・スケジュール取得レポート |
| Live Provider | `make test-e2e-functional-local AI_LIVE_LOCAL_FEATURES=company-info-search` | 実 API 品質ゲート（ローカルのみ） |

### 主要テストファイル

- `backend/tests/company_info/test_schedule_search_policy.py` -- 検索ポリシー・クエリ構築・信頼度キャップ
- `backend/tests/company_info/test_hybrid_search_priority_sources.py` -- Hybrid 検索の source 優先順位
- `backend/tests/company_info/test_hybrid_search_short_circuit.py` -- Hybrid 検索の短絡条件
- `backend/tests/company_info/test_upload_pdf_ingestion.py` -- PDF ingest のページ routing・OCR 分岐
- `backend/tests/company_info/test_vector_store_source_replacement.py` -- RAG ソース置換ロジック
- `backend/tests/company_info/test_domain_pattern_matching.py` -- ドメインパターンマッチング
- `backend/tests/company_info/test_pdf_ocr_schedule.py` -- スケジュール取得の PDF OCR
- `backend/tests/company_info/test_content_classifier.py` -- コンテンツタイプ分類
- `backend/tests/company_info/test_rag_gap_analyzer.py` -- RAG GAP 分析
- `backend/tests/company_info/test_public_url_guard.py` -- SSRF / 公開 URL 検証
- `backend/tests/architecture/test_company_info_ca4_boundaries.py` -- CA4 アーキテクチャ境界

---

## 14. 主要ファイル一覧（クイックリファレンス）

| カテゴリ | ファイル | 行数 |
|---|---|---|
| **Backend Service** | `backend/app/services/company_info/build_rag_source.py` | ~1,010 |
| | `backend/app/services/company_info/fetch_schedule.py` | ~826 |
| | `backend/app/services/company_info/extract_deadlines.py` | ~199 |
| **Backend Router** | `backend/app/routers/company_info.py` | ~415 |
| | `backend/app/routers/company_info_candidate_scoring.py` | ~1,014 |
| | `backend/app/routers/company_info_corporate_search.py` | ~678 |
| | `backend/app/routers/company_info_recruit_search.py` | ~414 |
| | `backend/app/routers/company_info_url_utils.py` | ~324 |
| | `backend/app/routers/company_info_config.py` | ~602 |
| | `backend/app/routers/company_info_llm_extraction.py` | ~283 |
| | `backend/app/routers/company_info_models.py` | ~290 |
| | `backend/app/routers/company_info_pdf.py` | ~503 |
| **BFF** | `src/app/api/companies/[id]/fetch-info/route.ts` | ~594 |
| | `src/app/api/companies/[id]/fetch-corporate/route.ts` | ~659 |
| | `src/app/api/companies/[id]/fetch-corporate-upload/route.ts` | ~470 |
| **Billing** | `src/bff/billing/company-fetch-policy.ts` | ~109 |
| | `src/lib/company-info/pricing.ts` | ~103 |
| | `src/lib/company-info/usage.ts` | ~447 |
| | `src/lib/company-info/pdf-ingest-limits.ts` | ~50 |

---

## 補足: 関連ドキュメント

- `docs/features/COMPANY_INFO_SEARCH.md`
- `docs/features/COMPANY_RAG.md`
- `docs/features/CREDITS.md`
