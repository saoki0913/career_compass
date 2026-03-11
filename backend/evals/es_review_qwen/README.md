# ES Review Qwen Evals

Qwen3 ES 添削 β のオフライン評価で使う補助コードを置く。

- `metrics.py`
  - `json_valid_rate`
  - `rewrite_validator_success_rate`
  - `char_limit_pass_rate`
  - `reference_overlap_violation_rate`
  - `teacher_tie_or_better_rate`

想定フロー:

1. `ml/es_review_qwen/scripts/build_teacher_dataset.py` で teacher dataset を生成する
2. `ml/es_review_qwen/scripts/train_unsloth_sft.py` で LoRA adapter を学習する
3. holdout に対する推論結果を JSONL へ保存する
4. `ml/es_review_qwen/scripts/evaluate_holdout.py` で validator と指標を集計する

このディレクトリは本番 API の code path には含めない。品質確認専用で使う。
