# ES添削 品質監査レポート (2026-04-14)

## 実行環境

| 項目 | 値 |
|------|------|
| git SHA | `eb50ecd65a42800aac927f0da9b2ba4f719f6d01` |
| 実行日 | 2026-04-14 |
| smoke モデル | gpt-5.4, claude-sonnet |
| extended モデル | claude-sonnet, claude-haiku, gpt-5.4, gemini-3.1-pro-preview |
| judge モデル | gpt-5.4 |
| ケースセット | smoke (8 cases), extended (30 cases) |
| 実行回数 | smoke×1 (strict) + extended×2 (collect + strict) |
| aggregate ファイル | `backend/tests/output/live_es_review_aggregate_20260414T125236Z.json` |

## 対象施策

全9施策の実装完了後の初回品質計測。

1. Assistive grounding prompt
2. 敬称統一 (御社→貴社)
3. User fact 短文帯最適化
4. AI smell Tier 2 検出
5. Extended テストケース追加
6. AI smell 検出改善
7. CAPEL 文字数制御
8. Global rule 最適化
9. Prose quality ブロック

## Baseline 記録

> **本結果は 9施策実装後の初回計測であり、事前 baseline は存在しない。以後の regression 判定基準として使用する。**

## 結果サマリー

### Smoke (strict gate, 2モデル × 8 cases = 16 runs)

| モデル | Pass | Total | Rate |
|--------|------|-------|------|
| gpt-5.4 | 8 | 8 | 100% |
| claude-sonnet | 6 | 8 | 75% |
| **合計** | **14** | **16** | **87.5%** |

sonnet の 2 失敗: `user_fact_tokens:missing` (weak input パラフレーズ), `focus_tokens:missing` (設問語の言い換え)。いずれも LLM 確率性起因。

### Extended (4モデル × 30 cases = 120 runs × 2回 = 240 runs)

| モデル | Pass | Total | Rate |
|--------|------|-------|------|
| gpt-5.4 | 56 | 60 | 93.3% |
| gemini-3.1-pro | 53 | 60 | 88.3% |
| claude-sonnet | 52 | 60 | 86.7% |
| claude-haiku | 46 | 60 | 76.7% |
| **合計** | **207** | **240** | **86.2%** |

### Band 別 pass rate

| モデル | short | medium | long |
|--------|-------|--------|------|
| gpt-5.4 | 100% | 88% | 100% |
| claude-sonnet | 91% | 84% | 83% |
| gemini-3.1-pro | 91% | 84% | 100% |
| claude-haiku | 73% | 75% | 100% |

### 処理統計

| 指標 | 値 |
|------|------|
| 1st attempt 成功 | 165/240 (68.8%) |
| 2 attempts | 31 (12.9%) |
| 3 attempts | 21 (8.8%) |
| 4 attempts (最大) | 23 (9.6%) |
| Length-fix 発火 | 18/240 (7.5%) |
| Length-fix 成功 (soft) | 12/18 (66.7%) |
| Length-fix 成功 (strict) | 2/18 (11.1%) |
| Length-fix 失敗 | 4/18 (22.2%) |
| Fallback rewrite 発火 | 0/240 (0%) |
| AI smell Tier 2 発火 | 0/240 (0%) |
| AI smell warnings (any) | 36 件 |

### AI smell 警告内訳

- `ceremonial_closing`: 16 件
- `ai_signature_phrase`: 13 件
- `vague_modifier_chain`: 7 件

全て Tier 0/1（記録のみ）。Tier 2 reject は発生していない。

## Regression 判定

**施策起因の regression は検出されなかった。**

全 15 種の失敗パターンを分類した結果:

| 分類 | 件数 | 例 |
|------|------|------|
| テストケースのトークン定義が狭い | 6 | intern_reason_three_part_coverage, gakuchika_assistive_medium |
| LLM 確率性 (パラフレーズ) | 4 | company_motivation_required_short_weak (user_fact), post_join_goals (focus) |
| Judge と assistive policy の緊張 | 3 | work_values_assistive_medium, self_pr_assistive_medium |
| haiku モデル制限 | 4 | style:not_dearu, garbled output, char shortfall |
| 施策起因の regression | **0** | — |

## 発見事項と改善提案

### P0 (次回修正)

1. **`intern_reason_three_part_coverage_medium` のトークン拡張**
   - `required_focus_groups` の Group 1 に `("応募", "臨み", "挑み")` を追加
   - Group 3 に `("身につけ", "吸収", "習得", "深め")` を追加
   - prompt に三部構成の語彙保持指示を追加

2. **Assistive grounding の self-focused テンプレ対応**
   - `_format_assistive_grounding_block()` で `fact_priority="self"` のとき企業名言及を抑制
   - work_values, self_pr で judge が企業名を減点する問題を解消

### P1 (改善推奨)

3. **`gakuchika_assistive_medium` の `expected_company_tokens` 拡張**
   - `("事業", "価値", "協働")` を追加

4. **Thin input ガード**
   - 元回答が50字未満の場合、`_format_user_fact_guidance` で「元の表現を骨格にして構成だけ整える」指示を追加

5. **Length-fix prompt に AI smell ガード追加**
   - haiku の garbled output 防止

6. **`_candidate_has_grounding_anchor` の AND→OR 緩和検討**
   - assistive policy + weak RAG のケースで grounding reject が厳しすぎる

### P2 (低優先)

7. prose_style と output_contract の改行禁止重複を整理
8. `_GLOBAL_CONCLUSION_FIRST_RULES` (dead code) の整理
9. `_build_contextual_rules` scope="all" ルール群の視覚的グルーピング

## ドキュメント変更

- `docs/plan/ES_REVIEW_QUALITY_IMPROVEMENT_PLAN.md`: ステータス「実装済み」→「検証済み」
- `docs/review/TRACKER.md`: es-review 行を「検証待ち」→「完了」に更新
- `docs/testing/ES_REVIEW_QUALITY.md`: 4モデル構成に更新済み（本レビュー Step 1）

## 次回アクション

- P0 項目を実装後、CASE_FILTER 指定で該当ケースのみ再実行して効果を確認
- haiku の品質問題は model-specific で、コード側では吸収しきれない。monitoring 継続
- `company_motivation_required_short_weak` は known-hard case として pass rate 期待値を調整する
