# RAG 検索補助プロンプト

> runtime_linkage: forbidden

## Runtime Sources

- `backend/app/prompts/hybrid_search_prompts.py`
- `backend/app/rag/hybrid_search.py`
- `backend/app/utils/content_classifier.py`

## Prompt Surfaces

- `query-expansion.md`: 短文 / 通常 query expansion。
- `hyde.md`: HyDE hypothetical passage generation。
- `content-classification.md`: RAG content type fallback classification。

Non-LLM deterministic search query templates and cross-encoder rerank are not prompt surfaces.

