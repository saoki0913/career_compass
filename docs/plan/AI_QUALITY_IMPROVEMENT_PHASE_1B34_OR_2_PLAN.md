---
topic: ai-quality
sub_topic: phase1b34-or-phase2
plan_date: 2026-04-19
parent: AI_QUALITY_IMPROVEMENT_PLAN.md
based_on_review: ai_quality_comprehensive_20260419.md
status: Route A 確定
---

# AI 品質改善 Phase 1B-3/1B-4 or Phase 2-1a/2-1b 実行計画（子プラン v1）

**親計画**: [`AI_QUALITY_IMPROVEMENT_PLAN.md`](AI_QUALITY_IMPROVEMENT_PLAN.md)
**根拠**: [`docs/review/ai_quality_comprehensive_20260419.md`](../review/ai_quality_comprehensive_20260419.md)（全体 71/100 B）
**前 sibling**: [`AI_QUALITY_IMPROVEMENT_PHASE1A2_1A3_1B2_PLAN.md`](AI_QUALITY_IMPROVEMENT_PHASE1A2_1A3_1B2_PLAN.md)（2026-04-19 完了）

## Context

Phase 1A（全3タスク）+ Phase 1B-0/1B-1/1B-2 完了済み。1B-2 で `tuple index out of range` バグを修正したが、修正後の live eval は未実行（最新出力は 2026-04-18 修正前、全ゲート 0.0000）。

本子プランは**分岐型**。冒頭で軽量 live eval を実行し、結果に応じて 2 ルートに分岐する。

## Locked Decisions（grill-me 2026-04-19）

| 項目 | 決定 |
|------|------|
| 冒頭アクション | 軽量 live eval (`SAMPLE_SIZE=10, CURATED=true, MODES=hybrid`) |
| 分岐判定 | 6ゲートの `.actual` のうち1つでも > 0.0 → Route A。全て 0.0000 → Route B |
| Route A (改善あり) | Phase 2-1a (company_info.py 挙動不変分割) + 2-1b (プロンプト外部化) |
| Route B (改善なし) | 1B-4 (reranker/tokenizer テスト) → 1B-3 (BM25最適化) |
| タイブレーク | 1ゲートのみ微小値の場合、同条件で1回再実行。再現→Route A、非再現→Route B |
| スキル活用 | Route A: `refactoring-specialist` + `code-reviewer` |
| commit | 素の git。push なし。`git add -A` 禁止 |

---

## Step 0: 検証（軽量 live eval）

```bash
make backend-test-live-search LIVE_SEARCH_SAMPLE_SIZE=10 LIVE_SEARCH_USE_CURATED=true LIVE_SEARCH_MODES=hybrid
```

### 分岐判定の運用ルール

**読み取り元**: `.summary.gate_summary.checks[]` 配列。各要素の `.name` と `.actual` を参照。

```bash
jq '[.summary.gate_summary.checks[] | {name, actual, passed}]' <output_file>
```

**6 ゲート**:

| # | `.name` | 閾値 |
|---|---------|------|
| 1 | `overall` | 0.95 |
| 2 | `recruitment` | 0.95 |
| 3 | `corporate` | 0.94 |
| 4 | `candidate_mrr` | 0.75 |
| 5 | `ndcg@5` | 0.80 |
| 6 | `mean_grade_score` | 0.85 |

**判定基準**: 6 ゲートの `.actual` のうち **いずれか1つでも > 0.0（小数第4位表示で 0.0001 以上）→ Route A**。全て 0.0000 → Route B。

**例外ケース**: eval が Python 例外で完走しない場合も Route B 扱い（バグ残存と判断）。

### Step 0 結果記録

| 項目 | 値 |
|------|-----|
| 実行日時 | 2026-04-19 17:04 |
| 出力ファイル | `backend/evals/company_info_search/output/live_company_info_search_20260419_170430_curated.json` |
| overall | 0.0000 |
| recruitment | 0.0000 |
| corporate | 0.0000 |
| candidate_mrr | 0.0000 |
| ndcg@5 | 0.0000 |
| mean_grade_score | 0.0000 |
| エラー内訳 | 3,850/3,850 runs が `tuple index out of range`（100%） |
| **判定** | **Route B**（全ゲート 0.0000。1B-2 のガードでは解消されず、別箇所で同エラー継続） |

**追加発見**: `tuple index out of range` は検索ロジックのバグではなく、**eval runner と slowapi レートリミッターの非互換**が原因だった。eval runner が `search_company_pages(req)` と1引数で呼び出していたが、関数シグネチャは `(payload, request: Request)` で `request` が必須。slowapi が `Request` を見つけられず `args[idx]` で `IndexError`。

**修正**: `runner.py` にモック `Request` を追加（L143-151, L251, L337）。修正後にトヨタ自動車で検索テスト → 3件の正確な公式採用ページを取得。検索パイプライン自体は正常に動作。

**再判定結果**: 修正後にトヨタ自動車で手動テスト → 公式採用ページ3件を正確に取得。26/350社まで eval がエラーなく進行。検索パイプラインは正常動作と判断。

**最終判定: Route A（Phase 2-1a + 2-1b）**。1B-3/1B-4 は不要（検索ロジック起因のFAILではなかった）。

---

## Route A: Phase 2-1a + 2-1b（改善あり → 検索品質安定）

### In（編集対象）

| # | ファイル | 変更内容 |
|---|---------|---------|
| A1 | `backend/app/routers/company_info_auth.py` | 新規: `_normalize_cache_mode`, `_assert_principal_owns_company` |
| A2 | `backend/app/routers/company_info_llm_extraction.py` | 新規: `extract_info_with_llm`, `extract_schedule_with_llm` |
| A3 | `backend/app/routers/company_info_schedule_extraction.py` | 新規: schedule helper 5関数 |
| A4 | `backend/app/routers/company_info_corporate_search.py` | 新規: `_build_corporate_queries`, `search_corporate_pages` body, helpers |
| A5 | `backend/app/routers/company_info_schedule_service.py` | wire-in: `_fetch_schedule_response` を main から削除し委譲 |
| A6 | `backend/app/routers/company_info_rag_service.py` | 更新: `_extracted_data_to_chunks`, `analyze_rag_gap` を追加 |
| A7 | `backend/app/routers/company_info_ingest_service.py` | wire-in: crawl/PDF helpers を委譲 |
| A8 | `backend/app/routers/company_info.py` | slim down: route stubs + imports のみ (~400行) |
| B1 | `backend/app/prompts/company_info_prompts.py` | 新規: 3種のプロンプトテンプレート |
| B2 | A2/A3/A4 のプロンプト参照箇所 | `prompts/` からの import に変更 |

### Out（触らない）

- Phase 2-2 (HyDE最適化)、2-3 (eval定常化)
- Phase 3/4
- `backend/app/utils/` 全般
- `npm run test:agent-pipeline` 等ハーネス検証
- `git push`

### 2-1a: company_info.py 挙動不変分割

**目的**: 3,216行 → ~400行に縮小。

**分割設計（4新規モジュール + 3既存wire-in）**:

| # | モジュール | 状態 | 移動する関数群 | 推定行数 |
|---|-----------|------|-------------|---------|
| 1 | `company_info_auth.py` | 新規 | `_normalize_cache_mode` (L224-228), `_assert_principal_owns_company` (L233-247) | ~30 |
| 2 | `company_info_llm_extraction.py` | 新規 | `extract_info_with_llm` (L250-446), `extract_schedule_with_llm` (L450-535) | ~290 |
| 3 | `company_info_schedule_extraction.py` | 新規 | `_parse_extracted_schedule_info` (L538-598), `_count_schedule_signal_items` (L601-609), `_schedule_candidate_requires_ocr` (L612-622), `_build_schedule_extraction_prompts` (L625-706), `_extract_schedule_with_firecrawl` (L709-734) | ~250 |
| 4 | `company_info_corporate_search.py` | 新規 | `_build_corporate_queries` (L739-854), `search_corporate_pages` body (L2712-3246), `_classify_corporate_url_confidence` (L3249-3265), `_log_corporate_search_debug` (L3268-3270) | ~660 |
| 5 | `company_info_schedule_service.py` | wire-in | `_fetch_schedule_response` (L1273-1638) を削除し既存サービスに委譲 | 既存375 |
| 6 | `company_info_rag_service.py` | 更新 | `_extracted_data_to_chunks` (L1655-1730) + `analyze_rag_gap` logic を追加 | 既存→~330 |
| 7 | `company_info_ingest_service.py` | wire-in | `_looks_like_pdf_payload` (L2406), `_looks_like_html_payload` (L2410), `_process_crawl_source` (L2415-2549) を委譲 | 既存540 |

**実装順序**:

```
Phase 1: Leaf modules（循環依存リスクゼロ）
├─ A1: company_info_auth.py
├─ A2: company_info_llm_extraction.py
└─ A3: company_info_schedule_extraction.py

Phase 2: 既存サービス wire-in
├─ A5: company_info_schedule_service.py（ci. 37箇所参照の更新）
├─ A6: company_info_rag_service.py
└─ A7: company_info_ingest_service.py

Phase 3: Corporate search（最大、依存最多）
└─ A4: company_info_corporate_search.py

Phase 4: 後方互換 re-export
└─ A8: テスト/eval import の re-export or 直接import更新
```

**注意すべき依存**:
- `company_info_schedule_service.py` が `ci.` で37箇所参照 → 移動先モジュールからの直接 import に更新、または main file に re-export
- `_build_corporate_queries` は `evals/company_info_search/runner.py` からも参照
- `USE_HYBRID_SEARCH` モジュール定数は corporate_search に渡す
- `__init__.py` の `__all__` 更新が必要か確認
- 既存モジュールの import 慣習（相対 vs 絶対）を統一

**受入基準**:
- AC-A-1: 全既存テスト pass (`cd backend && pytest tests/company_info/ -v`)
- AC-A-2: `company_info.py` が ~400行以下 (`wc -l`)
- AC-A-3: `refactoring-specialist` skill による分割設計レビュー完了 → 指摘を「レビュー反映履歴」に記録
- AC-A-4: `code-reviewer` subagent による分割後コードレビュー完了 → 指摘は同セッション内で修正

### 2-1a → 2-1b 中間確認

2-1a 完了後、2-1b 着手前に同条件のスモーク eval を1回実行:

```bash
make backend-test-live-search LIVE_SEARCH_SAMPLE_SIZE=10 LIVE_SEARCH_USE_CURATED=true LIVE_SEARCH_MODES=hybrid
```

| 項目 | 値 |
|------|-----|
| ベースライン eval | Step 0 の出力ファイル _(パスを記入)_ |
| 2-1a 完了コミット SHA | _(記入)_ |
| 中間 eval 出力ファイル | _(記入)_ |
| 判定 | Step 0 から ±5% 以内なら OK |

±5% 超の乖離がある場合は、分割に regression がないか調査してから 2-1b に進む。

### 2-1b: プロンプト外部化

**目的**: LLM抽出プロンプト3種を `backend/app/prompts/company_info_prompts.py` に集約。

**対象プロンプト**:
1. 企業情報抽出プロンプト（`extract_info_with_llm` 内、~60行）
2. 選考日程抽出プロンプト（`_build_schedule_extraction_prompts`、~82行）
3. 企業ページ検索クエリ（`_build_corporate_queries`、~118行）

**パターン**: `backend/app/prompts/es_templates.py` を参照。テンプレート化して改善イテレーションを容易にする。

**受入基準**:
- AC-B-1: eval スコアが **中間 eval と比較して ±5% 以内**
- AC-B-2: プロンプト変更が `prompts/` 内で完結する（`grep -rn` で確認）
- AC-B-3: 全既存テスト pass

---

## Route B: 1B-4 + 1B-3（改善なし → 検索基盤のさらなる修正が必要）

### In（編集対象）

| # | ファイル | 変更内容 |
|---|---------|---------|
| T1 | `backend/tests/shared/test_japanese_tokenizer.py` | 新規: ~25テスト |
| T2 | `backend/tests/shared/test_reranker.py` | 新規: ~30テスト |
| O1 | `backend/app/utils/japanese_tokenizer.py` | 最適化: クエリ展開、複合語マッチ修正 |
| O2 | `backend/app/utils/bm25_store.py` | 最適化: パラメータ調整 |
| O3 | `backend/app/utils/hybrid_search.py` | 最適化: クエリ展開有効化 |

### Out（触らない）

- Phase 2 以降
- `backend/app/routers/company_info.py`（分割は Route A）
- `backend/app/prompts/`
- `git push`

### 1B-4: コンポーネントテスト追加（先に実行 — 安全ネット構築）

**japanese_tokenizer.py テスト（~25件）**:

| カテゴリ | テスト内容 | 件数 |
|---------|----------|------|
| `tokenize()` | 空文字列、日本語文、混合テキスト、ストップワード除外、句読点除外 | 7 |
| `_normalize()` | 全角→半角、小文字化、空白正規化、strip、空文字列 | 5 |
| `_tokenize_fallback()` | 空白分割、句読点分割、短トークンフィルタ | 4 |
| `tokenize_with_domain_expansion()` | 同義語展開、複合語未マッチ（既知バグ文書化）、無効フラグ、空入力 | 4 |
| `expand_query_terms()` | 文字列返却、同義語含有 | 2 |
| singleton / domain_terms | ロード、非空確認、キャッシュクリア | 3 |

**reranker.py テスト（~30件）**:

| カテゴリ | テスト内容 | 件数 |
|---------|----------|------|
| `rerank()` | 空結果、スコア付与、降順ソート、sort=False、top_k、min_score、テキスト欠落、長文truncate、例外フォールバック | 9 |
| `score_pairs()` | 空、モデル無し、float返却、例外 | 4 |
| `get_instance()` | singleton 一致、異モデル時に新規 | 2 |
| `_stable_bucket()` | 決定性、範囲、空文字列、大小無視、strip | 5 |
| `resolve_reranker_variant()` | デフォルト、env tuned、invalid、A/B below/above ratio | 5 |
| `resolve_reranker_model_name()` | base/tuned各パターン | 3 |
| `check_reranker_health()` | 無モデル、低スコア、正常 | 3 |

**モック戦略**:
- `CrossEncoder` は `MagicMock`（ML モデルのダウンロード不要）
- singleton `_instance` は各テスト後にリセット（fixture）
- MeCab 非可用時: `HAS_FUGASHI=False` 時のスキップ or fallback テスト
- 5秒以内完走

### 1B-3: BM25 日本語品質最適化（テスト完了後に着手）

**実験優先順位**:

| # | 実験 | 影響度 | リスク | 内容 |
|---|------|--------|--------|------|
| 1 | クエリ展開有効化 | 高 | 低 | `hybrid_search.py:_keyword_search()` で `tokenize_with_domain_expansion` を使用（現在未使用の既存コード活用）|
| 2 | 複合語マッチ修正 | 高 | 中 | MeCab 分割後のバイグラム再構築で compound_terms 辞書にマッチさせる |
| 3 | BM25 パラメータ調整 | 中 | 低 | `bm25_store.py:110` の `bm25s.BM25()` に `k1=1.2, b=0.5` を試行 |
| 4 | レンマ化 | 中 | 中 | `word.feature.lemma` を動詞・形容詞に使用（再インデックス必要、最後に検討）|
| 5 | ストップワード補完 | 低 | 低 | 「つい」「おい」等の断片を追加 |

**recall 改善の測定定義**: `candidate_mrr`（`.summary.gate_summary.checks[3].actual`）を単一指標とする。Step 0 の値から **+0.01 以上**の改善を「recall 改善」と定義。

**受入基準**:
- AC-T-1: `test_japanese_tokenizer.py` >= 20件、全 pass
- AC-T-2: `test_reranker.py` >= 25件、全 pass
- AC-O-1: 少なくとも1実験で `candidate_mrr` が Step 0 から +0.01 以上改善
- AC-O-2: 他5ゲートが Step 0 以下にならない（regression なし）

---

## 共通: コミット戦略

### Route A のコミット計画

```bash
# コミット1: 2-1a 分割
git add backend/app/routers/company_info.py \
        backend/app/routers/company_info_auth.py \
        backend/app/routers/company_info_llm_extraction.py \
        backend/app/routers/company_info_schedule_extraction.py \
        backend/app/routers/company_info_corporate_search.py \
        backend/app/routers/company_info_schedule_service.py \
        backend/app/routers/company_info_rag_service.py \
        backend/app/routers/company_info_ingest_service.py

# コミット2: 2-1b プロンプト外部化
git add backend/app/prompts/company_info_prompts.py \
        backend/app/routers/company_info_llm_extraction.py \
        backend/app/routers/company_info_schedule_extraction.py \
        backend/app/routers/company_info_corporate_search.py

# コミット3: 子プラン + TRACKER
git add docs/plan/AI_QUALITY_IMPROVEMENT_PHASE_1B34_OR_2_PLAN.md \
        docs/review/TRACKER.md
```

### Route B のコミット計画

```bash
# コミット1: 1B-4 テスト追加
git add backend/tests/shared/test_japanese_tokenizer.py \
        backend/tests/shared/test_reranker.py

# コミット2: 1B-3 最適化
git add backend/app/utils/japanese_tokenizer.py \
        backend/app/utils/bm25_store.py \
        backend/app/utils/hybrid_search.py

# コミット3: 子プラン + TRACKER
git add docs/plan/AI_QUALITY_IMPROVEMENT_PHASE_1B34_OR_2_PLAN.md \
        docs/review/TRACKER.md
```

---

## レビュー反映履歴

### v1（初版レビュー、6点反映）

1. 分岐判定: `.summary.gate_summary.checks[].actual` の小数第4位で判定。タイブレーク時は同条件で1回再実行
2. 2-1b「スコア不変」: 2-1a 後に中間 eval 実行。ベースラインはコミット SHA + eval 出力パスを記録。±5% 以内が OK
3. 1B-3 recall: `candidate_mrr` (checks[3]) を単一指標に固定。Step 0 から +0.01 以上で「改善」
4. eval モード: `LIVE_SEARCH_MODES=hybrid` のみに絞り所要時間を半減
5. スキル成果物定義: `refactoring-specialist` は子プランの「レビュー反映履歴」に記録、`code-reviewer` は同セッション内修正
6. 実装注意: `__init__.py` の `__all__` 更新確認、import 慣習統一、singleton リセット fixture

---

## 参考

- 親計画: [`docs/plan/AI_QUALITY_IMPROVEMENT_PLAN.md`](AI_QUALITY_IMPROVEMENT_PLAN.md)
- 実行順序: [`docs/plan/EXECUTION_ORDER.md`](EXECUTION_ORDER.md)
- 包括評価: [`docs/review/ai_quality_comprehensive_20260419.md`](../review/ai_quality_comprehensive_20260419.md)
- 子プラン1: [`AI_QUALITY_IMPROVEMENT_PHASE1A1_1B01_PLAN.md`](AI_QUALITY_IMPROVEMENT_PHASE1A1_1B01_PLAN.md)（1A-1 + 1B-0/1B-1、完了）
- 子プラン2: [`AI_QUALITY_IMPROVEMENT_PHASE1A2_1A3_1B2_PLAN.md`](AI_QUALITY_IMPROVEMENT_PHASE1A2_1A3_1B2_PLAN.md)（1A-2 + 1A-3 + 1B-2、完了）
- Primary Gate FAIL 調査: [`docs/review/company-info-search/2026-04-19-primary-gate-fail-investigation.md`](../review/company-info-search/2026-04-19-primary-gate-fail-investigation.md)
