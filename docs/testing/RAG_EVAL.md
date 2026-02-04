# RAG評価（ES添削向け）

ES添削のRAG検索品質をオフラインで評価するためのガイドです。

---

## 目的

- 企業接続に必要な根拠情報が適切に取得できているかを数値で確認
- ハイブリッド検索の重みやHyDE/MMR/Rerankの効果を比較

---

## 入力データ（JSONL）

1行1サンプルのJSONL形式。必須は `company_id` と `query` のみです。

```json
{
  "company_id": "company_xxx",
  "query": "ES本文（または設問+回答）",
  "gold_chunk_ids": ["company_xxx_12", "company_xxx_45"],
  "gold_sources": ["https://example.com/recruit/"],
  "baseline_topk": [
    {"id": "company_xxx_2", "source_url": "https://example.com/ir/"},
    {"id": "company_xxx_12", "source_url": "https://example.com/recruit/"}
  ]
}
```

### フィールド

- `company_id` (必須): 企業ID  
- `query` (必須): ES本文または設問+回答
- `gold_chunk_ids` (任意): 正解チャンクID
- `gold_sources` (任意): 正解ソースURL
- `baseline_topk` (任意): 既存手法のトップK（比較用）

`gold_chunk_ids` と `gold_sources` のどちらかがあれば評価可能です。

---

## 実行方法

```bash
python backend/scripts/rag_eval.py \
  --input data/rag_eval_samples.jsonl \
  --top-k 5
```

### 主要オプション

- `--semantic-weight` / `--keyword-weight`: ハイブリッド重み
- `--no-expand` / `--no-hyde` / `--no-mmr` / `--no-rerank`: 各処理の無効化
- `--no-bm25`: BM25マージ無効化
- `--no-boosts`: コンテンツタイプブースト無効化
- `--boosts`: ブースト定義JSON（`{"es_review": {...}}` も可）
- `--output`: 結果JSONLの保存

---

## 指標

IDベースとソースURLベースで以下を算出します。

- Precision@k
- Recall@k
- Hit@k
- MRR@k
- nDCG@k

`gold_sources` がある場合は URL ベースの指標がより現実的です。

---

## 注意点

- 事前に企業RAGがChromaに登録済みである必要があります
- 評価セットは匿名化/最小化し、社外共有を避けてください
