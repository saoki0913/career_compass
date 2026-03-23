# 企業情報検索機能

採用ページから選考情報を抽出する機能と、コーポレートページをクロールして **RAG 用に蓄積する**機能を扱う。**選考スケジュール取得では RAG を構築しない**（抽出結果は締切等の DB 保存に用いるのみ）。

**参照実装**: `backend/app/routers/company_info.py`, `src/app/api/companies/[id]/fetch-info/route.ts`

---

## 1. 概要

| 項目 | 内容 |
|------|------|
| **選考スケジュール取得** | 採用ページから締切・選考情報を抽出 |
| **コーポレート情報取得** | ユーザーが選択した公開ページをクロールしてRAG保存 |
| **LLM** | 選考スケジュール抽出は `MODEL_SELECTION_SCHEDULE`（既定 `gpt-nano` → **GPT-5.4 nano**）、企業情報抽出は `MODEL_COMPANY_INFO`（既定 `gpt-fast`） |

### クレジット消費（選考スケジュール取得）

| 結果 | 条件 | 消費 |
|------|------|------|
| 完全成功 | 締切情報あり、**月次無料枠内** | 0クレジット（無料枠 1 回消費） |
| 完全成功 | 締切情報あり、無料枠外 | 1クレジット |
| 部分成功 | 締切なし、他データあり | 0クレジット |
| 失敗 | データなし | 0クレジット |

### プラン別制限

| プラン | 選考スケジュール | コーポレートページ |
|--------|-----------------|-------------------|
| guest | 利用不可（ログイン必須） | 利用不可 |
| free | 5回/月 | 3ソース + 月10ページ無料 |
| standard | 50回/月 | 100ソース + 月100ページ無料 |
| pro | 150回/月 | 500ソース + 月300ページ無料 |

### コーポレートRAG課金

- 月次無料枠は **URL クロールのページ数 + PDF のページ数**を合算してカウントする。
- 無料枠を先にページ数ぶん消費する。
- **URL**: 無料に載らなかった超過分は **1ページ = 1クレジット**。
- **PDF**: 文書ページ数の帯ごとに **固定クレジット**（無料枠で一部を消費してもティア額はフル課金）。ティアは `docs/features/CREDITS.md` §3.5。取込・課金に使うページ数は **実際に処理したページ**（プラン別上限で切り詰めた後）。上限は `docs/features/COMPANY_RAG.md` の表。
- API レスポンスは `actualUnits`（ページ）, `freeUnitsApplied`, `remainingFreeUnits`, `creditsConsumed`, `actualCreditsDeducted` を返す。

---

## 2. コンテンツタイプ（9種類）

企業情報を9つのカテゴリに分類。RAG検索時のブースト係数や、UI上の表示に使用。

| タイプ | 日本語ラベル | 典型的な内容 |
|-------|-------------|-------------|
| `new_grad_recruitment` | 新卒採用HP | 募集要項、選考フロー、エントリー情報 |
| `midcareer_recruitment` | 中途採用HP | 経験者向け職種、転職者向け情報 |
| `corporate_site` | 企業HP | 会社概要、沿革、事業内容、製品/サービス |
| `ir_materials` | IR資料 | 有価証券報告書、決算説明資料、統合報告書 |
| `ceo_message` | 社長メッセージ | トップメッセージ、社長挨拶 |
| `employee_interviews` | 社員インタビュー | 社員紹介、カルチャー記事、職種紹介 |
| `press_release` | プレスリリース | リリース本文、提携、受賞情報 |
| `csr_sustainability` | CSR/サステナ | サステナビリティ方針、ESGデータ |
| `midterm_plan` | 中期経営計画 | 中計資料、経営方針、KPI |

### コンテンツタイプの自動分類

`content_type`が指定されない場合、以下の順序で自動推定：

1. **URLパターン**: `/shinsotsu` → new_grad_recruitment, `/ir` → ir_materials 等
2. **キーワード**: 「新卒採用」「決算短信」等のテキストマッチング
3. **LLMフォールバック**: 上記で判定不可の場合、LLMで分類

**参照実装**: `backend/app/utils/content_classifier.py`

---

## 3. 選考スケジュール取得

### 処理フロー

```
1. 採用ページ検索
   POST /company-info/search-pages
   Hybrid検索を優先し、公式/trusted候補が得られない場合だけ Legacy 検索へフォールバック
   - プロフィールの卒業年度を初期値に使用
   - 公式候補 → trusted job site の順で優先
   - 親会社 / 子会社候補は表示するが、自動選択しない
         ↓
2. ユーザーがURL選択
         ↓
3. 情報抽出（選択した 1 URL のみ）
   POST /company-info/fetch-schedule
   ユーザーが選んだ URL の本文から構造化抽出（**別ページへの自動フォローは行わない**）
   - 取得元URLの relation / trusted job site / 年度一致を metadata 化
   - parent / subsidiary は confidence を low 上限に補正
   - trusted job site は medium 上限に補正
   - PDF の本文抽出に失敗した場合は OCR fallback のみ（同一リクエスト内）
         ↓
4. DB保存（非同期）
   - 締切 → deadlinesテーブル
   - 選考情報 → 検索・通知で使う構造化データ
         ↓
5. Google Calendar連携（オプション）
```

### LLM 失敗時の挙動（選考スケジュール・企業情報抽出）

- JSON がパースできない場合、`call_llm_with_error`（`backend/app/utils/llm.py`）は **同一モデルでの `max_tokens` 段階リトライは行わず**、**OpenAI キーがあるときは JSON 修復を 1 回**試す。選考スケジュール（`selection_schedule`）は **`gpt-nano`（GPT‑5.4 nano）**、それ以外は **`gpt-fast`（mini 相当）**（`REPAIR_JSON_OPENAI_MAX_TOKENS`、既定 1500）。OpenAI キーが無いときは従来どおり Claude（Sonnet）または同一プロバイダーで修復。解析理由だけで主経路を別プロバイダーへ自動フォールバックはしない。
- **課金不足（billing）・レート制限（rate_limit）・ネットワーク系（network）** のときは **別プロバイダーに自動切り替えしない**。
- **いずれの主プロバイダーでも**、API エラー時に **別プロバイダーへ自動切り替えしない**（`_feature_cross_fallback_model` は常に無効。エラーを返して UI の再試行に委ねる）。
- Next の [`fetch-info`](src/app/api/companies/[id]/fetch-info/route.ts) が FastAPI の `error_type` を解釈し、構造化エラーで返す（UI ではエラー用スナックバーで再試行を促す想定）。
- **API キー未設定（no_api_key）** もフォールバックせず、「管理者にお問い合わせください」系のメッセージを返す。
- 選考スケジュール抽出および企業情報一括抽出の初回 `max_tokens` はいずれも **1500**（選考は `SCHEDULE_LLM_MAX_OUTPUT_TOKENS`、フル抽出は `extract_info_with_llm` 呼び出し）。スキーマ上で締切・書類件数と文字列長を制限し、出力肥大を抑える。
- **極端に長い HTML 本文**（`SCHEDULE_EXTREME_PAGE_CHARS` 超）では、`_compress_schedule_page_text_for_llm` がキーワード行・日付らしい行・末尾付近だけをルールで切り出してから LLM に渡し、入力を通常 **≤4000 文字**に抑える（長大ページの先頭だけを送るフォールバックは使わない）。

### レート制限と abuse guard

- `search-pages` / `search-corporate-pages` / `source-compliance/check` は company search 系 limiter を使う。
- `fetch-info` は既存の `FETCH_INFO_RATE_LAYERS` を継続利用する。
- `fetch-corporate` / `fetch-corporate-upload` は corporate mutate limiter を使う。
- `delete-corporate-urls` は delete 専用 limiter を使う。
- `fetch-corporate` GET と `es-review-status` GET は polling limiter を使う。
- `source-compliance/check` は一度に 10 URL まで。超える場合は 400 を返す。
- 429 は `RATE_LIMITED` の構造化エラーで返し、`Retry-After` を付ける。

### 開発者向け: LLM トークン・概算コストログ

- **ユーザー向け UI や API レスポンスには含めない**（プロダクト上はクレジット／無料枠のみ表示）。
- FastAPI（`backend/app/utils/llm.py`）で `LLM_USAGE_COST_LOG=true` のとき、チャット系 LLM 呼び出しごとに `logger.info` で **1 行の開発者向けログ**を出す。共通キーは `event=llm_cost`。
  - 通常の 1 回呼び出し: `scope=call`（例: 構造化、テキスト、ストリーム、JSON 修復 `call_kind=json_repair`、PDF OCR `call_kind=pdf_ocr`）。
  - 選考スケジュール 1 リクエストの集計: `scope=request`・`call_kind=selection_schedule_request`（行頭に `[選考スケジュール抽出]`、`source_url` は先頭 120 文字程度）。
- **`ENVIRONMENT` によらず**、`LLM_USAGE_COST_LOG` のみで有効化できる。本番で ON にするとログ量が増えるため注意。
- 概算 **USD** はデフォルト単価カタログ（`gpt-5.4-mini` は公式 Standard / Short context: Input $0.75 / Cached $0.075 / Output $4.50 per 1M 等）と任意の `LLM_PRICE_OVERRIDES_JSON` で算出。カタログに無いモデルは `usage_status=unavailable_price` になりやすい。
- OpenAI mini の単価を環境変数で上書きする場合は **USD / 1M tokens** で次を設定（いずれか未設定ならカタログ値にフォールバック）:
  - `OPENAI_PRICE_GPT_5_4_MINI_INPUT_PER_MTOK_USD`
  - `OPENAI_PRICE_GPT_5_4_MINI_CACHED_INPUT_PER_MTOK_USD`（省略時は input 単価と同じ扱い）
  - `OPENAI_PRICE_GPT_5_4_MINI_OUTPUT_PER_MTOK_USD`
- ログに **概算円（`est_jpy`）** を付けるには `LLM_COST_USD_TO_JPY_RATE`（例: `155`）を **正の値で** 設定する。`est_usd` が算出できたときだけ `est_jpy=` が付く。実請求・為替とは一致しない。
- 単価の出典・改定: [OpenAI API Pricing](https://openai.com/api/pricing/)、[Anthropic Pricing](https://www.anthropic.com/pricing) 等。改定時はカタログまたは `LLM_PRICE_OVERRIDES_JSON` を更新する。

### 抽出項目

#### 3.1 締切情報（deadlines）

| フィールド | 説明 |
|-----------|------|
| type | es_submission, web_test, interview_1 等 |
| title | 「本エントリー締切」等 |
| due_date | 2024-06-01 |
| confidence | high / medium / low |

**締切タイプ一覧**:
- `es_submission` - ES提出
- `web_test` - Webテスト
- `aptitude_test` - 適性検査
- `interview_1/2/3/final` - 各面接
- `briefing` - 説明会
- `internship` - インターンシップ
- `offer_response` - 内定承諾
- `other` - その他

#### 3.2 その他の抽出項目

| 項目 | 内容 |
|------|------|
| required_documents | 提出物（ES、成績証明書等） |
| application_method | 応募方法（マイページからエントリー等） |
| selection_process | 選考フロー（ES → Webテスト → 面接等） |

### 日付推論ロジック

| 入力 | 出力 |
|------|------|
| 「6月上旬」 | 2024-06-01 |
| 「6月中旬」 | 2024-06-15 |
| 「6月下旬」 | 2024-06-25 |
| 「6月末」 | 2024-06-30 |
| 「随時」 | null |

### URL候補のスコアリング

| 要素 | スコア |
|------|--------|
| 企業名一致 | +10 |
| 採用キーワード（recruit, saiyo等） | +5 |
| 公式ドメイン | +3 |
| 卒業年度（2025, 2026等） | +2 |

**信頼度判定**:
- `high`: 対象企業の direct official ドメイン かつ 年度一致
- `medium`: direct official だが年度不一致、または trusted job site（マイナビ / リクナビ / ONE CAREER）
- `low`: 親会社 / 子会社 / その他

**補足**:
- 選考スケジュール抽出の confidence はバックエンドが最終決定し、Next.js 側では再補正しない
- 保存される `source_url` は、実際に締切を見つけたページ/PDF の URL

---

## 4. コーポレート情報検索

### 処理フロー

```
1. コンテンツタイプ選択（9種類から）
         ↓
2. ページ検索
   POST /company-info/search-corporate-pages
   DuckDuckGo「{企業名} {タイプラベル}」
         ↓
3. 3段階検索戦略
   ① 厳格: 企業名 + ドメイン一致必須
   ② 緩和: 結果 < 3件なら企業名マッチを緩和
   ③ フォールバック: 就活サイトも許可
         ↓
4. ユーザーがURL選択
         ↓
5. クロール & RAG保存
   POST /company-info/rag/crawl-corporate
   1秒間隔でページ取得 → チャンキング → ベクトル化
```

### コンテンツタイプと検索タイプの対応

| ContentType | SearchType | 検索クエリ例 |
|-------------|------------|-------------|
| new_grad_recruitment | about | 「NTTデータ 新卒採用HP」 |
| midcareer_recruitment | about | 「NTTデータ 中途採用HP」 |
| corporate_site | about | 「NTTデータ 会社概要」 |
| ir_materials | ir | 「NTTデータ IR資料」 |
| ceo_message | about | 「NTTデータ 社長メッセージ」 |
| employee_interviews | about | 「NTTデータ 社員インタビュー」 |
| press_release | about | 「NTTデータ プレスリリース」 |
| csr_sustainability | about | 「NTTデータ CSR」 |
| midterm_plan | ir | 「NTTデータ 中期経営計画」 |

### スコアリングアルゴリズム

| 項目 | スコア |
|------|--------|
| 企業名タイトル一致 | +3.0 |
| 企業名スニペット一致 | +2.0 |
| ドメインパターン一致 | +4.0 |
| TLD品質（.co.jp） | +1.5 |
| TLD品質（.jp） | +1.0 |
| 企業名不一致ペナルティ | -4.0 |

**除外対象**:
- ショッピングサイト、PDFビューア
- アグリゲーターサイト（設定による）
- Wikipedia、金融情報サイト等

**親会社/子会社ドメインの扱い**:
- 親会社/子会社ページは候補として残す
- ただし `sourceType` は `parent` / `subsidiary` のままで、`official` へ昇格させない
- `confidence` は `low` 上限。`official && high` の自動選択対象にはならない

### 短ドメイン許可リスト

3文字未満のドメインパターンは通常無視されるが、以下の企業は例外として許可:

```json
{
  "EY": ["ey"],
  "P&G": ["pg"],
  "エムスリー": ["m3"],
  "スタンダードチャータード銀行": ["sc"],
  "ドイツ銀行": ["db"],
  "日本HP": ["hp"]
}
```

**参照実装**: `backend/data/company_mappings.json` の `short_domain_allowlist`

### クエリエイリアス

英語名・ブランド名で検索精度を向上:

```python
COMPANY_QUERY_ALIASES = {
    "BCG": ["BCG", "Boston Consulting Group"],
    "PwC": ["PwC", "PricewaterhouseCoopers"],
    "P&G": ["P&G", "P&G Japan", "Procter & Gamble"],
    "NTTデータ": ["NTT DATA", "NTTData"],
    "三越伊勢丹": ["IMHDS", "IMHD"],
    ...
}
```

**参照実装**: `backend/app/utils/web_search.py` の `COMPANY_QUERY_ALIASES`

**参照実装**: `backend/app/routers/company_info.py` - `_score_corporate_candidate_with_breakdown()`

### 「該当するページが見つかりません」の対処

| 原因 | 対処法 |
|------|--------|
| 企業名フィルタ | 「条件を緩和して再検索」ボタン |
| スコア不足 | カスタム検索を使用 |
| グループ会社 | 関連会社候補として表示されるため、`親会社` / `子会社` ラベルを確認して選択 |

---

## 5. APIエンドポイント一覧

### 選考スケジュール取得

| エンドポイント | 説明 |
|---------------|------|
| `POST /company-info/search-pages` | 採用ページ候補を検索 |
| `POST /company-info/fetch-schedule` | URLから選考情報を抽出 |

### コーポレート情報取得

| エンドポイント | 説明 |
|---------------|------|
| `POST /company-info/search-corporate-pages` | コーポレートページ候補を検索 |
| `POST /company-info/rag/crawl-corporate` | ユーザーが選択したページをクロールしてRAG保存 |
| `POST /company-info/rag/{company_id}/delete-by-urls` | 登録済みURLを削除 |

### RAG管理

| エンドポイント | 説明 |
|---------------|------|
| `GET /company-info/rag/status/{company_id}` | 簡易ステータス |
| `GET /company-info/rag/status-detailed/{company_id}` | 詳細ステータス（タイプ別チャンク数） |
| `DELETE /company-info/rag/{company_id}` | RAGデータ全削除 |
| `DELETE /company-info/rag/{company_id}/{content_type}` | 特定タイプのみ削除 |

---

## 6. UI コンポーネント

### FetchInfoButton.tsx（選考スケジュール取得）

- モーダルは step を切り替えても同じ shell 幅を維持
- 卒業年度はプロフィール値を初期選択し、その場で変更可能
- URL候補リストから選択
- 信頼度バッジ（high=緑、medium=黄、low=灰）
- 親会社 / 子会社候補には relation ラベルを表示し、自動選択しない
- カスタムURL入力
- 進捗表示（「2/3 処理中...」）
- Google Calendar 追加失敗は「未連携 / 再連携必要 / 追加先未設定 / 一部失敗」を分けて表示

### CorporateInfoSection.tsx（コーポレート情報）

- コンテンツタイプ別の統計カード（9種類）
- URL検索・選択
- 登録済みURL一覧表示・削除

### DeadlineApprovalModal.tsx

- 抽出された締切一覧
- 信頼度「低」は初期チェックOFF
- 一括承認ボタン

---

## 7. 重要な仕様

1. **締切は未確認状態で保存**: `isConfirmed: false`、ユーザー承認が必要
2. **信頼度「低」は初期チェックOFF**: UI上で初期選択されない
3. **選考スケジュール取得では RAG を構築しない**: RAG はコーポレート情報取得でのみ保存する
4. **部分成功**: 締切なしでも他データがあれば0クレジットで保存する
5. **コーポレート取得の複数 URL**: ユーザーが選んだ URL を順次クロールし進捗を表示（選考スケジュールは 1 URL のみ）
6. **親子会社のラベルは relation-first**: `classify_company_domain_relation()` を source of truth とし、関連会社ページは `official` にしない
7. **URL自動選択は strict**: `official + high` だけを自動選択し、parent / subsidiary / job_site は手動選択のみ

---

## 8. 関連ファイル

| ファイル | 役割 |
|---------|------|
| `backend/app/routers/company_info.py` | FastAPIエンドポイント |
| `backend/app/utils/web_search.py` | 検索クエリ生成・スコアリング |
| `backend/app/utils/company_names.py` | ドメインパターンマッチング |
| `backend/app/utils/content_classifier.py` | コンテンツ自動分類 |
| `backend/app/utils/content_types.py` | コンテンツタイプ定義 |
| `backend/data/company_mappings.json` | ドメインパターン・許可リスト |
| `src/app/api/companies/[id]/fetch-info/route.ts` | Next.js API（選考スケジュール） |
| `src/app/api/companies/[id]/fetch-corporate/route.ts` | Next.js API（コーポレート情報） |
| `src/components/companies/FetchInfoButton.tsx` | 選考スケジュール取得UI |
| `src/components/companies/CorporateInfoSection.tsx` | コーポレート情報UI |

**RAG詳細**: `docs/features/COMPANY_RAG.md` を参照
