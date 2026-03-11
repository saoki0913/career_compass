# Qwen3 ES Review Beta

既存の Claude ES 添削を残したまま、就活向けに微調整した `Qwen3` を別経路で運用するための学習ワークスペース。

## ディレクトリ

- `configs/`
  - QLoRA / SFT の設定
- `data/`
  - seed cases と生成済み dataset の説明
- `scripts/build_teacher_dataset.py`
  - 現行 prompt と validator を使って teacher dataset を作る
- `scripts/generate_seed_cases.py`
  - `private/reference_es` から synthetic な弱い初稿と `teacher_top3` / `teacher_rewrite` を作る
- `scripts/train_unsloth_sft.py`
  - Unsloth + TRL で Qwen3 LoRA を学習する
- `scripts/generate_holdout_predictions.py`
  - serve 中の Qwen endpoint に holdout split を流して prediction JSONL を作る
- `scripts/evaluate_holdout.py`
  - holdout の JSON valid / rewrite validator / 文字数 / overlap を集計する
- `scripts/push_artifact_to_hub.py`
  - dataset や LoRA adapter を private Hugging Face repo に upload する
- `modal/serve_qwen_es_review.py`
  - Modal 上で vLLM OpenAI-compatible server を立てる
- `scripts/deploy_modal_service.py`
  - `.env.local` を読み、HF adapter repo から LoRA を取る Modal service を deploy する
- `notebooks/train_qwen3_es_review_colab.ipynb`
  - Colab GPU で `train_unsloth_sft.py` を回す notebook

## 前提

- Python 3.11+
- CUDA GPU
- Hugging Face のモデル取得権限
- `ANTHROPIC_API_KEY`
  - `--teacher-source claude` を使う場合のみ必要

## セットアップ

dataset 生成は backend の既存 Python 環境で回す。`build_teacher_dataset.py` は repo 内の prompt / validator / Claude client を import するため、学習用 venv とは分ける。

学習用 env:

```bash
python -m venv ml/es_review_qwen/.venv
source ml/es_review_qwen/.venv/bin/activate
pip install -r ml/es_review_qwen/requirements-train.txt
```

## 学習フロー

1. seed cases を用意する  
   形式は [data/README.md](/Users/saoki/work/career_compass/ml/es_review_qwen/data/README.md) を参照

2. seed cases を生成する

```bash
python ml/es_review_qwen/scripts/generate_seed_cases.py \
  --output ml/es_review_qwen/data/generated/seed_cases.jsonl
```

3. teacher dataset を生成する

```bash
python ml/es_review_qwen/scripts/build_teacher_dataset.py \
  --input ml/es_review_qwen/data/generated/seed_cases.jsonl \
  --teacher-source existing \
  --skip-reference-overlap-check \
  --output-dir ml/es_review_qwen/data/generated
```

必要なら dataset を private Hugging Face repo に載せる。

```bash
python ml/es_review_qwen/scripts/push_artifact_to_hub.py \
  --source-dir ml/es_review_qwen/data/generated \
  --repo-id saoki0913/career-compass-qwen3-es-review-data \
  --repo-type dataset \
  --private
```

4. Qwen3 LoRA を学習する

```bash
python ml/es_review_qwen/scripts/train_unsloth_sft.py \
  --config ml/es_review_qwen/configs/qwen3_14b_lora.json
```

Colab で回す場合は `ml/es_review_qwen/notebooks/train_qwen3_es_review_colab.ipynb` を使う。
学習後の adapter は同じ script で model repo に push できる。

```bash
python ml/es_review_qwen/scripts/push_artifact_to_hub.py \
  --source-dir ml/es_review_qwen/outputs/qwen3-14b-es-review-lora \
  --repo-id saoki0913/career-compass-qwen3-es-review-lora \
  --repo-type model \
  --private
```

5. 配備済み endpoint で holdout prediction を作る

```bash
python ml/es_review_qwen/scripts/generate_holdout_predictions.py \
  --teacher-records ml/es_review_qwen/data/generated/teacher_records.jsonl \
  --sft-records ml/es_review_qwen/data/generated/sft/test.jsonl \
  --base-url "$QWEN_ES_REVIEW_BASE_URL" \
  --api-key "$QWEN_ES_REVIEW_API_KEY" \
  --model "${QWEN_ES_REVIEW_ADAPTER_ID:-$QWEN_ES_REVIEW_MODEL}" \
  --output ml/es_review_qwen/data/generated/holdout_predictions.jsonl
```

6. holdout を評価する

```bash
python ml/es_review_qwen/scripts/evaluate_holdout.py \
  --predictions ml/es_review_qwen/data/generated/holdout_predictions.jsonl \
  --output ml/es_review_qwen/data/generated/eval_summary.json
```

## vLLM serving on Modal

学習後の adapter は Modal + vLLM で配備する。adapter は `saoki0913/career-compass-qwen3-es-review-lora` から直接取得できる。

```bash
python -m venv ml/es_review_qwen/.venv-serve
source ml/es_review_qwen/.venv-serve/bin/activate
pip install -r ml/es_review_qwen/requirements-serve.txt

python ml/es_review_qwen/scripts/deploy_modal_service.py
```

アプリ側は以下で接続する。

- backend:
  - `QWEN_ES_REVIEW_ENABLED=true`
  - `QWEN_ES_REVIEW_BASE_URL=https://<modal-app>.modal.run/v1`
  - `QWEN_ES_REVIEW_MODEL=Qwen/Qwen3-14B`
  - `QWEN_ES_REVIEW_ADAPTER_ID=es_review`
  - `QWEN_ES_REVIEW_API_KEY=<same api key as Modal>`
- frontend:
  - `NEXT_PUBLIC_QWEN_ES_REVIEW_ENABLED=true`

HF repo を使わず local adapter を直接 volume に置きたい場合だけ、次を使う。

```bash
modal run ml/es_review_qwen/modal/serve_qwen_es_review.py::upload_adapter \
  --local-adapter-dir ml/es_review_qwen/outputs/qwen3-14b-es-review-lora
```

疎通確認:

```bash
python ml/es_review_qwen/scripts/smoke_qwen_endpoint.py \
  --base-url "$QWEN_ES_REVIEW_BASE_URL" \
  --api-key "$QWEN_ES_REVIEW_API_KEY"
```

## 運用方針

- 標準経路は Claude のまま維持する
- Qwen3 は `POST /api/documents/[id]/review/qwen-stream` 経由でのみ使う
- 返却 shape は既存の `top3 + rewrites[0] + template_review + review_meta` を維持する
