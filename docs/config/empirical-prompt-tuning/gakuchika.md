# Gakuchika Prompt Tuning Config

ガクチカ領域の empirical-prompt-tuning 設定。対象プロンプト・バッテリー定義・閾値・シナリオを定義する。

## 対象プロンプトファイル

- `backend/app/prompts/gakuchika_prompts.py`
- `backend/app/prompts/gakuchika_prompt_builder.py`
- `backend/app/prompts/es_templates.py`（ガクチカ ES ドラフト生成部分）

## Batteries

### Battery A（静的: 契約テスト）

```bash
cd backend && pytest tests/gakuchika/test_gakuchika_prompt_contracts.py -x --tb=short -q
```

- ソース: `backend/tests/gakuchika/test_gakuchika_prompt_contracts.py`（10テスト）
- パス判定: 0 failures

### Battery D（静的: facts retention）

```bash
cd backend && pytest tests/gakuchika/test_gakuchika_facts_retention.py -x --tb=short -q
```

- ソース: `backend/tests/gakuchika/test_gakuchika_facts_retention.py`（11テスト）
- パス判定: 0 failures

### Battery C（LLM: judge pointwise）

```bash
cd backend && LIVE_AI_CONVERSATION_LLM_JUDGE=1 GAKUCHIKA_JUDGE_SAMPLES=3 \
  python -m scripts.measure_gakuchika_baseline \
    --label {iter_label} --output-dir {output_dir}
```

- ソース: `backend/scripts/measure_gakuchika_baseline.py`
- 母数: 8ケース（TRAINING 5 + HOLDOUT 3）× 3サンプル = 24ドラフト
- 出力: `{output_dir}/{iter_label}_summary.json`, `_drafts.json`, `_facts_retention.json`
- パス判定: 下記収束閾値

### AI 臭チェック

- `ai-writing-auditor` スキルの Tier 1 パターンを `{iter_label}_drafts.json` に適用
- 母数: 24ドラフト（8ケース × 3サンプル）
- パス判定: Tier 1 該当数の合計が閾値以下

## メトリクス名マッピング

収束判定で使うメトリクスと、実際の JSON 出力キーの対応:

| 判定軸 | 出力ファイル | JSON パス | スケール |
|---|---|---|---|
| judge_mean | `{label}_summary.json` | `judge_per_case.{case_id}.overall_mean_of_axis_means` の全ケース平均 | 1.0–5.0 |
| quote_retention | `{label}_facts_retention.json` | `overall.mean_quote_retention` | 0.0–1.0 |
| combined_fact_retention | `{label}_facts_retention.json` | `overall.mean_combined_fact_retention` | 0.0–1.0 |
| ai_smell_tier1 | subagent B 計測 | Tier 1 該当ドラフト数（24ドラフト合計） | 0–∞ |
| holdout_per_axis | `{label}_summary.json` | `judge_per_case.{holdout_case_id}.axes.{axis}.mean` | 1.0–5.0 |

judge 5軸: `star_completeness`, `user_fact_preservation`, `logical_flow`, `question_depth`, `naturalness`

## シナリオ

- ソース: `backend/tests/conversation/gakuchika_golden_set.py`
- TRAINING_CASES（5件）: `seed_only`, `rough_episode`, `implicit_task`, `domain_jargon`, `learning_shallow` — 最適化中に参照可
- HOLDOUT_CASES（3件）: `rich_detailed`, `ambiguous_role`, `learning_only` — **最適化中の参照禁止**

### holdout 汚染防止ルール

| 許可 | 禁止 |
|---|---|
| `measure_gakuchika_baseline.py` で HOLDOUT を計測（結果取得のみ） | HOLDOUT の内容をプロンプト改善の参考にする |
| 収束判定で holdout スコア劣化をチェック | HOLDOUT の transcript を few-shot に含める |
| | HOLDOUT を Battery A/D のテストフィクスチャに追加 |

## 収束閾値

| 条件 | 閾値 | 備考 |
|---|---|---|
| judge_mean | `>= baseline_judge_mean` | 回帰なし。judge 設定: GAKUCHIKA_JUDGE_SAMPLES=3 |
| quote_retention | `>= baseline - 0.02` | 0.0–1.0 スケール |
| combined_fact_retention | `>= baseline - 0.02` | 0.0–1.0 スケール |
| ai_smell_tier1 | `<= 5` | 24ドラフト合計の Tier 1 該当数 |
| holdout 劣化 | 各ケース各軸で `after - before >= -0.75` | 1–5 スケール（100点換算 -15pt） |
| 連続収束回数 | 2 | |
| max iterations | 5 | |

## コスト見積り

```bash
cd backend && python -c "
from tests.conversation.judge_sampling import estimate_pointwise_cost
print(estimate_pointwise_cost(n_cases=8, n_samples=3, axes_per_case=5))
"
```

## 比較コマンド

```bash
cd backend && LIVE_AI_CONVERSATION_LLM_JUDGE=1 \
  python scripts/compare_gakuchika_runs.py \
    --before-label {baseline_label} \
    --after-label {iter_label} \
    --output-dir {output_dir}
```
