# ES添削機能

ES添削は、設問単位で `改善案`、`改善ポイント`、`出典リンク` を返すストリーミング機能である。
現行実装は「改善ポイントを先に確定し、その改善ポイントを必ず反映する改善案を生成する」方式で動く。
旧来の `scores + 複数リライト案 + 巨大JSON` 方式は使っていない。

## 概要

| 項目 | 内容 |
|------|------|
| フロント入口 | `src/components/es/ReviewPanel.tsx` |
| Next.js API | `POST /api/documents/[id]/review/stream` |
| Next.js β API | `POST /api/documents/[id]/review/qwen-stream` |
| FastAPI API | `POST /api/es/review/stream` |
| FastAPI β API | `POST /api/es/review/qwen/stream` |
| 主モデル | `MODEL_ES_REVIEW` |
| βモデル | `QWEN_ES_REVIEW_MODEL` / `QWEN_ES_REVIEW_ADAPTER_ID` |
| 出力 | `top3` + `rewrites[0]` + `template_review` + `review_meta` |
| ストリーミング順 | `改善案 → 改善ポイント → 出典リンク` |
| 文字数条件 | `char_min = max(0, char_limit - 10)`、`char_max = char_limit` |
| rewrite 再試行 | 通常 5 回 + compact/fallback 1 回 |
| 参考ES | server-side の類似防止と運用メタ確認にだけ使う |

標準経路は Claude のまま維持する。Qwen3 β は別 route からだけ呼び、入力防御、RAG、validator、response shape は既存 ES 添削と揃える。

## リクエスト組み立て

Next.js 側では、設問タイトル、本文、企業、業界・職種選択、ユーザー文脈をまとめて FastAPI に送る。

### 主な入力

| 入力 | 使い方 |
|------|--------|
| `sectionTitle` | テンプレート推定、prompt 条件、RAG query の主要キー |
| `sectionContent` | 改善対象の元ES本文、RAG query の要約元 |
| `sectionCharLimit` | `char_max` と `char_min` の計算に使う |
| `templateType` | 会社未選択時は `gakuchika / self_pr / work_values` のみ。会社選択時は明示指定があれば優先、未指定時は設問文から自動推定 |
| `companyId` | 企業名・業界名・企業RAG取得に使う |
| `industryOverride` | 会社業界が broad / 未設定のときに、添削用の canonical 業界を明示する |
| `roleName` | 会社選択時は必須。添削に使う primary role は UI で選んだ値だけを使う |
| `internName` | インターン系テンプレートの条件に使う |
| `profile_context` | 大学、学部、志望業界、志望職種。背景情報としてのみ使う |
| `gakuchika_context` | completed summary または raw material。個人事実の補強候補として使う |
| `document_context.other_sections` | 同一 document の他設問。既に書かれている事実として使う |

### ユーザー文脈の取得元

ES添削は次の順でユーザー文脈を組み立てる。

1. 現在の設問本文
2. 同一 document の他設問
3. ガクチカ summary
4. ガクチカ raw material
5. プロフィール

#### 未完成ガクチカの扱い

completed していないガクチカでも、`gakuchika_contents.content` に素材があれば ES添削では使う。

- `structured_summary`
  - completed conversation があり、`summary` を parse できる場合
  - `strengths`, `action_text`, `result_text`, `numbers` を使う
- `raw_material`
  - completed でなくても `content` があれば使う
  - deterministic に切り出した `fact_spans` と `content_excerpt` だけを使う
  - 強み、成果、役割、数値の推定は禁止

### fact bank

backend では `allowed_user_facts` を作り、改善ポイント生成と改善案生成の両方で使う。

- `current_answer`
  - 具体的経験・役割・成果・数字に使ってよい
- `document_section`
  - 同一ES内で既に書かれている事実として使ってよい
- `gakuchika_summary`
  - 要約済みの行動、成果、数値、強みとして使ってよい
- `gakuchika_raw_material`
  - 明示文面にある事実だけ使ってよい
  - 強みや成果の推定は禁止
- `profile`
  - 志望職種、志望業界、大学、学部などの背景情報にだけ使う
  - 経験創作には使わない

### 業界・職種の扱い

会社選択済みの ES 添削では、`業界 / 業種 → 職種` を UI で必須入力にする。

- `company.industry` が canonical なら dropdown の初期値に使う
- `金融・保険` のような broad 値や未設定の場合は、レビュー前に業界選択を要求する
- `ReviewPanel` では `設問タイプ` も含めて dropdown ベースの設定カードに統一する
- 業界・職種の選択 UI は chip 群ではなく dropdown を使い、縦スクロールを増やさない
- `現在の設定` には `設問タイプ / 業界 / 職種` をまとめて表示する
- `この設問をAI添削` CTA と `消費クレジット` は、結果表示中も同じ高さを保つ固定フッターに表示する
- 添削中のフッターは disabled にし、進行中の操作導線は増やさない
- 企業情報の連携状態は `ReviewPanel` 上部に常時表示し、添削中と結果表示中は 1 行の compact bar に縮める
- `roleName` は role dropdown または custom 入力で必ず選ばせる
- 同一 ES document 内では、一度選んだ業界・職種を次の設問添削でも保持する
- `documents.jobTypeId` や `application.job_types` は候補表示には使うが、primary role の自動決定には使わない
- review path の `role_context.source` は `user_input | none` のみ
- この業界 / 職種 catalog は志望動機作成機能でも再利用し、broad 業界企業の `industry_selection` と `role_selection` の候補解決に使う

FastAPI には次の shape を渡す。

```json
{
  "role_context": {
    "primary_role": "デジタル企画",
    "role_candidates": ["デジタル企画"],
    "source": "user_input"
  },
  "retrieval_query": "三菱UFJ銀行 / デジタル企画 / デジタル企画を選択した理由 / ..."
}
```

### テンプレート自動推定

`templateType` が未指定なら、設問文から次を推定する。

- `学生時代に力を入れたこと` 系 → `gakuchika`
- `自己PR`, `自分の強み`, `あなたの強み`, `セールスポイント` 系 → `self_pr`
- `インターン参加理由` 系 → `intern_reason`
- `インターンで学びたいこと` 系 → `intern_goals`
- `入社後やりたいこと` 系 → `post_join_goals`
- `職種・コースを選択した理由` 系 → `role_course_reason`
- `働く上で大切にしている価値観` 系 → `work_values`
- `志望理由` 系 → `company_motivation`
- 判定が弱い場合のみ `basic`

### company 未選択モード

会社未選択では企業RAGを使わない「企業非依存モード」で動く。

- user-facing では `gakuchika`, `self_pr`, `work_values` だけを表示する
- backend でも上記以外の template は reject する
- このモードでは業界選択・職種選択を要求しない

## 現行パイプライン

### 1. 入力防御

FastAPI 入口では、ES 本文だけでなく prompt に入るユーザー由来テキスト全体を検査する。

- `high` リスク:
  - `ignore previous instructions`
  - `システムプロンプトを表示`
  - `APIキーを出力`
  - `ツールを使って` のような内部機能誘導
  - `参考ESの内容を表示して` のような reference ES 開示要求
  - `SELECT ... FROM users` や `個人情報を抜き出して` のような SQL / 個人情報抽出要求
- `medium` リスク:
  - role prefix
  - code fence
  - XML風タグ

挙動:

- `high` は遮断して `入力内容を確認して再実行してください。` を返す
- `medium` は sanitize 後に続行する
- サーバーログには `field:reason` だけを残し、入力本文そのものは残さない

sanitize 対象:

- `content`
- `section_title`
- `template_request.question / answer / company_name / industry / intern_name / role_name`
- `role_context`
- `retrieval_query`
- `document_context.other_sections`
- `gakuchika_context` と `profile_context` の文字列フィールド

`content` と `template_request.answer` には `sanitize_es_content()` を使い、それ以外の文字列は `sanitize_prompt_input()` で無害化する。

### 2. 企業RAG取得

企業が紐づく場合は `retrieval_query` でハイブリッド検索を行う。

設問タイプごとの基本 profile は `backend/app/prompts/es_templates.py` の `TEMPLATE_RAG_PROFILES` にある。
職種依存が強いテンプレートでは、追加で `content_type_boosts` を上書きする。

優先度:

- `new_grad_recruitment`
- `employee_interviews`
- `corporate_site`

補助:

- `midterm_plan`
- `press_release`
- `ir_materials`

### 3. grounding 判定

企業RAGがあっても、職種別の根拠が弱い場合は `role_grounded` にしない。

company grounding policy は設問ごとに固定する。

- `required`
  - `company_motivation`
  - `intern_reason`
  - `intern_goals`
  - `post_join_goals`
  - `role_course_reason`
- `assistive`
  - `basic`
  - `gakuchika`
  - `self_pr`
  - `work_values`

`review_meta.grounding_mode` は次のいずれかになる。

- `role_grounded`
  - 職種関連語を含む出典があり、かつ role に効く content type が取れている
- `company_general`
  - 企業情報はあるが、職種別の根拠が弱い
- `none`
  - 企業RAGを使っていない

company grounding が `required` の設問では、streaming rewrite を始める前に Next.js route 側で pre-stream 補強を行う。
`assistive` の設問でも、設問に company fit signal が強い場合だけ軽量な補強を許可する。

- 既存の company source coverage が薄い、または前回取得から 24 時間以上経過している場合にだけ起動する
- 補強は bounded wait で実行し、time budget を超えそうならその時点の source で安全に続行する
- 既存の `/api/companies/[id]/search-corporate-pages` と `/api/companies/[id]/fetch-corporate` を使い、認可・プラン制限・URL 永続化を再利用する
- 高信頼二次情報は query hint の補助にだけ使い、本文根拠や UI 出典には使わない

その上で、`company_general` かつ company grounding が `required` の設問では backend 側で role-focused second pass を 1 回だけ追加する。
`assistive` の設問でも、company fit signal が強く出典が薄いときだけ軽量 second pass を 1 回だけ許可する。

- query: `company_name + primary_role/intern_name + 補助語` を `_build_role_focused_second_pass_query()` で短く組み立てる
- priority content types:
  - `new_grad_recruitment`
  - `employee_interviews`
  - `corporate_site`
- `short_circuit=False`

2nd pass の結果で `grounding_mode` を再判定する。
それでも職種根拠が弱い場合は `company_general` のまま続行し、本文でも企業具体の断定を避ける。

`総合職` や `オープンコース` のような broad role label は別扱いにする。

- role 名そのものを深掘りしない
- 設問から `事業理解 / 成長機会 / 価値観 / 将来接続` の軸を抽出する
- 2nd pass query も `会社名 + 設問軸` に寄せる
- `company_evidence_cards` も theme diversity を優先し、同じ theme の card ばかりにしない
- `review_meta.evidence_coverage_level` が `weak` / `none` のときは、企業断定を広げず安全寄りに返す

### 4. 改善ポイント生成

現行実装は、改善案より先に改善ポイントを確定する。

`build_template_improvement_prompt()` は短い JSON だけを返させる。

- 対象は `元の回答` だけ
- 改善案本文は作らせない
- `allowed_user_facts` は「書いてよい事実の境界」としてだけ使う
- 企業RAGがあっても、評価は `重視能力 / 価値観 / 方向性` レベルに留める
- 元回答や user facts にない経験・役割・成果・数字を前提にしない
- JSON は `category / issue / suggestion` の 3 項目だけ
- `top3` は最大 3 件、`category` は 12 文字以内、`issue / suggestion` は各 60 文字以内に抑える
- 改行、箇条書き、コードブロックは禁止

LLM には最小 schema だけ返させ、`issue_id / required_action / must_appear / priority_rank / difficulty` は backend の `_parse_issues()` で補完する。
`why_now` は shallow な定型文を backend が自動補完しない。LLM か curated fallback が十分具体的な理由を持つときだけ返す。

改善ポイント生成では Claude の JSON parse retry を 1 回だけ有効にしている。
それでも失敗した場合だけ `_fallback_improvement_points()` に落とす。
再帰的な改善ポイント生成は行わない。

### 5. 改善案生成

改善案生成は 2 種類の prompt だけで行う。

- 通常: `build_template_rewrite_prompt()`
- 簡易化: `build_template_fallback_rewrite_prompt()`

rewrite prompt に入れるものは最小限である。

- 設問
- 企業名 / 業界 / インターン名 / 職種名
- 文字数条件
- 元の回答
- `selected_user_facts`
- 改善ポイント
- 失敗コードから作る短い `retry_hint`
- `company_evidence_cards`
- 参考ESから抽出した `reference_quality_block`

`selected_user_facts` は `allowed_user_facts` から relevance と source balance で最大 8 件に絞る。
設問軸の term も加点に使い、generic role のときは `事業理解 / 成長機会 / 価値観 / 将来接続` の軸と噛み合う事実を優先する。
`company_evidence_cards` は `rag_sources` から設問・職種・インターン名との一致度で最大 5 件を選び、`theme / claim / excerpt` に圧縮する。
本文では cards の固有表現を増殖させず、`方向性 / 価値観 / 重視姿勢 / 役割理解 / インターン価値` に抽象化して 1〜2 点だけ接続する。

retry が進むほど prompt は段階的に圧縮する。

- 通常 1 回目
  - user facts 最大 8 件
  - improvement points 3 件
  - 参考ES quality block を利用可
- compact retry
  - user facts 6 件まで
  - improvement points 2 件
  - company cards は 2 件以下
  - 参考ES quality block は外す
- fallback retry
  - user facts 5 件以下
  - company cards は 0〜1 件
  - 元回答の事実保持を最優先する
- small miss length-fix
  - main retry が失敗し、over/under が 25 字以内のときだけ 1 回追加する
  - 直前の本文だけを入力し、意味を変えず字数だけを直す

`gakuchika` / `self_pr` / `work_values` / `basic` では company grounding は assistive とし、company card は 0〜1 件、本文の主軸は常にユーザー事実に置く。

現行実装では次をもう使わない。

- rewrite plan
- coverage map
- targeted repair 用の個別 prompt

### 6. 改善案の検証

改善案の post-check は決定論的なものだけに絞る。

1. 空文字ではないか
2. 文字数制約に収まるか
3. `です・ます調` が混ざっていないか
4. 参考ESに近すぎないか

LLM validator は使わない。
ユーザー事実検査と企業根拠検査を別 LLM で多段実行する構成も廃止した。

### 6.1 文字数調整

文字数調整は `_fit_rewrite_text_deterministically()` に一本化している。

- over: `deterministic_compress_variant()` による軽い圧縮
- under: `_build_deterministic_expansion()` による安全な短句追加

`389 < 390` のような微小不足もここで吸収する。
意味を増やす LLM 文字数補修は行わない。

over-max では次の順で deterministic repair を試す。

1. 冗長句の短縮
2. 低優先文の pruning
3. 安全な文末・読点境界での trim

このため、`428 / 400` のような小さな超過は retry を増やさず吸収できる。
それでも直らない `small over / small under` だけは dedicated な `length-fix` pass を 1 回だけ許可する。

短字数設問 (`char_max <= 220`) では追加の安全弁を持つ。

- 上限は常に厳守する
- 下限未達が 20 字以内なら `soft_min_applied` として採用できる
- このとき `review_meta.length_policy` と `review_meta.length_shortfall` を返す

### 7. 再試行

rewrite の試行回数は固定である。

- 通常 rewrite: 最大 5 回
- 簡易化モード: 1 回

合計 6 回以内で必ず打ち切る。

通常 5 回で通らない場合は、`元回答の具体的事実を極力保持して構成だけ整える` 簡易化モードに切り替える。
このモードで採用された場合は `review_meta.fallback_to_generic = true` を返す。

簡易化モードでも通らない場合だけ、ユーザーには generic な 422 を返す。

## 参考ESの活用

参考ESの保存元は `private/reference_es/es_references.json` である。
現行実装では、参考ESは `抽象化した品質ヒント`、`粗い骨子`、`server-side の類似防止` に使う。

### 何に使うか

1. 近い参考ES件数の把握
2. 平均文字数、文数、結論先行率などの品質プロファイル抽出
3. 設問タイプごとの骨子抽出
4. 類似表現のブロック

### 何には使わないか

- 企業RAGの代替
- 出典リンクの生成
- 参考ES本文の直接コピー
- 参考ES本文や特徴表現の exemplar 的注入
- ユーザー事実の根拠

### 品質ヒントとしての使い方

`build_reference_quality_block()` は、近い参考ESから次のような抽象指標だけを prompt に入れる。

- 目安文字数
- 目安文数
- 数字を含む割合
- 結論先行率
- 設問タイプ別の品質ヒント
- coarse な骨子

参考ES本文そのものは prompt に入れない。
骨子は `論点配置の参考` に留め、文章や流れをそのままなぞることは許可しない。

### 類似防止としての使い方

`detect_reference_text_overlap()` は、生成済み改善案を server-side で参考ESと比較する。

主な検査:

- 正規化文字列ベースの比較
- boilerplate を弱化した長い共通部分の検出
- 複数の文単位一致の検出

基準を超えた場合:

- 改善案は採用されない
- 再試行理由はログに残る
- 最終的に通らなければ generic error を返す

### これで把握できること

参考ESの活用状況は次で追える。

- docs: このファイル
- サーバーログ: `reference_es_count`, `reference_es_mode`, `reference_overlap_blocked`
- テスト: 参考ESは quality profile と overlap guard に限定し、本文流用を許さないこと
- rubric: `docs/testing/ES_REVIEW_QUALITY.md` と `backend/tests/es_review/test_es_review_quality_rubric.py`
- final-quality gate: `backend/tests/es_review/test_es_review_final_quality_cases.py`

## ログの見方

現行実装では、主に次のログを見れば十分である。

- `user facts: count=... sources=...`
- `prompt context: selected_user_facts=... company_evidence_cards=... reference_examples=... evidence_coverage=...`
- `企業RAG判定: 本文長=... 出典数=... 判定=...`
- `grounding_mode=... triggered_enrichment=... enrichment_completed=... enrichment_sources_added=... second_pass_used=...`
- `improvement generation failed: fallback issues を使用`
- `rewrite ... attempt=... mode=normal|fallback`
- `rewrite success: template=... attempt=... chars=... fallback=...`
- `rewrite ... 最終失敗`

## 出典リンク

`template_review.keyword_sources` は UI 表示用の source metadata を含む。

| フィールド | 役割 |
|-----------|------|
| `source_url` | 実際に開くURL |
| `title` | 見出しやページ名 |
| `domain` | ドメイン表示 |
| `content_type` | 正規化済み content type |
| `content_type_label` | UI 向け日本語ラベル |
| `excerpt` | ストリーミング表示する要約 |

frontend では raw `employee_interviews` や `S1` を主見出しにせず、タイトル・種別・ドメインを優先表示する。
カード全体をクリックすると新しいタブで元ページを開ける。

## review_meta

`ReviewResponse.review_meta` には UI と運用確認用のメタ情報を入れる。

```json
{
  "llm_provider": "qwen-es-review",
  "llm_model": "es_review",
  "review_variant": "qwen3-beta",
  "grounding_mode": "company_general",
  "primary_role": "デジタル企画",
  "role_source": "user_input",
  "triggered_enrichment": true,
  "enrichment_completed": true,
  "enrichment_sources_added": 2,
  "reference_es_count": 2,
  "reference_es_mode": "quality_profile_and_overlap_guard",
  "reference_quality_profile_used": true,
  "reference_outline_used": true,
  "company_grounding_policy": "assistive",
  "company_evidence_count": 4,
  "evidence_coverage_level": "partial",
  "weak_evidence_notice": false,
  "injection_risk": "medium",
  "fallback_to_generic": false,
  "length_policy": "strict",
  "length_shortfall": 0,
  "length_fix_attempted": false,
  "length_fix_result": "not_needed"
}
```

主用途:

- UI で `Claude` と `Qwen3 β` のどちらが結果を返したかを区別する
- UI で `企業情報は参照しているが職種別根拠は限定的` を出す
- weak evidence のときに `安全寄りに添削した` 通知を出す
- pre-stream 補強が今回の request で完了したかを確認する
- 簡易化モードが採用されたかを確認する
- 参考ES quality profile と骨子が使われたかを確認する
- 短字数設問で soft min を適用したかを確認する

## ストリーミング

SSE の主な event は以下。

| event | 役割 |
|------|------|
| `progress` | 処理段階 |
| `string_chunk(path="streaming_rewrite")` | 改善案本文の部分文字列 |
| `array_item_complete(path="top3.*")` | 改善ポイント1件 |
| `array_item_complete(path="keyword_sources.*")` | 出典1件 |
| `complete` | 最終 `ReviewResponse` |
| `error` | エラー |

フロントは受信状態と表示状態を分離している。
そのため bursty な upstream chunk が来ても、一気に全文へ差し替えず、`改善案 → 改善ポイント → 出典リンク` を順に文字単位 playback する。

## 旧実装との違い

現在は使っていないもの:

- `es_review_prompts.py`
- 複数 rewrite 案
- score ベースの旧 ESレビューUI
- 参考ES本文の直接 prompt 注入
- 条件未達の途中改善案をフロントへ流す挙動
