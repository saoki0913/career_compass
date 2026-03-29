---
description: bugfix、test、security、SEO、refactor、RAG 回帰の品質確認入口。
---

<instructions>
この command は、変更の種類に応じて適切な quality workflow に振り分ける。

frontend bug / UI regression:
1. failing test を置く
2. `npm run test:unit -- <target>`
3. `npm run test:ui:review -- <route>`

backend bug / API change:
1. 関連 pytest
2. `scripts/ci/run-backend-deterministic.sh`

security-sensitive change:
1. auth / owner 判定 / webhook / secrets の観点を確認する
2. `security-change-check` を使う

public page quality:
1. title / meta / OG / structured data / indexability を確認する
2. `seo-change-check` を使う

RAG / search change:
1. `scripts/ci/run-backend-deterministic.sh`
2. `python backend/evals/rag/evaluate_retrieval.py --input <jsonl> --top-k 5`
3. 必要なら live company search eval を使う

refactor:
- frontend は `frontend-refactor-check`
- backend は `backend-refactor-check`
</instructions>
