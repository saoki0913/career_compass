# 企業情報取得機能

採用ページから選考情報を抽出する機能と、企業の公開ページや PDF を取り込んで企業 RAG を構築する機能を扱う。選考スケジュール取得と企業 RAG 取り込みは別機能であり、**選考スケジュール取得では RAG を構築しない**。

正本:

- FastAPI: `backend/app/routers/company_info.py`
- Next API:
  - `src/app/api/companies/[id]/fetch-info/route.ts`
  - `src/app/api/companies/[id]/fetch-corporate/route.ts`
  - `src/app/api/companies/[id]/fetch-corporate/estimate/route.ts`
  - `src/app/api/companies/[id]/fetch-corporate-upload/route.ts`
  - `src/app/api/companies/[id]/fetch-corporate-upload/estimate/route.ts`

## 1. 概要

| 項目 | 内容 |
|------|------|
| 選考スケジュール取得 | 採用ページ 1 URL から締切・提出物・選考フローを抽出する |
| コーポレート情報取得 | ユーザーが選んだ公開 URL / PDF を取り込み、RAG 用に保存する |
| LLM | 選考スケジュール抽出は `MODEL_SELECTION_SCHEDULE`、企業情報関連は `MODEL_COMPANY_INFO` を使う |
| ログイン要件 | 選考スケジュール取得、企業 RAG 取込ともにログイン必須 |

### プラン別制限

| プラン | 選考スケジュール無料回数 | RAG URL/HTML 無料ページ | RAG PDF 無料ページ | 1社あたり source 上限 | PDF ingest 上限 | Google OCR 上限 | Mistral OCR 上限 |
|------|------:|------:|------:|------:|------:|------:|------:|
| guest | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| free | 5 | 10 | 40 | 3 | 20 | 5 | 0 |
| standard | 50 | 100 | 200 | 100 | 60 | 30 | 10 |
| pro | 150 | 300 | 600 | 500 | 120 | 60 | 20 |

### 企業 RAG の課金ルール

- URL/HTML と PDF は**無料枠を分離**して管理する。
- URL/HTML は無料枠を超えたページだけ `1 page = 1 credit`。
- PDF は無料枠内なら `0 credits`。
- PDF は無料枠超過時のみ次の tier を課金する。

| PDF 超過ページ数 | credits |
|------|------:|
| 1-20 | 2 |
| 21-60 | 6 |
| 61-120 | 12 |

- PDF の価値指標は OCR provider ごとの内部原価ではなく、**最終的に処理したページ数**。
- provider ごとの実コストは telemetry に残すが、ユーザー課金は `src/lib/company-info/pricing.ts` を正とする。

## 2. 共通ルール

### 2.1 成功時のみ消費

- 選考スケジュール取得は、成功時のみ無料回数または credits を消費する。
- 企業 RAG 取込も、FastAPI で保存成功したものだけ `applyCompanyRagUsage()` を通して計上する。
- 見積 API は無料枠や credits を**消費しない**。

### 2.2 締切は承認必須

- `fetch-info` の抽出結果はそのまま本確定しない。
- 締切は `isConfirmed: false` で扱い、ユーザー承認後に確定する。

### 2.3 source 数の制御

- 企業 RAG は 1 社ごとに source 上限を持つ。
- 新しい URL や PDF を追加する時だけ上限にカウントする。
- 同じ URL の再取得は既存 source を安全に置換する。

### 2.4 確認ダイアログ

実行前見積は常に表示するが、確認ダイアログを出すのは次の時だけ。

- credits 見積が 0 を超える
- Mistral OCR を使う見込みがある
- 上限の都合で一部ページが切り捨てられる

## 3. 選考スケジュール取得

### 3.1 処理フロー

1. `POST /api/companies/[id]/search-pages` 相当で採用ページ候補を探す
2. ユーザーが 1 URL を選ぶ
3. `POST /api/companies/[id]/fetch-info` で本文抽出と構造化抽出を行う
4. 締切・提出物・選考フローを保存候補として返す
5. ユーザー承認後に deadline などへ反映する

### 3.2 抽出対象

| 項目 | 内容 |
|------|------|
| deadlines | ES 提出、Web テスト、面接、説明会など |
| required_documents | ES、成績証明書、ポートフォリオなど |
| application_method | マイページ登録、エントリー方法など |
| selection_process | ES -> Web テスト -> 面接、など |

### 3.3 抽出経路

- 通常の HTML は `Firecrawl` を優先して読む。
- PDF や OCR 必要ページでは `Google Document AI` を補助的に使う。
- `Google Layout Parser` は使わない。
- HTML 取得や LLM 抽出に失敗した時は、既存の本文抽出フォールバックを使う。

### 3.4 クレジット消費

| 結果 | 条件 | 消費 |
|------|------|------|
| 完全成功 | 月次無料回数内 | 0 credits、無料回数を 1 消費 |
| 完全成功 | 月次無料回数外 | 1 credit |
| 部分成功 | 締切なし、他データあり | 0 credits |
| 失敗 | データなし | 0 credits |

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

`crawl-corporate` は source ごとに次を判定する。

- `Content-Type`
- response bytes の先頭 signature
- 抽出本文の健全性

判定結果:

- HTML: そのまま本文抽出して chunk 化
- PDF: 手動 upload と同じ共通 PDF ingest へ渡す
- unsupported binary: skip する

このため、**PDF URL は手動 upload と同じ品質・同じ上限・同じ課金ルール**になる。

### 4.5 PDF ingest のページ単位 routing

PDF は資料単位で一律 OCR せず、**ページ単位で route を混在**させる。

1. 全ページを軽量 local 抽出する
2. 各ページの text layer quality を判定する
3. ページごとに route を決める

| route | 条件 |
|------|------|
| `local` | text layer が十分読める |
| `google` | local では読みにくい |
| `mistral` | `ir_materials` / `midterm_plan` かつ画像中心で、Google でも弱そうな難ページ |

補足:

- Free は `Mistral OCR` を使わない。
- OCR 対象ページだけ provider に送る。
- 元のページ順で再構成して、1 本の本文として chunk / 保存する。
- ingest 上限を超えるページは先頭から切り詰める。
- Google OCR 上限と Mistral OCR 上限は、**OCR 対象ページ数**として効く。

### 4.6 見積レスポンス

#### URL 取込見積

`POST /api/companies/[id]/fetch-corporate/estimate`

FastAPI 由来の field:

- `estimated_pages_crawled`
- `estimated_html_pages`
- `estimated_pdf_pages`
- `estimated_google_ocr_pages`
- `estimated_mistral_ocr_pages`
- `will_truncate`
- `page_routing_summaries`

Next 側で追加する field:

- `estimatedFreeHtmlPages`
- `estimatedFreePdfPages`
- `estimatedCredits`
- `remainingHtmlFreeUnits`
- `remainingPdfFreeUnits`
- `requiresConfirmation`

#### PDF upload 見積

`POST /api/companies/[id]/fetch-corporate-upload/estimate`

- `estimated_free_pdf_pages`
- `estimated_credits`
- `estimated_google_ocr_pages`
- `estimated_mistral_ocr_pages`
- `will_truncate`
- `requires_confirmation`
- `page_routing_summary`
- `processing_notice_ja`

見積は常に表示するが、source ごとの詳細 route は通常 UI に常設しない。詳細は debug / log で追う。

### 4.7 実行レスポンス

#### URL 取込

`POST /api/companies/[id]/fetch-corporate`

- `pagesCrawled`
- `actualUnits`
- `freeUnitsApplied`
- `remainingFreeUnits`
- `remainingHtmlFreeUnits`
- `remainingPdfFreeUnits`
- `creditsConsumed`
- `actualCreditsDeducted`
- `chunksStored`
- `pageRoutingSummaries`

#### PDF upload

`POST /api/companies/[id]/fetch-corporate-upload`

- `summary`
- `items[]`
- `totalUnits`
- `remainingFreeUnits`
- `actualCreditsDeducted`
- `estimatedCostBand`

`items[]` の各要素には次が入る。

- `ingestUnits`
- `freeUnitsApplied`
- `creditsConsumed`
- `actualCreditsDeducted`
- `sourceTotalPages`
- `ingestTruncated`
- `ocrTruncated`
- `processingNoticeJa`
- `pageRoutingSummary`

### 4.8 page routing summary

PDF 系処理では `page_routing_summary` を内部的に持ち、Next 側では `pageRoutingSummary` / `pageRoutingSummaries` として返す。主な項目は次のとおり。

- `total_pages`
- `ingest_pages`
- `local_pages`
- `google_ocr_pages`
- `mistral_ocr_pages`
- `truncated_pages`
- `planned_route`
- `actual_route`

## 5. コンテンツタイプ

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

## 6. 保存ルール

- 新しい URL を追加取得した時は既存 URL の RAG を消さずに蓄積する。
- 既存 URL を再取得した時は、その URL に紐づくチャンクだけを置き換える。
- 同じ URL の分類結果が変わった場合は、旧 `content_type` 側のチャンクを消して新しい分類へ移す。
- 再取得失敗時は旧データを残す。
- PDF upload も URL crawl も、保存 metadata は `corporateInfoUrls` に寄せて管理する。

## 7. UI

### FetchInfoButton.tsx

- 採用ページ候補を表示する
- relation / confidence を明示する
- 締切の承認導線を持つ
- 選考スケジュール取得では企業 RAG を作らない

### CorporateInfoSection.tsx

- コンテンツタイプ別に source を管理する
- URL 検索、URL 取込、PDF upload を扱う
- 実行前見積を表示する
- `credits > 0` / `Mistral 使用` / `truncation` の時だけ確認を出す

## 8. 関連ドキュメント

- `docs/features/COMPANY_INFO_SEARCH.md`
- `docs/features/COMPANY_RAG.md`
- `docs/features/CREDITS.md`
