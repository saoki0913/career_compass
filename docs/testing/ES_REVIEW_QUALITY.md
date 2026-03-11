# ES添削 品質評価

ES添削の品質を、live LLM を毎回回さずに固定ケースで継続監視するためのドキュメントです。

## 目的

- company grounding policy が設問ごとに正しく働くことを確認する
- 企業根拠、参考ES、ユーザー事実の使い方が安全寄りに崩れていないかを確認する
- over-max / short answer / weak evidence の失敗パターンを固定ケースで再現し、退化を防ぐ

## テストレイヤー

### 1. Context Rubric

`backend/tests/es_review/test_es_review_quality_rubric.py` は入力文脈と safety rail の品質を見る。

- `question_axes`
  - 設問から抽出した軸に対して `company_evidence_cards` が十分な theme を持つか
- `user_fact_anchors`
  - `selected_user_facts` が `current_answer` と補助 source を適切に拾えているか
- `reference_outline`
  - 参考ESが本文ではなく `quality hints + skeleton` として使われているか
- `coverage_level / weak_notice`
  - `evidence_coverage_level` が期待水準を満たし、根拠が弱いときは通知が立つか

代表ケース:

- `generic_role_post_join_goals`
- `weak_company_motivation`
- `companyless_gakuchika`

### 2. Final Quality Gate

`backend/tests/es_review/test_es_review_final_quality_cases.py` は mocked Claude 出力を通して、最終 `rewrite` と `review_meta` を直接検証する。

最低限の固定ケース:

- `company_motivation_strong_evidence`
  - required template で company card を複数使い、十分な coverage を返せるか
- `company_motivation_weak_evidence_safe_generalization`
  - 根拠が 1 軸しかないときに、企業固有断定を広げず `weak_evidence_notice=true` へ落とすか
- `gakuchika_uses_assistive_company_grounding`
  - 企業選択済みでも本文主軸はユーザー事実のまま、company fit を補助的にだけ使うか
- `self_pr_uses_assistive_company_fit`
  - 強みの活かし方に company fit を 1 文だけ補助できるか
- `intern_reason_short_answer`
  - 120 字前後の短字数設問で、短くても成立した回答を返せるか
- `over_max_retry_recovers_without_422`
  - 400 字制限を少し超える出力を deterministic repair で救済できるか
- `length_fix_for_small_overflow`
  - deterministic repair で救えない small miss を dedicated length-fix で回収できるか

最終品質 gate では次を必須条件として見る。

- 文字数制約を守る
- `だ・である調`
- 設問に正面から答えている
- policy に反する company grounding をしていない
- `review_meta` が期待通りである

### 3. Repair / Policy Tests

`backend/tests/es_review/test_es_review_template_repairs.py` と `backend/tests/es_review/test_es_review_template_rag_policy.py` は lower-level の回帰を止める。

- company grounding policy のマッピング
- company card の theme diversity / assistive 上限 / fallback company issue の条件
- deterministic length repair
- dedicated length-fix pass
- fallback improvement points
- improvement JSON parse retry
- retry ごとの prompt 圧縮

## 実行方法

品質関連だけを見る場合:

```bash
python -m pytest \
  backend/tests/es_review/test_es_review_template_rag_policy.py \
  backend/tests/es_review/test_es_review_template_repairs.py \
  backend/tests/es_review/test_es_review_quality_rubric.py \
  backend/tests/es_review/test_es_review_final_quality_cases.py -q
```

ES添削スイート全体:

```bash
python -m pytest backend/tests/es_review -q
```

## 解釈

- `quality_rubric` は最終文そのものの良し悪しを完全判定するものではない
- 最終品質の gate は `test_es_review_final_quality_cases.py` が担う
- live な最終文品質は、実運用ログとサンプル監査で別途点検する
