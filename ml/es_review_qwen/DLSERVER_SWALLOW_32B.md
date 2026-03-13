# DLServer Swallow 32B Runbook

学習は DLServer、常時推論は Modal + vLLM を前提にする。`venv` の作成は `A00` で行い、学習も `A00` の `RTX 6000 Ada 48GB x6` を優先する。

## 1. SSH 後の前提

- repo を DLServer 上へ clone するか rsync する
- `HF_TOKEN` を export する
- 学習結果を Hugging Face private repo へ push するなら、同じ `HF_TOKEN` に `write` 権限が必要

```bash
export HF_TOKEN=hf_xxx
```

## 2. 学習環境を作る

```bash
bash ml/es_review_qwen/scripts/bootstrap_dlserver_train.sh
```

この script は training venv を作り、依存 install と preflight をまとめて行う。

## 3. GPU / disk の事前確認

```bash
source ml/es_review_qwen/.venv/bin/activate
python ml/es_review_qwen/scripts/preflight_swallow_32b.py --check-imports
```

`eligible_gpu_indexes` が空なら、そのホストでは Swallow 32B 学習を始めない。`recommended_config` が `qwen3_swallow_32b_a6000_lora.json` なら、そのまま `train_swallow_32b.sh` に任せてよい。`recommended_gpu_index` は空いている GPU の候補。

## 4. 学習を回す

```bash
bash ml/es_review_qwen/scripts/train_swallow_32b.sh
```

`A00` / `a06` の 48GB class GPU では `train_swallow_32b.sh` が自動で `ml/es_review_qwen/configs/qwen3_swallow_32b_a6000_lora.json` を使い、最も空きメモリが大きい GPU を `CUDA_VISIBLE_DEVICES` に自動設定する。80GB 級 GPU がある環境では通常版 config を使う。

出力先:

- `ml/es_review_qwen/outputs/qwen3-swallow-32b-es-review-lora`

## 5. adapter を Hugging Face に push

```bash
bash ml/es_review_qwen/scripts/push_swallow_adapter.sh
```

既定 repo:

- `saoki0913/career-compass-qwen3-swallow-32b-es-review-lora`

## 6. Modal deploy 環境を作る

```bash
bash ml/es_review_qwen/scripts/bootstrap_modal_deploy.sh
```

`.env.local` に `MODAL_TOKEN_ID`, `MODAL_TOKEN_SECRET`, `HF_TOKEN`, `QWEN_ES_REVIEW_API_KEY` があれば、同じ `A00` からそのまま deploy できる。

## 7. Modal に deploy

```bash
bash ml/es_review_qwen/scripts/deploy_swallow_modal.sh
```

## 8. アプリ接続

`.env.local` に次を入れる。

```dotenv
QWEN_ES_REVIEW_ENABLED=true
QWEN_ES_REVIEW_BASE_URL=https://<modal-app>.modal.run/v1
QWEN_ES_REVIEW_MODEL=tokyotech-llm/Qwen3-Swallow-32B-SFT-v0.2
QWEN_ES_REVIEW_ADAPTER_ID=es_review
QWEN_ES_REVIEW_API_KEY=<same api key as Modal>
QWEN_ES_REVIEW_TIMEOUT_SECONDS=120
NEXT_PUBLIC_QWEN_ES_REVIEW_ENABLED=true
```

backend / frontend を再起動すれば、既存の `Qwen β` 導線が Swallow 32B を向く。
