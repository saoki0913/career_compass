# ES添削 品質評価

ES添削の品質を、固定ケースと live provider gate の両方で継続監視するためのドキュメントです。

## 目的

- `TEMPLATE_DEFS` の共通 spec が全テンプレで同じ粒度を保っていることを確認する
- prompt / validator / retry hint が同じ spec を参照し、設問知識の二重管理が再発していないことを確認する
- company grounding policy が設問ごとに正しく働くことを確認する
- 設問分類の `confidence / secondary_candidates / rationale / recommended_grounding_level` が妥当か確認する
- 企業根拠、参考ES、ユーザー事実の使い方が安全寄りに崩れていないかを確認する
- over-max / short answer / weak evidence の失敗パターンを固定ケースで再現し、退化を防ぐ
- fallback が常用経路になっていないかを監視する
- 全標準モデルで `結論ファースト` と `冗長な導入回避` を共通 rubric で守らせる

## テストレイヤー

### 1. Context Rubric

`backend/tests/es_review/test_es_review_quality_rubric.py` は入力文脈と safety rail の品質を見る。

- `question_axes`
  - 設問と回答から抽出した `事業理解 / 成長機会 / 価値観 / 将来接続 / 役割理解 / インターン機会` の軸に対して `company_evidence_cards` が十分な theme を持つか
- `user_fact_anchors`
  - `selected_user_facts` が `current_answer` と補助 source を適切に拾え、profile を過剰に入れすぎていないか
- `source_priority`
  - `user_provided_corporate_urls` が family-aligned retrieval boost として働き、ユーザーが選択して保存した企業ソースと一緒にその回の添削へ反映されるか
- `reference_outline`
  - 参考ESが本文ではなく `quality hints + skeleton + conditional hints` として使われているか
- `coverage_level / weak_notice`
  - `evidence_coverage_level` が期待水準を満たし、根拠が弱いときは通知が立つか
- `classification_diag`
  - `predicted_template_type / confidence / secondary_candidates / recommended_grounding_level` が設問文と整合するか

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
  - 390〜400 字設問で、strict → focused retry 1 → focused retry 2 → length-fix の順で収束できるか
- `multi_focus_retry`
  - `under_min + verbose_opening` や `under_min + grounding` のような複合失敗で、`length` を主因、`opening / grounding` を副因として同じ retry に載せて収束できるか
- `gpt_length_fix_window`
  - 文字数不足または小超過が専用 `length-fix` 1 回でだけ回収されるか
- `required_short_answer_guidance`
  - required 設問の 150〜220 字帯が 2〜3 文へ圧縮されすぎず、3〜4 文と bridge guidance で under-min を防げるか
- `style_normalization_salvage`
  - Gemini などで `です・ます` が残っても、安全な決定論正規化で だ・である調へ寄せて回収できるか
- `fallback_safe_rewrite`
  - 非 length 主因の複合失敗で safe fallback rewrite が発火し、`fallback_triggered` と `fallback_reason` が残るか

最終品質 gate では次を必須条件として見る。

- 文字数制約を守る
- `だ・である調`
- 設問に正面から答えている
- 冒頭1文で結論を置き、設問の復唱で始めない
- policy に反する company grounding をしていない
- `review_meta` が期待通りである

### 3. Repair / Policy Tests

`backend/tests/es_review/test_es_review_template_repairs.py` と `backend/tests/es_review/test_es_review_template_rag_policy.py` は lower-level の回帰を止める。

- `TEMPLATE_DEFS` の全テンプレが `purpose / required_elements / anti_patterns / recommended_structure / evaluation_checks / retry_guidance / company_usage / fact_priority` を持つこと
- prompt structure テストで `required_elements` と `anti_patterns` が system prompt に展開されること
- validator が `evaluation_checks` の `repeated_opening_pattern` / head focus / anchor / `negative_self_eval_patterns` を参照していること
- retry hint が `retry_guidance` を参照してテンプレ別の under-min 補修文言を返すこと
- company grounding policy のマッピング
- grounding level (`none / light / standard / deep`) のマッピングと policy 互換
- company card の theme diversity / required 設問での role+company 軸確保 / assistive 上限 / fallback company issue の条件
- evidence card が `value_orientation / business_characteristics / work_environment / role_expectation` に正規化されること
- reference quality profile の平均・分散・条件付きヒント
- deterministic length repair
- dedicated length-fix pass
- required 設問の 150〜220 字帯と 300〜500 字帯で、`under_min` が `length_focus_min`、`over_max` が `length_focus_max` に振り分けられること
- focused retry が常に最新の failure code 群に追従し、最大 2 つまでの focus mode を組み合わせられること
- `under_min` を含む mixed failure では、retry code と length-fix の主因が `under_min` 側に倒れること
- `self_pr` の自己否定語 (`経験不足` / `自信がない`) が `negative_self_eval` として検知され、`positive_reframe_focus` に乗ること
- 文末未完了の断片が `fragment` として弾かれ、length-fix の soft rescue に紛れないこと
- rewrite validation retry
- retry ごとの prompt 圧縮
  - focused retry 2 回、length-fix が最大 1 回で止まること
  - focused retry / length-fix が低温化されても短字数帯・長字数帯で通ること
- required template の weak/partial coverage で grounding_focus が適切に起動すること
- required template で `employee_interviews` 1件だけなら `role_grounded` に上げず、role/company の片軸欠けを focused retry で補うこと
- required template で **単一 verified source** しか残らない場合でも、excerpt が `事業理解 + 現場期待/役割理解` を含むなら 2 theme card として安全に分解できること
- `evidence_coverage_level` は same-company 検証済み card のみで計算すること
- `review_meta` で `company_grounding_safety_applied` と `effective_company_grounding_policy` を確認できること
- `review_meta` で `classification_confidence` / `classification_secondary_candidates` / `recommended_grounding_level` / `effective_grounding_level` / `fallback_triggered` / `fallback_reason` / `misclassification_recovery_applied` を確認できること
- foreign domain や `Investors` ページが sources / evidence cards / final rewrite に残らないこと
- official domain の title 表記揺れだけで `企業不一致ペナルティ` が入らないこと
- 標準モデル共通 validator の `answer_focus / verbose_opening / bulletish_or_listlike`
- 今回の spec 共通化では `classifier` と `TEMPLATE_RAG_PROFILES` を触らないため、テスト対象の境界をそこまでに固定すること

### 4. Frontend / stream tests

`src/components/es/streaming-review-response.regression.test.ts` と `src/components/es/review-panel-validation.test.ts` は、rewrite-only UI と入力バリデーションが崩れていないことを確認する。

- `rewrite_validation_status=soft_ok` の注意表示
- `rewrite_validation_status=degraded` の注意表示
- `top3` / `issues` を前提にしないストリーミング描画
- 設問条件不足時の ReviewPanel バリデーション

## Live プロバイダゲート（実 API）

`backend/tests/es_review/integration/test_live_es_review_provider_report.py` を **`RUN_LIVE_ES_REVIEW=1`** で実行する。レポート JSON / Markdown は `backend/tests/output/` に書き出される（`.gitignore` 対象）。

### Markdown 表と JSON の読み方（失敗の切り分け）

- 同じタイムスタンプの **`live_es_review_<case_set>_<timestamp>.json`** に、各行の `deterministic_fail_reasons` と `judge_blocking_reasons` が入る。Markdown 表だけでは「`judge` 列が ok なのに `failed`」の理由が分かりにくいが、**`judge_status` はジャッジ API が返ったことの要約**であり、`LIVE_ES_REVIEW_REQUIRE_JUDGE_PASS=0` のときは **決定論 `evaluate_live_case` だけ**で `failed` になり得る。
- **同じ basename の `.md` には、表の下に付録がある**（`## 失敗の内訳`・`## ケース別詳細`）。決定論理由の粗分類、`review_meta` 要約（根拠件数・coverage・grounding 等）、`final_rewrite` 全文、`rewrite_attempt_trace`（`LIVE_ES_REVIEW_CAPTURE_DEBUG=1` 時）を並べ、ターミナルログを手で追わなくても「文字数 / フォーカス / 根拠 / メタ」を切り分けしやすくする。
- 付録の対象は既定 **`LIVE_ES_REVIEW_MD_DETAIL=failed`**（失敗行のみ）。**通過行もターミナル相当の块で残す**ときは `LIVE_ES_REVIEW_MD_DETAIL=all`。
- extended スイープでは失敗の多くが **字数不足**、**focus_tokens:missing**、**style:not_dearu** に集まりやすい。`expected_focus_tokens` は製品ルール（ルータの結論焦点・インターン頭部 regex 等）の **参照**であり、表現のゆらぎは **ルータと同義のトークン**でゲート側も許容する（例: コース志望の「惹か」、インターン理由の「体感」「機会」「鍛え」）。改善時は JSON の `deterministic_fail_reasons` を優先し、`es_review_live_gate.py` と `es_review.py` を突き合わせる。
- 現在の `extended` は **30 ケース**。主要テンプレ × 文字数帯 × grounding に加え、次の hard-input を含む。
  - 箇条書き・メモ書きからの再構成
  - `companyless` なのに選択企業名が漏れる汚染
  - 数値事実の保持を伴う短尺圧縮
  - 近接 role/course の取り違え防止
  - 「理由 / 経験 / 持ち帰り」の複合設問取りこぼし
  - noisy RAG 混在時の selective grounding
  - `です・ます` / 口語混在入力の `だ・である調` 正規化
  - 自己否定表現の安全な言い換え
- `LiveESReviewCase` の `required_focus_groups` は複合設問で各要素が本文に一度は現れることを求め、`forbidden_anywhere_tokens` は本文全体で出てはいけない role 語・他社名・自己否定語の混入を検知する。failure 文字列は既存と同じ `focus_tokens:missing` / `forbidden_token:*` を使う。
- `evaluate_live_case` は under-min 失敗時に `length_shortfall_bucket:{1-5|6-20|21+}`、文末未完了時に `unfinished_tail:detected`、複合設問の欠落 group ごとに `focus_group_missing:{index}` も付与する。aggregate では「どの程度足りないか」「どの設問要素が落ちたか」を切り分けるために使う。

### 手動実行（開発者が明示的に実行）

Live ゲートは **CI では走らせない**。`.env.local` に API キーを用意したうえで、必要なときだけローカルで実行する。

**旧 CI「smoke」相当（ミニ 1 モデル + ジャッジ厳格）**の例:

1. （任意）事前チェック: `npm run test:unit -- 'src/app/api/documents/[id]/route.test.ts'` と、下記「品質関連だけを見る場合」の `pytest` ブロック
2. Live 本体:

```bash
make backend-test-live-es-review \
  LIVE_ES_REVIEW_CASE_SET=smoke \
  LIVE_ES_REVIEW_PROVIDERS=gpt-5.4 \
  LIVE_ES_REVIEW_ENABLE_JUDGE=1 \
  LIVE_ES_REVIEW_REQUIRE_JUDGE_PASS=1 \
  LIVE_ES_REVIEW_FAIL_ON_MISSING_KEYS=1
```

**旧 CI「extended」相当（4 モデル + ジャッジ厳格）**の例:

```bash
make backend-test-live-es-review \
  LIVE_ES_REVIEW_CASE_SET=extended \
  LIVE_ES_REVIEW_PROVIDERS="claude-sonnet,claude-haiku,gpt-5.4,gemini-3.1-pro-preview" \
  LIVE_ES_REVIEW_ENABLE_JUDGE=1 \
  LIVE_ES_REVIEW_REQUIRE_JUDGE_PASS=1 \
  LIVE_ES_REVIEW_FAIL_ON_MISSING_KEYS=1
```

`make backend-test-live-es-review` は `npx dotenv -e .env.local -- python -m pytest ...` でキーを読み込む。拡張スクリプトは `scripts/dev/run-live-es-review-extended.sh` なども参照。

**ブロック条件（pytest が失敗する条件）**は統合テスト内の `blocking_failures` によるもの。

- **決定論**: `evaluate_live_case`（文字数、`だ・である`、`rewrite_validation_status`、`length_fix_result`、メタの provider/model、`grounding_mode`、証拠数、必須トークン、422 相当の `HTTPException` など）。
- **厳格モード**: `LIVE_ES_REVIEW_REQUIRE_JUDGE_PASS=1` かつジャッジ有効時は、ジャッジ API 失敗または `overall_pass=false` もブロックに含める。
- **収集モード**: `LIVE_ES_REVIEW_COLLECT_ONLY=1` のときはレポートは出すが **最後に `pytest.fail` しない**（ローカルで smoke / extended を複数回回して失敗パターンを集める用途）。

**GitHub**: リポジトリの Branch protection で **必須ステータスに「ES Review Live Gate」系が残っている場合は削除**する（ワークフローを廃止したため付かなくなる）。

### 環境変数一覧（統合テスト）

| 環境変数 | 説明 |
|----------|------|
| `LIVE_ES_REVIEW_CASE_SET` | `smoke` / `extended` / `canary` |
| `LIVE_ES_REVIEW_PROVIDERS` | カンマ区切りモデル ID。空のとき **smoke は `gpt-5.4`、extended は 4 モデル既定**（claude-haiku, gpt-5.4, claude-sonnet, gemini-3.1-pro-preview）。`all_standard` で従来の全標準一覧。 |
| `LIVE_ES_REVIEW_CASE_FILTER` | カンマ区切りの `case_id` でサブセット実行 |
| `LIVE_ES_REVIEW_ENABLE_JUDGE` | `1` で LLM ジャッジ（extended 既定 `1`、smoke 既定 `0` はテスト内ロジック） |
| `LIVE_ES_REVIEW_REQUIRE_JUDGE_PASS` | `1` で `overall_pass` 必須（ジャッジ有効時） |
| `LIVE_ES_REVIEW_COLLECT_ONLY` | `1` で失敗しても pytest を緑で終える（集計用） |
| `LIVE_ES_REVIEW_OUTPUT_DIR` | レポート出力先（既定 `backend/tests/output`） |
| `LIVE_ES_REVIEW_CAPTURE_DEBUG` | `1` のときのみ、ルータが rewrite / length-fix の**各試行の生成テキスト**と却下理由を `ReviewMeta` の exclude フィールド（`rewrite_attempt_trace` / `rewrite_rejection_reasons`）に保持する。422 時は `detail.debug` に `rewrite_attempt_trace` も付与。統合テスト `test_live_es_review_provider_report` は実行時に `1` を強制する。 |
| `LIVE_ES_REVIEW_MD_DETAIL` | レポート MD の **ケース別詳細付録**に載せる行: `failed`（既定）または `all`（通過行も `review_meta` 要約・rewrite・trace を出力）。 |

`review_meta` の文字数関連:

- `length_policy`: `strict` または `soft_ok`（ルータが final soft を受理したとき）
- `length_fix_result`: `not_needed` / `soft_recovered` / `failed` など（length-fix 専用パスの結果）
- `length_shortfall`: 受理時点の不足文字数（参考）
- `length_shortfall_bucket`: live aggregate で不足幅を粗く見るためのバケット。`1-5` / `6-20` / `21+`
- `soft_min_floor_ratio`: 最終段の soft rescue で適用した floor。現行は全帯域で `0.9`

`review_meta` の追加診断:

- `selected_company_evidence_themes`: 採用した company evidence card の theme 一覧。required 設問で `事業理解` と `現場期待 / 役割理解` の両軸が取れているかを見る
- `unfinished_tail_detected`: 最終 rewrite が句点なし断片で終わっていないかの診断
- `classification_confidence` / `classification_secondary_candidates`: 設問分類の曖昧さ診断
- `recommended_grounding_level` / `effective_grounding_level`: 推奨接地深度と最終採用深度の差分
- `fallback_triggered` / `fallback_reason`: safe fallback rewrite の発火監視
- `misclassification_recovery_applied`: 近接テンプレ混線を抑える補助ガードの有無

`rewrite_validation_status` は `strict_ok` / `soft_ok` / `degraded` の判定に使う。ライブゲート `evaluate_live_case` は、ルータの `_soft_min_shortfall` と同条件で **`length_policy == soft_ok` または `length_fix_result == soft_recovered`** のときだけ不足を許容する。runtime / gate ともに、`strict → focused retry 1 → focused retry 2 → length-fix` の最終段だけ **`0.9X〜X`** を受理余地とし、それ以外は strict を守る。`rewrite_validation_codes` は degraded 時も単一主因ではなく、最終未解決 code 群を保持する。`dearu_style` は末尾の空白を `strip()` してから **だ・である調** 判定し、style fail は最終検証前に安全な決定論正規化を一度だけ試す。

## 実行方法

品質関連だけを見る場合:

```bash
python -m pytest \
  backend/tests/es_review/test_es_review_template_rag_policy.py \
  backend/tests/es_review/test_es_review_template_repairs.py \
  backend/tests/es_review/test_es_review_quality_rubric.py \
  backend/tests/es_review/test_es_review_final_quality_cases.py \
  backend/tests/shared/test_llm_provider_routing.py -q
npm run test:unit -- \
  src/components/es/streaming-review-response.regression.test.ts \
  src/components/es/review-panel-validation.test.ts
```

ES添削スイート全体:

```bash
python -m pytest backend/tests/es_review -q
```

review telemetry 集計:

```bash
python scripts/es-review/summarize_review_telemetry.py path/to/review-results.json
```

### Live ゲート 5+5 スイープ（ローカル集計）

API キーが揃った環境で、**smoke を 5 回・extended を 5 回**（各ラウンドとも **4 モデル**）実行し、`backend/tests/output/` に出た JSON を **1 本の aggregate** にまとめる:

```bash
./scripts/dev/run-live-es-review-sweep.sh
```

集計のみ（既存の `live_es_review_*.json` を指定）:

```bash
python scripts/dev/aggregate_live_es_review_runs.py backend/tests/output/live_es_review_smoke_*.json
```

### aggregate レポートの内容（改善用）

`scripts/dev/aggregate_live_es_review_runs.py` の出力:

- **JSON**: 従来の `by_model_case` / `failure_reason_counts` に加え、ソースファイル順の全行 **`runs_detail`**（モデル・`template_type`・設問・文字数帯・`rewrite_attempt_count`・各試行のリライト全文 `rewrite_attempt_trace`・採用案 `final_rewrite`・決定論/ジャッジ失敗理由など）。
- **Markdown**: 集計表のあと **Run-by-run detail** セクションに、上記と同内容を**リライト全文込み**で列挙（ファイルが非常に大きくなりうる。`backend/tests/output/` は通常 `.gitignore`）。

上記のトレースは **`LIVE_ES_REVIEW_CAPTURE_DEBUG=1`** が前提（ライブ統合テスト実行時は自動で有効）。

## 解釈

- `quality_rubric` は最終文そのものの良し悪しを完全判定するものではない
- 最終品質の gate は `test_es_review_final_quality_cases.py` が担う
- Claude 専用 code を変えずに OpenAI / Gemini の structured output 契約と non-Claude prompt hardening が shared layer で崩れていないかは `test_llm_provider_routing.py` で見る
- live な最終文品質は `test_live_es_review_provider_report.py` を `case_set` で回す。`smoke` は既定 **gpt-5.4** のみ（手動の軽量実行向け）、`extended` は既定で **4 モデル**（haiku / 5.4 / sonnet / Gemini）。主判定は決定論ルール。`LIVE_ES_REVIEW_REQUIRE_JUDGE_PASS=1` のときは **judge の `overall_pass` もブロック条件**に含める。`COLLECT_ONLY=1` は複数回スイープで失敗を集める用途。OpenAI の rewrite 空レスポンス対策として、rewrite は stability-first の Chat Completions 系 text 経路に分離している。Gemini は ES 添削で低温固定を外している
- OpenAI live で `parse` / `空のテキストレスポンス` が出た場合は、多くが **出力枠を先に使い切り、可視テキストがゼロ**になったケースに相当する。実装側では **rewrite の `reasoning.effort=none`、出力トークン下限、incomplete 時の内部1回リトライ**で抑えている。
- live gate の `expected_effective_policy` は **`ReviewMeta.grounding_mode`**（`company_general` / `role_grounded` / `none`）と照合する。`effective_company_grounding_policy`（`required` / `assistive`）とは別物で、以前はフィールド名の取り違えで偽陽性が出うる状態だった
- `company_motivation` の rewrite 検証は **先頭3文まで**に企業アンカー（社名または貴社等）と志望の語を含めば通す（研究・経験から入り、後段で企業に接続する出力を許容）
- `intern_reason` は **先頭2文まで**に参加動機の語（学びたい・試しながら 等）を確認する。設問の `intern_name` にインターン／Internship が含まれる場合、本文に「インターン」と書かなくても **実務・課題・現場** などの文脈があればインターン文脈ありとみなす
- `intern_goals` は **先頭3文まで**にプログラム名または「インターン」等の文脈と、学習目的の語（学びたい・確かめたい 等）を確認する。英語プログラム名のみの設問では、先頭に「インターン」と書かなくても **実務・分析・意思決定** などの文脈で学習目的が読み取れれば通す。ライブゲートの `intern_goals_required_medium` は、上記に加え **「鍛え・深め・精度・判断・実務」** のいずれかが本文にあれば学習の核として通す（OR グループ）。
- `intern_reason` のライブ検証では **「学びたく」** も参加動機の語として扱う（「学びたい」との表記ゆれ）。**「志望」** もフォーカストークンに含める。
- `role_course_reason` の長文ライブケースでは **「選ぶ・関心・共感」** を志望系トークンに含め、プロンプト上は **志望する** の語を推奨する。
- ライブゲートの文字数は原則 `[char_min, char_max]` だが、`review_meta.length_policy == soft_ok` または `length_fix_result == soft_recovered` の場合だけ最終段の soft を許容する。許容帯は全帯域で **`0.9X〜X`**

## CI

- **Live プロバイダゲート**（実 API）は **GitHub Actions では実行しない**（上記「手動実行」を参照）。
- `develop-ci.yml` / `main-promotion-guard.yml`
  - frontend build に加えて source policy unit test
  - backend の最小 deterministic smoke (`quality_rubric`, `final_quality_cases`, `test_llm_provider_routing`)
