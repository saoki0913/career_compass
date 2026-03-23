# ES添削 品質評価

ES添削の品質を、固定ケースと live provider gate の両方で継続監視するためのドキュメントです。

## 目的

- company grounding policy が設問ごとに正しく働くことを確認する
- 企業根拠、参考ES、ユーザー事実の使い方が安全寄りに崩れていないかを確認する
- over-max / short answer / weak evidence の失敗パターンを固定ケースで再現し、退化を防ぐ
- 全標準モデルで `結論ファースト` と `冗長な導入回避` を共通 rubric で守らせる

## テストレイヤー

### 1. Context Rubric

`backend/tests/es_review/test_es_review_quality_rubric.py` は入力文脈と safety rail の品質を見る。

- `question_axes`
  - 設問と回答から抽出した `事業理解 / 成長機会 / 価値観 / 将来接続 / 役割理解 / インターン機会` の軸に対して `company_evidence_cards` が十分な theme を持つか
- `user_fact_anchors`
  - `selected_user_facts` が `current_answer` と補助 source を適切に拾え、profile を過剰に入れすぎていないか
- `source_priority`
  - `user_provided_corporate_urls` とユーザーが選択して保存した企業ソースが通常 RAG より優先され、その回の添削から evidence card に反映されるか
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
  - 390〜400 字設問で、under-min のあと 2 回目の `length_focus` で収束できるか
- `gpt_length_fix_window`
  - 文字数不足または小超過が専用 `length-fix` 1 回でだけ回収されるか

最終品質 gate では次を必須条件として見る。

- 文字数制約を守る
- `だ・である調`
- 設問に正面から答えている
- 冒頭1文で結論を置き、設問の復唱で始めない
- policy に反する company grounding をしていない
- `review_meta` が期待通りである

### 3. Repair / Policy Tests

`backend/tests/es_review/test_es_review_template_repairs.py` と `backend/tests/es_review/test_es_review_template_rag_policy.py` は lower-level の回帰を止める。

- company grounding policy のマッピング
- company card の theme diversity / required 設問での role+company 軸確保 / assistive 上限 / fallback company issue の条件
- deterministic length repair
- dedicated length-fix pass
- 300〜500 字帯 required 設問で、under-min recovery prompt が 2 回目に使われること
- fallback improvement points
- improvement JSON parse retry
- retry ごとの prompt 圧縮
  - rewrite call が最大 3 回、length-fix が最大 1 回で止まること
  - timeout fallback が 190〜200 字 / 390〜400 字の required template でも通ること
- required template の weak/partial coverage で role-focused second pass が適切に起動すること
- required template で `employee_interviews` 1件だけなら `role_grounded` に上げず、role/company の片軸欠けを second pass で補うこと
- `evidence_coverage_level` は same-company 検証済み card のみで計算すること
- `review_meta` で `company_grounding_safety_applied` と `effective_company_grounding_policy` を確認できること
- foreign domain や `Investors` ページが sources / evidence cards / final rewrite に残らないこと
- official domain の title 表記揺れだけで `企業不一致ペナルティ` が入らないこと
- 標準モデル共通 validator の `answer_focus / verbose_opening / bulletish_or_listlike`

### 4. Next.js source policy tests

`src/app/api/documents/[id]/review/stream/route.test.ts` は、企業ソースの優先順位と保存済み RAG の扱いが崩れていないことを確認する。

- trusted official / parent-allowed source が揃っているときは余計な取得をしない
- third-party source しかないときは保存済みソースの範囲で扱う
- assistive 設問で企業シグナルがないときは企業固有断定を強めない
- freshness ではなく trusted coverage だけで判定する

## Live プロバイダゲート（実 API）

`backend/tests/es_review/integration/test_live_es_review_provider_report.py` を **`RUN_LIVE_ES_REVIEW=1`** で実行する。レポート JSON / Markdown は `backend/tests/output/` に書き出される（`.gitignore` 対象）。

| 環境変数 | 説明 |
|----------|------|
| `LIVE_ES_REVIEW_CASE_SET` | `smoke` / `extended` / `canary` |
| `LIVE_ES_REVIEW_CASE_FILTER` | カンマ区切りの `case_id` でサブセット実行 |
| `LIVE_ES_REVIEW_CAPTURE_DEBUG` | テスト側で `1` にすると、422 時の `detail.debug` に `last_retry_reason` / `attempt_failures` が載る（本番の挙動は `LIVE_ES_REVIEW_CAPTURE_DEBUG` 時のみルータが付与） |

`review_meta` の文字数関連:

- `length_policy`: `strict` または `soft_min_applied`（ルータが soft 下限で受理したとき）
- `length_fix_result`: `not_needed` / `soft_min_applied` / `failed` など（length-fix 専用パスの結果）
- `length_shortfall`: 受理時点の不足文字数（参考）
- `soft_min_floor_ratio`: 最終段の soft rescue で適用した floor。現行は全帯域で `0.9`

ライブゲート `evaluate_live_case` は、ルータの `_soft_min_shortfall` と同条件で **`length_policy` または `length_fix_result` が `soft_min_applied` のときだけ**不足を許容する。runtime / gate ともに、`rewrite 3回 + length-fix 1回` の最終段だけ **`0.9X〜X`** を受理余地とし、それ以外は strict を守る。`dearu_style` は末尾の空白を `strip()` してから **だ・である調** 判定する。

## 実行方法

品質関連だけを見る場合:

```bash
python -m pytest \
  backend/tests/es_review/test_es_review_template_rag_policy.py \
  backend/tests/es_review/test_es_review_template_repairs.py \
  backend/tests/es_review/test_es_review_quality_rubric.py \
  backend/tests/es_review/test_es_review_final_quality_cases.py \
  backend/tests/shared/test_llm_provider_routing.py -q
npm run test:unit -- 'src/app/api/documents/[id]/review/stream/route.test.ts'
```

ES添削スイート全体:

```bash
python -m pytest backend/tests/es_review -q
```

review telemetry 集計:

```bash
python scripts/es-review/summarize_review_telemetry.py path/to/review-results.json
```

## 解釈

- `quality_rubric` は最終文そのものの良し悪しを完全判定するものではない
- 最終品質の gate は `test_es_review_final_quality_cases.py` が担う
- Claude 専用 code を変えずに OpenAI / Gemini / Cohere の structured output 契約と non-Claude prompt hardening が shared layer で崩れていないかは `test_llm_provider_routing.py` で見る
- live な最終文品質は `backend/tests/es_review/integration/test_live_es_review_provider_report.py` を `case_set` ベースで回し、`smoke` では `gpt-5.4-mini` による required gate、`extended` では必要に応じて `LIVE_ES_REVIEW_PROVIDERS=all_standard` で全標準モデル sweep、`canary` では `claude-sonnet` と `gemini-3.1-pro-preview` の少数 sanity を確認する。live の主判定は `文字数 / だ・である調 / 冒頭1文の適合 / grounding / user facts` の deterministic rule とし、judge は補助レポートに留める。OpenAI の rewrite 空レスポンス対策として、improvement は `Responses API`、rewrite は stability-first の Chat Completions 系 text 経路に分離している。Gemini は ES 添削で低温固定を外している。`canary` は non-blocking で、`failure_kind=quality|infra|config` と `preflight_status` をレポートに残す
- OpenAI live で `parse` / `空のテキストレスポンス` が出た場合は、多くが **Responses API で推論が `max_output_tokens` を先に使い切り、可視テキストがゼロ**になったケースに相当する。実装側では **rewrite の `reasoning.effort=none`、出力トークン下限、incomplete 時の内部1回リトライ**で抑えている。改善ポイント JSON は Structured Outputs 経路のため同種の空応答は起きにくい
- live gate の `expected_effective_policy` は **`ReviewMeta.grounding_mode`**（`company_general` / `role_grounded` / `none`）と照合する。`effective_company_grounding_policy`（`required` / `assistive`）とは別物で、以前はフィールド名の取り違えで偽陽性が出うる状態だった
- `company_motivation` の rewrite 検証は **先頭3文まで**に企業アンカー（社名または貴社等）と志望の語を含めば通す（研究・経験から入り、後段で企業に接続する出力を許容）
- `intern_reason` は **先頭2文まで**に参加動機の語（学びたい・試しながら 等）を確認する。設問の `intern_name` にインターン／Internship が含まれる場合、本文に「インターン」と書かなくても **実務・課題・現場** などの文脈があればインターン文脈ありとみなす
- `intern_goals` は **先頭3文まで**にプログラム名または「インターン」等の文脈と、学習目的の語（学びたい・確かめたい 等）を確認する。英語プログラム名のみの設問では、先頭に「インターン」と書かなくても **実務・分析・意思決定** などの文脈で学習目的が読み取れれば通す
- ライブゲートの文字数は原則 `[char_min, char_max]` だが、`review_meta.length_policy == soft_min_applied` または `length_fix_result == soft_min_applied` の場合だけ最終段の soft を許容する。許容帯は全帯域で **`0.9X〜X`**

## CI

- `es-review-live-gate.yml`
  - source policy unit test
  - deterministic ES quality suite
  - live smoke gate (`gpt-5.4-mini` / `smoke`)
  - nightly/manual の `extended` + `all_standard` sweep と `claude-sonnet / gemini-3.1-pro-preview` canary
- `develop-ci.yml` / `main-promotion-guard.yml`
  - frontend build に加えて source policy unit test
  - backend の最小 deterministic smoke (`quality_rubric`, `final_quality_cases`, `test_llm_provider_routing`)
