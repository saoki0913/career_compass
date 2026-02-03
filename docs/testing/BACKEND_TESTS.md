# Backend テストコード ドキュメント

## 概要

`backend/tests/` ディレクトリには、RAG検索システムと企業マッピング機能の品質を担保するためのテストコードが格納されています。

## ディレクトリ構造

```
backend/tests/
├── conftest.py                     # 共有フィクスチャ・ユーティリティ
├── data/
│   ├── __init__.py
│   └── search_test_queries.json    # 検索テストクエリセット
├── test_company_mappings.py        # 企業マッピング総合検証テスト（統合済み）
├── test_subsidiary_detection.py    # 子会社判定ロジックテスト（リファクタ済み）
├── test_comprehensive_search.py    # 全企業包括的検索テスト（NEW）
├── test_search_precision.py        # 検索精度測定テスト
├── test_missing_subsidiaries.py    # 不足子会社検出テスト
└── test_content_type_search.py     # ContentType別検索精度テスト
```

---

## クイックスタート

### 全テスト実行（高速）

```bash
cd backend
pytest tests/ -v --ignore=tests/test_comprehensive_search.py
```

### 包括的検索テスト（約30分、実API呼び出し）

```bash
pytest tests/test_comprehensive_search.py -v -s
```

### 関係性テストのみ（API呼び出しなし）

```bash
pytest tests/test_comprehensive_search.py -v -k "TestCompanyRelationships"
```

---

## 0. conftest.py（共有フィクスチャ）

### 目的

全テストファイルで共有するフィクスチャとユーティリティ関数を集約。コードの重複を排除。

### 提供するフィクスチャ

| フィクスチャ名 | スコープ | 説明 |
|---|---|---|
| `all_companies` | session | 全企業データ（mappings辞書） |
| `subsidiaries` | session | 全子会社リスト `[(name, mapping), ...]` |
| `parent_companies` | session | 全親会社・独立企業リスト `[(name, domains), ...]` |
| `parent_company_names` | session | 親会社名のセット |

### 提供するユーティリティ関数

| 関数名 | 説明 |
|---|---|
| `load_all_companies()` | company_mappings.jsonから全企業を読み込む |
| `get_domains(mapping)` | マッピングからドメインパターンを取得 |
| `has_parent(mapping)` | 子会社かどうかを判定 |
| `get_subsidiaries(companies)` | 子会社のリストを取得 |
| `get_parents(companies)` | 親会社・独立企業のリストを取得 |
| `get_parent_companies_set(companies)` | 親会社名のセットを取得 |
| `get_subsidiary_parent_pairs(companies)` | (子会社名, 親会社名)のペアリストを取得 |

### カスタムマーカー

| マーカー | 説明 |
|---|---|
| `@pytest.mark.slow` | 時間がかかるテスト |
| `@pytest.mark.integration` | 実際のAPI呼び出しを行うテスト |

---

## 1. テストデータ

### `data/search_test_queries.json`

検索精度測定用のテストクエリセットを定義したJSONファイル。

#### 構造

```json
{
  "test_cases": [...],           // 15件のテストケース
  "evaluation_metrics": {...},   // 評価指標の定義
  "query_categories": {...},     // クエリのカテゴリ分類
  "content_type_specific_tests": [...] // ContentType別テスト
}
```

#### テストケース例

| ID | 説明 | クエリ | 期待するContentType |
|---|---|---|---|
| q001 | 商社 - 新卒採用基本検索 | 三菱商事 新卒採用 2026 | new_grad_recruitment |
| q004 | 電機 - 企業理念検索 | ソニー 社長メッセージ 企業理念 | ceo_message, corporate_site |
| q007 | 商社 - 社員インタビュー検索 | 三井物産 社員インタビュー キャリア | employee_interviews |
| q010 | 概念的クエリ - 成長環境 | 成長できる環境 若手 挑戦 | new_grad_recruitment, employee_interviews |

#### 評価指標

| 指標 | 説明 | 目標値 |
|---|---|---|
| precision_at_5 | 上位5件中の関連結果の割合 | 0.7 |
| domain_match_rate | 公式ドメインマッチ率（上位5件） | 0.6 |
| content_type_accuracy | 期待content_typeとの一致率 | 0.6 |
| latency_p95 | 95パーセンタイルレイテンシ（ms） | 1000 |

---

## 2. test_company_mappings.py（統合済み）

### 目的

`company_mappings.json`に登録された全企業の検索ロジックが総合的に正しく動作することを検証。旧`test_company_mappings_validation.py`の内容を統合。

### 実行方法

```bash
# 全テスト実行
pytest backend/tests/test_company_mappings.py -v

# 公式ドメイン検証のみ
pytest backend/tests/test_company_mappings.py -v -k "official"

# 親子関係検証のみ
pytest backend/tests/test_company_mappings.py -v -k "parent or subsidiary"

# 求人サイト検証のみ
pytest backend/tests/test_company_mappings.py -v -k "job_board"
```

### テストクラス

#### `TestMappingDataIntegrity`
マッピングデータの整合性テスト

| テスト名 | 検証内容 |
|---|---|
| `test_mappings_file_exists` | マッピングファイルの存在確認 |
| `test_mappings_file_valid_json` | 有効なJSON形式か確認 |
| `test_company_count` | 企業数が1000社以上か確認 |
| `test_all_subsidiaries_have_valid_parent` | 全子会社の親会社が存在するか確認 |
| `test_all_companies_have_domains` | 全企業にドメインパターンが設定されているか確認 |

#### `TestDomainPatternConsistency`
ドメインパターンの整合性検証

| テスト名 | 検証内容 |
|---|---|
| `test_patterns_are_lowercase` | パターンが全て小文字 |
| `test_no_duplicate_domains_within_company` | 同一企業内で重複なし |
| `test_no_empty_domain_patterns` | 空文字パターンなし |

#### `TestOfficialDomainDetection`
公式ドメイン検出の検証

| テスト名 | 検証内容 |
|---|---|
| `test_official_domain_detection_sample` | 公式ドメインがofficial_domainとして検出される（500社サンプル） |
| `test_official_domain_boost_is_1_5` | 公式ドメインで1.5倍のブーストが適用される |
| `test_non_official_domain_no_boost` | 非公式ドメインにはブーストなし |

#### `TestContentTypeBoost`
コンテンツタイプブースト検証

| テスト名 | 検証内容 |
|---|---|
| `test_new_grad_recruitment_boost_defined` | 新卒採用コンテンツのブースト係数が定義されている |
| `test_official_high_final_score` | 公式・高 = official_domain (1.5x) × new_grad (1.5x) = 2.25x |
| `test_ir_materials_lower_boost` | IR資料は低いブースト |

#### `TestParentChildRelationships`
親子会社関係の検証

| テスト名 | 検証内容 |
|---|---|
| `test_subsidiary_count` | 子会社が500社以上登録されている |
| `test_all_subsidiaries_have_valid_parent` | 全子会社の親会社が存在する |
| `test_get_parent_company_returns_correct_parent` | get_parent_company()が正しい親会社を返す |
| `test_subsidiary_detection_for_parent_search` | 親会社検索時に子会社ドメインが検出される |
| `test_parent_domain_detection_for_subsidiary_search` | 子会社検索時に親会社ドメインが検出される |
| `test_sibling_companies_share_parent` | 兄弟会社が同じ親会社を共有する |
| `test_parent_domain_penalty_applied` | 子会社検索時に親会社サイトが減点される |

#### `TestOwnDomainNotMisdetected`
子会社自身のドメイン誤検出防止

- `test_own_domain_not_parent`: 全子会社（200社サンプル）でパラメタライズドテスト

#### `TestJobBoardRanking`
求人サイトの分類検証

| テスト名 | 検証内容 |
|---|---|
| `test_mynavi_classified_as_job_board` | マイナビがjob_boardとして分類 |
| `test_rikunabi_classified_as_job_board` | リクナビがjob_boardとして分類 |
| `test_all_major_job_boards_classified` | 主要求人サイト全てがjob_boardとして分類 |

#### `TestDomainBoundaryValidation`
ドメイン境界検証（誤検出防止）

- `test_is_parent_domain_has_boundary_check`: is_parent_domain()の境界チェック
- `test_hyphenated_domain_match`: ハイフン区切りドメインのマッチ
- `test_subdomain_match`: サブドメインのマッチ

#### `TestStatistics`
統計情報の出力（デバッグ用）

- `test_print_statistics`: マッピング統計を出力

---

## 3. test_subsidiary_detection.py（リファクタ済み）

### 目的

子会社判定ロジック（`is_subsidiary_of`, `is_parent_domain`）の正確性を検証。9クラスから8クラスにリファクタし、重複を排除。

### 実行方法

```bash
pytest backend/tests/test_subsidiary_detection.py -v
```

### テストクラス

#### `TestSubsidiaryBasics`
子会社判定の基本テスト

| テスト名 | 検証内容 |
|---|---|
| `test_mfr_not_subsidiary` | 三井不動産レジデンシャル公式サイトが子会社判定されない |
| `test_subsidiary_still_detected_for_unregistered_domain` | 未登録ドメインで子会社キーワードがある場合は検出 |
| `test_registered_domain_bypasses_keyword_check` | 登録済みドメインは子会社キーワードチェックをバイパス |

#### `TestParentDomainExclusion`
子会社検索時の親会社ドメイン除外テスト

| テスト名 | 検証内容 |
|---|---|
| `test_parent_company_lookup` | 親会社名の取得（三井物産スチール → 三井物産） |
| `test_parent_domain_patterns` | 親会社ドメインパターンの取得 |
| `test_parent_domain_detection_mitsui` | 三井物産スチール検索時に三井物産サイトが検出される |
| `test_subsidiary_own_domain_not_parent` | 子会社自身のドメインは親会社として検出されない |

#### `TestDomainBoundaryValidation`
ドメイン境界チェックのテスト（部分文字列マッチの誤検出防止）

| テスト名 | 検証内容 |
|---|---|
| `test_exact_domain_match` | 完全一致するドメインセグメント |
| `test_subdomain_match` | サブドメインを含むマッチ |
| `test_no_partial_match_prefix` | smitsui != mitsui（接頭辞誤検出防止） |
| `test_no_partial_match_suffix` | permitsui != mitsui（接尾辞誤検出防止） |
| `test_hyphenated_pattern_prefix` | ハイフン付きパターン（mitsui-career） |

#### `TestWildcardSubsidiaryDetection`
ワイルドカードパターンによる未登録子会社検出のテスト

- `test_unregistered_nttdata_xxx_detected`: 未登録のnttdata-xxxドメインがワイルドカード検出
- `test_nttdata_recruit_official_not_detected`: 採用関連ドメインは子会社として検出しない

#### `TestParentSearchSubsidiaryDetection`
親会社検索時に子会社サイトが検出されることを確認

- `test_nttdata_detects_mse`: NTTデータ検索でNTTデータMSEサイトが検出
- `test_mitsui_detects_steel`: 三井物産検索で三井物産スチールサイトが検出

#### `TestDomainBoostPenalty`
ドメインブースト・ペナルティのテスト

| テスト名 | 検証内容 |
|---|---|
| `test_recruitment_page_mild_penalty` | 採用ページは0.6xペナルティ |
| `test_ir_page_harsh_penalty` | IRページは0.3xペナルティ |
| `test_default_penalty` | デフォルトは0.5xペナルティ |
| `test_no_penalty_for_non_parent` | 親会社以外はペナルティなし（1.0x） |

#### `TestParentCompanyPatternExclusion`
親会社パターンが検索対象から除外されるテスト

- `test_nttdata_search_excludes_ntt_pattern`: NTTデータ検索でnttパターンが含まれない

---

## 4. test_comprehensive_search.py（NEW）

### 目的

`company_mappings.json`に登録された全企業（1000社以上）の検索が正しく動作することを包括的に検証。実際のDuckDuckGo APIを使用。

### 実行方法

```bash
# 全テスト実行（約30分）
pytest backend/tests/test_comprehensive_search.py -v -s

# 関係性テストのみ（API呼び出しなし、高速）
pytest backend/tests/test_comprehensive_search.py -v -k "TestCompanyRelationships"

# 特定企業のみ
pytest backend/tests/test_comprehensive_search.py -v -k "三菱地所"

# 統計・サマリーのみ
pytest backend/tests/test_comprehensive_search.py -v -k "TestSearchStatistics"
```

### テストクラス

#### `TestCompanyRelationships`（API呼び出しなし）
親子・兄弟関係の検証

| テスト名 | 検証内容 |
|---|---|
| `test_all_subsidiaries_have_valid_parent` | 全子会社の親会社がmappingsに存在すること |
| `test_parent_companies_have_domains` | 全親会社・独立企業がドメインパターンを持つこと |
| `test_subsidiaries_have_domains` | 全子会社がドメインパターンを持つこと |
| `test_no_circular_parent_references` | 親会社の循環参照がないこと |
| `test_sibling_companies_share_parent` | 同一親を持つ子会社が正しく設定されていること |
| `test_domain_patterns_are_unique` | ドメインパターンが一意であること |

#### `TestComprehensiveSearch`（@pytest.mark.integration）
全企業の検索精度検証

| テスト名 | 検証内容 |
|---|---|
| `test_search_returns_results_for_parent_companies` | 全親会社で検索結果が返されること |
| `test_official_domain_in_results` | 代表企業の検索結果に公式ドメインが含まれること |

#### `TestSearchResultQuality`（@pytest.mark.integration）
検索結果の品質詳細検証

| テスト名 | 検証内容 |
|---|---|
| `test_recruitment_search_quality` | 代表企業の採用検索品質 |

#### `TestParentSubsidiarySearchBehavior`（@pytest.mark.integration）
親子会社検索時の挙動検証

| テスト名 | 検証内容 |
|---|---|
| `test_subsidiary_search_returns_results` | 子会社検索で結果が返されること |

#### `TestSearchStatistics`
検索関連の統計・サマリー

| テスト名 | 検証内容 |
|---|---|
| `test_company_count_summary` | 企業数のサマリー |
| `test_domain_coverage_summary` | ドメインカバレッジのサマリー |
| `test_parent_company_distribution` | 親会社ごとの子会社分布 |

### テスト対象企業

- **親会社・独立企業**: 全社（約200社）
- **子会社**: 各親会社グループから最大3社をサンプリング

### レート制限対策

DuckDuckGo API呼び出し間隔: 1.0秒

---

## 5. test_search_precision.py

### 目的
RAG検索システムの精度を定量的に測定し、ベースラインを確立する。

### 実行方法

```bash
# 全テスト実行
pytest backend/tests/test_search_precision.py -v

# 統合テスト（実際の検索関数を使用）
pytest backend/tests/test_search_precision.py::test_baseline_precision -v -m integration
```

### 主要クラス・関数

#### `SearchPrecisionEvaluator`
検索精度を評価するメインクラス。

**メソッド:**
- `evaluate_single_query()`: 単一クエリの評価
- `evaluate_all()`: 全テストケースの評価
- `print_report()`: 評価レポートの出力

#### テスト関数

| 関数名 | 説明 |
|---|---|
| `test_load_test_cases` | テストケースの読み込み確認 |
| `test_extract_domain` | URLからドメイン抽出の検証 |
| `test_check_domain_match` | ドメインパターンマッチングの検証 |
| `test_check_content_type_match` | ContentTypeマッチングの検証 |
| `test_check_keyword_match` | キーワードマッチングの検証 |
| `test_evaluate_single_query` | 単一クエリ評価の検証（モック使用） |
| `test_evaluate_all` | 全体評価の検証（モック使用） |
| `test_baseline_precision` | 実環境でのベースライン測定（統合テスト） |

### 評価メトリクス

- **Precision@5**: 上位5件中の関連結果の割合
- **Domain Match Rate**: 期待ドメインパターンとの一致率
- **Content Type Accuracy**: 期待ContentTypeとの一致率
- **Latency**: 検索レイテンシ（ms）

---

## 6. test_missing_subsidiaries.py

### 目的
Perplexity APIで主要企業グループの子会社一覧を取得し、`company_mappings.json`に未登録の子会社を検出・提案する。

### 実行方法

```bash
# 全親会社の不足子会社を検出（要PERPLEXITY_API_KEY）
pytest backend/tests/test_missing_subsidiaries.py -v -s

# 特定の親会社のみ
pytest backend/tests/test_missing_subsidiaries.py -v -s -k "NTTデータ"

# APIキーなしで登録済み子会社を確認
pytest backend/tests/test_missing_subsidiaries.py -v -s -k "test_show_registered"
```

### 環境変数

```
PERPLEXITY_API_KEY  # Perplexity API キー（API使用テストのみ必要）
```

### 主要親会社リスト

| カテゴリ | 企業 |
|---|---|
| IT・通信 | NTTデータ, NTT, 富士通, NEC, 日立製作所, 野村総合研究所, SCSK, TIS |
| 商社 | 三井物産, 三菱商事, 伊藤忠商事, 丸紅, 住友商事 |
| 金融 | 三菱UFJフィナンシャル・グループ, みずほフィナンシャルグループ, 三井住友フィナンシャルグループ |
| メーカー | トヨタ自動車, ソニー, パナソニック |

### テストクラス

#### `TestMissingSubsidiaries`
不足子会社の検出テスト

- `test_show_registered_subsidiaries`: 登録済み子会社の一覧表示（APIキー不要）
- `test_find_missing_subsidiaries`: 親会社ごとに不足子会社を検出（パラメタライズド）

#### `TestSpecificParent`
特定の親会社をテスト（デバッグ用）

- `test_nttdata_subsidiaries`: NTTデータの子会社を確認

#### `TestDomainEstimation`
ドメインパターン推定のテスト

- `test_estimate_domain_pattern`: 企業名からドメインパターンを推定

### 出力例

```
// 以下を company_mappings.json に追加:
    "NTTデータSBC": {"domains": ["nttdata-sbc"], "parent": "NTTデータ"},
    "NTTデータフォース": {"domains": ["nttdata-force"], "parent": "NTTデータ"},
```

---

## 7. test_content_type_search.py

### 目的
ContentType別の検索精度を検証。URLパターン検出、スコアリング、クエリ生成の正確性を確認。

### 実行方法

```bash
# 全テスト実行
pytest backend/tests/test_content_type_search.py -v

# キーワード定義テストのみ
pytest backend/tests/test_content_type_search.py::TestContentTypeKeywords -v

# 統合テスト（ネットワーク必要）
pytest backend/tests/test_content_type_search.py -v -m integration
```

### テストクラス

#### `TestContentTypeKeywords`
キーワード定義の検証

| テスト名 | 検証内容 |
|---|---|
| `test_all_content_types_have_keywords` | 全ContentTypeにキーワードが定義されている |
| `test_keyword_structure` | 各ContentTypeにurl/title/snippetキーが存在 |
| `test_no_critical_keyword_overlap_between_types` | URLキーワードの重複チェック |
| `test_get_content_type_keywords_returns_correct_structure` | 正しい構造を返す |
| `test_get_search_type_for_content_type` | ContentType → SearchType変換 |

#### `TestContentTypeDetection`
URL検出の検証

| テスト名 | 検証内容 |
|---|---|
| `test_detect_ceo_message_from_url` | 社長メッセージURLパターンの検出 |
| `test_detect_employee_interviews_from_url` | 社員インタビューURLパターンの検出 |
| `test_detect_ir_materials_from_url` | IR資料URLパターンの検出 |
| `test_detect_press_release_from_url` | プレスリリースURLパターンの検出 |
| `test_detect_csr_sustainability_from_url` | CSR/サステナビリティURLパターンの検出 |
| `test_no_detection_for_generic_url` | 一般的なURLでは検出しない |

#### `TestConflictingTypes`
競合タイプの検証

| テスト名 | 検証内容 |
|---|---|
| `test_ceo_message_conflicts_with_interviews` | 社長メッセージと社員インタビューが競合 |
| `test_ir_materials_conflicts_with_midterm_plan` | IR資料と中期経営計画が競合 |
| `test_recruitment_types_conflict` | 新卒と中途が競合 |

#### `TestContentTypeScoring`
スコアリング検証

| テスト名 | 検証内容 |
|---|---|
| `test_ceo_message_url_pattern_detected` | 社長メッセージURLパターンが検出される |
| `test_ceo_message_title_pattern_detected` | 社長メッセージタイトルパターンが検出される |
| `test_content_type_mismatch_penalty` | ContentType不一致でペナルティが適用される |
| `test_backward_compatibility_without_content_type` | content_type未指定時の後方互換性 |

#### `TestContentTypeSearchIntegration`
統合テスト（ネットワーク必要）

- `test_ceo_message_search_returns_results`: 社長メッセージ検索で結果が返る
- `test_employee_interviews_search_returns_results`: 社員インタビュー検索で結果が返る

#### `TestQueryBuilding`
クエリ生成テスト

| テスト名 | 検証内容 |
|---|---|
| `test_query_building_with_content_type` | content_type指定時に専用クエリが生成される |
| `test_query_building_fallback_without_content_type` | content_type未指定時にlegacyクエリが生成される |
| `test_query_building_with_custom_query` | custom_query指定時にカスタムクエリが優先される |

---

## 依存関係

### 共通依存

```
pytest
pytest-asyncio
```

### テスト別依存

| テストファイル | 依存モジュール |
|---|---|
| conftest.py | (標準ライブラリのみ) |
| test_company_mappings.py | app.utils.company_names, app.utils.hybrid_search |
| test_subsidiary_detection.py | app.utils.company_names |
| test_comprehensive_search.py | ddgs, app.utils.company_names |
| test_search_precision.py | app.utils.hybrid_search |
| test_missing_subsidiaries.py | app.utils.company_names, httpx, PERPLEXITY_API_KEY |
| test_content_type_search.py | app.utils.content_type_keywords, app.utils.content_types |

---

## 実行例

### 全テスト実行（包括的検索テストを除く）

```bash
cd backend
pytest tests/ -v --ignore=tests/test_comprehensive_search.py
```

### 特定カテゴリのテスト実行

```bash
# 企業マッピング関連
pytest tests/ -v -k "company_mapping"

# 子会社関連
pytest tests/ -v -k "subsidiary"

# ContentType関連
pytest tests/ -v -k "content_type"

# 関係性テストのみ（高速）
pytest tests/ -v -k "TestCompanyRelationships"
```

### 統合テスト（API呼び出しあり）

```bash
# 全統合テスト
pytest tests/ -v -m integration

# 包括的検索テストのみ
pytest tests/test_comprehensive_search.py -v -s -m integration
```

### テストカバレッジ

```bash
pytest tests/ --cov=app --cov-report=html
```

---

## トラブルシューティング

### ImportError が発生する場合

```bash
# backend ディレクトリから実行
cd backend
pytest tests/ -v
```

### 統合テストがスキップされる場合

```bash
# ddgs がインストールされているか確認
pip install duckduckgo-search

# company_id を実際の値に置き換える
# test_search_precision.py::test_baseline_precision 内の company_id を設定
```

### Perplexity API テストがスキップされる場合

```bash
export PERPLEXITY_API_KEY="your-api-key"
pytest tests/test_missing_subsidiaries.py -v -s
```

### 包括的検索テストがタイムアウトする場合

```bash
# 関係性テストのみ実行（API呼び出しなし）
pytest tests/test_comprehensive_search.py -v -k "TestCompanyRelationships"

# 統計テストのみ実行
pytest tests/test_comprehensive_search.py -v -k "TestSearchStatistics"
```
