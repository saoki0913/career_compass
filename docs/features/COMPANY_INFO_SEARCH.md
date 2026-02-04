# 企業情報検索機能（検索ロジック）

`/company-info/search-pages`（採用ページ検索）と `/company-info/search-corporate-pages`（コーポレートページ検索）の検索ロジックを整理する。  
本ドキュメントは**実装現状**のルールを記載する。

## 概要

**対象エンドポイント**
- `POST /company-info/search-pages`
- `POST /company-info/search-corporate-pages`

**Hybrid / Legacy 切替**
- Hybrid: `USE_HYBRID_SEARCH = True` かつ `custom_query` なし
- Legacy: 上記以外

**戻り値（候補）**
- `search-pages`: `SearchCandidate[]`（`url`, `title`, `confidence`, `source_type`）
- `search-corporate-pages`: `CorporatePageCandidate[]`（`url`, `title`, `snippet`, `confidence`, `source_type`）

**共通の並び替え**
- `source_type` 優先度: `official` → `job_site` → `parent/subsidiary` → `other` → `blog`
- 同一 `source_type` 内は `confidence`（`high` → `medium` → `low`）
- Hybrid の `aggregator` は `job_site` として扱う。

**キャッシュ（Hybrid/検索）**
- Hybrid はインメモリキャッシュ（TTL 30分 / 最大200件）を使用。
- `search-corporate-pages` は `cache_mode`（`use` / `refresh` / `bypass`）を Hybrid に渡す。
- Legacy の DuckDuckGo 検索もクエリ単位でキャッシュされる（`_search_with_ddgs`）。

## 共通仕様（フィルタ・判定）

**公式ドメイン判定**
- `get_company_domain_patterns()` と `_domain_pattern_matches()` を使用。
- 短いパターンは許可リスト制（誤マッチ抑制）。

**競合ドメイン除外**
- `_get_conflicting_companies(domain, company_name)` で競合判定。
- 公式ドメイン or 厳密一致（`_has_strict_company_name_match`）なら除外しない。
- 厳密一致は **タイトル/スニペットのみ** を対象（URLは見ない）。

**企業名一致チェック（`_contains_company_name`）**
- 既定では **タイトル/URLのみ** を判定（`allow_snippet_match = False`）。
- 企業名の **短いプレフィックス**（4〜8文字程度）で一致判定を行う。
- `allow_snippet_match = True` のときのみスニペットも対象。
- 公式ドメインはこのチェックを免除。

**親会社/子会社の扱い**
- `_is_subsidiary()` は **除外**（公式ドメインなら除外しない）。
- `is_subsidiary_domain()` は **ペナルティ（0.3x）** を付与。
- 親会社サイトは **ペナルティ（0.5x）**。コーポレート検索では条件により **0.8x**。

---

## 1. `search-pages`（採用ページ検索）

### 1.1 入力パラメータ

| パラメータ | デフォルト / 上限 | 説明 |
| --- | --- | --- |
| `company_name` | 必須 | 企業名 |
| `industry` | 任意 | 業界ヒント |
| `custom_query` | 任意 | 指定時は Legacy 固定 |
| `max_results` | default 10 / cap 15 | 返却上限 |
| `graduation_year` | 任意 | 卒業年度 |
| `selection_type` | 任意 | `main_selection` / `internship` |
| `allow_snippet_match` | default `false` | 企業名一致チェックにスニペットを含める |

### 1.2 Hybrid 経路（RRF + Cross-Encoder + Heuristic）

**処理フロー**
1. `get_company_domain_patterns(company_name)` を取得。
2. `hybrid_web_search()` 実行（`search_intent="recruitment"`、`max_results + 10` で取得）。
3. フィルタ/ペナルティ適用。
4. `confidence` 判定。
5. `source_type` → `confidence` で並び替え。

**Hybrid 内部（概要）**
- クエリ生成 → RRF 融合 → Cross-Encoder リランク（利用可能時） → ヒューリスティック → 正規化合成。
- 合成比率: `rerank 0.5` / `heuristic 0.3` / `rrf 0.2`。
- スコアは **クエリ集合内で正規化** される（相対評価）。

**フィルタ（除外）**
- `_is_irrelevant_url(url)`
- `_is_subsidiary(company_name, title, url)`
- `_get_conflicting_companies(domain, company_name)` で競合判定（公式 or 厳密一致なら除外しない）
- `_contains_company_name(...)`（公式ドメインは免除）

**ペナルティ**
- 親会社サイト: `0.5x`
- 子会社ドメイン: `0.3x`

**confidence 判定**
- `adjusted_score >= 0.7` かつ公式 → `high`
- `adjusted_score >= 0.5` → `medium`
- それ以外 → `low`
- `year_matched = false` なら `high → medium` にダウングレード

### 1.3 Legacy 経路（ルールベース）

**処理フロー**
1. `_build_recruit_queries()` でクエリ生成（`selection_type` / `graduation_year` 反映）。
2. DuckDuckGo 検索（`_search_with_ddgs`）。
3. `_score_recruit_candidate_with_breakdown()` で点数化。
4. フィルタ/ペナルティ適用。
5. `confidence` 判定（`_score_to_confidence`）。
6. `source_type` → `confidence` で並び替え。

**DDGS 利用不可時**
- `candidates: []` とエラーメッセージを返す。

**クエリ生成の特徴**
- `custom_query` が最優先。
- `selection_type` が `internship` / `main_selection` の場合は専用クエリ。
- 企業別エイリアス (`COMPANY_QUERY_ALIASES`) を優先追加。
- `industry` があれば追加。
- 最大6件に制限。

**confidence 判定（Legacy）**
- `official`: `score >= 6` → `high`（年度不一致なら `medium`）、`score >= 3` → `medium`。
- `job_site` / `blog` / `parent` / `subsidiary`: `score >= 6` → `medium`、それ以外 `low`。
- `other`: `score >= 4` → `medium`（`high` なし）。

### 1.4 Legacy スコア内訳（採用）

**加点**
| 項目 | 加点 |
| --- | --- |
| 企業名タイトル一致 | `+3.0` |
| 企業名スニペット一致 | `+2.0` |
| ドメインパターン一致 | `+4.0` |
| ASCII名一致（ドメイン） | `+3.0` |
| 採用サブドメイン一致 | `+3.0` |
| 採用URLキーワード一致 | `+3.0` |
| 採用タイトルキーワード一致 | `+2.0` |
| 採用スニペットキーワード一致 | `+1.0` |
| 卒業年度一致 | `+1.0` |
| TLD品質 | `.co.jp +2.0`, `.jp +1.5`, `.com +1.0`, `.net +0.5` |
| 業界名一致 | `+0.5` |
| マイページボーナス（`mypage`） | `+1.0` |

**減点**
| 項目 | 減点 |
| --- | --- |
| 年度不一致ペナルティ | `-2.0` |
| アグリゲータ | `-3.0` |
| ブログ/個人サイト | `-5.0`（個人ブログ）, `-1.0`（公式ブログ）, `-3.0`（個人サイト） |
| 低品質TLD | `-1.0` |

---

## 2. `search-corporate-pages`（コーポレートページ検索）

### 2.1 入力パラメータ

| パラメータ | デフォルト / 上限 | 説明 |
| --- | --- | --- |
| `company_name` | 必須 | 企業名 |
| `search_type` | default `about` | `ir` / `business` / `about` |
| `content_type` | 任意 | 9カテゴリ（下表） |
| `custom_query` | 任意 | 指定時は Legacy 固定 |
| `preferred_domain` | 任意 | 優先ドメイン |
| `strict_company_match` | default `true` | 厳格に企業一致を要求 |
| `allow_aggregators` | default `false` | アグリゲータ許可 |
| `max_results` | default 5 / cap 10 | 返却上限 |
| `allow_snippet_match` | default `false` | 企業名一致チェックにスニペットを含める |
| `cache_mode` | default `bypass` | `use` / `refresh` / `bypass` |

**content_type（9カテゴリ）**
| content_type | 内容 |
| --- | --- |
| `new_grad_recruitment` | 新卒採用 |
| `midcareer_recruitment` | 中途採用 |
| `ceo_message` | 社長メッセージ |
| `employee_interviews` | 社員インタビュー |
| `press_release` | プレスリリース |
| `ir_materials` | IR資料 |
| `csr_sustainability` | CSR/サステナ |
| `midterm_plan` | 中期経営計画 |
| `corporate_site` | 企業情報 |

### 2.2 Hybrid 経路（RRF + Cross-Encoder + Heuristic）

**処理フロー**
1. `get_company_domain_patterns(company_name)` を取得。
2. `content_type` を `search_intent` に変換して `hybrid_web_search()` 実行。
3. フィルタ/ペナルティ適用。
4. `confidence` 判定。
5. `source_type` → `confidence` で並び替え。

**content_type → search_intent 対応**
| content_type | search_intent |
| --- | --- |
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

**フィルタ（除外）**
- `_is_irrelevant_url(url)`
- `_is_subsidiary(company_name, title, url)`
- `_get_conflicting_companies(domain, company_name)` で競合判定（公式 or 厳密一致なら除外しない）
- `_contains_company_name(...)`（公式ドメイン or 親会社許可ドメインは免除）

**ペナルティ**
- 親会社サイト: `0.5x`、ただし `is_parent_domain_allowed()` なら `0.8x`
- 子会社ドメイン: `0.3x`

**confidence 判定**
- `adjusted_score >= 0.7` かつ公式 → `high`
- `adjusted_score >= 0.5` → `medium`
- それ以外 → `low`

### 2.3 Legacy 経路（ルールベース）

**処理フロー**
1. `_build_corporate_queries()` でクエリ生成（`custom_query` > `content_type` > `search_type`）。
2. DuckDuckGo 検索（`_search_with_ddgs`）。
3. `_score_corporate_candidate_with_breakdown()` で点数化。
4. strict → relaxed → aggregator許可の3段階検索。
5. フィルタ/ペナルティ適用。
6. `confidence` 判定（`_score_to_confidence`）。
7. `source_type` → `confidence` で並び替え。

**クエリ生成の特徴**
- `custom_query` が最優先。
- `content_type` 指定時は専用クエリ（最大4件）。
- 未指定時は `search_type` のクエリを使用。
- `preferred_domain` 指定時は `site:preferred_domain` を付与。
- 最大4件に制限。

**検索の段階条件**
- strict で `results < 3` のとき relaxed を追加。
- `allow_aggregators = false` で結果 0 件の場合、aggregator 許可のフォールバックを実行。
- `score < 3.5` は候補から除外。

### 2.4 Legacy スコア内訳（コーポレート）

`content_type` 指定時は ContentType 系の加点/不一致ペナルティのみを使用し、`search_type` 系キーワードは使わない。  
`content_type` 未指定時は `search_type` 系キーワードのみを使用する。

**加点**
| 項目 | 加点 |
| --- | --- |
| 企業名タイトル一致 | `+3.0` |
| 企業名スニペット一致 | `+2.0` |
| ドメインパターン一致 | `+4.0` |
| ASCII名一致（ドメイン） | `+3.0` |
| TLD品質 | `.co.jp +1.5`, `.jp +1.0`, `.com +0.5`, `.net +0.5` |
| ContentType URLパターン一致 | `+2.5` |
| ContentType タイトル一致 | `+2.0` |
| ContentType スニペット一致 | `+1.0` |
| Legacy URLキーワード一致 | `+2.0` |
| Legacy タイトル一致 | `+2.0` |
| Legacy スニペット一致 | `+1.0` |
| preferred_domain 一致 | `+3.0` |
| IR検索かつPDF | `+1.5` |
| IR文書キーワード一致 | `+2.5` |

**減点 / 除外**
strict 判定は「企業名一致 / preferred_domain 一致 / 公式ドメイン / 親会社許可」のいずれかで通過。
| 項目 | 減点 |
| --- | --- |
| 企業不一致ペナルティ | `-4.0` |
| ContentType 不一致ペナルティ | `-2.0` |
| preferred_domain 不一致 | `-1.0` |
| アグリゲータ | `-2.0` |
| 低品質TLD | `-1.0` |
| アグリゲータ除外（設定時） | 除外 |
| strict 企業一致に失敗 | 除外 |
| 非HTTP URL | 除外 |

---

## 3. 問題点 / 注意点（コード由来）

- Hybrid の `combined_score` は **クエリ集合内で正規化** されるため、絶対品質ではなく相対評価になりやすい。
- Hybrid / Legacy で **confidence判定の尺度が別**（Hybridは0-1の`adjusted_score`、Legacyは加点合計の`score`）。
- コーポレート検索の Hybrid は `preferred_domain` / `strict_company_match` / `allow_aggregators` を **反映しない**。
- Hybrid のヒューリスティックは **採用系キーワード前提**（`calculate_heuristic_score()`）。IR/企業情報向けの意図とミスマッチが起こる。
- Hybrid には **content_type固有の加点/不一致ペナルティがない**（Legacyのみ）。
- `source_type` 判定・優先度が採用サイト寄りで、コーポレート用途で並びが歪む可能性がある。
- `_contains_company_name()` は **短いプレフィックス一致** に依存するため、社名が短い/類似が多い場合に誤判定が起きやすい。
- 競合ドメイン除外の厳密一致は **タイトル/スニペットのみ**。正式社名が出ないページは誤除外の可能性がある。

---

## 4. 主要実装ファイル
- `backend/app/routers/company_info.py`
- `backend/app/utils/web_search.py`
- `docs/features/COMPANY_INFO_FETCH.md`
