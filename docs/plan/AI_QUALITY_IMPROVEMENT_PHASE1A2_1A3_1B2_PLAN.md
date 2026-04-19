---
topic: ai-quality
sub_topic: phase1a2-1a3-1b2
plan_date: 2026-04-19
parent: AI_QUALITY_IMPROVEMENT_PLAN.md
based_on_review: ai_quality_comprehensive_20260419.md
status: 完了
---

# AI 品質改善 Phase 1A-2 + 1A-3 + 1B-2 実行計画（子プラン v2）

**親計画**: [`AI_QUALITY_IMPROVEMENT_PLAN.md`](AI_QUALITY_IMPROVEMENT_PLAN.md)
**根拠**: [`docs/review/ai_quality_comprehensive_20260419.md`](../review/ai_quality_comprehensive_20260419.md)（全体 71/100 B）
**前 sibling**: [`AI_QUALITY_IMPROVEMENT_PHASE1A1_1B01_PLAN.md`](AI_QUALITY_IMPROVEMENT_PHASE1A1_1B01_PLAN.md)（2026-04-19 完了）

## Context

親計画の Phase 1A-1 と Phase 1B-0/1B-1 完了済み。本子プランでは Phase 1A 完走（1A-2 + 1A-3）と Phase 1B 最大ボトルネック解消（1B-2）を 1 セッションで完走する。

- **1A-2**: 出力側ガードレール（`detect_output_leakage` + Claude 3 経路注入、log_only ティア）
- **1A-3**: 合成 labeled dataset + precision/recall harness（holdout 分離）
- **1B-2**: tuple index out of range バグ修正（`web_search.py` + `bm25_store.py`）

## Codex Plan Review

Codex (GPT-5.4) による plan_review を実施（2026-04-19）。以下を反映:
- `_emit_output_leakage_event` から raw_text を除外し metadata のみに（二次漏えい防止）
- dataset を tuning set (70%) / holdout set (30%) に分離

## 実装サマリ

### Branch A: 出力側ガードレール (1A-2)

| ファイル | 変更 |
|---|---|
| `backend/app/utils/llm_prompt_safety.py` | `OutputLeakageResult` dataclass + `detect_output_leakage()` 関数追加（11 regex パターン）|
| `backend/app/utils/llm.py` | `_emit_output_leakage_event` ヘルパ + 3 経路注入（`_call_claude`, `call_llm_streaming`, `call_llm_streaming_fields`）|
| `backend/tests/shared/test_prompt_safety.py` | 出力 leakage 検出テスト 7 件 + caplog 検証 1 件追加 |

### Branch B: Labeled Dataset + P/R (1A-3)

| ファイル | 変更 |
|---|---|
| `backend/tests/shared/fixtures/prompt_safety_dataset.json` | 合成 labeled dataset（input 67+102, output 31+61, tuning/holdout 分離）|
| `backend/tests/shared/test_prompt_safety_metrics.py` | precision/recall harness（holdout のみで計測、P >= 0.95 / R >= 0.90）|

### Branch C: tuple bug fix (1B-2)

| ファイル | 変更 |
|---|---|
| `backend/app/utils/web_search.py` | 空 `company_variants` ガード + 原名 fallback |
| `backend/app/utils/bm25_store.py` | 内側 ndarray 長さガード + mismatch warning + logger 追加 |
| `backend/tests/shared/test_web_search_guards.py` | monkeypatch テスト 3 件 |
| `backend/tests/shared/test_bm25_store_guards.py` | ndarray mock テスト 4 件 |

## 検証結果

- `pytest tests/shared/`: 157 tests passed, 0 failed
- precision/recall (holdout): input P >= 0.95, R >= 0.90 / output P >= 0.95, R >= 0.90
- `grep -n "_emit_output_leakage_event" backend/app/utils/llm.py`: 4 行（定義 1 + 呼び出し 3）

## Out of Scope

- OpenAI / Gemini 経路への展開（次回）
- fail-closed 化 / マスク・ブロックティア（2 週間観察後）
- live eval 実行
- Phase 2 以降
