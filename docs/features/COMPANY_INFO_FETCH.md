# 企業情報検索機能

採用ページ・コーポレートページから企業情報をAIで自動抽出し、RAG用に蓄積する機能。

**参照実装**: `backend/app/routers/company_info.py`, `src/app/api/companies/[id]/fetch-info/route.ts`

---

## 1. 概要

| 項目 | 内容 |
|------|------|
| **選考スケジュール取得** | 採用ページから締切・選考情報を抽出 |
| **コーポレート情報取得** | IR・事業紹介ページをクロールしてRAG構築 |
| **LLM** | 選考スケジュール抽出は `MODEL_SELECTION_SCHEDULE`、企業情報抽出は `MODEL_COMPANY_INFO` |

### クレジット消費（選考スケジュール取得）

| 結果 | 条件 | 消費 |
|------|------|------|
| 完全成功 | 締切情報あり | 1クレジット |
| 部分成功 | 締切なし、他データあり | 0クレジット |
| 失敗 | データなし | 0クレジット |

### プラン別制限

| プラン | 選考スケジュール | コーポレートページ |
|--------|-----------------|-------------------|
| guest | 5回/日 | 利用不可 |
| free | 10回/日 | 10ソース + 月160unit無料 |
| standard | 20回/日 | 100ソース + 月640unit無料 |
| pro | 40回/日 | 500ソース + 月2400unit無料 |

### コーポレートRAG課金

- URL取込は `1ページ = 1 unit`。
- PDF取込はページ数に応じて `2 / 4 / 6 / 10 unit`。
- 無料枠を先に消費し、超過分は `40 unit = 1クレジット` で整数課金する。
- 40unit 未満の overflow はその場では課金せず、当月の `ragOverflowUnits` に持ち越す。
- API レスポンスは `actualUnits`, `freeUnitsApplied`, `remainingFreeUnits`, `creditsConsumed`, `actualCreditsDeducted` を返す。

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
2. ユーザーがURL選択（複数可）
         ↓
3. 情報抽出（URLごと順次処理）
   POST /company-info/fetch-schedule
   選択URLを抽出 → 日付付き締切が取れない場合だけ 1ホップ先の募集要項/締切リンクを追加探索 → 構造化抽出
   - 取得元URLの relation / trusted job site / 年度一致を metadata 化
   - parent / subsidiary は confidence を low 上限に補正
   - trusted job site は medium 上限に補正
   - direct PDF リンクは最大1件まで追加探索し、本文抽出に失敗した場合だけ OCR fallback
         ↓
4. DB保存 & RAG構築（非同期）
   - 締切 → deadlinesテーブル
   - フルテキスト → ChromaDB
         ↓
5. Google Calendar連携（オプション）
```

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
5. クロール & RAG構築
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
| `POST /company-info/rag/crawl-corporate` | ページをクロールしてRAG構築 |
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
- URL候補リスト（チェックボックスで複数選択）
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
3. **RAG構築は自動トリガー**: 情報取得成功時に非同期で実行
4. **部分成功**: 締切なしでも他データがあれば0クレジットで保存する
5. **複数URL順次処理**: 1つずつ順次処理し進捗を表示
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

**RAG詳細**: `docs/COMPANY_RAG.md` を参照
