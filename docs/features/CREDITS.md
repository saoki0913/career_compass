# クレジット・課金機能

就活Pass のクレジット、月次無料枠、Stripe 連携、AI 機能ごとの消費ルールをまとめる。

## 入口

実装を正本とし、外部 provider の単価は公式 pricing を参照。円換算はすべて `**1 USD = 160 円**` 固定。

## 仕様

### 1. 正本


| 項目                         | 正本                                                                 |
| -------------------------- | ------------------------------------------------------------------ |
| クレジット残高・月次リセット・予約/確定/取消    | `src/lib/credits/index.ts`                                         |
| ES 添削のクレジット表               | `src/lib/credits/cost.ts`                                          |
| 選考スケジュール月次無料回数             | `src/lib/company-info/pricing.ts`                                  |
| 企業 RAG 月次無料ページ・PDF tier 課金 | `src/lib/company-info/pricing.ts`, `src/lib/company-info/usage.ts` |
| PDF 取込 / OCR ページ上限         | `src/lib/company-info/pdf-ingest-limits.ts`                        |
| プラン料金・Stripe price ID      | `src/lib/stripe/config.ts`                                         |
| Stripe 反映                  | `src/app/api/webhooks/stripe/route.ts`                             |
| DB 台帳                      | `src/lib/db/schema.ts`                                             |
| クレジット API                  | `src/app/api/credits/route.ts`                                     |
| クレジット表示 hook               | `src/hooks/useCredits.ts`                                          |


### 2. プランと月次配分

#### 2.1 プラン料金

`src/lib/stripe/config.ts` の現行表示値。


| プラン      | 月額     | 年額      | 月次クレジット |
| -------- | ------ | ------- | ------- |
| Guest    | ¥0     | —       | 0       |
| Free     | ¥0     | —       | 50      |
| Standard | ¥1,490 | ¥14,900 | 350     |
| Pro      | ¥2,980 | ¥29,800 | 750     |


#### 2.2 プラン差分


| 項目                         | Guest | Free    | Standard  | Pro      |
| -------------------------- | ----- | ------- | --------- | -------- |
| ガクチカ素材数上限                  | 2     | 5       | 15        | 30       |
| 選考スケジュール取得の月次無料回数          | 0     | 10      | 100       | 200      |
| 企業 RAG URL/HTML の月次無料ページ   | 0     | 20      | 200       | 500      |
| 企業 RAG PDF の月次無料ページ        | 0     | 60      | 250       | 600      |
| 1 社あたり RAG ソース上限           | 0     | 3       | 200       | 500      |
| PDF 取込上限（1 ファイル）           | 0     | 20 ページ  | 100 ページ   | 200 ページ  |
| PDF Google OCR 上限（1 ファイル）  | 0     | 5 ページ   | 50 ページ    | 100 ページ  |
| PDF Mistral OCR 上限（1 ファイル） | 0     | 0 ページ   | 15 ページ    | 30 ページ   |


補足:

- 月次クレジットの正本は `PLAN_CREDITS`。
- ガクチカ素材数上限は `PLAN_METADATA.gakuchika` を `src/app/api/gakuchika/route.ts` で実際に enforce している。
- `PLAN_METADATA.esReviews` は表示用ヒントであり、回数の hard limit ではない。

### 3. 共通ルール

#### 3.1 成功時のみ消費

クレジットは原則として **成功時のみ消費** する。

- 長時間処理は `reserveCredits()` で仮押さえし、成功時に `confirmReservation()`、失敗時に `cancelReservation()`。
- 会話系や軽量 API は成功時に `consumeCredits()`。

#### 3.2 月次リセット

月次リセットは JST 基準。
ただし月初バッチではなく、`getCreditsInfo()` 呼び出し時に JST の月跨ぎを検知して遅延実行する。

- 繰り越しはしない
- `balance` は `monthlyAllocation` に置き換わる
- `nextResetAt` は JST 月初境界から計算する

#### 3.3 プラン変更

Stripe webhook でプランが確定すると `updatePlanAllocation()` が走る。

- upgrade / downgrade / 解約のいずれでも `monthlyAllocation` は新プラン値に更新
- `balance` も新プラン値に即時リセット
- `credit_transactions.type = "plan_change"` を記録

#### 3.4 予約取消と `refund`

`TransactionType` には `refund` があるが、現行の予約取消では別の `refund` transaction を追加していない。
`cancelReservation()` は、元の予約 transaction の description を `[Cancelled/Refunded] ...` に更新し、残高を戻す。

### 4. 機能別の課金ルール

#### 4.1 一覧


| 機能            | 利用条件   | 課金ルール                                                                                                      | TransactionType      |
| ------------- | ------ | ---------------------------------------------------------------------------------------------------------- | -------------------- |
| ES 添削         | ログイン必須 | 予約 -> 成功確定 / 失敗取消                                                                                          | `es_review`          |
| ガクチカ会話        | ログイン必須 | 1 ターン 1 credit を成功時消費                                                                                      | `gakuchika`          |
| ガクチカ ES 下書き   | ログイン必須 | 6 credits を予約 -> 成功確定 / 失敗取消                                                                               | `gakuchika_draft`    |
| 志望動機会話        | ログイン必須 | 1 ターン 1 credit を成功時消費                                                                                      | `motivation`         |
| 志望動機 ES 下書き   | ログイン必須 | 6 credits を予約 -> 成功確定 / 失敗取消（対話後 `generate-draft` と会話なし `generate-draft-direct` の両方で同一 `motivation_draft`） | `motivation_draft`   |
| 面接会話          | ログイン必須 | 1 ターン 1 credit を成功時消費                                                                                      | `interview`          |
| 面接最終講評        | ログイン必須 | 6 credits を予約 -> 成功確定 / 失敗取消                                                                               | `interview_feedback` |
| 選考スケジュール取得    | ログイン必須 | 月次無料枠を先に消費。超過後は 1 回 1 credit                                                                               | `company_fetch`      |
| 企業 RAG URL 取込 | ログイン必須 | 月次無料ページを先に消費。超過ページは 1 ページ 1 credit                                                                         | `company_fetch`      |
| 企業 RAG PDF 取込 | ログイン必須 | PDF 無料枠内は 0 credits。超過時だけ PDF tier 課金                                                                      | `company_fetch`      |


#### 4.2 ES 添削

`src/lib/credits/cost.ts` が正本。

**プレミアム帯**


| 文字数   | クレジット |
| ----- | ----- |
| 〜500  | 6     |
| 〜1000 | 10    |
| 〜1500 | 14    |
| 1501〜 | 20    |


**low-cost 帯**


| 文字数   | クレジット |
| ----- | ----- |
| 〜500  | 3     |
| 〜1000 | 6     |
| 〜1500 | 9     |
| 1501〜 | 12    |


補足:

- `claude-sonnet` / `gpt` / `gemini` はプレミアム帯。
- `low-cost` は low-cost 帯。
- **Free プランは実行モデルが low-cost（実装上は `gpt-mini` / `gpt-5.4-mini`）でも、請求クレジットはプレミアム帯**。
- ES 添削 route は document の owner が guest でも、最終的にログイン必須。

#### 4.3 ガクチカ・志望動機

- 会話:
  - ガクチカ: 1 ターン 1 credit
  - 志望動機: 1 ターン 1 credit
  - どちらも `consumeCredits()` で成功時のみ消費
- 下書き:
  - ガクチカ ES 下書き: 6 credits
  - 志望動機 ES 下書き: 6 credits（対話ベースとプロフィールのみの直生成で共通）
  - どちらも `reserve -> confirm/cancel`

#### 4.4 面接対策

- 面接対策全体がログイン必須
- 質問フロー（start → stream → continue）: 1 ターン 1 credit を `consumeCredits()` で成功時のみ消費
- 最終講評: 6 credits（`reserve -> confirm/cancel`）

### 5. 選考スケジュール取得と企業 RAG

#### 5.1 選考スケジュール取得

- ログイン必須。guest は route で 401
- 月次無料枠:
  - Free 10 回
  - Standard 100 回
  - Pro 200 回
- 無料枠を使い切った後は 1 回 1 credit
- 成功時のみ `incrementMonthlyScheduleFreeUse()` または `consumeCredits()` を実行

#### 5.2 企業 RAG URL 取込

- URL/HTML 専用の月次無料ページ枠を先に消費
- 無料枠を超えたページだけ `1 ページ = 1 credit`
- 取込 route は `applyCompanyRagUsage()` を通す

#### 5.3 企業 RAG PDF 取込

PDF は URL と別の無料枠を持ち、**無料枠内なら 0 credits**。


| PDF 超過ページ数 | クレジット |
| ---------- | ----- |
| 1〜20       | 2     |
| 21〜60      | 6     |
| 61〜120     | 12    |


補足:

- `page_count` は「実際に処理したページ数」。
- 取込前にプラン上限で先頭ページに切り詰める。
- PDF 本文はページ単位で `local / Google OCR / Mistral OCR` を混在させる。
- route 応答では `freeUnitsApplied`, `creditsConsumed`, `actualCreditsDeducted`, `processingNoticeJa`, `pageRoutingSummary` を返す。

### 6. `/api/credits` と UI 表示

#### 6.1 `/api/credits`

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

#### 6.2 `useCredits`

`src/hooks/useCredits.ts` には guest fallback として `balance: 12` / `monthlyAllocation: 12` がある。
これは **UI fallback** であり、`/api/credits` の正本ではない。

hook では `selectionScheduleRemaining` / `selectionScheduleLimit` を返し、実体は `selectionSchedule` の **月次**無料枠。

### 7. 監査ログと台帳

#### 7.1 `TransactionType`

- `monthly_grant`
- `plan_change`
- `company_fetch`
- `es_review`
- `gakuchika`
- `gakuchika_draft`
- `motivation`
- `motivation_draft`
- `interview`
- `interview_feedback`
- `refund`

#### 7.2 主なテーブル


| テーブル                         | 用途                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------- |
| `credits`                    | 残高と月次配分                                                                                     |
| `credit_transactions`        | クレジット監査ログ                                                                                   |
| `company_info_monthly_usage` | `rag_ingest_units`, `rag_html_free_units`, `rag_pdf_free_units`, `schedule_fetch_free_uses` |
| `subscriptions`              | Stripe サブスク状態                                                                               |
| `processed_stripe_events`    | webhook 冪等性                                                                                 |


補足:

- `company_fetch` は選考スケジュール取得と企業 RAG 取込で共通。
- 監査上の区別は `description` や route 文脈で読む必要がある。

## 技術メモ

### 機能別デフォルトモデル

alias → feature 対応の正本: `backend/app/config.py:172-189`
alias → 実モデル ID 解決の正本: `backend/app/config.py:126-162`


| 機能       | alias           | 実モデル ID             | 表示名               |
| -------- | --------------- | ------------------- | ----------------- |
| ES 添削    | `claude-sonnet` | `claude-sonnet-4-6` | Claude Sonnet 4.6 |
| ガクチカ会話   | `gpt-mini`      | `gpt-5.4-mini`      | GPT-5.4 mini      |
| ガクチカ下書き  | `claude-sonnet` | `claude-sonnet-4-6` | Claude Sonnet 4.6 |
| 志望動機会話   | `gpt-mini`      | `gpt-5.4-mini`      | GPT-5.4 mini      |
| 志望動機下書き  | `claude-sonnet` | `claude-sonnet-4-6` | Claude Sonnet 4.6 |
| 面接質問     | `gpt-mini`      | `gpt-5.4-mini`      | GPT-5.4 mini      |
| 面接講評     | `claude-sonnet` | `claude-sonnet-4-6` | Claude Sonnet 4.6 |
| 選考スケジュール | `gpt-mini`      | `gpt-5.4-mini`      | GPT-5.4 mini      |


ES 添削はユーザーがモデルを選択可能（`claude-sonnet` / `gpt` / `gemini` / `low-cost`）。他の機能はサーバー側で固定。

### 外部 provider の参考単価（一次情報）

確認日: **2026-04-09**
円換算: **1 USD = 160 円**
内部価格カタログ正本: `backend/app/utils/llm_usage_cost.py:19-50`


| Provider  | モデル                    | Input (¥/1M) | Output (¥/1M) | 確認日        |
| --------- | ---------------------- | ------------ | ------------- | ---------- |
| OpenAI    | GPT-5.4                | ¥400         | ¥2,400        | 2026-04-03 |
| OpenAI    | GPT-5.4 mini           | ¥120         | ¥720          | 2026-04-03 |
| OpenAI    | GPT-5.4 nano           | ¥32          | ¥200          | 2026-04-03 |
| Anthropic | Claude Sonnet 4.6      | ¥480         | ¥2,400        | 2026-04-03 |
| Google    | Gemini 3.1 Pro Preview | ¥320         | ¥1,920        | 2026-04-09 |
| Google    | Document AI OCR        | ¥0.24/page   | —             | 2026-04-03 |
| Mistral   | OCR 3                  | ¥0.32/page   | —             | 2026-04-03 |


補足:

- コード上の alias:
  - `gpt` → `gpt-5.4`
  - `gpt-mini` / `low-cost` → `gpt-5.4-mini`
  - `gpt-nano` → `gpt-5.4-nano`
  - `claude-sonnet` → `claude-sonnet-4-6`
  - `gemini` → `gemini-3.1-pro-preview`
- OpenAI cached input: GPT-5.4 ¥40/1M, GPT-5.4 mini ¥12/1M, GPT-5.4 nano ¥3.2/1M
- OpenAI ES 添削では `max_output_tokens` を最低 4096 に設定している（`es_review_retry.py:41`）が、これは上限設定であり実際の課金は生成トークン分のみ。ES rewrite は常に `reasoning_effort="none"`（reasoning tokens = 0）で実行される。可視出力は 500-700 tok/call 程度
- Google Document AI の OCR add-ons: ¥0.96/page
- Mistral OCR 3 Annotated Pages: ¥0.48/page
- ユーザー課金は provider 原価の pass-through ではなく、`src/lib/company-info/pricing.ts` と `src/lib/credits/cost.ts` の product pricing を正とする。

### 要注意

- 志望動機 AI とガクチカ AI はどちらもログイン必須。
- 選考スケジュール取得は guest identity を解決するコードがあるが、現行 route は guest に 401 を返す。
- `motivation_draft` は実課金 6 に対し、成功 telemetry の `creditsUsed` は 2 で記録される箇所がある。運用ログだけで課金実績を判定しない。

## 収益性分析

### 前提

- 円換算: 1 USD = 160 円
- 価格カタログ正本: `backend/app/utils/llm_usage_cost.py:19-50`
- ES 添削: 最大 4 回 LLM 呼び出し（`REWRITE_MAX_ATTEMPTS=3` + length-fix 1 回）
- OpenAI ES 添削の `_OPENAI_ES_REVIEW_OUTPUT_TOKEN_FLOOR=4096` は `max_output_tokens` の下限設定。ES rewrite は `reasoning_effort="none"` のため reasoning tokens = 0 であり、実際の出力課金は生成トークン（~500-700 tok/call）のみ
- 会話系（ガクチカ・志望動機・面接）は conversation_history を累積送信するため、後半ほど入力トークンが増大する:
  - ガクチカ 5 回答: 初回 ~1,500 tok → 5 回目 ~4,000 tok（累計入力 ~13,000 tok）
  - 志望動機 5 回答: 同上（累計入力 ~13,000 tok）
  - 面接 1 セッション（20 ターン）: 初回 ~2,000 tok → 20 回目 ~12,000 tok（累計入力 ~140,000 tok）
- 全会話系機能は 1 ターン 1 credit を消費する。面接もクレジット消費対象

### 1 操作あたり API コスト見積（worst-case）


| 機能                               | モデル               | API コスト（worst） | クレジット消費 | 1 cr あたりコスト |
| -------------------------------- | ----------------- | -------------- | ------- | ----------- |
| ES 添削（Claude, 1500+字, 4call）    | Claude Sonnet 4.6 | ~¥22           | 20      | ~¥1.1       |
| ES 添削（GPT, 1500+字, 4call）       | GPT-5.4           | ~¥20           | 20      | ~¥1.0       |
| ES 添削（Gemini, 1500+字, 4call）    | Gemini 3.1 Pro    | ~¥20           | 20      | ~¥1.0       |
| ES 添削（low-cost, 1500+字, 4call）  | GPT-5.4 mini      | ~¥6            | 12      | ~¥0.5       |
| ガクチカ会話（1ターン, 累積 history）        | GPT-5.4 mini      | ~¥0.6          | 1       | ~¥0.6       |
| ガクチカ下書き                         | Claude Sonnet 4.6 | ~¥5            | 6       | ~¥0.8       |
| 志望動機会話（1ターン, 累積 history）        | GPT-5.4 mini      | ~¥0.6          | 1       | ~¥0.6       |
| 志望動機下書き                         | Claude Sonnet 4.6 | ~¥5            | 6       | ~¥0.8       |
| 面接会話（1ターン, 累積 history）          | GPT-5.4 mini      | ~¥1.3          | 1       | ~¥1.3       |
| 面接講評                            | Claude Sonnet 4.6 | ~¥6            | 6       | ~¥1.0       |
| 選考スケジュール取得                      | GPT-5.4 mini      | ~¥0.5          | 1（超過時）  | ~¥0.5       |

面接会話の 1 cr あたりコストが高いのは、会話履歴の累積により後半ターンの入力トークンが増大するため。

### プラン別 収益 vs 最大コスト

総コストは「クレジット消費分の API コスト + 月次無料枠の API コスト」の合計。
無料枠はクレジットを消費しないが、選考スケジュール取得（~¥0.5/回）と PDF OCR（¥0.24-0.32/ページ）に実コストが発生する。

前提:
- クレジットコスト基準: ES 添削中心 ¥1.1/cr（Claude Sonnet 4.6 worst-case）
- PDF OCR 率: 保守的に 25%（Google 20% + Mistral 5%）→ blended ¥0.07/ページ


| プラン         | 月額収益     | 総コスト（全枠消費、¥1.1/cr、25% OCR）   | 粗利           | 粗利率    |
| ----------- | -------- | ----------------------------- | ------------ | ------ |
| Free        | ¥0       | ~¥64（50cr ¥55 + 無料枠 ¥9）       | **-¥64**     | —      |
| Standard 月額 | ¥1,490   | ~¥454（350cr ¥385 + 無料枠 ¥69）   | **¥1,036**   | 69.5%  |
| Standard 年額 | ¥1,242/月 | ~¥454                         | **¥788**     | 63.5%  |
| Pro 月額      | ¥2,980   | ~¥970（750cr ¥825 + 無料枠 ¥145）  | **¥2,010**   | 67.4%  |
| Pro 年額      | ¥2,483/月 | ~¥970                         | **¥1,513**   | 60.9%  |


### 結論

1. **全有料プランで粗利 60% 以上**。年額ベース最低 60.9%（Pro 年額）
2. **総コストにはクレジット消費 + 無料枠 API コストを含む**。選考スケジュール取得（¥0.5/回 × 100-200 回）が無料枠コストの主要因
3. **Free プランは意図的 loss leader**。月 ~¥64 の損失（許容 -¥100 以内）

## 関連ドキュメント

- `src/lib/credits/index.ts`
- `src/lib/credits/cost.ts`
- `src/lib/company-info/pricing.ts`
- `src/lib/company-info/usage.ts`
- `src/lib/company-info/pdf-ingest-limits.ts`
- `src/lib/stripe/config.ts`
- `src/app/api/credits/route.ts`
- `src/hooks/useCredits.ts`
- `src/app/api/webhooks/stripe/route.ts`

