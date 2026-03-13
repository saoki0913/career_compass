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
  - 設問と回答から抽出した `事業理解 / 成長機会 / 価値観 / 将来接続 / 役割理解 / インターン機会` の軸に対して `company_evidence_cards` が十分な theme を持つか
- `user_fact_anchors`
  - `selected_user_facts` が `current_answer` と補助 source を適切に拾え、profile を過剰に入れすぎていないか
- `source_priority`
  - `user_provided_corporate_urls` と `prestream_source_urls` が通常 RAG より優先され、その回の添削から evidence card に反映されるか
- `reference_outline`
  - 参考ESが本文ではなく `quality hints + skeleton` として使われているか
- `coverage_level / weak_notice`
  - `evidence_coverage_level` が期待水準を満たし、根拠が弱いときは通知が立つか

代表ケース:

- `generic_role_post_join_goals`
- `weak_company_motivation`
- `companyless_gakuchika`
- `role_course_reason_role_and_company_axes`
- `intern_goals_program_and_growth_axes`

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
- `gpt_length_focus_retry`
  - 非Claudeの 390〜400 字設問で、under-min が続いたときに 3 回目以降の length-focused retry で収束できるか
- `gpt_length_fix_window`
  - 350 字前後まで短い候補でも、非Claude用の拡張 length-fix 窓で最終回収できるか

最終品質 gate では次を必須条件として見る。

- 文字数制約を守る
- `だ・である調`
- 設問に正面から答えている
- policy に反する company grounding をしていない
- `review_meta` が期待通りである

### 3. Repair / Policy Tests

`backend/tests/es_review/test_es_review_template_repairs.py` と `backend/tests/es_review/test_es_review_template_rag_policy.py` は lower-level の回帰を止める。

- company grounding policy のマッピング
- company card の theme diversity / required 設問での role+company 軸確保 / assistive 上限 / fallback company issue の条件
- deterministic length repair
- dedicated length-fix pass
- 非Claudeの 300〜500 字帯 required 設問で、4文構成 guidance と under-min recovery prompt が使われること
- fallback improvement points
- improvement JSON parse retry
- retry ごとの prompt 圧縮
- required template の weak/partial coverage で role-focused second pass が適切に起動すること
- required template で `employee_interviews` 1件だけなら `role_grounded` に上げず、role/company の片軸欠けを second pass で補うこと
- official domain の title 表記揺れだけで `企業不一致ペナルティ` が入らないこと
- Qwen β の short-answer semantic validator

## 実行方法

品質関連だけを見る場合:

```bash
python -m pytest \
  backend/tests/es_review/test_es_review_template_rag_policy.py \
  backend/tests/es_review/test_es_review_template_repairs.py \
  backend/tests/es_review/test_es_review_quality_rubric.py \
  backend/tests/es_review/test_es_review_final_quality_cases.py \
  backend/tests/shared/test_llm_provider_routing.py -q
```

ES添削スイート全体:

```bash
python -m pytest backend/tests/es_review -q
```

## 解釈

- `quality_rubric` は最終文そのものの良し悪しを完全判定するものではない
- 最終品質の gate は `test_es_review_final_quality_cases.py` が担う
- Claude 専用 code を変えずに OpenAI / Gemini / Cohere / DeepSeek の structured output 契約が shared layer で崩れていないかは `test_llm_provider_routing.py` で見る
- live な最終文品質は、実運用ログとサンプル監査で別途点検する
