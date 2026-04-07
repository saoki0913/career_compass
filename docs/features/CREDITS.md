# クレジット・課金機能

就活Pass のクレジット、月次無料枠、Stripe 連携、AI 機能ごとの消費ルールをまとめる。

このドキュメントは、まずアプリ実装を正本とし、外部 provider の単価は公式 pricing の一次情報を参照する。  
円換算はすべて **`1 USD = 160 円`** 固定。

## 1. 正本

| 項目 | 正本 |
|------|------|
| クレジット残高・月次リセット・予約/確定/取消 | `src/lib/credits/index.ts` |
| ES 添削のクレジット表 | `src/lib/credits/cost.ts` |
| 選考スケジュール月次無料回数 | `src/lib/company-info/pricing.ts` |
| 企業 RAG 月次無料ページ・PDF tier 課金 | `src/lib/company-info/pricing.ts`, `src/lib/company-info/usage.ts` |
| PDF 取込 / OCR ページ上限 | `src/lib/company-info/pdf-ingest-limits.ts` |
| プラン料金・Stripe price ID | `src/lib/stripe/config.ts` |
| Stripe 反映 | `src/app/api/webhooks/stripe/route.ts` |
| DB 台帳 | `src/lib/db/schema.ts` |
| クレジット API | `src/app/api/credits/route.ts` |
| クレジット表示 hook | `src/hooks/useCredits.ts` |

## 2. プランと月次配分

### 2.1 プラン料金

`src/lib/stripe/config.ts` の現行表示値。

| プラン | 月額 | 年額 | 月次クレジット |
|------|------:|------:|------:|
| Guest | ¥0 | — | 0 |
| Free | ¥0 | — | 30 |
| Standard | ¥1,490 | ¥14,900 | 100 |
| Pro | ¥2,980 | ¥29,800 | 300 |

### 2.2 プラン差分

| 項目 | Guest | Free | Standard | Pro |
|------|------:|------:|------:|------:|
| ガクチカ素材数上限 | 2 | 3 | 10 | 20 |
| 選考スケジュール取得の月次無料回数 | 0 | 5 | 50 | 150 |
| 企業 RAG URL/HTML の月次無料ページ | 0 | 10 | 100 | 300 |
| 企業 RAG PDF の月次無料ページ | 0 | 40 | 200 | 600 |
| 1 社あたり RAG ソース上限 | 0 | 3 | 100 | 500 |
| PDF 取込上限（1 ファイル） | 0 | 20 ページ | 60 ページ | 120 ページ |
| PDF Google OCR 上限（1 ファイル） | 0 | 5 ページ | 30 ページ | 60 ページ |
| PDF Mistral OCR 上限（1 ファイル） | 0 | 0 ページ | 10 ページ | 20 ページ |

補足:

- 月次クレジットの正本は `PLAN_CREDITS`。
- ガクチカ素材数上限は `PLAN_METADATA.gakuchika` を `src/app/api/gakuchika/route.ts` で実際に enforce している。
- `PLAN_METADATA.esReviews` は表示用ヒントであり、回数の hard limit ではない。

## 3. 共通ルール

### 3.1 成功時のみ消費

クレジットは原則として **成功時のみ消費** する。

- 長時間処理は `reserveCredits()` で仮押さえし、成功時に `confirmReservation()`、失敗時に `cancelReservation()`。
- 会話系や軽量 API は成功時に `consumeCredits()`。

### 3.2 月次リセット

月次リセットは JST 基準。  
ただし月初バッチではなく、`getCreditsInfo()` 呼び出し時に JST の月跨ぎを検知して遅延実行する。

- 繰り越しはしない
- `balance` は `monthlyAllocation` に置き換わる
- `nextResetAt` は JST 月初境界から計算する

### 3.3 プラン変更

Stripe webhook でプランが確定すると `updatePlanAllocation()` が走る。

- upgrade / downgrade / 解約のいずれでも `monthlyAllocation` は新プラン値に更新
- `balance` も新プラン値に即時リセット
- `credit_transactions.type = "plan_change"` を記録

### 3.4 予約取消と `refund`

`TransactionType` には `refund` があるが、現行の予約取消では別の `refund` transaction を追加していない。  
`cancelReservation()` は、元の予約 transaction の description を `[Cancelled/Refunded] ...` に更新し、残高を戻す。

## 4. 機能別の課金ルール

### 4.1 一覧

| 機能 | 利用条件 | 課金ルール | TransactionType |
|------|------|------|------|
| ES 添削 | ログイン必須 | 予約 -> 成功確定 / 失敗取消 | `es_review` |
| ガクチカ会話 | ログイン必須 | 5 回答ごとに 3 credits を成功時消費 | `gakuchika` |
| ガクチカ ES 下書き | ログイン必須 | 6 credits を予約 -> 成功確定 / 失敗取消 | `gakuchika_draft` |
| 志望動機会話 | ログイン必須 | 5 回答ごとに 3 credits を成功時消費 | `motivation` |
| 志望動機 ES 下書き | ログイン必須 | 6 credits を予約 -> 成功確定 / 失敗取消（対話後 `generate-draft` と会話なし `generate-draft-direct` の両方で同一 `motivation_draft`） | `motivation_draft` |
| 面接最終講評 | ログイン必須 | 6 credits を予約 -> 成功確定 / 失敗取消 | `interview_feedback` |
| 選考スケジュール取得 | ログイン必須 | 月次無料枠を先に消費。超過後は 1 回 1 credit | `company_fetch` |
| 企業 RAG URL 取込 | ログイン必須 | 月次無料ページを先に消費。超過ページは 1 ページ 1 credit | `company_fetch` |
| 企業 RAG PDF 取込 | ログイン必須 | PDF 無料枠内は 0 credits。超過時だけ PDF tier 課金 | `company_fetch` |

### 4.2 ES 添削

`src/lib/credits/cost.ts` が正本。

#### プレミアム帯

| 文字数 | クレジット |
|------|------:|
| 〜500 | 6 |
| 〜1000 | 10 |
| 〜1500 | 14 |
| 1501〜 | 20 |

#### low-cost 帯

| 文字数 | クレジット |
|------|------:|
| 〜500 | 3 |
| 〜1000 | 6 |
| 〜1500 | 9 |
| 1501〜 | 12 |

補足:

- `claude-sonnet` / `gpt` / `gemini` はプレミアム帯。
- `low-cost` は low-cost 帯。
- **Free プランは実行モデルが low-cost（実装上は `gpt-fast` / `gpt-5.4-mini`）でも、請求クレジットはプレミアム帯**。
- ES 添削 route は document の owner が guest でも、最終的にログイン必須。

### 4.3 ガクチカ・志望動機

- 会話:
  - ガクチカ: 5 回答ごとに 3 credits
  - 志望動機: 5 回答ごとに 3 credits
  - どちらも `consumeCredits()` で成功時のみ消費
- 下書き:
  - ガクチカ ES 下書き: 6 credits
  - 志望動機 ES 下書き: 6 credits（対話ベースとプロフィールのみの直生成で共通）
  - どちらも `reserve -> confirm/cancel`

### 4.4 面接対策

- 面接対策全体がログイン必須
- 質問フロー自体に月次無料枠はない
- 最終講評だけ 6 credits

## 5. 選考スケジュール取得と企業 RAG

### 5.1 選考スケジュール取得

- ログイン必須。guest は route で 401
- 月次無料枠:
  - Free 5 回
  - Standard 50 回
  - Pro 150 回
- 無料枠を使い切った後は 1 回 1 credit
- 成功時のみ `incrementMonthlyScheduleFreeUse()` または `consumeCredits()` を実行

### 5.2 企業 RAG URL 取込

- URL/HTML 専用の月次無料ページ枠を先に消費
- 無料枠を超えたページだけ `1 ページ = 1 credit`
- 取込 route は `applyCompanyRagUsage()` を通す

### 5.3 企業 RAG PDF 取込

PDF は URL と別の無料枠を持ち、**無料枠内なら 0 credits**。

| PDF 超過ページ数 | クレジット |
|------|------:|
| 1〜20 | 2 |
| 21〜60 | 6 |
| 61〜120 | 12 |

補足:

- `page_count` は「実際に処理したページ数」。
- 取込前にプラン上限で先頭ページに切り詰める。
- PDF 本文はページ単位で `local / Google OCR / Mistral OCR` を混在させる。
- route 応答では `freeUnitsApplied`, `creditsConsumed`, `actualCreditsDeducted`, `processingNoticeJa`, `pageRoutingSummary` を返す。

## 6. `/api/credits` と UI 表示

### 6.1 `/api/credits`

ログイン時:

- `type`
- `plan`
- `balance`
- `monthlyAllocation`
- `nextResetAt`
- `monthlyFree.companyRagHtmlPages`
- `monthlyFree.companyRagPdfPages`
- `monthlyFree.selectionSchedule`
- `ragPdfLimits.maxPagesIngest`
- `ragPdfLimits.maxPagesGoogleOcr`
- `ragPdfLimits.maxPagesMistralOcr`
- `ragPdfLimits.summaryJa`

guest 時:

- `plan = "guest"`
- `balance = 0`
- `monthlyAllocation = 0`
- `nextResetAt = null`
- `monthlyFree.companyRagHtmlPages = 0/0`
- `monthlyFree.companyRagPdfPages = 0/0`
- `monthlyFree.selectionSchedule = 0/0`

### 6.2 `useCredits`

`src/hooks/useCredits.ts` には guest fallback として `balance: 12` / `monthlyAllocation: 12` がある。  
これは **UI fallback** であり、`/api/credits` の正本ではない。

hook では `selectionScheduleRemaining` / `selectionScheduleLimit` を返し、実体は `selectionSchedule` の **月次**無料枠。

## 7. 監査ログと台帳

### 7.1 `TransactionType`

現行実装の `TransactionType` は次のとおり。

- `monthly_grant`
- `plan_change`
- `company_fetch`
- `es_review`
- `gakuchika`
- `gakuchika_draft`
- `motivation`
- `motivation_draft`
- `interview_feedback`
- `refund`

### 7.2 主なテーブル

| テーブル | 用途 |
|------|------|
| `credits` | 残高と月次配分 |
| `credit_transactions` | クレジット監査ログ |
| `company_info_monthly_usage` | `rag_ingest_units`（互換合算）, `rag_html_free_units`, `rag_pdf_free_units`, `schedule_fetch_free_uses` |
| `subscriptions` | Stripe サブスク状態 |
| `processed_stripe_events` | webhook 冪等性 |

補足:

- `company_fetch` は選考スケジュール取得と企業 RAG 取込で共通。
- 監査上の区別は `description` や route 文脈で読む必要がある。
- 専用の credit history API / UI は現状ない。

## 8. 外部 provider の参考単価（一次情報）

確認日: **2026-04-03**  
円換算: **1 USD = 160 円**

### 8.1 OpenAI

コード上の対応:

- `gpt` -> `gpt-5.4`
- `gpt-fast` / `low-cost` -> `gpt-5.4-mini`
- `gpt-nano` -> `gpt-5.4-nano`

一次情報:

- https://developers.openai.com/api/docs/models/gpt-5.4

| モデル | Input | Cached input | Output |
|------|------:|------:|------:|
| GPT-5.4 | ¥400 / 1M tokens | ¥40 / 1M | ¥2,400 / 1M |
| GPT-5.4 mini | ¥120 / 1M tokens | ¥12 / 1M | ¥720 / 1M |
| GPT-5.4 nano | ¥32 / 1M tokens | ¥3.2 / 1M | ¥200 / 1M |

### 8.2 Anthropic

コード上の既定:

- `claude-sonnet` -> `claude-sonnet-4-6`

一次情報:

- https://www.anthropic.com/claude/sonnet

| モデル | Input | Output |
|------|------:|------:|
| Claude Sonnet 4.6 | ¥480 / 1M tokens | ¥2,400 / 1M |

### 8.3 Google Gemini

コード上の `gemini` alias は `settings.gemini_model` に解決され、既定値は `gemini-3.1-pro-preview`。  
一方、Google の現行公開 pricing page で直接確認しやすいのは `Gemini 2.5 Pro` の価格。

一次情報:

- https://ai.google.dev/gemini-api/docs/pricing

参考換算:

| 公開 pricing 上のモデル | 条件 | Input | Output |
|------|------|------:|------:|
| Gemini 2.5 Pro | 入力 200k tokens 以下 | ¥200 / 1M tokens | ¥1,600 / 1M |
| Gemini 2.5 Pro | 入力 200k tokens 超 | ¥400 / 1M tokens | ¥2,400 / 1M |

注:

- `gemini` 経路の ES クレジット表は `src/lib/credits/cost.ts` を正とする。
- Google 側の実請求単価は、実際に解決された model ID と Google の現行 pricing に依存する。

### 8.4 Google Document AI

コード上の役割:

- PDF OCR の primary route
- 選考スケジュール取得の OCR route

一次情報:

- https://cloud.google.com/document-ai/pricing?hl=ja

| 項目 | USD | 円換算 |
|------|------:|------:|
| Enterprise Document OCR Processor | $1.50 / 1,000 pages | ¥240 / 1,000 pages |
| OCR add-ons | $6 / 1,000 pages | ¥960 / 1,000 pages |

1 ページ換算:

- Enterprise Document OCR: **約 ¥0.24 / page**
- OCR add-ons: **約 ¥0.96 / page**
- Document AI の failed `4xx` / `5xx` リクエストは、公式 pricing 上は課金対象外。

### 8.5 Mistral OCR

コード上の役割:

- `mistral-ocr-latest` を high-accuracy fallback として利用

一次情報:

- https://docs.mistral.ai/models/ocr-3-25-12

参考換算:

| 公開 pricing 上のモデル | 単位 | 円換算 |
|------|------|------:|
| OCR 3 | $2 / 1,000 pages | ¥320 / 1,000 pages |
| OCR 3 Annotated Pages | $3 / 1,000 pages | ¥480 / 1,000 pages |

注:

- 現行実装は `mistral-ocr-latest` を呼ぶため、実請求は docs 上の最新 OCR モデル価格に追随する可能性がある。
- 上表は **2026-04-03 時点で公開されている OCR 3 の参考値**。
- ユーザー課金は provider 原価の pass-through ではなく、`src/lib/company-info/pricing.ts` の product pricing を正とする。

### 8.6 Firecrawl

コード上の役割:

- 選考スケジュール取得の主経路

一次情報:

- https://www.firecrawl.dev/pricing

注:

- Firecrawl の pricing はプラン / credits ベース。
- 就活Pass のコードは Firecrawl credits をユーザー向けクレジットへ直接変換していない。
- そのため本書では Firecrawl の「1 リクエストあたり何円」は固定値として載せない。

## 9. 要注意

- 志望動機 AI とガクチカ AI はどちらもログイン必須。
- 選考スケジュール取得は guest identity を解決するコードがあるが、現行 route は guest に 401 を返す。
- `motivation_draft` は実課金 6 に対し、成功 telemetry の `creditsUsed` は 2 で記録される箇所がある。運用ログだけで課金実績を判定しない。

## 10. 関連ファイル

- `src/lib/credits/index.ts`
- `src/lib/credits/cost.ts`
- `src/lib/company-info/pricing.ts`
- `src/lib/company-info/usage.ts`
- `src/lib/company-info/pdf-ingest-limits.ts`
- `src/lib/stripe/config.ts`
- `src/app/api/credits/route.ts`
- `src/hooks/useCredits.ts`
- `src/app/api/webhooks/stripe/route.ts`
- `src/app/api/documents/[id]/review/stream/route.ts`
- `src/app/api/gakuchika/[id]/conversation/stream/route.ts`
- `src/app/api/gakuchika/[id]/generate-es-draft/route.ts`
- `src/app/api/motivation/[companyId]/conversation/stream/route.ts`
- `src/app/api/motivation/[companyId]/generate-draft/route.ts`
- `src/app/api/motivation/[companyId]/generate-draft-direct/route.ts`
- `src/app/api/companies/[id]/interview/feedback/route.ts`
- `src/app/api/companies/[id]/fetch-info/route.ts`
- `src/app/api/companies/[id]/fetch-corporate/route.ts`
- `src/app/api/companies/[id]/fetch-corporate-upload/route.ts`
