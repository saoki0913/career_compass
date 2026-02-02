# AI選考スケジュール取得機能 & コーポレート情報取得

採用ページURLから締切・選考情報をAIで自動抽出し、DBに保存する機能。
加えて、企業のIR・事業紹介ページをクロールしてRAG用に蓄積する機能も提供。

**参照実装**: `backend/app/routers/company_info.py`, `src/app/api/companies/[id]/fetch-info/route.ts`

---

## 1. 概要

| 項目 | 内容 |
|------|------|
| **目的** | 採用ページから選考情報（締切/提出物/応募方法/選考プロセス）を抽出 |
| **LLM** | OpenAI GPT（環境変数 `OPENAI_COMPANY_INFO_MODEL` で設定、デフォルト: gpt-5-mini） |
| **用途** | 応募締切の自動検出・管理、選考フロー情報の収集 |

### 機能一覧

| 機能 | 説明 | 対象ユーザー |
|------|------|-------------|
| **選考スケジュール取得** | 採用ページから締切・選考情報を抽出 | 全ユーザー |
| **コーポレート情報取得** | IR・事業紹介ページをクロールしてRAG構築 | 登録ユーザーのみ |

### 成功判定とクレジット消費（選考スケジュール取得）

| 結果 | 条件 | クレジット消費 |
|------|------|---------------|
| 完全成功 | 締切情報あり | 1クレジット |
| 部分成功 | 締切なし、他データあり | 0.5クレジット |
| 失敗 | データなし | 0クレジット |

**無料枠**:
- ゲスト: 1回/日
- 登録ユーザー: 3回/日

### コーポレート情報取得のプラン制限

| プラン | ページ上限 |
|--------|-----------|
| guest | 0（利用不可） |
| free | 10ページ |
| standard | 50ページ |
| pro | 150ページ |

---

## 2. エンドツーエンドの流れ

### 2.1 選考スケジュール取得フロー

```
┌─────────────────────────────────────────────────────────────┐
│  Step 1: 採用ページ検索                                      │
│  POST /company-info/search-pages                            │
│  - DuckDuckGoで「{企業名} 新卒採用」検索                      │
│  - 候補URL 5-10件を信頼度付きで返却                          │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  ユーザー操作: 候補URLから複数選択（または手動入力）           │
│  - 複数URL選択可能（チェックボックス）                        │
│  - カスタムURL入力も可能                                     │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 2: 情報抽出（複数URL順次処理）                          │
│  POST /company-info/fetch-schedule（URLごと）                │
│  - HTMLをフェッチ → BeautifulSoupでテキスト抽出             │
│  - GPT-5-miniで構造化データ抽出                             │
│  - 進捗をリアルタイム表示（1/3完了など）                      │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 3: データ保存 (Next.js API)                            │
│  - 締切情報 → deadlinesテーブルに保存                        │
│  - 企業の recruitmentUrl, infoFetchedAt 更新                │
│  - クレジット消費（成功時のみ）                              │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 4: RAG構築（自動・非同期）                             │
│  → 詳細は docs/COMPANY_RAG.md を参照                        │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 5: Google Calendar連携（オプション）                   │
│  - ユーザーがカレンダー連携済みの場合                         │
│  - 抽出した締切を自動でカレンダーに追加                       │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 コーポレート情報取得フロー

```
┌─────────────────────────────────────────────────────────────┐
│  Step 1: コーポレートページ検索                               │
│  POST /company-info/search-corporate-pages                  │
│  - DuckDuckGoで「{企業名} IR」「{企業名} 事業紹介」検索        │
│  - 企業公式ドメイン優先のスコアリング                         │
│  - 3段階検索戦略（厳格→緩和→フォールバック）                  │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  ユーザー操作: コンテンツタイプ選択 → URL選択                  │
│  - 9種類のコンテンツタイプから選択                            │
│  - プラン上限内でURL選択                                     │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 2: クロール & RAG構築                                  │
│  POST /company-info/rag/crawl-corporate                     │
│  - 1秒間隔でページ取得（レート制限）                          │
│  - HTMLテキスト抽出 → チャンキング → ベクトル化               │
│  - content_type メタデータ付与                               │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 3: 登録URL管理                                         │
│  - corporateInfoUrls JSONフィールドに保存                    │
│  - UI上で登録済みURL一覧表示・削除可能                        │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. 抽出項目

### 3.1 締切情報（deadlines）

| フィールド | 説明 | 例 |
|-----------|------|-----|
| type | 締切タイプ | es_submission, web_test, interview_1 等 |
| title | タイトル | 「本エントリー締切」 |
| due_date | 期日 | 2024-06-01 |
| confidence | 信頼度 | high / medium / low |

**締切タイプ一覧**:
| タイプ | 説明 |
|-------|------|
| `es_submission` | ES提出 |
| `web_test` | Webテスト |
| `aptitude_test` | 適性検査 |
| `interview_1` | 一次面接 |
| `interview_2` | 二次面接 |
| `interview_3` | 三次面接 |
| `interview_final` | 最終面接 |
| `briefing` | 説明会 |
| `internship` | インターンシップ |
| `offer_response` | 内定承諾 |
| `other` | その他 |

### 3.2 提出物（required_documents）

| フィールド | 説明 | 例 |
|-----------|------|-----|
| name | 書類名 | 「エントリーシート」「成績証明書」 |
| required | 必須か | true / false |
| source_url | 根拠URL | https://... |
| confidence | 信頼度 | high / medium / low |

### 3.3 応募方法（application_method）

| フィールド | 説明 | 例 |
|-----------|------|-----|
| value | 応募方法 | 「マイページからエントリー」 |
| source_url | 根拠URL | https://... |
| confidence | 信頼度 | high / medium / low |

### 3.4 選考プロセス（selection_process）

| フィールド | 説明 | 例 |
|-----------|------|-----|
| value | 選考フロー | 「ES → Webテスト → 面接3回 → 内定」 |
| source_url | 根拠URL | https://... |
| confidence | 信頼度 | high / medium / low |

---

## 4. APIエンドポイント

### 4.1 採用ページ検索

**`POST /company-info/search-pages`**

DuckDuckGo検索を使い採用ページ候補を返却

**リクエスト**:
```json
{
  "company_name": "株式会社〇〇",
  "industry": "IT・通信",
  "custom_query": null
}
```

**レスポンス**:
```json
{
  "candidates": [
    {
      "url": "https://example.com/recruit",
      "title": "〇〇株式会社 新卒採用",
      "snippet": "2025年度新卒採用...",
      "confidence": "high"
    }
  ]
}
```

**信頼度判定基準**:
- `high`: 企業公式ドメイン + recruitパスを含む
- `medium`: 就活サイト（リクナビ、マイナビ等）
- `low`: その他

**URLスコアリングアルゴリズム**:
| 要素 | スコア加算 |
|------|-----------|
| 企業名一致 | +10 |
| 採用キーワード（recruit, saiyo, career等） | +5 |
| 公式ドメイン | +3 |
| 卒業年度（2025, 2026等） | +2 |

**制限**: 最大15件（`max_results`パラメータで指定可能、上限15）

### 4.2 情報抽出

**`POST /company-info/fetch-schedule`**

URLから選考情報を抽出

**リクエスト**:
```json
{
  "url": "https://example.com/recruit"
}
```

**レスポンス**:
```json
{
  "success": true,
  "partial_success": false,
  "data": {
    "deadlines": [...],
    "required_documents": [...],
    "application_method": {...},
    "selection_process": {...}
  },
  "source_url": "https://example.com/recruit",
  "extracted_at": "2024-01-15T10:00:00Z",
  "deadlines_found": true,
  "other_items_found": true,
  "raw_text": "...",
  "raw_html": "..."
}
```

**注意**:
- `raw_text`/`raw_html`: RAGパイプライン用に提供（nullable）
- HTMLテキスト抽出は最大15,000文字に制限

### 4.3 コーポレートページ検索

**`POST /company-info/search-corporate-pages`**

IR・事業紹介ページの候補を検索

**リクエスト**:
```json
{
  "company_name": "株式会社〇〇",
  "preferred_domain": "example.com",
  "search_type": "ir" | "business" | "about"
}
```

**レスポンス**:
```json
{
  "candidates": [
    {
      "url": "https://example.com/ir",
      "title": "IR情報｜株式会社〇〇",
      "snippet": "投資家の皆様へ...",
      "confidence": "high"
    }
  ]
}
```

**3段階検索戦略**:
1. **厳格マッチ**: 企業名 + ドメイン一致必須
2. **緩和マッチ**: 結果が3件未満の場合、企業名マッチを緩和
3. **フォールバック**: それでも少ない場合、就活サイト（マイナビ等）も許可

#### 4.3.1 コンテンツタイプ別検索ロジック

UIで選択可能な9種類のコンテンツタイプと、それぞれの検索ロジック。

**コンテンツタイプとSearchTypeのマッピング**:

| ContentType | 日本語ラベル | SearchType | 備考 |
|-------------|-------------|------------|------|
| `new_grad_recruitment` | 新卒採用HP | `about` | 採用関連全般 |
| `midcareer_recruitment` | 中途採用HP | `about` | 採用関連全般 |
| `corporate_site` | 会社概要 | `about` | 企業情報全般 |
| `ir_materials` | IR資料 | `ir` | 投資家向け情報 |
| `ceo_message` | 社長メッセージ | `about` | 企業情報全般 |
| `employee_interviews` | 社員インタビュー | `about` | 採用関連全般 |
| `press_release` | プレスリリース | `about` | 企業情報全般 |
| `csr_sustainability` | CSR/サステナ | `about` | 企業情報全般 |
| `midterm_plan` | 中期経営計画 | `ir` | 投資家向け情報 |

**参照実装**: `src/components/companies/CorporateInfoSection.tsx` - `CONTENT_TYPE_TO_SEARCH_TYPE`

#### 4.3.2 検索クエリ構築

UIでコンテンツタイプを選択すると、以下のクエリが自動生成される:

```
クエリ = "{企業名} {コンテンツタイプラベル}"

例:
- 新卒採用HP → "NTTデータ 新卒採用HP"
- IR資料 → "NTTデータ IR資料"
- 社長メッセージ → "NTTデータ 社長メッセージ"
```

**SearchType別のフォールバッククエリ**:

`customQuery`が指定されない場合のデフォルトクエリ:

| SearchType | 検索クエリ（DuckDuckGo） |
|------------|-------------------------|
| `ir` | `{企業名} IR`, `{企業名} 投資家情報`, `{企業名} 決算説明資料` |
| `business` | `{企業名} 事業内容`, `{企業名} 事業紹介`, `{企業名} 製品 サービス` |
| `about` | `{企業名} 会社概要`, `{企業名} 企業情報`, `{企業名} 会社案内` |

**参照実装**: `backend/app/routers/company_info.py` - `_build_corporate_queries()`

#### 4.3.3 検索フロー図

```
┌─────────────────────────────────────────────────────────────────────┐
│ Step 1: コンテンツタイプ選択                                          │
│   - UIで9種類から選択（例: IR資料）                                   │
│   - ContentType → SearchType に変換（ir_materials → ir）            │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ Step 2: 検索クエリ生成                                               │
│   - query = "{企業名} {ラベル}" （例: "NTTデータ IR資料"）            │
│   - preferred_domain があれば site: 演算子を追加                      │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ Step 3: DuckDuckGo検索                                              │
│   - 各クエリで最大8件取得                                            │
│   - 非同期でWeb検索実行                                              │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ Step 4: スコアリング                                                 │
│   - 企業名タイトル一致: +3.0pt                                       │
│   - 企業名スニペット一致: +2.0pt                                     │
│   - ドメインパターン一致: +4.0pt（company_mappings.jsonから）         │
│   - TLD品質: +1.5pt (.co.jp), +1.0pt (.jp)                          │
│   - 企業名不一致ペナルティ: -4.0pt                                   │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ Step 5: フィルタリング                                               │
│   - 最低スコア（CORP_SEARCH_MIN_SCORE）未満を除外                    │
│   - 不適切なサイト（ショッピング、PDFビューア等）を除外               │
│   - 子会社サイトを除外                                               │
│   - 企業名がタイトル/URLに含まれない結果を除外                        │
│     ※ allowSnippetMatch=true の場合はスニペットも許可               │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ Step 6: 3段階検索戦略                                                │
│   1. 厳格マッチ: 企業名 + ドメイン一致必須                           │
│   2. 緩和マッチ: 結果が3件未満の場合、企業名マッチを緩和             │
│   3. フォールバック: 就活サイト（マイナビ等）も許可                   │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ Step 7: 結果返却                                                     │
│   - source_type: official / job_site / other                        │
│   - confidence: high / medium / low                                 │
│   - 最大10件を返却                                                   │
└─────────────────────────────────────────────────────────────────────┘
```

#### 4.3.4 スコアリングアルゴリズム

**`_score_corporate_candidate_with_breakdown()` のスコア計算**:

| 項目 | スコア | 条件 |
|------|--------|------|
| 企業名タイトル一致 | +3.0 | 正規化された企業名がタイトルに含まれる |
| 企業名スニペット一致 | +2.0 | 正規化された企業名がスニペットに含まれる |
| ドメインパターン一致 | +4.0 | `company_mappings.json` のドメインパターンがURLに含まれる |
| ASCII名一致 | +3.0 | ドメインパターン不一致時、ASCII変換名がドメインに含まれる |
| TLD品質（.co.jp） | +1.5 | ドメインが .co.jp で終わる |
| TLD品質（.jp） | +1.0 | ドメインが .jp で終わる |
| 企業名不一致ペナルティ | -4.0 | タイトル/スニペット/ドメインいずれにも企業名が含まれない |

**除外条件**:
- 除外ドメインリスト（`_is_excluded_url`）
- 無効なURL形式
- アグリゲーターサイト（`allow_aggregators=false` の場合）
- 厳格モードでの企業名不一致（`strict_company_match=true`）

**参照実装**: `backend/app/routers/company_info.py` - `_score_corporate_candidate_with_breakdown()`

#### 4.3.5 「該当するページが見つかりませんでした」の原因と対処法

検索結果が0件になる主な原因:

| 原因 | 説明 | 対処法 |
|------|------|--------|
| 企業名フィルタ | タイトル/URLに企業名が含まれない | 「条件を緩和して再検索」ボタン |
| スコア不足 | 公式ドメインでない + キーワードなし | カスタム検索を使用 |
| Web検索0件 | DuckDuckGoが結果を返さなかった | カスタムURL入力 |
| グループ会社 | 親会社サイトに情報が集約 | 親会社名で検索 |

**「条件を緩和して再検索」ボタン**:
- `allowSnippetMatch=true` で再検索
- スニペット内の企業名マッチも許可
- タイトルに企業名がないページも拾える

### 4.4 コーポレートページクロール

**`POST /company-info/rag/crawl-corporate`**

コーポレートページをクロールしてRAG構築

**リクエスト**:
```json
{
  "company_id": "uuid",
  "company_name": "株式会社〇〇",
  "urls": [
    "https://example.com/ir",
    "https://example.com/about"
  ],
  "content_type": "ir_materials"
}
```

**レスポンス**:
```json
{
  "success": true,
  "pages_crawled": 2,
  "chunks_stored": 25,
  "errors": []
}
```

**特徴**:
- 1秒間隔でページ取得（レート制限）
- URLごとにエラーハンドリング
- content_type メタデータ自動付与

### 4.5 コーポレートURL削除

**`POST /company-info/rag/{company_id}/delete-by-urls`**

登録済みURLとそのRAGチャンクを削除

**リクエスト**:
```json
{
  "urls": [
    "https://example.com/ir"
  ]
}
```

**レスポンス**:
```json
{
  "success": true,
  "deleted": {
    "https://example.com/ir": 15
  }
}
```

### 4.6 RAGステータス詳細

**`GET /company-info/rag/status-detailed/{company_id}`**

コンテンツタイプ別のRAGチャンク数を取得

**レスポンス**:
```json
{
  "company_id": "uuid",
  "has_rag": true,
  "total_chunks": 50,
  "new_grad_recruitment_chunks": 10,
  "midcareer_recruitment_chunks": 5,
  "corporate_site_chunks": 10,
  "ir_materials_chunks": 12,
  "ceo_message_chunks": 3,
  "employee_interviews_chunks": 5,
  "press_release_chunks": 2,
  "csr_sustainability_chunks": 1,
  "midterm_plan_chunks": 2,
  "last_updated": "2024-01-15T10:00:00Z"
}
```

---

> 互換用の旧エンドポイント: **`POST /company-info/fetch`**
> 旧APIは内部で `/fetch-schedule` に委譲され、同じレスポンス構造を返します。

## 5. 日付推論ロジック

曖昧な日付表現を具体的な日付に変換：

| 入力 | 出力 |
|------|------|
| 「6月上旬」 | 2024-06-01 |
| 「6月中旬」 | 2024-06-15 |
| 「6月下旬」 | 2024-06-25 |
| 「6月末」 | 2024-06-30 |
| 「随時」 | null（遠い将来の日付をプレースホルダーとして設定） |

---

## 6. エラーハンドリング

| エラー | メッセージ |
|-------|----------|
| 接続エラー | 「URLに接続できませんでした」 |
| タイムアウト | 「URLの取得がタイムアウトしました」 |
| 404 | 「指定されたページが見つかりませんでした」 |
| 403 | 「ページへのアクセスが拒否されました」 |
| 抽出失敗 | 「情報を抽出できませんでした」 |
| プラン上限 | 「プランの上限に達しました」 |

---

## 7. 重要な仕様

1. **締切は未確認状態で保存**: `isConfirmed: false` で保存され、ユーザーの承認が必要
2. **信頼度「低」は初期チェックOFF**: UIで締切承認時、信頼度が低いものは初期状態でチェックが外れている
3. **RAG構築は自動トリガー**: 情報取得成功時、非同期でRAG構築も実行される（詳細は `docs/COMPANY_RAG.md` 参照）
4. **部分成功の処理**: 締切なしでも他のデータ（提出物、応募方法等）がある場合は部分成功として0.5クレジット消費
5. **複数URL順次処理**: 複数URLを選択した場合、1つずつ順次処理し進捗を表示

---

## 8. Next.js API統合

### 8.1 選考スケジュール取得

`src/app/api/companies/[id]/fetch-info/route.ts` での処理フロー：

1. **認証チェック**: ユーザー/ゲストの識別
2. **無料枠チェック**: ゲスト1回/日、登録ユーザー3回/日
3. **FastAPI呼び出し**: `/company-info/fetch-schedule` を呼び出し
4. **結果に応じた処理**:
   - 完全成功（締切あり）: 1クレジット消費
   - 部分成功（締切なし、他データあり）: 0.5クレジット消費
   - 失敗: クレジット消費なし
5. **DB保存**: 締切情報を `deadlines` テーブルに保存
6. **RAGトリガー**: 成功時に非同期でRAG構築を開始

### 8.2 コーポレート情報取得

`src/app/api/companies/[id]/fetch-corporate/route.ts` での処理フロー：

1. **認証チェック**: ユーザーのみ（ゲスト不可）
2. **プラン上限チェック**: guest=0, free=10, standard=50, pro=150
3. **FastAPI呼び出し**: `/company-info/rag/crawl-corporate` を呼び出し
4. **DB更新**: `corporateInfoUrls` JSONフィールドに追加
5. **レスポンス**: クロール結果（pages_crawled, chunks_stored）を返却

### 8.3 コーポレートURL削除

`src/app/api/companies/[id]/delete-corporate-urls/route.ts` での処理フロー：

1. **認証チェック**: ユーザーのみ
2. **FastAPI呼び出し**: `/rag/{company_id}/delete-by-urls` を呼び出し
3. **DB更新**: `corporateInfoUrls` から削除したURLを除外
4. **レスポンス**: 削除結果を返却

---

## 9. フロントエンドコンポーネント

### 9.1 FetchInfoButton.tsx

選考スケジュール取得のメインUIコンポーネント

**主な機能**:
- `handleSearchPages()`: DuckDuckGo検索で候補URL取得
- `handleConfirmUrl()`: 複数URL順次処理（進捗表示付き）
- `addDeadlinesToGoogleCalendar()`: 抽出した締切をカレンダーに追加

**UI要素**:
| 要素 | 説明 |
|------|------|
| URL候補リスト | チェックボックスで複数選択可能 |
| 信頼度バッジ | high=緑、medium=黄、low=灰 |
| カスタムURL入力 | 手動でURL追加可能 |
| 進捗表示 | 「2/3 処理中...」形式 |
| 無料枠/クレジット表示 | 残り回数を表示 |

### 9.2 CorporateInfoSection.tsx

コーポレート情報取得・管理のUIコンポーネント

**主な機能**:
- コンテンツタイプ別の統計カード表示（9種類）
- URL検索・選択
- 登録済みURL一覧表示・削除

**コンテンツタイプカード**:
| タイプ | 日本語ラベル | カラー |
|-------|-------------|--------|
| new_grad_recruitment | 新卒採用HP | Blue |
| midcareer_recruitment | 中途採用HP | Sky |
| corporate_site | 企業HP | Emerald |
| ir_materials | IR資料 | Purple |
| ceo_message | 社長メッセージ | Amber |
| employee_interviews | 社員インタビュー | Pink |
| press_release | プレスリリース | Cyan |
| csr_sustainability | CSR/サステナ | Green |
| midterm_plan | 中期経営計画 | Indigo |

**RAGステータス表示**:
- 総チャンク数
- 最終更新日時
- コンテンツタイプ別チャンク数

### 9.3 DeadlineApprovalModal.tsx

AI抽出した締切の承認モーダル

**主な機能**:
- 抽出された締切一覧表示
- チェックボックスで承認対象を選択
- 信頼度「低」は初期チェックOFF
- 一括承認ボタン

### 9.4 Google Calendar連携

**連携フロー**:
1. ユーザーがカレンダー連携済みか確認（`/api/calendar/settings`）
2. 締切承認後、自動でカレンダーに追加
3. イベントタイトル: `{企業名} {締切タイトル}`
4. 重複作成防止（同一締切IDでチェック）

---

## 10. 関連ファイル

| ファイル | 役割 |
|---------|------|
| `backend/app/routers/company_info.py` | FastAPIエンドポイント（search-pages, fetch, rag/build等） |
| `backend/app/utils/llm.py` | LLM呼び出し（GPT-5-mini） |
| `src/app/api/companies/[id]/fetch-info/route.ts` | Next.js API（選考スケジュール取得） |
| `src/app/api/companies/[id]/fetch-corporate/route.ts` | Next.js API（コーポレート情報取得） |
| `src/app/api/companies/[id]/search-pages/route.ts` | 採用ページ検索プロキシ |
| `src/app/api/companies/[id]/search-corporate-pages/route.ts` | コーポレートページ検索プロキシ |
| `src/app/api/companies/[id]/delete-corporate-urls/route.ts` | コーポレートURL削除 |
| `src/components/companies/FetchInfoButton.tsx` | UI（選考スケジュール取得ボタン） |
| `src/components/companies/CorporateInfoSection.tsx` | UI（コーポレート情報セクション） |
| `src/components/companies/DeadlineApprovalModal.tsx` | UI（締切承認モーダル） |
