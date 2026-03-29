---
name: rag-change-check
description: RAG / search 変更で使う deterministic test、offline eval、live eval の使い分けを固定する。
---

# RAG Change Check

RAG や search quality の変更では、新しい評価基盤を作らず既存 eval を使う。

## 対象

- `backend/app/utils/vector_store.py`
- `backend/app/utils/hybrid_search.py`
- `backend/app/utils/reranker.py`
- `backend/evals/**`

## 必須確認

- 小さなロジック変更:
  - `scripts/ci/run-backend-deterministic.sh`
- retrieval quality 変更:
  - `python backend/evals/rag/evaluate_retrieval.py --input <jsonl> --top-k 5`
- company search / reranker 変更:
  - `backend/tests/company_info/integration/test_live_company_info_search_report.py`
  - または `backend/evals/company_info_search/cli/run_improve_search_test.sh`

## 正本

- `docs/testing/RAG_EVAL.md`
- `backend/evals/README.md`
