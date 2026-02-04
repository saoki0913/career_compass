# 企業情報検索機能（検索ロジック）

`/company-info/search-pages`（採用ページ検索）と`/company-info/search-corporate-pages`（コーポレートページ検索）の検索ロジックを整理する。  
本ドキュメントは**実装現状**のルールを記載する。

**対象エンドポイント**
- `POST /company-info/search-pages`
- `POST /company-info/search-corporate-pages`

**Hybrid/Legacy切替**
- Hybrid: `USE_HYBRID_SEARCH = True` かつ `custom_query` なし
- Legacy: 上記以外

---

**1. search-pages（採用ページ検索）**

**1.1 入力パラメータ（主要）**
- `company_name`
- `industry`
- `custom_query`
- `max_results`（上限15）
- `graduation_year`
- `selection_type`（`main_selection` / `internship`）
- `allow_snippet_match`

**1.2 Hybrid経路（RRF + Cross-Encoder + Heuristic）**
**処理フロー**
- `hybrid_web_search()` を実行（RRF + rerank + ルールスコア合成）
- 結果をフィルタ/ペナルティ適用
- confidence判定
- `source_type` → `confidence` でソート

**フィルタ（除外条件）**
- `_is_irrelevant_url(url)` → 不適切サイト除外
- `_is_subsidiary(company_name, title, url)` → 子会社サイト除外
- `_get_conflicting_companies(domain, company_name)` → 競合ドメイン除外（公式ドメインまたは厳密一致なら除外しない）
- `_contains_company_name(...)` → 企業名不一致除外（公式ドメインは免除）

**ペナルティ**
- 親会社サイト: `0.5x`
- 子会社ドメイン: `0.3x`

**confidence判定**
- `adjusted_score >= 0.7` かつ公式判定 → `high`
- `adjusted_score >= 0.5` → `medium`
- それ以外 → `low`
- `year_matched` が false の場合 `high` → `medium`

**最終ソート**
- `source_type` 優先度: `official` → `job_site` → `parent/subsidiary` → `other` → `blog`
- 次に `confidence`（high → medium → low）

**1.3 Legacy経路（ルールベース）**
**処理フロー**
- `_build_recruit_queries()` でクエリ生成
- DuckDuckGo検索
- `_score_recruit_candidate_with_breakdown()` で点数化
- フィルタ/ペナルティ
- confidence判定
- `source_type` → `confidence` でソート

**フィルタ・ペナルティ**
- Hybrid経路と同等

**confidence判定**
- `_score_to_confidence(score, source_type, year_matched)`

**1.4 問題点（コード由来）**
- Hybridの`combined_score`は**クエリ集合内で正規化**されるため、絶対品質ではなく相対評価になりやすい（`combine_scores()`の正規化 + `adjusted_score`閾値）。結果全体が低品質でも`high`が出る可能性がある。
- Hybrid/Legacyで**confidence判定の尺度が別**（Hybridは0-1の`adjusted_score`、Legacyは加点合計の`score`）。同じURLでも経路で信頼度が変わりうる。
- 競合ドメイン除外は`_has_strict_company_name_match()`が**タイトル/スニペット完全一致のみ**（URL一致は見ない）。正式社名が出ない採用ページは誤除外の可能性がある。
- `_contains_company_name()`が**短いプレフィックス一致**（4文字など）に依存するため、社名が短い/類似が多いケースで誤判定が起きやすい。

---

**2. search-corporate-pages（コーポレートページ検索）**

**2.1 入力パラメータ（主要）**
- `company_name`
- `search_type`（`ir` / `business` / `about`）
- `content_type`（9カテゴリ）
- `custom_query`
- `preferred_domain`
- `strict_company_match`
- `allow_aggregators`
- `max_results`（上限10）
- `allow_snippet_match`
- `cache_mode`

**2.2 Hybrid経路（RRF + Cross-Encoder + Heuristic）**
**処理フロー**
- `hybrid_web_search()` を実行
- 結果をフィルタ/ペナルティ適用
- confidence判定
- `source_type` → `confidence` でソート

**フィルタ（除外条件）**
- `_is_irrelevant_url(url)` → 不適切サイト除外
- `_is_subsidiary(company_name, title, url)` → 子会社サイト除外
- `_get_conflicting_companies(domain, company_name)` → 競合ドメイン除外（公式ドメインまたは厳密一致なら除外しない）
- `_contains_company_name(...)` → 企業名不一致除外（公式ドメインは免除）

**ペナルティ**
- 親会社サイト: `0.5x`、ただし`is_parent_domain_allowed()`なら`0.8x`
- 子会社ドメイン: `0.3x`

**confidence判定**
- `adjusted_score >= 0.7` かつ公式判定 → `high`
- `adjusted_score >= 0.5` → `medium`
- それ以外 → `low`

**最終ソート**
- `source_type` 優先度: `official` → `job_site` → `parent/subsidiary` → `other` → `blog`
- 次に `confidence`（high → medium → low）

**2.3 Legacy経路（ルールベース）**
**処理フロー**
- `_build_corporate_queries()` でクエリ生成
- DuckDuckGo検索
- `_score_corporate_candidate_with_breakdown()` で点数化
- strict → relaxed → aggregator 許可の3段階検索
- フィルタ/ペナルティ
- confidence判定
- `source_type` → `confidence` でソート

**フィルタ・ペナルティ**
- Hybrid経路と同等

**confidence判定**
- `_score_to_confidence(score, source_type)`

**2.4 問題点（コード由来）**
- Hybrid経路は`preferred_domain` / `strict_company_match` / `allow_aggregators`を**一切反映しない**（Legacyのみで有効）。ユーザー指定が無視される。
- Hybridのヒューリスティックは**採用系キーワード前提**（`calculate_heuristic_score()`内の採用URL/採用タイトル/採用サブドメイン）。IR/企業情報向けの意図とミスマッチが起こる。
- Hybrid経路には**`content_type`固有の加点/不一致ペナルティがない**（Legacyのみ）。`content_type`指定時の精度が下がる。
- `source_type`判定が採用サイト前提（`_get_source_type()`の`job_site`分類など）で、コーポレート用途の並び替え優先度が歪む可能性がある。
- `_contains_company_name()`の**短いプレフィックス一致**はコーポレート検索でも同様の誤判定要因になる。

---

**3. スコア内訳（Legacy経路の詳細）**

**3.1 `_score_recruit_candidate_with_breakdown()`（採用ページ）**
**除外**
- `_is_excluded_url(url)` → 除外

**加点**
- 企業名タイトル一致 `+3.0`
- 企業名スニペット一致 `+2.0`
- ドメインパターン一致 `+4.0`
- ASCII名一致 `+3.0`
- 採用サブドメイン一致 `+3.0`
- 採用URLキーワード一致 `+3.0`
- 採用タイトルキーワード一致 `+2.0`
- 採用スニペットキーワード一致 `+1.0`
- 卒業年度一致 `+1.0`
- TLD品質: `.co.jp +2.0`, `.jp +1.5`, `.com +1.0`, `.net +0.5`
- 業界名一致 `+0.5`
- マイページボーナス（`mypage`） `+1.0`

**減点**
- 年度不一致ペナルティ `-2.0`
- アグリゲータ `-3.0`
- ブログ/個人サイト: `-5.0` / `-1.0` / `-3.0`
- 低品質TLD `-1.0`

**3.2 `_score_corporate_candidate_with_breakdown()`（コーポレート）**
**除外**
- `_is_excluded_url(url)` → 除外
- 非HTTP URL → 除外
- アグリゲータ禁止設定で該当 → 除外
- strict条件で企業名/ドメイン一致不可 → 除外

**加点**
- 企業名タイトル一致 `+3.0`
- 企業名スニペット一致 `+2.0`
- ドメインパターン一致 `+4.0`
- ASCII名一致 `+3.0`
- TLD品質: `.co.jp +1.5`, `.jp +1.0`, `.com +0.5`, `.net +0.5`
- ContentType URLパターン一致 `+2.5`
- ContentType タイトル一致 `+2.0`
- ContentType スニペット一致 `+1.0`
- Legacy URLキーワード一致 `+2.0`
- Legacy タイトル一致 `+2.0`
- Legacy スニペット一致 `+1.0`
- preferred_domain一致 `+3.0`
- IR検索かつPDF `+1.5`
- IR文書キーワード一致 `+2.5`

**減点**
- 企業不一致ペナルティ `-4.0`
- 低品質TLD `-1.0`
- ContentType不一致ペナルティ `-2.0`
- preferred_domain不一致 `-1.0`
- アグリゲータ `-2.0`

---

**4. 主要実装ファイル**
- `backend/app/routers/company_info.py`
- `backend/app/utils/web_search.py`
- `docs/features/COMPANY_INFO_FETCH.md`
