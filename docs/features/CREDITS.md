# クレジット・課金機能

Free / Standard / Pro プランに基づくクレジット管理と、Stripe 連携による決済。

## 1. 概要・参照実装

| 項目 | 内容 |
|------|------|
| **プラン** | Guest / Free / Standard / Pro（課金は Free 以外） |
| **課金方式** | 月額サブスクリプション（Stripe） |
| **クレジット** | 月次付与 + 消費制（**成功時のみ消費**） |
| **リセット** | JST（`Asia/Tokyo`）基準の月次リセット |
| **無料枠** | 選考スケジュール・企業 RAG は**月次**（JST 暦月。RAG はページ合算）。面接対策は月次無料枠なし |
| **Free の API 原価目標** | 同一ユーザーのヘビー利用シナリオでも、**概ね 500 円/月以内**（API・埋め込みの粗利確保の設計目標。実測で外れ値はありうる） |

**参照実装**

- `src/lib/credits/index.ts` — `PLAN_CREDITS`、残高・付与・消費・予約
- `src/lib/credits/cost.ts` — ES 添削 `calculateESReviewCost`
- `src/lib/company-info/pricing.ts` — 選考スケジュール月次無料回数、RAG 月次無料ページ、PDF ティア課金（`calculatePdfIngestCredits`）
- `src/lib/company-info/pdf-ingest-limits.ts` — PDF 取込・OCR のプラン別ページ上限（`GET /api/credits` の `ragPdfLimits` と同期）
- `src/lib/company-info/usage.ts` — 月次 RAG / 選考スケジュール無料枠の消費とクレジット徴収
- `src/lib/stripe/config.ts` — 価格 ID 等（表示用の月額は参考。クレジット数値は `PLAN_CREDITS` が正）
- `src/app/api/credits/route.ts` — 残高・`monthlyFree.selectionSchedule`・`monthlyFree.companyRagPages`

**換算レート（ドキュメント採算用）**: 本書の円額はすべて **`1 USD = 160 円`**（固定・実勢や手数料は含めない）。

---

## 2. プラン別に使える機能

| 機能 | Guest | Free | Standard | Pro |
|------|-------|------|----------|-----|
| 月次クレジット | 0 | 30 | **100** | **300** |
| ES 添削 | 不可 | 可（ログイン・クレジット） | 可 | 可 |
| セクション添削 | 不可 | 可 | 可 | 可 |
| 企業 RAG | 不可 | 可 | 可 | 可 |
| ガクチカ素材数 | 2（AI 不可） | 3 | 10 | 20 |
| 面接対策 | 不可 | 可（最終講評成功時 6 クレジット） | 可（最終講評成功時 6 クレジット） | 可（最終講評成功時 6 クレジット） |
| 選考スケジュール取得（月次無料） | 不可 | **5 回/月** | 50 回/月 | **150 回/月** |
| 企業 RAG 取込（月次無料ページ） | 不可 | **10** | **100** | **300** |
| 1 社あたり RAG ソース上限 | — | **3** | 100 | 500 |
| ES 添削モデル | — | **GPT-5.4 mini 固定**（`low-cost` 経路）。**課金プランでは Claude / GPT / Gemini 等を選択可** | 選択可 | 選択可 |
| 面接対策モデル | — | **GPT-5.4 mini 固定** | **GPT-5.4 mini 固定** | **GPT-5.4 mini 固定** |

- 月次クレジットの付与量は `PLAN_CREDITS`（`src/lib/credits/index.ts`）。リセット時は残高を `monthlyAllocation` に**置き換え**（繰り越しなし）。
- **Free の ES 添削**: 実体モデルは **GPT-5.4 mini**（バックエンドは `llm_model=low-cost`）。**請求クレジットは Standard / Pro でプレミアムモデルを選んだ場合と同じ表**（〜500 字で 6、〜1000 で 10 …）。`calculateESReviewCost(charCount, _, { userPlan: "free" })` と `src/app/api/documents/[id]/review/stream/route.ts` で強制。
- 選考スケジュールは無料枠外で **1 クレジット/回**（ログインのみ）。
- 面接の質問フローは **GPT-5.4 mini 固定**。**最終講評だけ Claude Sonnet 4.6** を使い、**最終講評成功時に 6 クレジット**消費する。月次無料枠はない。
- 企業 RAG の無料枠超過は後述（URL は超過ページ **1 ページ=1 クレジット**、PDF はページ数帯の固定クレジット）。

---

## 3. AI 機能ごとの「1 回あたりのコスト（円）」目安

前提はいずれも **キャッシュなし・やや長めの入出力** の上限寄り。実測は Usage / Telemetry で再評価する。

### 3.1 プロバイダ単価（円 / 百万トークン、×160）

出典: 各社公式 pricing（OpenAI / Anthropic / Google）。

| モデル | Input（円/MTok） | Output（円/MTok） | メモ |
|--------|------------------|-------------------|------|
| GPT-5.4 | 400 | 2,400 | ES 高品質系 |
| GPT-5.4 mini | 120 | 720 | ガクチカ・志望動機の**会話**、企業情報、**RAG のクエリ拡張・HyDE** 既定、選考以外の JSON 修復 |
| GPT-5.4 nano | 32 | 200 | 選考スケジュール、**RAG コンテンツ分類**（`model_rag_classify`。**RAG 補助 LLM で nano 既定は分類のみ**） |
| Claude Sonnet 4.6（Base I/O のみ想定） | 480 | 2,400 | |
| Gemini 3.1 Pro（20 万トークン未満入力帯） | 320 | 1,920 | |

### 3.2 ES 添削（1 回・5 ラウンド想定: 入力 8k / 出力 2k ×5）

| 系統 | 粗い原価（円/回） |
|------|-------------------|
| GPT-5.4 | 約 40 |
| GPT-5.4 mini（low-cost） | 約 12 |
| Claude Sonnet | 約 43 |
| Gemini 3.1 Pro | 約 32 |

**プロバイダ切替**: `backend/app/utils/llm.py` では **Anthropic → OpenAI への自動フォールバックは行わない**（同一プロバイダー内のリトライ・JSON 修復と、クライアントの再試行に任せる）。

**請求クレジット**（`src/lib/credits/cost.ts`）

| モデル区分 | 〜500 | 〜1000 | 〜1500 | 1501〜 |
|------------|-------|--------|--------|--------|
| Claude / GPT / Gemini | 6 | 10 | 14 | 20 |
| low-cost（Standard / Pro でユーザーが選択した場合） | 3 | 6 | 9 | 12 |
| **Free プランの ES**（実体は mini・上と同じクレジット表を適用） | **6** | **10** | **14** | **20** |

### 3.3 ガクチカ・志望動機・面接対策（会話・下書き）

- **会話**: `model_gakuchika` / `model_motivation` / `model_interview`（既定 **`gpt-fast` = GPT-5.4 mini**）。`call_llm_with_error` の feature は `gakuchika` / `motivation` / `interview`。
- **下書き**: `model_gakuchika_draft` / `model_motivation_draft`（既定 **`claude-sonnet` = Claude Sonnet 4.6**）。feature は `gakuchika_draft` / `motivation_draft`。
- 会話: ユーザー回答（ガクチカ）または新規質問（志望動機）が **5 回につき 3 クレジット**。実装上は **各回答のたびに next 質問（または評価）を 1 回ストリーミング生成**するため、**5 回分で mini の LLM が最大 5 回**（コンテキストが伸びるほどトークンも増える）。
- 下書き生成: **6 クレジット/回**（`reserveCredits`）。主経路が Sonnet のため **1 回あたりの API 原価は会話 1 回分の mini より高い**が、6CR に分散する。
- 面接対策:
  - 会話フェーズは課金しない
  - 最終講評は `interview_feedback` として **6 クレジット/回**
  - `reserveCredits` → 成功時 `confirmReservation` → 失敗時 `cancelReservation`

**API 原価のオーダー（§3.1 ×160、キャッシュなし・中程度トークン想定）**

| 区分 | トークン想定（ざっくり） | 粗い原価（円） |
|------|--------------------------|----------------|
| 会話・**課金バッチ**（5 回答＝ next 生成×5・mini） | 各回 入力 ~6k / 出力 ~1.5k 前後 | **約 8〜22 / バッチ**（履歴が長いと上振れ） |
| 会話・単発（参考: next 1 回だけ） | 入力 ~6k / 出力 ~1.5k・mini | 約 1.5〜4 |
| 下書き 1 回 | 入力 ~8k / 出力 ~2k・Sonnet | 約 8〜18 |
| 面接対策・質問フロー | 入力 ~6k / 出力 ~2k 前後・mini | **約 10〜20 / セッション** |
| 面接対策・最終講評 | 入力 ~8k / 出力 ~2k 前後・Sonnet | **約 8〜18 / 回** |

### 3.4 選考スケジュール取得

- 主経路: 通常の採用サイト HTML は **`Firecrawl`** を優先利用して抽出する。
- OCR: `Firecrawl` の結果から **PDF / OCR 必要** と判断された場合のみ、**`Google Document AI (Enterprise Document OCR)`** を **1 回だけ**追加で利用する。
- LLM 正規化: OCR 結果や `Firecrawl` 失敗時の fallback では、**`model_selection_schedule` = `gpt-nano`**（**GPT-5.4 nano**）を使う。JSON 修復も同一ティア（`gpt-nano`）で最大 1 回。
- 取得範囲: ユーザーが指定した URL を基点にしつつ、`Firecrawl` 経路では **募集要項 / entry / recruit / PDF** 系の follow-link を **最大 1 件**だけ追加取得する場合がある。
- 無料枠内: **0 クレジット**。無料枠外: **1 クレジット/回**。
- **課金ルール**: 内部で `Firecrawl` や `Google Document AI` を使っても、**ユーザー向け課金は変わらない**。無料枠外は引き続き **1 回 = 1 クレジット**。
- **収益設計の目安**: 有料時は 1 クレジット徴収と対になるよう、通常ケースは `Firecrawl` 単独、重いケースでも `Google OCR 1 回まで` に抑え、原価上振れを制御する構成とする。
- **極端に長いページ**: `company_info.py` の `_compress_schedule_page_text_for_llm` が、キーワード行・日付らしい行・末尾付近だけをルールベースで切り出し、LLM 入力を通常 **≤4000 文字**（極長閾値は `SCHEDULE_EXTREME_PAGE_CHARS`）に抑える。先頭数万文字だけを送るフォールバックは使わない。
- OpenAI のトークン単価や概算コストは **ユーザー画面では表示しない**。

### 3.5 企業 RAG 取込

- **月次無料枠**: URL クロールのページ数と PDF の **`page_count`（実際に取り込んだページ数）** を**合算**してカウント（**Free 10** / Standard **100** / Pro **300** ページ/月）。PDF はプラン別の**取込ページ上限**で先頭から切り詰めたうえで `page_count` が確定する（Free **24** / Standard **72** / Pro **120** ページ/ファイル。OCR だけさらに厳しい上限あり。詳細は `docs/features/COMPANY_RAG.md`）。
- **クレジット課金**: URL の超過ページ（**1 ページ=1 クレジット**）および PDF の**処理後ページ数**に対するページ数帯（下表）。

#### 3.5.1 RAG 検索時の裏側コスト（取込とは別）

ES 添削などで **既に取り込んだコーパスを検索**するときは `backend/app/utils/hybrid_search.py` の `dense_hybrid_search` が使われる。**埋め込み API**は、元クエリのベクトルに加え、追加で走る各クエリ（拡張・HyDE 仮想文書）ごとに呼ばれうる。

| 処理 | 内容 |
|------|------|
| **初回セマンティック検索** | 常に 1 回（結果が空なら終了） |
| **ショートサーキット** | `short_circuit=true`（既定）かつ `_should_short_circuit_search` が真なら、**クエリ拡張・HyDE・BM25 併合・再ランキングをスキップ**（以降の LLM・追加 embedding なし） |
| **クエリ拡張（LLM）** | ショートサーキットしなかった場合のみ。`expand_queries=true` かつ `max_queries>0` かつクエリ長 **5〜1200 文字**。`model_rag_query_expansion`（既定 **gpt-fast** = GPT-5.4 mini）。**10 文字未満**は軽量プロンプトの別経路 |
| **HyDE（LLM）** | 同上。`rag_use_hyde=true`（既定）かつ検索プロファイルが HyDE 許可かつクエリ長 **600 文字以下**。`model_rag_hyde`（既定 **gpt-fast**）。HyDE 有効時は拡張クエリを最大 2 件に制限 |
| **BM25** | `rag_keyword_weight > 0` のときローカル索引でキーワード検索（LLM ではない） |
| **再ランキング** | **LLM ではない**。`sentence-transformers` の **cross-encoder**（`backend/app/utils/reranker.py`）。`_should_rerank` により「すでに自信あり」「極端に低スコア」ではスキップ |

**取り込み時（別経路）**: チャンクの `content_type` 推定は `model_rag_classify`（既定 **gpt-nano**）。ルールベースで決まる場合は LLM を呼ばない。

`hybrid_search_company_context_enhanced`（`vector_store.py`）はクエリ内容に応じて `infer_retrieval_profile` で `max_queries` / `use_hyde` / `rerank_threshold` 等を上書きしうる。

- **無料枠を超えた URL 取込**: その取込で無料に載らなかったページ数ぶん **1 ページ = 1 クレジット**。
- **PDF**: 取込ごとに文書ページ数の**上限帯で固定クレジット**（無料枠で一部ページを消費してもティア額はフル課金）。

| ページ数（上限比較） | クレジット |
|----------------------|------------|
| ≤1 | 1 |
| ≤2 | 2 |
| ≤5 | 3 |
| ≤10 | 6 |
| ≤20 | 12 |
| ≤40 | 24 |
| ≤60 | 36 |
| ≤80 | 48 |
| ≤100 | 60 |
| 101 ページ以上 | 72 |

**処理後ページがプラン上限ちょうどのときのティア（1 ファイルあたりの請求上限の目安）**

| プラン | 取込上限（ページ） | そのページ数でのティア | 請求クレジット（無料枠外・1 ファイル） |
|--------|-------------------|------------------------|----------------------------------------|
| Free | 24 | ≤40 | **24** |
| Standard | 72 | ≤80 | **48** |
| Pro | 120 | 101 以上帯（上限 120 のため実質この帯） | **72** |

無料枠内に収まる場合はクレジット 0（ティア額は月次ページから先に相殺したあとも**フル課金**のまま。§2 脚注どおり）。

- **実行前の表示**: 企業情報モーダルで PDF を選ぶと、ブラウザ上でページ数を読み取り、**上限切り詰め後**の見込みページ・月次無料枠の充当見込み・ティア合計クレジットの見込みを表示する（読み取れない PDF は取り込み完了時に確定）。

---

## 4. 全 AI 機能の「1 クレジットあたり原価（円）」一覧（オーダー）

§3.2 の **1 回あたり原価 ÷ 請求クレジット** の上限寄り目安。  
ただし、**企業 RAG 取込の PDF OCR と embedding の実測合算は別管理**であり、下表だけで月額原価を確定させることはできない。

| 区分 | 請求クレジット | 約 円 / 1 credit |
|------|----------------|------------------|
| Claude / GPT / Gemini（ES） | 6〜20 | 約 2〜7 |
| low-cost（ES・mini・有料プランで選択時） | 3〜12 | 約 1〜4 |
| **Free の ES**（mini 実行・クレジットは上のプレミアム帯） | 6〜20 | **API は mini（§3.2 の約 12 円/回オーダー）÷ 請求 6〜20 → 約 0.6〜2 円/credit** |
| 選考スケジュール（有料時） | 1 | 無料時 0。通常は `Firecrawl` 単独、重いケースだけ `Google OCR` を 1 回追加。ユーザー向けは 1 回 = 1 クレジットのまま |
| ガクチカ・志望動機（会話） | 3 / 5 往復 | §3.3 の **バッチ原価（約 8〜22 円）÷3** → **約 2.5〜8 円/credit** |
| 下書き生成 | 6 | §3.3 の下書き原価（約 8〜18 円）÷6 → **約 1.3〜3 円/credit** |
| 面接対策 | 5 / セッション完了 | §3.3 の **面接対策原価（約 10〜20 円）÷5** → **約 2〜4 円/credit** |
| RAG URL 超過 | 1 / ページ | 埋め込み・ページ長で変動。URL 取込は主に embedding コスト |
| RAG PDF | ティア（§3.5 表・**処理後ページ**） | 1 ファイルあたりの取込・OCR ページはプラン上限で**上振れにキャップ**（`COMPANY_RAG.md`）。OCR は **Google Document AI** を既定に、難しい PDF だけ **Mistral OCR** に昇格するため、原価は provider とページ密度で変動 |

---

## 5. プラン別収支（概算・1 ユーザーあたり月間）

### 5.1 まず結論

- **Free は赤字前提**。ただし無料枠を小さくし、ES を `GPT-5.4 mini` 固定にすることで、通常のヘビー利用でも API 原価を抑える設計。
- **Standard / Pro は、クレジット起因の既知コストだけを見ると直ちに大赤字ではない**。
- 企業 RAG の PDF は **取込・OCR ページ上限**で 1 ファイルあたりの外れ値は抑えやすくなったが、**スキャン PDF の比率**や **embedding 総量**でまだブレうるため、**月額原価の厳密な上限は断定しない**。

### 5.2 既知コストだけで見たレンジ目安（RAG 取込を除く）

ここでいう **既知コスト** は、次を含む。

- クレジット消費に紐づく LLM 実行
- 選考スケジュール取得の `Firecrawl` / `Google OCR` / nano 正規化

ここでいう **未確定要素** は、次を含む。

- 企業 RAG URL 取込の embedding 総量
- 企業 RAG PDF 取込時の OCR（**Google Document AI** 既定、必要時のみ **Mistral OCR**。取込・OCR ページ上限でキャップ済みでも、ページあたりの画像密度で変動）
- プロンプトキャッシュ有無、再試行、ページ長のばらつき

下表の円額は **RAG 取込（embedding・分類・OCR 等）を含まない**。実際の月次原価は **表のレンジ + RAG 取込分**。

| プラン | 月額売上（円・税抜目安） | 月間選考スケジュール無料（回） | 月次 RAG 無料（ページ） | 月次クレジット | 既知コスト（円/月・RAG 除く） | 判断 |
|--------|--------------------------|--------------------------------|-------------------------|----------------|------------------------------|------|
| Guest | 0 | 0 | 0 | 0 | 0 | 0 |
| Free | 0 | **5** | **10** | **30** | **約 35〜275** | 赤字前提 |
| Standard | **1,480** | 50 | **100** | **100** | **約 250〜950** | 通常は売上内に収まるが、RAG 次第 |
| Pro | **2,980** | **150** | **300** | **300** | **約 750〜2,850** | 通常は売上内に収まるが、RAG 次第 |

### 5.3 表 5.2 の計算手順

前提: 月次クレジットを**期末までにすべて消費**し、選考スケジュールは**無料枠だけ**使う。§4 の **1 クレジットあたり原価（円）** のレンジをプラン別に乗算する。

1. **選考スケジュール無料分**（§3.4、**約 3 円/回**）  
   - Free: 5 × 3 = **15 円**  
   - Standard: 50 × 3 = **150 円**  
   - Pro: 150 × 3 = **450 円**

2. **月次クレジット分**（§4 のレンジをプラン別に乗算）  
   - **Free（30 CR）**  
     - Free ES（請求はプレミアム帯・API は mini）: **約 0.6〜2 円/CR** → 30 × 0.6〜30 × 2 = **約 18〜60 円**  
     - 会話系に全振り: **約 2.5〜8 円/CR** → **約 75〜240 円**  
     - いずれか一方に偏る極端ケースを合成すると、クレジット部分は **約 18〜240 円**  
   - **Standard（100 CR）**  
     - 理論上の広い箱: ES プレミアム **約 2〜7**、low-cost **約 1〜4**、会話 **約 2.5〜8**（いずれも円/CR）  
     - **単一路線で使い切る**ときの合成: 最小は low-cost 下限 **100 × 1 = 100 円**、最大は会話上限 **100 × 8 = 800 円** → **約 100〜800 円**  
   - **Pro（300 CR）**  
     - 同様に **約 300〜2,400 円**（300 × 1〜300 × 8 の箱）

3. **表 5.2 への丸め**（1. + 2. を合算）  
   - Free: 15 + 18〜15 + 240 = **33〜255 円** → 読みやすく **約 35〜275 円**  
   - Standard: 150 + 100〜150 + 800 = **250〜950 円**  
   - Pro: 450 + 300〜450 + 2400 = **750〜2,850 円**

**注**: Standard / Pro で「ES プレミアム帯の下限 **約 2 円/CR** だけ」を仮定すると、Pro のクレジット部分は **約 600 円**となり、選考と合わせて **約 1,050 円**からになる。表の **750 円**は **low-cost ES の下限 1 円/CR**（§4）を使い切った理論最小に対応する。

### 5.4 RAG 取込が不確定要素である理由

- URL 取込は、取得ページ数だけでなく **実際の本文長と chunk 数**で embedding 原価が変わる。
- PDF 取込は、`pypdf` で本文が弱い場合に **Google Document AI** で OCR し、その結果が弱い大型 PDF だけ **Mistral OCR** に昇格する（同期・タイムアウトあり）。プラン別に **取込ページ上限** と **OCR ページ上限** があり、超過分は先頭から切り詰め。詳細は `docs/features/COMPANY_RAG.md`。
- したがって、**RAG 無料ページ数が同じでも、URL 中心か PDF 中心かで原価差が大きい**。

### 5.4a 選考スケジュール取得の原価変動要因

- 選考スケジュール取得は、ユーザー向けには **無料枠外 1 回 = 1 クレジット** の固定課金だが、内部原価は取得元の形式で変動する。
- 通常の採用ページ HTML は **`Firecrawl`** を主経路として処理する。
- `Firecrawl` の抽出結果から **OCR が必要** と判断された場合のみ、**`Google Document AI (Enterprise Document OCR)`** を **1 回だけ**追加で利用する。
- したがって、同じ「1 回の選考スケジュール取得」でも、**HTML だけで完了するケース**と**OCR を伴うケース**では内部原価が異なる。
- ただし原価の上振れを抑えるため、follow-link は最大 1 件、Google OCR も最大 1 回に制限する。

### 5.5 現時点の収支判断

- **Free**: 赤字許容の獲得導線として妥当。
- **Standard**: 現行の `¥1,480` に対して、**既知コストだけならまだ余地がある**。ただし PDF OCR が重いユーザーは赤字化しうる。
- **Pro**: 現行の `¥2,980` に対して、**既知コストだけなら大きな余地はない**。RAG の PDF 比率が高いと赤字化リスクがある。

今後 `Firecrawl` を選考スケジュール取得の主経路に採用すると、内部原価は従来の nano 単独構成より上がる可能性がある。一方で、OCR は **`Google Document AI` を最大 1 回**に制限するため、PDF / 画像埋め込みケースの原価上振れは一定範囲に抑える前提とする。収支判断は provider 別の実測ログを揃えたうえで再評価する。

売上は `src/lib/stripe/config.ts` の月額表示（**Standard ¥1,480** / Pro ¥2,980）基準。年額 Standard は **¥14,980**（`ANNUAL_PLAN_PRICES.standard`）。  
今後の原価判断は、`internal_telemetry.est_jpy_total` と embedding / OCR の別集計を揃えたうえで再評価する。なお、現状の下書き生成 API は telemetry の `creditsUsed` が実課金 6 ではなく 2 で記録されているため、**ログ集計だけで 1 credit 原価を判断しないこと**。

---

## 6. ビジネスルール

### 成功時のみ消費（予約 → 確定 / 返金）

ES 添削ストリームは **予約 → 確定 / 返金**。

```
POST /api/documents/[id]/review/stream
  → reserveCredits()
  → SSE 完了で confirmReservation()
  → 異常終了で cancelReservation()
```

### 月次リセット（クレジット）

JST で月が変われば `balance` を `monthlyAllocation` にリセット（`src/lib/credits/index.ts`）。

### 月次無料（選考スケジュール）

`company_info_monthly_usage.schedule_fetch_free_uses`（JST `YYYY-MM` の `month_key` と対）で、当月に無料枠として消費した**選考スケジュール取得の回数**を管理。ログインユーザーのみ（ゲストは取得 API 不可）。

### 月次無料（企業 RAG）

`company_info_monthly_usage.rag_ingest_units` は **当月消化ページ数**（列名は互換のため `rag_ingest_units`）。`rag_overflow_units` は現行では使用せず **0**。

---

## 7. Stripe 連携

### チェックアウト

`POST /api/stripe/checkout` → Checkout → `checkout.session.completed` でサブスク・クレジット初期化。

### カスタマーポータル

`POST /api/stripe/portal`

### 主な Webhook

| イベント | 処理 |
|----------|------|
| `checkout.session.completed` | 開始・クレジット付与 |
| `customer.subscription.updated` | 実際の price 変更時のみプラン反映・クレジット再計算 |
| `customer.subscription.deleted` | 終了・Free へ |
| `invoice.payment_succeeded` | ステータス復帰のみ |
| `invoice.payment_failed` | 失敗通知 |

`processedStripeEvents` で冪等性を担保。

---

## 8. 関連 DB・API・主要ファイル

### クレジットを消費する機能

| 機能 | `creditTransactions.type` | クレジット |
|------|---------------------------|------------|
| ES 添削 | `es_review` | §3.2 表 |
| 選考スケジュール（無料枠外） | `company_fetch` | 1 / 回 |
| 企業 RAG（無料枠外） | `company_fetch` | URL: 超過ページ数、PDF: ティア |
| ガクチカ会話 | `gakuchika` | 5 回答ごとに 3 |
| ガクチカ下書き | `gakuchika_draft` | 6 |
| 志望動機会話 | `motivation` | 新規質問 5 回ごとに 3 |
| 志望動機下書き | `motivation_draft` | 6 |

**注**: 選考スケジュール取得は内部的に `Firecrawl` や `Google Document AI` を利用する場合があるが、`creditTransactions.type` とユーザー向けクレジット消費量は変わらない。

### `GET /api/credits` 応答（抜粋）

- `monthlyFree.selectionSchedule` — 選考スケジュールの月次無料の残り / 上限（**回**）
- `monthlyFree.companyRagPages` — RAG 月次無料の残り / 上限（**ページ**）

### 主要テーブル

| テーブル | 役割 |
|----------|------|
| `credits` | 残高・月次付与量 |
| `creditTransactions` | 監査ログ |
| `subscriptions` | Stripe サブスク |
| `companyInfoMonthlyUsage` | `rag_ingest_units`（RAG ページ）、`schedule_fetch_free_uses`（選考無料回数） |

### その他

| ファイル | 役割 |
|----------|------|
| `src/app/pricing/page.tsx` | 料金ページ |
| `src/app/api/webhooks/stripe/route.ts` | Webhook |
| `src/lib/rate-limit.ts` / `rate-limit-spike.ts` | review / conversation / draft / company-info 系の高コスト API に対する分散・二層レート制限 |

---

## 関連ドキュメント

- `docs/features/ES_REVIEW.md` — ES 添削フロー
- `docs/features/COMPANY_INFO_FETCH.md` — 企業情報・選考スケジュール
- `docs/features/COMPANY_RAG.md` — RAG 取込の技術面
