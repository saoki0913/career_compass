# RAG評価（ES添削向け）

ES添削のRAG検索品質をオフラインで評価するためのガイドです。

---

## 目的

- 企業接続に必要な根拠情報が適切に取得できているかを数値で確認
- ハイブリッド検索の重みやHyDE/MMR/Rerankの効果を比較

---

## 入力データ（JSONL）

1行1サンプルのJSONL形式。tenant strict 化後は `company_id`、`tenant_key`、`query` が必須です。

```json
{
  "query_id": "company-info-dena-recruitment-01",
  "company_id": "company_xxx",
  "tenant_key": "00000000000000000000000000000000",
  "query": "ES本文（または設問+回答）",
  "query_type": "single-hop",
  "difficulty": "medium",
  "gold_chunk_ids": ["company_xxx_12", "company_xxx_45"],
  "gold_sources": ["https://example.com/recruit/"],
  "metadata": {
    "company_name": "Example",
    "target_content_type": "new_grad_recruitment",
    "source": "auto_bm25",
    "review_status": "candidate"
  },
  "baseline_topk": [
    {"id": "company_xxx_2", "source_url": "https://example.com/ir/"},
    {"id": "company_xxx_12", "source_url": "https://example.com/recruit/"}
  ]
}
```

### フィールド

- `company_id` (必須): 企業ID  
- `tenant_key` (必須): FastAPI が `X-Career-Principal` から導出する tenant key。ad-hoc 実行では `--tenant-key` で全行 fallback 可能
- `query_id` (必須): stable な一意ID
- `query` (必須): ES本文または設問+回答
- `query_type` (必須): `single-hop` / `multi-hop` / `reasoning` / `conversational` / `fact-lookup`
- `difficulty` (必須): `easy` / `medium` / `hard`
- `gold_chunk_ids` (任意): 正解チャンクID
- `gold_sources` (任意): 正解ソースURL
- `metadata.source` (必須): `auto_bm25` / `manual` / `synthetic`
- `metadata.review_status` (必須): `candidate` / `reviewed`
- `baseline_topk` (任意): 既存手法のトップK（比較用）

`gold_chunk_ids` と `gold_sources` のどちらかがあれば評価可能です。

---

## 実行方法

```bash
python backend/evals/rag/evaluate_retrieval.py \
  --input data/rag_eval_samples.jsonl \
  --top-k 5
```

JSONL に `tenant_key` がない一時サンプルだけを評価する場合は、全行に同じ tenant を適用する fallback として `--tenant-key` を指定します。複数 tenant を含む golden set では JSONL 側に行ごとの `tenant_key` を持たせてください。

```bash
python backend/evals/rag/evaluate_retrieval.py \
  --input data/rag_eval_samples.jsonl \
  --tenant-key 00000000000000000000000000000000 \
  --top-k 5
```

### 主要オプション

- `--semantic-weight` / `--keyword-weight`: ハイブリッド重み
- `--no-expand` / `--no-hyde` / `--no-mmr` / `--no-rerank`: 各処理の無効化
- `--no-bm25`: BM25マージ無効化
- `--no-boosts`: コンテンツタイプブースト無効化
- `--boosts`: ブースト定義JSON（`{"es_review": {...}}` も可）
- `--tenant-key`: JSONL 行に `tenant_key` がない場合の fallback
- `--output`: 結果JSONLの保存
- `--save-baseline`: 集計結果を baseline JSON として明示保存

baseline は通常テストでは更新しません。更新する場合だけ明示します。

```bash
python backend/evals/rag/evaluate_retrieval.py \
  --input backend/evals/rag/golden/company_info_v1.jsonl \
  --save-baseline backend/evals/rag/golden/baseline_v1.json \
  --top-k 5
```

現行 baseline（2026-04-27、52件）は nDCG@5(src)=0.8184、MRR(src)=0.8205、Hit@5(src)=0.8846 です。`baseline_v1.json` は metric だけでなく `golden_sha256`、`query_id_hash`、tenant / content-type 分布、`top_k`、embedding provider / model、評価設定の canonical `config` / `config_hash` も保持し、golden set や検索設定の差し替え漏れを検出します。

---

## Golden set の生成

正本は **BM25自動生成 + 人手レビュー** です。Ragas の synthetic generation は将来拡張候補で、現時点では依存追加しません。

```bash
python backend/evals/rag/generate_golden_set.py \
  --input-dir backend/data/bm25 \
  --output backend/evals/rag/golden/company_info_v1.jsonl \
  --target-total 50
```

生成器は tenant-aware な `{tenant_key}__{company_id}.json` のみ読み込み、strict 化前の company-only BM25 ファイルはスキップします。自動生成された行は `metadata.review_status="candidate"` なので、品質確認済みの行だけ `"reviewed"` に変更します。

## 実検索用 corpus の再投入

実検索 baseline を更新する前に、golden set の `tenant_key` と一致する Chroma / BM25 を作り直します。既存の strict 化前 Chroma/BM25 を直接補正せず、現行 storage 経路で再投入します。

```bash
python backend/evals/rag/seed_eval_corpus.py \
  --input backend/evals/rag/golden/company_info_v1.jsonl \
  --bm25-dir backend/data/bm25 \
  --strict-missing
```

事前確認だけなら `--dry-run` を付けます。`--strict-missing` は golden に対応する tenant-aware BM25 source が欠けた場合に失敗させるため、baseline 更新前の必須チェックです。company-only legacy BM25 は既定では読みません。移行調査で必要な場合だけ `--allow-legacy-bm25` を明示します。

CI では以下だけを必須にします。

- JSONL schema / 分布 / 件数の integrity
- baseline JSON の件数・metric shape integrity
- metric 関数と runner の単体テスト
- generator の tenant-aware 読み込みテスト
- seed corpus の source 解決テスト

local ChromaDB / BM25 を使う実検索の `golden_eval` は baseline 更新時とリリース前確認で実行します。

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

- 事前に企業RAGがChromaに登録済みであり、Chroma metadata / BM25 path が同じ `tenant_key` を持っている必要があります
- strict 化前の company-only BM25 ファイルは評価データ生成でスキップします
- 評価セットは匿名化/最小化し、社外共有を避けてください
