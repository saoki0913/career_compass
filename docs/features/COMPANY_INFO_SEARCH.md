# 企業情報検索機能

採用ページとコーポレートページの Web 検索候補生成を行う。Hybrid 検索（RRF + Cross-Encoder）と Legacy 検索（DDGS + heuristic）の 2 モードを用意し、公式ドメイン判定、除外フィルタ、confidence 判定、共通ソートを経て候補 URL を返す。

## 入口

- **採用ページ検索**: `backend/app/routers/company_info.py` の `/company-info/search-pages`
- **コーポレートページ検索**: 同 `/company-info/search-corporate-pages`

---

## 仕様

### 全体フロー

```
リクエスト受信
    │
    ├─ /search-pages (採用ページ)
    │   │
    │   └─ Hybrid 優先。公式/trusted 不足なら Legacy を追加実行
    │
    └─ /search-corporate-pages (コーポレート)
        │
        └─ USE_HYBRID_SEARCH=true かつ custom_query 未指定 → Hybrid
           それ以外 → Legacy
                   │
                   └─→ 共通ソート → 結果返却
```

### 検索モード判定

| 検索種別 | モード判定ルール |
|---------|---------------|
| **採用ページ** | Hybrid 優先。公式/trusted 候補不足時のみ Legacy 追加 |
| **コーポレート** | `USE_HYBRID_SEARCH=true` かつ `custom_query` 未指定 → Hybrid。それ以外 → Legacy |

### 共通ルール

#### 1. 公式ドメイン判定

| 分類 | 説明 |
|-----|------|
| `official` | `classify_company_domain_relation()` で登録済み所有関係が判定できる場合のみ付与。短社名は bare token ではなく dotted domain を明示登録 |
| `job_site` | `job.mynavi.jp`, `job.rikunabi.com`, `onecareer.jp` のみ trusted |
| `parent` / `subsidiary` | 親会社/子会社ドメイン。候補として残すが `official` へは昇格させない |
| `other` / `blog` | その他の一般ドメイン |

#### 2. 除外フィルタ

| 項目 | 除外対象 |
|-----|---------|
| **無関係 URL** | Wikipedia, LinkedIn 等（`_is_irrelevant_url()`） |
| **競合ドメイン** | 厳密一致時のみタイトル/スニペットで判定（`_get_conflicting_companies()`） |
| **企業名不一致** | 公式ドメイン・親子会社ドメインは免除（`_contains_company_name()`） |
| **社員記事不適合** | `employee_interviews` で `Investors` `IR` `会社概要` 等を除外 |

#### 3. スコアペナルティ

| 対象 | 乗数 |
|-----|------|
| 親会社ドメイン | ×0.5 |
| 子会社ドメイン | ×0.3 |

#### 4. 共通ソートロジック

優先順位:
1. `source_type` による優先度: `official` > `job_site` > `parent`/`subsidiary` > `other` > `blog`
2. 同一 `source_type` 内では `confidence`: `high` > `medium` > `low`
3. 同一 `confidence` 内では `combined_score` 降順

---

### 採用ページ検索 (`/search-pages`)

#### 処理概要
- Hybrid 検索を実行（intent: `recruitment`, max_results: 指定値 + 10）
- 公式/trusted 候補が不足なら Legacy 検索を追加
- 除外・ペナルティ適用後、confidence 判定と共通ソート

#### Confidence 判定

**Hybrid:**

| adjusted_score | source_type | year_matched | confidence |
|---------------|-------------|--------------|------------|
| ≥ 0.7 | official | true | **high** |
| ≥ 0.7 | official | false | **medium** |
| ≥ 0.7 | job_site | - | **medium** |
| 任意 | parent / subsidiary | - | **low** |

**Legacy:**

| source_type | score | year_matched | confidence |
|------------|-------|--------------|------------|
| official | ≥ 6 | true | **high** |
| official | ≥ 6 | false | **medium** |
| official | 3-5 | - | **medium** |
| official | < 3 | - | **low** |
| job_site | ≥ 6 | - | **medium** |
| job_site | < 6 | - | **low** |
| parent / subsidiary | 任意 | - | **low** |

#### Legacy スコアリング概要
ドメインパターン一致（+4.0）、企業名タイトル（+3.0）、採用サブドメイン（+3.0）、卒業年度一致（+1.0）、TLD ボーナス（.co.jp +2.0）などを加算。アグリゲータ（-3.0）、個人ブログ（-5.0）などを減点。詳細は `backend/app/utils/web_search.py` の `_score_recruit_candidate_with_breakdown()` を参照。

---

### コーポレートページ検索 (`/search-corporate-pages`)

#### 処理概要
- `content_type` → `search_intent` へ変換してクエリ生成
- Hybrid または Legacy 検索を実行
- 除外・ペナルティ適用後、confidence 判定と共通ソート

#### content_type → search_intent マッピング

| content_type | search_intent |
|-------------|---------------|
| `new_grad_recruitment` | `new_grad` |
| `midcareer_recruitment` | `midcareer` |
| `ceo_message` | `ceo_message` |
| `employee_interviews` | `employee_interviews` |
| `ir_materials` | `corporate_ir` |
| `csr_sustainability` | `csr` |
| `midterm_plan` | `midterm_plan` |
| `press_release` | `press_release` |
| `corporate_site` | `corporate_about` |
| 未指定 | `corporate_about` |

#### Confidence 判定

**Hybrid:**

| adjusted_score | source_type | confidence |
|---------------|-------------|------------|
| ≥ 0.7 | official | **high** |
| ≥ 0.7 | job_site / blog | **medium** |
| ≥ 0.5 | other | **medium** |
| 任意 | parent / subsidiary | **low** |

**Legacy:**

| source_type | score | confidence |
|------------|-------|------------|
| official | ≥ 6 | **high** |
| official | 3-5 | **medium** |
| official | < 3 | **low** |
| job_site / blog | ≥ 6 | **medium** |
| job_site / blog | < 6 | **low** |
| parent / subsidiary | 任意 | **low** |
| other | ≥ 4 | **medium** |
| other | < 4 | **low** |

#### Legacy スコアリング概要
ドメインパターン一致（+4.0）、企業名タイトル（+3.0）、ContentType URL パターン（+2.5）、IR PDF（+1.5）、TLD ボーナス（.co.jp +1.5）などを加算。企業不一致（-4.0）、ContentType 不一致（-2.0）などを減点。詳細は `backend/app/utils/web_search.py` の `_score_corporate_candidate_with_breakdown()` を参照。

#### Legacy 検索の Strict / Relaxed Pass
- **Strict Pass**: 企業名一致、preferred_domain 一致、公式ドメイン、親子会社ドメインのいずれかを満たす候補のみ通過
- 結果 < 3 件 → Relaxed Pass 実行
- `allow_aggregators=false` かつ結果 = 0 → Aggregator 許可 Pass 実行
- 最終的に score < 3.5 を除外

---

## 技術メモ

### Hybrid 検索の内部処理
1. クエリ生成
2. **Fast path**: `WEB_SEARCH_FAST_MAX_QUERIES` 件までの query variation で DDG 並列検索 → RRF 融合 → prefilter → heuristic 合成。候補が十分ならここで返す
3. **Deep path**（候補不足/official 不足時のみ）: 全 query variation で再検索 → 必要なら site rescue → Cross-Encoder Rerank → light verification
4. `combined_score` 降順ソート

### デバッグログ
- `WEB_SEARCH_DEBUG=1` で Hybrid 検索の詳細トレースが `logger.debug` に出力される（uvicorn のログレベルを DEBUG にする必要あり）
- 通常の INFO では 1 リクエストあたり 1 行サマリーのみ
- `WEB_SEARCH_DEBUG_PRINT=1` で標準出力にも同じ詳細を出力

### 検索結果と取込の責務分離
- 検索は「候補 URL を返す」までが責務
- HTML / PDF / unsupported の判定は `fetch-corporate` 側で行う（`docs/features/COMPANY_INFO_FETCH.md` 参照）
- PDF 候補は検索段階で完全排除せず、IR や中計では残してよい

---

## 既知の問題点

### 🔴 重要度: 高

| # | 問題内容 | 影響範囲 |
|---|---------|---------|
| 1 | **Hybrid の combined_score は相対評価**。クエリ集合内での正規化のため、絶対的な品質保証ができない | Hybrid 検索全体 |
| 2 | **Hybrid と Legacy で confidence 基準が異なる**。同じクエリでもモードにより信頼度が変わる可能性 | 検索結果の一貫性 |
| 3 | **Corporate Hybrid は一部パラメータ未対応**。`preferred_domain`, `strict`, `allow_aggregators` が反映されない | コーポレート Hybrid |

### 🟡 重要度: 中

| # | 問題内容 | 影響範囲 |
|---|---------|---------|
| 4 | **Hybrid heuristic は採用系前提**。コーポレート検索には最適化されていない | コーポレート Hybrid |
| 5 | **Hybrid に content_type 固有加点なし**。Legacy のような詳細な content_type 対応がない | コーポレート Hybrid |
| 6 | **source_type 優先度が採用寄り**。`job_site` が高優先となり、IR サイト等が不利 | 共通ソート |

### 🟢 重要度: 低

| # | 問題内容 | 影響範囲 |
|---|---------|---------|
| 7 | **企業名一致判定が短いプレフィックス依存**。`_contains_company_name()` の精度課題 | 除外フィルタ |
| 8 | **競合ドメイン判定が限定的**。厳密一致時のタイトル/スニペットのみチェック | 除外フィルタ |

---

## 関連ドキュメント

- `docs/features/COMPANY_INFO_FETCH.md` - 取込・課金・PDF routing
- `docs/features/COMPANY_RAG.md` - 保存・検索・RAG 全体
- `backend/app/routers/company_info.py` - エンドポイント実装
- `backend/app/utils/web_search.py` - 検索ロジック実装
