# Qwen3 Swallow 32B ES Review Beta

既存の Claude ES 添削を残したまま、`Qwen3 Swallow 32B` を `Qwen β` 経路へ載せるための学習・配備ワークスペース。

## Summary

- 学習: DLServer の `80GB` 級 GPU 上で `tokyotech-llm/Qwen3-Swallow-32B-SFT-v0.2` に QLoRA
- 推論: Modal + vLLM の OpenAI-compatible endpoint
- アプリ統合: 既存の `POST /api/documents/[id]/review/qwen-stream` と `POST /api/es/review/qwen/stream`
- 標準経路: Claude のまま維持

## Inference-Only Quality Tuning

再学習なしで品質を上げるときは、まず app 側の Qwen 専用 policy を優先する。

- Qwen β は rewrite-only で動かし、改善ポイント JSON は生成しない
- `top3` は空配列を返し、UI でも改善ポイントを表示しない
- short-answer は prompt context を Claude より小さくする
- reference ES は使わない
- `post_join_goals` / `intern_goals` / `company_motivation` / `role_course_reason` は Qwen 専用 semantic validator を通す
- JSON は strict schema、client は non-thinking mode を使う
- timeout は stage ごとに分離する
  - rewrite: 長めに待つ
  - compact rewrite: さらに短い timeout を使う
  - compact retry も timeout したら deterministic fallback rewrite を返す
- holdout 評価は `ml/es_review_qwen/scripts/evaluate_holdout.py` で `qwen3-beta` validator を使って確認する

## Directory

- `configs/qwen3_swallow_32b_lora.json`
  - Swallow 32B 学習設定
- `scripts/bootstrap_dlserver_train.sh`
  - training venv 作成と依存 install
- `scripts/preflight_swallow_32b.py`
  - GPU / disk / import の事前確認
- `scripts/train_swallow_32b.sh`
  - Swallow 32B 学習の標準 entrypoint
- `scripts/push_swallow_adapter.sh`
  - LoRA adapter を private Hugging Face repo に upload
- `scripts/bootstrap_modal_deploy.sh`
  - Modal deploy 用 venv を作成
- `modal/serve_qwen_es_review.py`
  - Swallow 32B + LoRA の Modal serving
- `scripts/deploy_modal_service.py`
  - `.env.local` を読んで Modal deploy
- `scripts/deploy_swallow_modal.sh`
  - Swallow 32B 用 Modal deploy の標準 entrypoint
- `DLSERVER_SWALLOW_32B.md`
  - DLServer 実行 runbook

## Dataset

既定では既存の生成済み dataset を再利用する。

- train: `ml/es_review_qwen/data/generated/sft/train.jsonl`
- valid: `ml/es_review_qwen/data/generated/sft/valid.jsonl`
- teacher records: `ml/es_review_qwen/data/generated/teacher_records.jsonl`

再生成が必要なときだけ、次を使う。

```bash
python ml/es_review_qwen/scripts/generate_seed_cases.py \
  --output ml/es_review_qwen/data/generated/seed_cases.jsonl

python ml/es_review_qwen/scripts/build_teacher_dataset.py \
  --input ml/es_review_qwen/data/generated/seed_cases.jsonl \
  --teacher-source existing \
  --skip-reference-overlap-check \
  --output-dir ml/es_review_qwen/data/generated
```

## Training On DLServer

DLServer 向けの詳細手順は [DLSERVER_SWALLOW_32B.md](/Users/saoki/work/career_compass/ml/es_review_qwen/DLSERVER_SWALLOW_32B.md) を参照。

最短フロー:

```bash
bash ml/es_review_qwen/scripts/bootstrap_dlserver_train.sh
bash ml/es_review_qwen/scripts/train_swallow_32b.sh
bash ml/es_review_qwen/scripts/push_swallow_adapter.sh
```

DLServer 実機では `A00` の `RTX 6000 Ada 48GB x6` を優先する。`train_swallow_32b.sh` は 48GB class GPU を検出すると `qwen3_swallow_32b_a6000_lora.json` を自動選択し、最も空いている GPU を自動で選ぶ。

既定の adapter repo:

- `saoki0913/career-compass-qwen3-swallow-32b-es-review-lora`

## Modal Serving

serve 用 venv:

```bash
bash ml/es_review_qwen/scripts/bootstrap_modal_deploy.sh
```

deploy:

```bash
bash ml/es_review_qwen/scripts/deploy_swallow_modal.sh
```

local adapter を volume に直置きしたいときだけ:

```bash
modal run ml/es_review_qwen/modal/serve_qwen_es_review.py::upload_adapter \
  --local-adapter-dir ml/es_review_qwen/outputs/qwen3-swallow-32b-es-review-lora
```

## App Integration

- backend:
  - `QWEN_ES_REVIEW_ENABLED=true`
  - `QWEN_ES_REVIEW_BASE_URL=https://<modal-app>.modal.run/v1`
  - `QWEN_ES_REVIEW_MODEL=tokyotech-llm/Qwen3-Swallow-32B-SFT-v0.2`
  - `QWEN_ES_REVIEW_ADAPTER_ID=es_review`
  - `QWEN_ES_REVIEW_API_KEY=<same api key as Modal>`
  - `QWEN_ES_REVIEW_TIMEOUT_REWRITE_SECONDS=90`
  - `QWEN_ES_REVIEW_TIMEOUT_COMPACT_REWRITE_SECONDS=45`
  - `QWEN_ES_REVIEW_TOTAL_BUDGET_SECONDS=150`
- frontend:
  - `NEXT_PUBLIC_QWEN_ES_REVIEW_ENABLED=true`

Modal deploy の既定 profile は `interactive`。ES添削のような対話 workload では `QWEN_MODAL_PROFILE=interactive` を維持し、throughput 重視のときだけ `throughput` に切り替える。

疎通確認:

```bash
python ml/es_review_qwen/scripts/smoke_qwen_endpoint.py \
  --base-url "$QWEN_ES_REVIEW_BASE_URL" \
  --api-key "$QWEN_ES_REVIEW_API_KEY"
```

holdout 評価:

```bash
python ml/es_review_qwen/scripts/generate_holdout_predictions.py \
  --teacher-records ml/es_review_qwen/data/generated/teacher_records.jsonl \
  --sft-records ml/es_review_qwen/data/generated/sft/test.jsonl \
  --base-url "$QWEN_ES_REVIEW_BASE_URL" \
  --api-key "$QWEN_ES_REVIEW_API_KEY" \
  --model "${QWEN_ES_REVIEW_ADAPTER_ID:-$QWEN_ES_REVIEW_MODEL}" \
  --improvement-timeout-seconds 30 \
  --rewrite-timeout-seconds 90 \
  --output ml/es_review_qwen/data/generated/holdout_predictions.jsonl

python ml/es_review_qwen/scripts/evaluate_holdout.py \
  --predictions ml/es_review_qwen/data/generated/holdout_predictions.jsonl \
  --output ml/es_review_qwen/data/generated/eval_summary.json
```

## Cost Check

簡易見積り:

```bash
python ml/es_review_qwen/scripts/estimate_qwen_serving_cost.py \
  --avg-input-tokens 8000 \
  --avg-output-tokens 1000 \
  --avg-gpu-seconds 45 \
  --gpu-type A100-80GB
```

## Notes

- Colab notebook は legacy のまま残す。Swallow 32B の標準学習導線では使わない。
- 既存の `Qwen β` route は残すが、中身は Swallow 32B を前提にする。
- 返却 shape は既存の `top3 + rewrites[0] + template_review + review_meta` を維持する。
