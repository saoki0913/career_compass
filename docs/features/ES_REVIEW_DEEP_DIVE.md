# ES Review プロンプト / Rewrite Pipeline 完全解説

本ドキュメントは、ES Review のリライト処理で LLM が受け取る指示テキストと、その指示が validation / retry / recovery にどう接続されるかを記録した手動監査用資料である。runtime の正本はコードであり、機能全体の正本は `docs/features/ES_REVIEW.md` とする。

---

## Chapter 0: 読み方ガイド

### 0.1 目的とスコープ

`docs/features/ES_REVIEW.md` がシステム全体のアーキテクチャ（UI/BFF/FastAPI/SSE、認証、課金、セキュリティ境界等）を扱うのに対し、本ドキュメントはプロンプト、rewrite loop、validation prompt、retry guidance の内部を記録する。対象は以下の通り:

- System prompt の全セクション構造と各セクションの指示文
- User prompt のフォーマット
- 文字数制御・文体ルール・Anti-AI フレーズの全量
- テンプレート別の分岐ロジックと条件付き指示
- Prompt injection scan / sanitize、公開 SSE DTO、課金確定のような non-prompt 境界は要点だけを記し、詳細は `docs/features/ES_REVIEW.md` を参照する

このディレクトリは `docs/prompts/es-review/README.md` の通り `runtime_linkage: forbidden` であり、アプリ内プロンプトをここから読み込まない。本文内の「全量」「完全」は、監査時点の実装理解を意味し、runtime SSOT ではない。

### 0.2 表記規則

| 表記 | 意味 |
|---|---|
| `<xml_tag>` | プロンプト内の XML セクションタグ |
| `ファイル:行番号` | ソースコード参照（例: `_prompt_builder.py:1228`） |
| `【日本語ヘッダ】` | プロンプト内のセクション見出し |
| `{variable}` | 実行時に埋め込まれる変数 |

### 0.3 処理フロー全体図

```
User Request
  --> BFF (認証/クレジット)
  --> FastAPI Router
  --> Stage 1: コンテキスト準備
      - テンプレート分類 (9テンプレートから自動選択)
      - RAG (企業情報検索 + エビデンスカード生成)
      - ユーザー事実抽出
      - 参考ES品質ヒント反映（統計値なし・文字数帯別骨子）
  --> Stage 2: リライトループ (最大3回)
      - プロンプト組立 (build_template_rewrite_prompt)
      - LLM呼出
      - バリデーション (機械チェック + LLM品質検証 + Fact Guard)
      - AI臭は hard reject ではなく観測値・retry hint として利用
      - 不合格 --> リトライヒント付きで再ループ
  --> Stage 3: リカバリ
      - ループ内の最終付近で条件付き safe_rewrite を使う場合がある
      - ループ後は最善候補を degraded_best_effort 採用 or 422
  --> Stage 4: 組立
      - FastAPI が改善案本文・出典・改善解説・billing_outcome を送出
      - BFF が成功 complete を検証して credit reservation を confirm/cancel
```

### 0.4 Non-Prompt 境界の要点

- **課金境界**: FastAPI は credit を直接変更しない。BFF の `src/bff/es-review/handle-review-stream.ts` と `src/bff/billing/es-review-stream-policy.ts` が Reserve → Confirm/Cancel を担う。
- **公開 SSE 境界**: FastAPI 内部イベント（`string_chunk`, `field_complete`, `array_item_complete`, top-level `billing_outcome`, `internal_telemetry`）は BFF で公開 DTO（`rewrite_delta`, `rewrite_complete`, `explanation_complete`, `source_added`, sanitized `complete`）へ変換される。
- **入力防御**: Prompt injection scan は `backend/app/services/es_review/request.py` と router 層で行い、high は遮断、medium は sanitize して継続する。
- **出力漏洩防止**: 公開 SSE は `source_id`, upstream `requestId`, retry trace, token usage, debug 情報を出さない。公開 `review_meta` は allow-list された subset のみ。

---

## Chapter 1: プロンプト組立の全体像

ソース: `backend/app/prompts/es_templates/_prompt_builder.py`, `backend/app/prompts/es_templates/_types.py`

関数 `build_template_rewrite_prompt()` が rewrite 用の `PromptPlan` を作成し、`PromptRenderer` が system prompt と user prompt に描画する。draft / fallback も同じ型付きレンダリング基盤を使う。

現行の組立は、テンプレート・文字数計画・grounding・retry plan から直接文字列を連結するのではなく、`PromptInstruction` または raw block として `PromptPlan` に集約する。`InstructionId` を持つ指示は ID 単位で重複排除され、priority が高いものを残してから、`PromptRenderer` が定められた section order で XML 風セクションへ出力する。

### 1.1 System prompt の構造

System prompt は以下の順序でセクションを描画する:

```
あなたは{role}である。

<role_task> ... </role_task>
<output_contract> ... </output_contract>
<constraints priority="absolute"> ... </constraints>
<constraints priority="core"> ... </constraints>
<constraints priority="target"> ... </constraints>
<length> ... </length>                  -- 文字数制御セクション (複数ブロック)
<style> ... </style>                    -- 文体ルールセクション (複数ブロック)
<template> ... </template>              -- テンプレート固有指示
<company> ... </company>                -- 企業情報セクション
<context> ... </context>                -- 条件付き (参考ES品質ブロック + ユーザー事実)
<retry> ... </retry>                    -- attempt-specific guidance（フォーカスモード、前回失敗に対する差分リトライヒント）
```

各セクションの中身は、対応するフォーマッタ関数の結果を `PromptInstruction` / raw block として `PromptPlan` に追加して生成される:
- `_format_length_section()` -- `<length_policy>`, セルフチェック, 短字数/中字数ガイダンス
- `_format_style_section()` -- 文体ルール, prose_style, anti_ai_compact, gakuchika_bias_guard
- `_format_template_section()` -- テンプレート固有のガイダンス, プレイブック, 構造テンプレート
- `_format_company_section()` -- 企業エビデンスカード, grounding ルール
- `_format_context_section()` -- 参考ES品質ブロック, ユーザー事実
- `_format_retry_section()` -- フォーカスモード, 前回失敗に対する差分リトライヒント

retry 時は `render_on_retry=False` の初回専用指示を抑制する。具体的には `<role_task>`, `<constraints priority="core">`, `<constraints priority="target">`, 初回用 `<style>` は再掲しない。一方で、LLM call は各回独立しているため、出力契約、事実保全・参考ESコピー防止などの absolute constraints、`<length>`, `<template>`, `<company>`, `<context>` は保持する。`<retry>` は focus mode と前回失敗への差分ヒントだけを出す。

### 1.2 User prompt の構造

User prompt は以下のフォーマットで生成される (`_prompt_builder.py:1411-1417`):

```
【条件】
設問: {question}
企業: {company_name}        <-- company_name が存在する場合のみ
業界: {industry}             <-- industry が存在する場合のみ
インターン名: {intern_name}  <-- intern_name が存在する場合のみ
職種・コース名: {role_name}  <-- role_name が存在する場合のみ
文字数: {char_condition}

【元の回答】
{answer}

この回答を、提出できる改善案に書き直してください。改善案本文のみを返してください。
```

Standard 戦略と Fallback 戦略で条件行の順序が異なる。Standard では「文字数」が最後に来るが、Fallback では「設問」の直後に来る。

### 1.3 Standard vs Fallback 戦略

`RewriteStrategy` enum (`_prompt_builder.py:1025-1027`) と `_StrategyConfig` dataclass (`_prompt_builder.py:1030-1040`) で2戦略を定義する。`_resolve_strategy_config()` (`_prompt_builder.py:1043-1076`) が戦略に応じた設定を返す。

| 項目 | Standard | Fallback |
|---|---|---|
| `role` | テンプレート専門家 (例: 就活ESの志望理由作成のプロフェッショナル) | 日本語のES編集者 |
| `task` | 提出できる改善案本文を1件だけ作る。 | 元回答の事実を保ったまま、提出できる本文に安全に整える。 |
| `absolute_preamble` | 元回答の具体的事実は保ち、構成と伝わり方を改善する / ユーザー事実にない経験・役割・成果・数字を足さない | 具体的事実は元回答とユーザー事実の範囲から出す / 足りない情報は創作せず、一般化してつなぐ |
| `core_closing` | 最終文は具体的な行動や貢献で締め、抽象的な意気込みの羅列にしない | (空文字列 -- 出力されない) |
| `user_prompt_suffix` | この回答を、提出できる改善案に書き直してください。改善案本文のみを返してください。 | 元の具体的事実を極力保ちつつ、構成だけを整えた安全な改善案本文を1件だけ返してください。 |
| `include_template_focus` | true | false |
| `pass_focus_mode_context` | true | false |
| `company_abstraction_fallback` | 企業根拠カードの固有名詞・施策名・組織名・英字略語を本文でそのまま増殖させない | 固有施策、社内体制、数値、成果を新しく断定しない |
| `output_contract_extra` | (空文字列) | `\n- {char_condition}` (文字数条件を追加) |

重要: Fallback 戦略は「Stage 2 が全失敗した後に必ず別 LLM call として走る第2パイプライン」ではない。現行 runtime では `execute_rewrite_loop()` 内で条件を満たすと `build_template_fallback_rewrite_prompt()` を使う `safe_rewrite` が発火し、その後の `execute_recovery_pipeline()` は新規 LLM fallback ではなく、best rejected candidate の `degraded_best_effort` 採用または 422 を行う。

---

## Chapter 2: ロールとタスク定義

ソース: `_prompt_builder.py` `TEMPLATE_ROLES` (行 85-95)

System prompt の冒頭に `あなたは{role}である。` の形式で注入される。

### 2.1 テンプレート別ロール定義

| テンプレートキー | ロール文字列 |
|---|---|
| `basic` | 就活ES作成のプロフェッショナル |
| `company_motivation` | 就活ESの志望理由作成のプロフェッショナル |
| `intern_reason` | 就活ESのインターン志望理由作成のプロフェッショナル |
| `intern_goals` | 就活ESのインターン目標作成のプロフェッショナル |
| `gakuchika` | 就活ESのガクチカ作成のプロフェッショナル |
| `self_pr` | 就活ESの自己PR作成のプロフェッショナル |
| `post_join_goals` | 就活ESの入社後ビジョン作成のプロフェッショナル |
| `role_course_reason` | 就活ESの職種選択理由作成のプロフェッショナル |
| `work_values` | 就活ESの価値観表現作成のプロフェッショナル |

### 2.2 タスク文

タスク文は `<role_task>` タグ内に配置される:

- **Standard**: `提出できる改善案本文を1件だけ作る。`
- **Fallback**: `元回答の事実を保ったまま、提出できる本文に安全に整える。`

---

## Chapter 3: 出力契約 (Output Contract)

ソース: `_prompt_builder.py` 行 1325-1331

`<output_contract>` セクションには以下の5つのハードルールが含まれる:

```
- 出力は改善案本文のみ。1文字目から本文を書き始める
- 説明、前置き、後書き、箇条書き、引用符、JSON、コードブロックは禁止
- 「以下が改善案です」等のメタ説明は禁止
- だ・である調で統一（「です」「ます」は1箇所も使わない）
- 改行・空行を入れず、1段落の連続した文章として出力する
```

### 3.1 Fallback 戦略の追加ルール

Fallback 戦略では `output_contract_extra` により文字数条件が6行目として追加される:

```
- {char_condition}
```

例: `- 360字〜400字`

### 3.2 出力契約の設計意図

これらのルールは後段の validation / post-process と対応しており、LLM に事前に制約を伝えることでリトライ率を下げる役割を持つ。機械 validation が直接 hard block する中心は empty、箇条書き形式、文字数、Fact Guard、断片、companyless 敬称であり、「メタ説明」や単なる改行だけを専用コードで即 reject する設計ではない。

---

## Chapter 4: 制約の3階層

ソース: `_prompt_builder.py` の PromptPlan 組立部分

制約は `<constraints>` タグの `priority` 属性で3階層に分かれる。LLM は上位階層の制約を優先して遵守する。

### 4.1 Absolute Constraints (`priority="absolute"`)

最優先の制約。事実保全と参考ESコピー防止を担う。

#### Preamble (戦略別)

**Standard**:
```
- 元回答の具体的事実は保ち、構成と伝わり方を改善する
- ユーザー事実にない経験・役割・成果・数字を足さない
```

**Fallback**:
```
- 具体的事実は元回答とユーザー事実の範囲から出す
- 足りない情報は創作せず、一般化してつなぐ
```

#### 事実保全ルール

ソース: `_format_fact_preservation_rules()`

```
- 元回答・使えるユーザー事実・企業根拠カードにない数値、役職、経験、成果、企業施策を追加しない
- 文字数不足でも新事実で埋めず、既存事実の説明密度、接続、語尾、構成だけで調整する
- 前回不合格案に含まれる事実でも、正本入力にないものは削除する
- 企業根拠カードは方向性の補助に使い、未確認の固有施策・社内体制・数値として断定しない
- ただし構造改善（文の順序変更、論理接続の補強、行動の具体化、能力の抽象化、貢献像、キャリア接続）で元回答の事実から論理的に導ける表現への置き換え・補強は事実追加に含めない。禁止するのは元にない数値・固有名詞・未経験の出来事の追加のみ
```

5つ目のルールは「構造改善の自由度」を確保するための例外規定であり、LLM が過度に保守的になって改善案の品質が下がることを防ぐ。

#### 参考ESコピー安全ルール

ソース: `_format_reference_copy_safety_rules()`

```
- 参考ESは品質傾向だけを参考にし、本文・語句・特徴的な言い回し・個別エピソードを再利用しない
- 参考ES由来の事実をユーザー事実や企業根拠として扱わない
- 論理構成パターンは構成の参考に留め、パターン内の例示表現や語句をそのまま使わない
```

これは参考ES漏洩防止の中核ルールである。参考ES (`reference_es.py`) は抽象ヒント（品質ヒント・骨子・文レベルの流れ・論理構成パターン）の形でのみプロンプトに渡され、原文・統計値は一切含まれないが、ヒント内の構成パターン記述からも表現を転用しないよう、このルールで二重に防御している。

### 4.2 Core Constraints (`priority="core"`)

ソース: `_prompt_builder.py` の core constraints 追加部分

```
- 設問に正面から答える
- 1文目で設問への答えの核を言い切る
- 最終文は具体的な行動や貢献で締め、抽象的な意気込みの羅列にしない  <-- Standard のみ
- 冗長な接続詞で文字数を浪費しない
- role_name があっても別職種や別コースを仮定しない
```

3行目 (`core_closing`) は Standard 戦略のみ出力される。Fallback 戦略では空文字列のため省略される。

#### テンプレート別 rewrite_closing_guidance

各テンプレート定義の `rewrite_closing_guidance` フィールドが core constraints の末尾に追加される。`_format_rewrite_closing_guidance()` が `\n- {guidance}` の形式で注入する。

| テンプレート | rewrite_closing_guidance |
|---|---|
| `company_motivation` | 結びで元回答の経験と企業根拠カードの方向性を接続した貢献像を述べてよい。企業根拠カードにない固有施策・数値を新たに追加しない |
| `gakuchika` | 結びの1文は元回答の行動・成果から得た能力を「培った」「身につけた」で締める。元回答にない数値や経験は足さず、行動の抽象化のみ行う |
| `self_pr` | 結びで自分の強みを志望先の業務文脈に接続してよい。元回答にない具体的な業務名・技術名は追加しない |
| `intern_reason` | 結びでインターン経験を将来のキャリア像に接続してよい。元回答にない具体的な職種名・企業施策は追加しない |
| `intern_goals` | 結びでインターン経験を将来のキャリア像に接続してよい。元回答にない具体的な職種名・企業施策は追加しない |
| `post_join_goals` | 結びで短期目標から中長期のキャリア像に自然に接続してよい。ただし元回答の経験・志望動機から論理的に導ける範囲に留め、具体的な部署名・プロジェクト名を新たに追加しない |
| `role_course_reason` | 結びで元回答の経験・強みから導ける貢献像を述べてよい。具体的な業務名・技術名は元回答にあるものだけを使う |
| `work_values` | 結びで価値観を志望先の事業特性に接続してよい。企業根拠カードにない固有施策・数値を新たに追加しない |

### 4.3 Target Constraints (`priority="target"`)

ソース: `_prompt_builder.py` の target constraints 追加部分

企業情報の使用方法を制御する。grounding レベルと grounding モードに応じて動的に変わる。

#### 固定行

```
- 企業情報は設問タイプに応じて使い、required でない設問では補助的にだけ使う
```

#### company_specificity_rule (grounding level 別)

| grounding level | ルール |
|---|---|
| `deep` | 企業根拠カード由来の固有候補だけを1軸で使い、カード外の固有名詞・施策・数値は足さない |
| non-deep (Standard) | 企業根拠カードの固有名詞・施策名・組織名・英字略語を本文でそのまま増殖させない |
| non-deep (Fallback) | 固有施策、社内体制、数値、成果を新しく断定しない |

#### company_abstraction_rule (grounding level 別)

| grounding level | ルール |
|---|---|
| `deep` | 固有候補を羅列せず、自分の経験・強み・学びとの接続文として使う |
| non-deep | 本文で企業に触れるときは、方向性・価値観・重視姿勢に抽象化する |

#### company_mention_rule (grounding mode 別)

3つのバリアントがある:

| grounding_mode | ルール |
|---|---|
| `none` | この設問では企業名・企業敬称（貴社・御社・貴行等）を絶対に使わない。自分の経験と強みだけで完結させる |
| assistive (effective_company_grounding) | 企業に言及するときは「{honorific}」を使う。本文全体で2回までにとどめる |
| required (effective_company_grounding) | 企業名は本文中で1回までにとどめ、2回目以降は「{honorific}」を使う |

#### 敬称 (honorific) の決定

`get_company_honorific()` (`_common.py:43-60`) が業界名から敬称を決定する:

| 業界キーワード | 敬称 |
|---|---|
| 信用金庫 | 貴庫 |
| 銀行 | 貴行 |
| 事務所 | 貴所 |
| 学校, 大学 | 貴校 |
| 病院 | 貴院 |
| その他 | 貴社 |

マッチ順序に注意: 「信用金庫」は「銀行」より先にチェックされるため、「信用金庫銀行」のような名前でも「貴庫」が返る。

---

## Chapter 5: 文字数制御システム

### 5.1 Length Policy Block

ソース: `_format_length_policy_block()` (`_length_control.py:352-387`)

`<length_policy>` タグで出力される。`LengthTargetPlan` から算出した受理帯と生成目標帯を LLM に伝える。

```xml
<length_policy>
- strict受理帯: {acceptance_band}
- 今回の生成目標帯: {target_window}
- 最終提出文は strict受理帯から外さない。文字数不足も上限超過も不合格
- 文字数調整は新事実で埋めず、元回答にある行動の目的・対象・結果・学び・接続で行う
</length_policy>
```

条件付き追加行:

- `char_max >= 350` の場合:
  ```
  - 長文設問: 設問が求める複数の軸を削らず、{char_min}字未満で終えない。最終文まで strict 帯内に収める
  ```

- 生成目標帯が受理帯を超える場合 (`plan.generation_exceeds_acceptance`):
  ```
  - 文字数不足の再調整では生成時だけ上限寄せを許すが、最終提出文は必ず{char_max}字以内へ圧縮する
  ```

### 5.2 Self-Count 指示

ソース: `_format_self_count_instruction()` (`_prompt_builder.py:556-610`)

CAPEL 方法論に基づき、LLM に生成中の文字数カウントを促す指示ブロック。

```
【文字数セルフチェック】
- 必須受理帯: {acceptance_desc}
- 生成時の目安: {target_desc}
- 文量配分の目安: {sentence_count}文前後。1文ごとに結論・根拠・接続・締めの役割を持たせる
- Draft → 文字数を数える → strict受理帯に収まるよう Adjust
- 不足時は一般論を足さず、元回答にある行動の目的・対象・結果・学び・接続を具体化する
```

条件付き追加行:

- 前回出力が `char_min` 未満の場合:
  ```
  - 前回出力は{latest_failed_length}字で、最低字数まで{shortfall}字不足。一般論でなく既存事実の説明密度を増やす
  ```

- 前回出力が `char_max` 超過の場合:
  ```
  - 前回出力は{latest_failed_length}字で、上限まで{overshoot}字超過。重複説明と補助論点を圧縮する
  ```

- `char_max >= 320` の場合:
  ```
  - 長文では第1文を結論、第2〜3文を根拠経験、第4文以降を学び・企業接点・今後に割り当てる
  ```

#### 文数の算出式

```python
sentence_count = max(2, round(avg_target / 40))
```

`avg_target` は `char_max` (char_min と char_max 両方ある場合) または `char_min` (char_min のみの場合)。

### 5.3 短字数設問ガイダンス (`char_max <= 220`)

ソース: `_format_short_answer_guidance()` (`_prompt_builder.py:613-673`)

`char_max` が 220 以下の場合のみ出力される。

```
【短字数設問の書き方】
- 2〜3文で構成する                          <-- dense_short_answer の場合は「3〜4文で構成する」
- {structure from rewrite_policy.structure_short}
- 目標は {target} で、短く終わらせない
- {bridge_line}
- 一般論の言い換えだけで埋めず、元回答にある材料をつないで伸ばす
- {char_min}字未満で終えない                 <-- char_min が存在する場合のみ
- 文を細かく切りすぎず、各文に意味を持たせる
```

`bridge_line` は `dense_short_answer` の有無で変わる:
- dense: `文字数が足りないときは、既にある経験・役割・企業接点のつながりを1〜2文まで補う`
- 通常: `文字数が足りないときは、既にある経験・役割・企業接点のつながりを1文だけ補う`

#### dense_short_answer 追加行

`dense_short_answer` フラグが true かつ `150 <= char_max <= 220` の場合に追加:

```
- required 設問では、根拠経験だけで終わらせず、企業接点と貢献の両方を残す
- 3文で足りなければ4文目で役割・学び・貢献のいずれかを言い切る
```

該当テンプレート: `company_motivation`, `intern_reason`, `intern_goals`, `post_join_goals`, `role_course_reason`

#### three_sentence_close_on_short_band 追加行

`three_sentence_close_on_short_band` フラグが true かつ `160 <= char_max <= 220` の場合に追加:

```
- 3文で締め、3文目で仕事や再現性につながる価値を言い切る
- 2文目の具体経験を削りすぎず、根拠の一手だけは残す
```

該当テンプレート: `gakuchika`, `self_pr`, `work_values`

### 5.4 中字数設問ガイダンス (`280 <= char_max <= 520`)

ソース: `_format_midrange_length_guidance()` (`_prompt_builder.py:676-724`)

`char_max` が 280 以上 520 以下で、かつテンプレート定義の `rewrite_policy.playbook` に `opening` / `second` / `third` / `fourth` が存在する場合のみ出力される。中字数の構成は playbook を正本にし、旧 mid 構成フィールドは使わない。

```
【300〜500字設問の組み方】
- 4文前後で構成する
- {mid_structure}
- 目標は {target} で、{char_min}字未満で終えない
- 説明だけの文で終わらせず、各文に役割を持たせる
- 短くまとめすぎる場合は、既にある経験・職種・企業接点のつながりを1文補う
- 企業接点と貢献は1文に圧縮してよく、4文固定や冗長な段階増しを避ける
```

#### under_min_recovery モードの追加行

`length_control_mode == "under_min_recovery"` の場合:

```
【今回の不足を埋める方針】
- 現在の不足は {shortfall_text} と見なし、一般論ではなく接続文で埋める
- 新事実を足さず、経験→職種→企業理解の順で補強する
- 3文以下で終わっている場合は文数を増やし、最後の文で役割や貢献を言い切る
```

#### tight_length モードの追加行

`length_control_mode == "tight_length"` の場合:

```
- 根拠経験と企業接点のどちらも省略せず、4文構成を保つ
```

### 5.5 LengthControlProfile

ソース: `_length_control.py`

モデルファミリー別のデフォルト gap 値。gap は `char_max` からの差分で、生成目標帯の下限を `char_max - gap` に設定する。

#### モデルファミリー別デフォルト gap

| Provider Family | Band | default gap | recovery gap | tight gap |
|---|---|---|---|---|
| `openai_gpt5_mini` | short (<=220) | 10 | 0 | 10 |
| `openai_gpt5_mini` | medium (221-320) | 18 | 0 | 16 |
| `openai_gpt5_mini` | long (>320) | 20 | 0 | 18 |
| `openai_gpt5` | short | 10 | 0 | 10 |
| `openai_gpt5` | medium | 16 | 0 | 14 |
| `openai_gpt5` | long | 18 | 0 | 16 |
| `anthropic_claude` | short | 10 | 0 | 10 |
| `anthropic_claude` | medium | 14 | 0 | 14 |
| `anthropic_claude` | long | 14 | 0 | 16 |
| `google_gemini` | short | 10 | 0 | 10 |
| `google_gemini` | medium | 14 | 0 | 14 |
| `google_gemini` | long | 14 | 0 | 16 |

Band 分類: short (`char_max <= 220`), medium (`221 <= char_max <= 320`), long (`char_max > 320`)

#### Fill ratio による gap 調整 (default ステージのみ)

`ratio = original_len / char_max` として:

| 条件 | 調整 |
|---|---|
| `ratio < 0.45` | `gap += 1` (gpt5_mini), `gap += 2` (その他) |
| `0.80 < ratio < 0.95` | `gap -= 1` |
| `ratio >= 0.95` | `gap += 1` |

#### Delta bands

Shortfall (不足字数) の規模分類:

| Band | 条件 |
|---|---|
| large | shortfall >= 70 |
| medium | shortfall >= 35 |
| small | shortfall >= 15 |
| tiny | shortfall < 15 |

#### Overshoot 計算 (under_min recovery)

`compute_retry_overshoot()` (`_length_control.py:87-121`) が under_min リカバリ時の生成上限超過量を算出する:

```
coeff:
  1.3  (shortfall <= 15)
  1.2  (shortfall > 15)

scale:
  0.9  (char_max <= 200)
  1.0  (201 <= char_max <= 350)
  1.1  (char_max > 350)

cap = max(5, int(char_max * 0.25))
overshoot = min(int(shortfall * coeff * scale), cap)
```

この overshoot 分だけ生成目標帯の上限が `char_max` を超えることが許容される。生成後に圧縮して受理帯内に収めることが前提。

---

## Chapter 6: 文体ルールシステム

### 6.1 Core Style (MUST/SHOULD/WATCH)

ソース: `es_quality_rules.py` `StyleRule` リスト (行 22-76), `_build_contextual_rules()` (行 169-208)

15 個の `StyleRule` インスタンスが定義されている。各ルールは `scope`、`applicable_templates`、`priority` の3軸でフィルタリングされる。

#### 全 StyleRule 一覧

| # | text | scope | applicable_templates | priority |
|---|---|---|---|---|
| 1 | 1文目は設問への答えを結論として言い切る（前置きや背景説明から入らない） | all | (全テンプレート) | must |
| 2 | 各文は役割を1つに絞り、同趣旨を言い換えて引き延ばさない | all | (全テンプレート) | should |
| 3 | 企業接点・貢献・活かし方は必要なら1文に圧縮してよく、段階を無理に増やさない | all | (全テンプレート) | should |
| 4 | ユーザーの元回答に含まれる数値・固有名詞（○人、○か月、ツール名、イベント名など）は必ず保持する | all | (全テンプレート) | must |
| 5 | 「整理した」「取り組んだ」「向き合った」のような抽象動詞だけで済ませず、具体的な行動（何をどうしたか）を1つ以上含める | all | (全テンプレート) | should |
| 6 | 同じ文末表現（〜したい、〜と考える、〜と考えている、〜していきたい）が連続しないよう、語尾を変化させる | all | (全テンプレート) | should |
| 7 | 「貢献する」「成長する」だけで終わらず、何にどう貢献するか・どの方向に成長するかを1語以上具体化する | all | (全テンプレート) | should |
| 8 | 指定の字数下限を下回る改善案は再検証で弾かれる。要約しすぎず、下限まで本文を伸ばす | mid_long | (全テンプレート) | watch |
| 9 | 下限が200字を超える設問では、具体を削りすぎず下限付近まで本文を伸ばす | mid_long | (全テンプレート) | watch |
| 10 | 短い字数制限では結論と根拠を凝縮し、冗長な修飾を削る | short_only | (全テンプレート) | watch |
| 11 | 抽象ラベルだけで終わらせず、行動の対象・範囲・頻度・比較を具体化する。ただし元回答にない数字は作らない | all | self_pr, work_values | should |
| 12 | 強みや価値観は抽象語の反復で済ませず、具体的な行動動詞を最低1組入れて再現性を示す | all | self_pr, work_values | should |
| 13 | 複数の施策がある場合は①②を文中にインラインで置く（リスト化しない）。簡潔な列挙（「①XX②YYの2施策」）は1文内でよいが、各施策を説明するときは「①では」を短い冒頭にして各項目を完結した文にする（句点「。」で区切る） | all | gakuchika | should |
| 14 | 理由・目標を複数挙げるときは「理由は二点ある。第一に〜第二に〜」等で数と順序を宣言する（ナンバリングは任意で、1つの理由だけなら不要） | all | company_motivation, intern_reason, intern_goals, post_join_goals, role_course_reason | should |
| 15 | 「関係者を巻き込みながら」「新たな価値を」「幅広い視野」等のLLM特有フレーズは、ユーザーの元回答に含まれていない限り使わない | all | (全テンプレート) | watch |

#### フィルタリングロジック

`_build_contextual_rules(template_type, char_max, grounding_mode)` (行 169-208) が以下のロジックでルールをフィルタする:

1. `band` を決定: `char_max <= 220` なら `"short"`、それ以外は `"mid_long"`
2. 各ルールについて:
   - `scope == "all"` --> 常に含む
   - `scope == "company"` --> `grounding_mode != "none"` の場合のみ含む
   - `scope == "short_only"` --> `band == "short"` の場合のみ含む
   - `scope == "mid_long"` --> `band == "mid_long"` の場合のみ含む
3. `applicable_templates` が設定されている場合、`template_type` がその frozenset に含まれる場合のみ含む

#### 出力フォーマット

ルールは priority 別にグループ化され、以下の形式で出力される:

```
【結論ファースト（全設問・全文字数）】
【MUST（絶対守る）】
  1. {must_rule_1}
  2. {must_rule_2}
【SHOULD（できる限り）】
  1. {should_rule_1}
  2. {should_rule_2}
  ...
【WATCH（注意）】
- {watch_rule_1}
- {watch_rule_2}
```

MUST と SHOULD は番号付き、WATCH は箇条書き（番号なし）。

### 6.2 Prose Style (`char_max > 220` のみ)

ソース: `_common.py` `_format_prose_style_block()` (行 11-24)

`char_max` が 220 を超える場合のみ出力される。短字数設問ではプロンプトの肥大化を避けるため省略。

```xml
<prose_style>
- 文と文の間は、前文の固有名詞か固有動詞を次文の主語に据えてつなぐ（「この」「その」「こうした」で始めない）
- 読み手に伝わる順序で配置する（結論→根拠→展望）
- 同じ意味の言い換え（パラフレーズ）で字数を稼がない。1文=1新情報
- ユーザーの口語表現（「すごく」「めっちゃ」等）は書き言葉に直しつつ、動詞の核は保つ
</prose_style>
```

### 6.3 Anti-AI 指示

初回 rewrite / fallback / draft では詳細なカテゴリ列挙を出さず、`<style>` 内の raw block として短い `<anti_ai_compact>` advisory だけを出す。現行の `InstructionId` には anti-AI 専用 ID を置かず、詳細な AI 臭カテゴリは初回 system prompt の常時出力対象から外している。

AI-臭 (AI-flavored) が validation / retry で検出された場合のみ、失敗カテゴリに対応する差分指示を `<retry>` に追加する。検出カテゴリの正本は引き続き `ai_smell.py` の `_CATEGORIES` タプルである。

初回の枠:

```xml
<anti_ai_compact>
- 「多角的」「新たな価値」「関係者を巻き込み」などの定型句は、元回答にない限り使わない
</anti_ai_compact>
```

詳細カテゴリの列挙は初回プロンプトへ常時出さず、AI臭が検出された retry で該当カテゴリだけを差分指示として追加する。

#### カテゴリ 1: abstract_buzzword (penalty 2.0)

```
- 抽象修飾: 多角的、包括的、能動的、俯瞰的、多様な関係者、幅広い視野
  → 置換ルール: 抽象修飾語を消し、元回答の事実から具体的な対象・数・方法を抽出して書く
  NG: 多角的に検討した結果、解決策を導いた → OK: 販売データと現場ヒアリングの2軸で原因を特定し、解決策を絞った
  NG: 主体的にプロジェクトを推進した → OK: 週1回の進捗会議を自ら設定し、3チームの担当者と期限を合意した
  NG: 幅広い視野で問題を捉えた → OK: 技術・コスト・納期の3点から問題を整理した
  NG: 包括的なサポート体制を構築した → OK: 問い合わせ対応・マニュアル整備・月次研修の3本立てで支援した
```

検知パターン (正規表現):
- `多角的(?:な|に)`
- `包括的(?:な|に)`
- `能動的(?:な|に)`
- `俯瞰的(?:な|に)`
- `多様な(?:関係者|人々|価値観)`
- `幅広い(?:視野|知見|経験)`

#### カテゴリ 2: value_creation (penalty 2.5)

```
- 価値創出系: 価値を創出、価値を形にする、新たな価値を生み出す、付加価値を提供
  → 置換ルール: 「価値」を具体的な成果物・指標・行動に置き換える
  NG: 新たな価値を生み出すことができた → OK: 既存の集計レポートに異常検知機能を追加し、障害対応時間を30分短縮した
  NG: 付加価値を提供した → OK: 納品物に操作動画マニュアルを添付し、問い合わせ件数を半減させた
  NG: 価値を創出する人材になりたい → OK: 顧客の業務フローを分析し、工数を削減する仕組みを設計できる人材になりたい
```

検知パターン:
- `価値を創出`
- `価値を形にする`
- `新たな価値を(?:生み出す|創造する)`
- `付加価値を提供`

#### カテゴリ 3: growth_cliche (penalty 1.5)

```
- 成長定型: 〜を通じて成長した、〜の重要性を学んだ、〜の大切さを実感した
  → 置換ルール: 「成長した」「学んだ」を、具体的にどのようなことを学んだか・身につけたかに置き換える
  NG: この経験を通じて成長した → OK: この経験で、データに基づいて仮説を立て検証する手法を身につけた
  NG: チームワークの重要性を学んだ → OK: 異なる専門の人と目標を共有し、役割分担する進め方を学んだ
  NG: 継続の大切さを実感した → OK: 毎日30分の復習を3ヶ月続けた結果、正答率が40%から85%に上がった
  NG: 異文化理解の大切さを痛感した → OK: 現地の商習慣に合わせて提案書の構成を変えたところ、受注率が2倍になった
```

検知パターン:
- `を通じて成長した`
- `の重要性を学んだ`
- `の大切さを(?:実感した|痛感した)`
- `に対する理解を深めた`
- `を深く考えるきっかけとなった`

#### カテゴリ 4: relation_abstract (penalty 2.0)

```
- 関係性抽象: 関係者を巻き込み、多様な人々、ステークホルダー、周囲を巻き込みながら
  → 置換ルール: 「関係者」「多様な人々」を、具体的な役割名・人数に置き換える
  NG: 関係者を巻き込みながら進めた → OK: 営業2名と開発3名を週次MTGに招集し、要件のすり合わせを行った
  NG: 多様な人々と協力した → OK: 現地スタッフ4名と日本人駐在2名の計6名で運営した
  NG: ステークホルダーとの調整を行った → OK: 教授・TA・受講生代表の3者と日程・内容を調整した
  NG: 周囲を巻き込みながら解決した → OK: ゼミの同期5名に声をかけ、役割分担を決めて対応した
```

検知パターン:
- `関係者(?:を巻き込み|と連携し)`
- `多様な人々`
- `ステークホルダー`
- `周囲を巻き込みながら`

#### カテゴリ 5: empty_emphasis (penalty 1.0)

```
- 空虚強調: まさに、確かに、大いに、〜と言えるでしょう、〜ではないでしょうか
  → 置換ルール: これらの語は削除する（置き換えではなく除去）
  NG: まさにこの経験が私の強みである → OK: この経験が私の強みである
  NG: 確かに困難な状況であったが → OK: 困難な状況であったが
  NG: 大いに成長できた経験である → OK: 成長できた経験である
  NG: 重要だったと言えるでしょう → OK: 重要であった
```

検知パターン:
- `まさに`
- `確かに`
- `大いに`
- `と言えるでしょう`
- `ではないでしょうか`

#### specificity check

`abstract_buzzword`, `value_creation`, `growth_cliche`, `relation_abstract` の4カテゴリは `requires_specificity_check = True` に設定されている。同一文内に具体性マーカー（数値+単位、カタカナ3文字以上、組織名、動作動詞）がある場合、検知がスキップされる (`_sentence_has_specificity()`, `ai_smell.py:185-195`)。`empty_emphasis` は `requires_specificity_check = False` で常に検知される。

### 6.4 ガクチカバイアスガード

ソース: `_prompt_builder.py` `_format_gakuchika_bias_guard()` (行 168-175)

`gakuchika` と `basic` 以外のテンプレートで出力される。ガクチカのエピソードが本文を支配してしまい、設問の主題（志望動機や自己PR等）が薄くなる現象を防ぐ。

```xml
<gakuchika_bias_guard>
- ガクチカのエピソード説明は最小限に留め、設問の主題（志望動機/自己PR/入社後ビジョン等）に直接答える内容を優先する
- ガクチカの経験は「根拠の一言」程度にとどめ、設問が求める結論・動機・展望を本文の6割以上にする
</gakuchika_bias_guard>
```

`gakuchika` テンプレート自体はガクチカの詳述が主題であるため除外。`basic` テンプレートは設問タイプが不明確なため除外。

---

## Chapter 7: テンプレート別指示（9テンプレート）

ソース: `backend/app/prompts/es_templates/` 以下の各 `.py` ファイル

9つのテンプレート定義（`TemplateDef` 辞書）が、プロンプト組立の全セクションに影響する。現在は用途別に `rewrite_policy` / `validation_policy` / `retry_policy` へ分離している。

### 7.1 basic（汎用ES添削）

ソース: `backend/app/prompts/es_templates/basic.py`

| フィールド | 値 |
|---|---|
| `label` | 汎用ES添削 |
| `validation_policy.grounding_level` | `light` |
| `validation_policy.requires_company_rag` | `False` |
| `rewrite_policy.company_usage` | `assistive` |
| `rewrite_policy.fact_priority` | `mixed` |

#### rewrite_policy.required_elements

```
- 設問への結論
- 根拠になる経験・考え
- 必要に応じた仕事や企業との接点
```

#### rewrite_policy.anti_patterns

```
- 設問文の言い換えだけで始める
- 具体性のない一般論だけで終わる
- 箇条書きや断片文のまま終わる
```

#### validation_policy.evaluation_axes

| 軸名 | pass_condition | rewrite_instruction |
|---|---|---|
| 設問への直答性 | 冒頭で設問に正面から答えている | 背景説明から入らず、1文目で答えの核を言い切る |
| 根拠の具体性 | 結論を支える具体的な経験・事実がある | 5W1Hや数字を使い、主観だけで終わらせない |
| 論理の一貫性 | 結論、根拠、帰結の流れに矛盾がない | 接続語で因果を明示し、話題の飛躍をなくす |
| 独自性 | 書き手固有の経験や視点が含まれている | 誰でも書ける一般論を避け、元回答にある固有の場面を残す |

#### rewrite_policy.structure_short

| バンド | 構造 |
|---|---|
| `short` | 1文目で結論、2文目で根拠、必要なら3文目で仕事や企業との接点を置く |

`dense_short_answer`: なし / `three_sentence_close_on_short_band`: なし

#### validation_policy.evaluation_checks

```python
{
    "head_sentence_window": 2,
}
```

`head_focus_pattern`, `anchor_type`, `answer_focus_message` 等は定義なし。

#### retry_policy.guidance_by_failure

| コード | ヒント |
|---|---|
| `under_min` | {target_hint} を狙い、既にある経験や考えのつながりを補って不足字数を埋める |
| `answer_focus` | 1文目で設問への答えの核を短く言い切る |
| `grounding` | 企業理解との接点を自然な範囲で1点示す |

#### playbook

定義なし。

#### rewrite_closing_guidance

定義なし（`basic` は closing guidance を持たない）。

#### テンプレート別ガイダンス (`es_quality_rules.py` TEMPLATE_GUIDANCE)

```
- 冒頭で設問への答えを端的に示す
- 根拠は経験や行動で裏付ける
- 主張が複数ある場合は、各項目を「主張→根拠→展望」で完結させる
```

---

### 7.2 company_motivation（企業志望理由）

ソース: `backend/app/prompts/es_templates/company_motivation.py`

| フィールド | 値 |
|---|---|
| `label` | 企業志望理由 |
| `validation_policy.grounding_level` | `deep` |
| `validation_policy.requires_company_rag` | `True` |
| `rewrite_policy.company_usage` | `required` |
| `rewrite_policy.fact_priority` | `mixed` |

#### required_elements

```
- 志望理由の核
- 根拠になる経験
- 企業理解との接点
- 入社後の価値発揮
```

#### anti_patterns

```
- どの企業にも当てはまる一般論
- 企業説明だけで終わり自分との接続がない
- 志望理由の言い換えだけで始める
```

#### evaluation_axes

| 軸名 | pass_condition | rewrite_instruction |
|---|---|---|
| 志望理由の核 | その企業を志望する理由の核が冒頭で明確 | 業界説明や自己紹介から入らず、志望理由を結論として短く示す |
| 経験との接続 | 自身の経験と志望理由が因果でつながっている | この経験から、という接続で原体験と企業選択をつなぐ |
| 企業固有性 | その企業ならではの根拠が1点に絞られている | 企業特徴の羅列を避け、事業・価値観・制度のうち1軸に絞る |
| 入社後の価値発揮 | 入社後に何をどう貢献するか具体的 | 成長したい、貢献したいで終えず、行動計画に落とす |
| 競合差別化の根拠 | 同業他社ではなくその企業を選ぶ理由が読み取れる | 他社名は出さず、この企業ならではの接点を自然に示す |

#### rewrite_policy.structure_short_or_playbook

| バンド | 構造 |
|---|---|
| `short` | 1文目で志望理由、2文目で根拠経験、必要なら3文目で企業接点を置く |
| `mid` | 1文目で志望理由、2文目で根拠経験、3文目で企業理解との接点、4文目で貢献イメージを置く。理由を複数出す場合は「第一に〜第二に〜」で順序を示す |

`dense_short_answer`: `True` / `composition_ratio`: 導入15% / 本論70% / 締め15%

#### evaluation_checks

```python
{
    "repeated_opening_pattern": r"(志望する理由|志望理由)は",
    "head_sentence_window": 3,
    "anchor_type": "company",
    "head_focus_pattern": r"志望|惹|魅力|理由|価値|からだ|ためだ|関心|期待|共感|惹か",
    "answer_focus_message": "冒頭でなぜこの会社かを短く言い切ってください（企業名または貴社と志望の核を含む）。",
}
```

#### retry_policy.guidance_by_failure

| コード | ヒント |
|---|---|
| `under_min` | {target_hint} を狙い、既にある経験から企業接点と貢献への橋渡しを1文補う |
| `answer_focus` | 1文目でなぜその企業を志望するのかを短く言い切る |
| `grounding` | 企業理解との接点を1点だけ明確にする |
| `structure` | 志望理由が複数あるときは「理由は二点ある。第一に〜第二に〜」で数を宣言し、各々「根拠→企業接点→貢献」を完結させる |

#### playbook

```
subject: {honorific}を志望する理由
opening: 1文目で{honorific}を志望する理由の核を言い切る
second: 2文目で元回答の経験を1点だけ出す
third: 3文目で企業理解との接点を1点だけつなぐ。理由を複数出す場合は「第一に〜第二に〜」で順序を示す
fourth: 4文目で入社後の貢献で締める
example_good_1: 私が{honorific}を志望するのは、事業を通じて社会課題に向き合う姿勢に魅力を感じたからだ。
example_good_2: 研究で仮説検証を重ねた経験を土台に、現場で事業理解を深め、価値創出につなげたい。
example_bad: 私は{honorific}を志望する理由は、{honorific}の魅力に惹かれたからだ。
```

#### rewrite_closing_guidance

```
結びで元回答の経験と企業根拠カードの方向性を接続した貢献像を述べてよい。企業根拠カードにない固有施策・数値を新たに追加しない
```

---

### 7.3 gakuchika（ガクチカ）

ソース: `backend/app/prompts/es_templates/gakuchika.py`

| フィールド | 値 |
|---|---|
| `label` | ガクチカ |
| `validation_policy.grounding_level` | `none` |
| `validation_policy.requires_company_rag` | `False` |
| `rewrite_policy.company_usage` | `none` |
| `rewrite_policy.fact_priority` | `self` |

#### required_elements

```
- 取り組みの核
- 課題や目的
- 工夫した行動
- 成果や学び
```

#### anti_patterns（14項目 -- 最多）

```
- 活動名だけで中身が見えない
- 行動や工夫が具体化されていない
- 企業接続を無理に入れて主題がぼける
- 『この経験を通じて〜の重要性を学んだ』のような定型の学び表現で締める
- 『多様な』『幅広い』『様々な』等の抽象修飾語を具体例なしで使う
- 『分析し、検討し、実行した』のような抽象動詞を連打して行動の中身が見えない
- 学生が口語で語った言い回しを全て書き言葉に置き換えて等身大の声を消す
- 冒頭の結論と末尾の学びで同じことを繰り返し、実質の情報量が落ちる
- 結びの1文は、この経験での結果・得た学び・身についた能力のいずれかで締める
- 「再現できる」「次に活きる」を使った学び結びは抽象的
- 最終文を『手法は〜に直結する』『〜と言える』のような評論調・一般論で締める
- 最終文で抽象名詞を主語にせず、経験の結果・学び・得た能力を主語にする
- 結びを『今後の仕事でも〜発揮していく』『活かしていく』と未来志向にする
- ①②で施策を列挙する際に導入文なしでいきなり番号を始める
```

#### evaluation_axes（6軸 -- 最多）

| 軸名 | pass_condition | rewrite_instruction |
|---|---|---|
| 課題の明確さ | 課題や目的が因果接続で行動につながっている | 課題、分析、必要性、行動の順に飛躍なくつなぐ |
| 行動の具体性 | 提案、導入、設計、改善等の具体動詞がある | 頑張った、工夫したを具体的な行動に置き換える |
| 役割の明確さ | 集団活動では自分の役割が明示されている | 主担当、リーダー、担当範囲など元回答内の役割を残す |
| 成果の追跡可能性 | 行動と成果が数字または変化表現でつながる | その結果、ことによりでA→Rの因果を明示する |
| 思考プロセスの可視化 | 施策を選んだ理由や判断が見える | なぜその方法を選んだかを1句で補う |
| 人柄の透過性 | 行動描写から価値観や性格が自然に伝わる | 直接的な自己評価ではなく、行動のHOWで示す |

#### rewrite_policy.structure_short_or_playbook

| バンド | 構造 |
|---|---|
| `short` | 1文目で最も力を入れた行動、2文目で工夫や成果、必要なら3文目で仕事との接点を置く |

`three_sentence_close_on_short_band`: `True`

#### playbook

```
subject: 学生時代に力を入れた取り組み
opening: 1文目で最も力を入れた取り組みと自分の役割を言い切る
second: 2文目で直面した課題や目的を1点だけ置く
third: 3文目で工夫した行動を順序が分かる形で具体化する
fourth: 4文目で成果と学び、仕事での再現性を短く締める
```

#### ガクチカ固有: 配分ガイド (`_format_gakuchika_allocation_guide`)

ソース: `_prompt_builder.py:231-267`。`template_type == "gakuchika"` の場合のみ出力される。

```
【配分ガイド（目安）】
- 結論: 約 13〜17%
- 状況＋課題: 約 20〜25%
- 行動: 約 35〜40%
- 成果: 約 15〜20%
- 学び: 約 5〜10%
- 薄くなる場合は行動・成果を優先する
- 最終文は評論調にしない。抽象名詞を主語にした「手法は〜に直結する」「〜と言える」は避ける
- 結びは必ず「結果、OOした」または「結果、OOした。この経験からOOを〈結び動詞〉」のどちらか
- 結び動詞は「培った」「身につけた」「磨いた」のいずれか（「学んだ」「実感した」は使わない）
- 結びで「今後の仕事でも〜」「発揮していく」「活かしていく」と未来志向にしない
- 学び・身についた能力だけで終えない。結びには経験内の成果、数字、前後差のいずれかを必ず含める
- 複数施策を①②で列挙する場合、施策数と行動意図を示す導入文を置く
- 各施策説明は「①では」を短い冒頭にして各項目を完結した文にする
```

---

### 7.4 self_pr（自己PR）

ソース: `backend/app/prompts/es_templates/self_pr.py`

| フィールド | 値 |
|---|---|
| `label` | 自己PR |
| `validation_policy.grounding_level` | `light` |
| `validation_policy.requires_company_rag` | `False` |
| `rewrite_policy.company_usage` | `assistive` |
| `rewrite_policy.fact_priority` | `self` |

#### required_elements

```
- 強みの核
- 根拠になる経験
- 仕事や役割での活かし方
```

#### anti_patterns

```
- 強みの名前だけで根拠がない
- 経験が説明で終わり再現性が見えない
- 自己否定語をそのまま残す
- 強みを裏付ける経験で「整理した」「取り組んだ」「向き合った」だけで済ませる
- 最終文で「この強みを活かして貢献したい」と定型的に締める
- 強みの名前を冒頭と末尾で繰り返し、新情報なしで終わる
```

#### evaluation_axes

| 軸名 | pass_condition | rewrite_instruction |
|---|---|---|
| 強みの核の明示 | 冒頭で強みが具体的に定義されている | 強み名だけでなく、どの場面でどう発揮する力かを書く |
| 経験による裏づけ | 強みを発揮した具体エピソードがある | 場面、行動、結果が見える1つの経験に絞る |
| 成果の可視化 | 成果が数字または具体的な変化として示されている | うまくいった、好評だったを客観的な変化に直す |
| 仕事での活かし方 | 入社後に強みをどう活かすか具体的 | 活かしたいだけで終えず、業務場面や価値発揮につなげる |
| 再現性の提示 | 一回限りでなく再現可能な力として伝わる | 行動プロセスを汎用スキルとして読める形にする |

#### self_pr 固有: negative_reframe_guidance

```
- 「経験不足」「自信がない」などの自己否定語をそのまま残さない
- 元の事実は保ちつつ、準備・責任感・学習姿勢・確認力などの前向きな表現に言い換える
- 弱さの告白で締めず、仕事で再現できる行動特性で締める
```

この指示は `_format_negative_reframe_guidance()` で `<template>` セクション内に出力される。retry では前回失敗に対する差分ヒントのみを `<retry>` に追加する。

---

### 7.5 intern_reason（インターン志望理由）

ソース: `backend/app/prompts/es_templates/intern_reason.py`

| フィールド | 値 |
|---|---|
| `label` | インターン志望理由 |
| `validation_policy.grounding_level` | `standard` |
| `validation_policy.requires_company_rag` | `True` |
| `rewrite_policy.company_usage` | `required` |
| `rewrite_policy.fact_priority` | `mixed` |

#### required_elements

```
- 参加理由の核
- 活かせる経験や課題意識
- プログラムとの接点
- 得たい学び
```

#### evaluation_axes

| 軸名 | pass_condition | rewrite_instruction |
|---|---|---|
| 学びたいことの核 | 参加目的が冒頭で1点に絞られている | 学びたい、検証したい対象を具体動詞で示す |
| 根拠になる経験や問題意識 | なぜ学びたいのかを支える経験がある | 経験、気づき、必要性、参加目的の因果をつなぐ |
| プログラムとの接点 | インターン内容と自分の目的が結びついている | 企業魅力の羅列ではなく、プログラム内容と目標の接点に絞る |
| 主体的姿勢 | 試したい、検証したい等の能動表現がある | 教えていただきたい、触れてみたい等の受け身表現を避ける |

#### intern_reason 固有: question_focus_rules

```python
[
    {
        "contains_all": ["活か"],
        "contains_any": ["持ち帰", "得たい", "学びたい"],
        "title": "この設問で落としてはいけない3要素",
        "items": [
            "参加したい理由を1文で明示する",
            "活かせる経験・事実を1文で置く",
            "持ち帰りたい学び・視点を最後に1文で言い切る",
            "3要素のどれも省略しない",
        ],
    }
]
```

設問文に「活か」かつ「持ち帰/得たい/学びたい」が含まれる場合にのみ、`_format_question_specific_guidance()` で `<template>` セクションへ出力される。retry 時もこの設問固有条件は `<template>` に残り、`<retry>` は前回失敗への差分ヒントに限定する。

---

### 7.6 intern_goals（インターンでやりたいこと・学びたいこと）

ソース: `backend/app/prompts/es_templates/intern_goals.py`

| フィールド | 値 |
|---|---|
| `label` | インターンでやりたいこと・学びたいこと |
| `validation_policy.grounding_level` | `standard` |
| `validation_policy.requires_company_rag` | `True` |
| `rewrite_policy.company_usage` | `required` |
| `rewrite_policy.fact_priority` | `mixed` |

`intern_reason` とほぼ同じ構造だが、`head_focus_pattern` が学習目標寄り（学びたい/身につけたい/やりたい/獲得したい 等）に特化している。playbook の `opening` は「学びたいことの核を言い切る（学びたい・確かめたい・得たい・磨きたいのいずれかを含める）」と動詞を指定。

---

### 7.7 post_join_goals（入社後やりたいこと）

ソース: `backend/app/prompts/es_templates/post_join_goals.py`

| フィールド | 値 |
|---|---|
| `label` | 入社後やりたいこと |
| `validation_policy.grounding_level` | `standard` |
| `validation_policy.requires_company_rag` | `True` |
| `rewrite_policy.company_usage` | `required` |
| `rewrite_policy.fact_priority` | `mixed` |

`dense_short_answer`: `True`。`validation_policy.evaluation_axes` は5軸で、「事業理解の深さ」軸（HPコピー調を避け、自分の目標との関係で示す）が固有。

---

### 7.8 role_course_reason（職種・コース選択理由）

ソース: `backend/app/prompts/es_templates/role_course_reason.py`

| フィールド | 値 |
|---|---|
| `label` | 職種・コース選択理由 |
| `validation_policy.grounding_level` | `deep` |
| `validation_policy.requires_company_rag` | `True` |
| `rewrite_policy.company_usage` | `required` |
| `rewrite_policy.fact_priority` | `mixed` |

`validation_policy.grounding_level` が `deep` であり、`company_motivation` と同じく固有名詞を1つ含めることが強制される。`validation_policy.evaluation_axes` は5軸で「他職種との差別化」軸（他職種を否定せず、この職種との親和性を示す）が固有。

---

### 7.9 work_values（働くうえで大切にしている価値観）

ソース: `backend/app/prompts/es_templates/work_values.py`

| フィールド | 値 |
|---|---|
| `label` | 働くうえで大切にしている価値観 |
| `validation_policy.grounding_level` | `light` |
| `validation_policy.requires_company_rag` | `False` |
| `rewrite_policy.company_usage` | `assistive` |
| `rewrite_policy.fact_priority` | `self` |

`validation_policy.evaluation_axes` は5軸で「トレードオフ認識」軸（価値観を貫く際の葛藤や兼ね合いがある）が固有。`three_sentence_close_on_short_band`: `True`。

---

### 7.10 テンプレート横断マトリクス

以下の表は、各テンプレートが持つ主要ブロックの有無を示す。

| ブロック | basic | company_motivation | gakuchika | self_pr | intern_reason | intern_goals | post_join_goals | role_course_reason | work_values |
|---|---|---|---|---|---|---|---|---|---|
| `playbook` | -- | YES | YES | -- | YES | YES | YES | YES | -- |
| `dense_short_answer` | -- | YES | -- | -- | YES | YES | YES | YES | -- |
| `three_sentence_close` | -- | -- | YES | YES | -- | -- | -- | -- | YES |
| `composition_ratio` | -- | YES | -- | -- | -- | -- | -- | -- | -- |
| `question_focus_rules` | -- | -- | -- | -- | YES | -- | -- | -- | -- |
| `negative_reframe_guidance` | -- | -- | -- | YES | -- | -- | -- | -- | -- |
| `gakuchika_allocation_guide` | -- | -- | YES | -- | -- | -- | -- | -- | -- |
| `gakuchika_bias_guard` | -- | YES | -- | YES | YES | YES | YES | YES | YES |
| `structure_template` | -- | YES | YES | YES | YES | -- | YES | YES | -- |
| `deep_grounding_requirements` | -- | YES | -- | -- | -- | -- | -- | YES | -- |
| `proper_noun_policy` | -- | -- | -- | -- | YES | YES | -- | YES | -- |
| `anchor_type` | -- | company | -- | -- | intern | intern | -- | role | -- |

---

## Chapter 8: 企業接地システム

### 8.1 GroundingLevel（テンプレート定義時）

ソース: `backend/app/services/es_review/enums.py` `GroundingLevel` (行 36-40)

テンプレート定義の `validation_policy.grounding_level` で設定される静的レベル。

| 値 | 該当テンプレート |
|---|---|
| `none` | gakuchika |
| `light` | basic, self_pr, work_values |
| `standard` | intern_reason, intern_goals, post_join_goals |
| `deep` | company_motivation, role_course_reason |

`validation_policy.grounding_level` から `CompanyGroundingPolicy` への変換ルール:
- `standard` または `deep` --> `required`
- それ以外 --> `assistive`

### 8.2 GroundingMode（実行時解決）

ソース: `enums.py` `GroundingMode` (行 30-33)

実行時の企業情報の利用可能性に応じて決定される。

| 値 | 意味 |
|---|---|
| `none` | 企業名が提供されていない。企業言及禁止 |
| `company_general` | 企業名はあるが、職種/インターン名が未指定または汎用 |
| `role_grounded` | 企業名 + 職種名/インターン名が具体的に提供されている |

### 8.3 CompanyGroundingPolicy

ソース: `enums.py` `CompanyGroundingPolicy` (行 69-70)

| 値 | 条件 | 動作 |
|---|---|---|
| `required` | `validation_policy.grounding_level` が `standard` or `deep` | 企業根拠が必須。不足時は second pass RAG を試行 |
| `assistive` | `validation_policy.grounding_level` が `none` or `light` | 企業情報は補助的。なくても可 |

### 8.4 Assistive Grounding Block

ソース: `_prompt_builder.py` `_format_assistive_grounding_block()` (行 374-398)

**出力条件**: `effective_company_grounding == "assistive"` AND `grounding_mode != "none"` AND `company_name` が存在する場合。

```xml
<assistive_grounding>
- 企業への言及は「{company_name}」の名前、または具体的な事業・価値観で行う
- 企業に言及するときは「貴社」等の敬称を使ってよい
- 企業との接点は補助的に 0〜1 文にとどめ、本文の主軸は応募者自身の経験に置く
- 経験と企業の接点が自然に書けないときは企業言及を省略してよい
</assistive_grounding>
```

### 8.5 Deep Grounding Requirements

ソース: `_prompt_builder.py` `_format_deep_grounding_requirements()` (行 147-165)

**出力条件**: `effective_grounding_level == "deep"` の場合のみ（`company_motivation`, `role_course_reason`）。

```xml
<required_company_specifics>
以下の固有候補から必ず1つだけ本文中に含めること（複数使用不可）:
候補: {terms_line}

使用ルール:
- 選んだ1つを、自分の経験・強み・学びとの接続文として使う
- カード外の固有施策・部署名・数値・成果は追加しない
- 固有候補の羅列や過剰反復は避け、本文の主張を補強する1軸に絞る
</required_company_specifics>
```

`_extract_deep_grounding_hint_terms()` (行 130-144) がエビデンスカードからカタカナ3文字以上、漢字+組織名詞、英字、数値+単位の固有語を最大5つ抽出する。

### 8.6 Proper Noun Policy

ソース: `_prompt_builder.py` `_format_proper_noun_policy()` (行 401-423)

**出力条件**: `template_type` が `intern_reason`, `intern_goals`, `role_course_reason` の場合のみ。

インターン系:
```xml
<proper_noun_policy>
- 「{anchor}」のような固有名詞は冒頭で1回だけ使う
- 2回目以降は「本インターンシップ」または「本プログラム」に言い換える
- 固有名詞の反復で字数を使わず、参加理由・学び・接点の中身を優先する
</proper_noun_policy>
```

`role_course_reason`:
```xml
<proper_noun_policy>
- 「{anchor}」のような固有名詞は冒頭で1回だけ使う
- 2回目以降は「本コース」または「当該職種」に言い換える
- 固有名詞の反復で字数を使わず、志望理由・適性・役割理解の中身を優先する
</proper_noun_policy>
```

### 8.7 Company Guidance Block

ソース: `_prompt_builder.py` `_format_company_guidance()` (行 426-548)

企業根拠カードの表示と使い方を制御する大型ブロック。decision tree は以下の通り:

1. **RAG あり + カードあり** --> カード一覧 + 使い方ルール出力
   - `company_grounding == "assistive"` の場合: gakuchika 用/非 gakuchika 用の分岐あり（`grounding_mode` が `none` なら企業敬称禁止）
   - `grounding_mode == "company_general"` なら: 職種別断定回避 + PRIMARY だけ使う指示
   - `grounding_mode == "role_grounded"` なら: 役割理解カード優先
   - `generic_role_mode` なら: broad な職種名ではなく事業理解+スキルの2軸
   - `evidence_coverage_level` が `weak`/`partial` かつ `required` なら: 別観点の anchor を2点拾う指示
2. **RAG なし + required** --> 「推測で企業固有情報を書かない」
3. **RAG なし + assistive** --> テンプレート/grounding_mode に応じた簡易ガイダンス

### 8.8 Evidence Card 構築

ソース: `grounding.py` `_build_company_evidence_cards()` (行 708-947)

#### スコアリング (`_score_company_evidence_source`, 行 599-657)

| 要素 | 加点 |
|---|---|
| `content_type` 基本点 | new_grad_recruitment=10, employee_interviews=9, corporate_site=7, midterm_plan/ir_materials=6, press_release=4, other=3 |
| role_terms との overlap | +4/term |
| query_terms との overlap | +2/term |
| focus_terms との overlap | +2/term (generic_role_mode なら +4) |
| role_grounded + ROLE_SUPPORTIVE_CONTENT_TYPES | +3 |
| intern_name マッチ | +5 |
| user_priority_urls マッチ | +8 |
| title 存在 | +1 |
| excerpt 存在 | +1 |

#### テーマ推定 (`_infer_company_evidence_theme`, 行 518-565)

6つの設問シグナル（事業理解/成長機会/価値観/将来接続/役割理解/インターン機会）と content_type の組み合わせからテーマを推定。テンプレート別のデフォルトシグナルも定義されている。

#### カード選択ロジック

1. `required` の場合: ROLE_PROGRAM テーマと COMPANY_DIRECTION テーマから各1枚を優先確保
2. テーマ多様性を優先（`theme_target`: assistive=1, generic_role=4, other=3）
3. `effective_max_items`: assistive は最大2枚（条件付き）、required は最大4枚
4. 最後に `normalized_summary` を付与し、`is_primary` を先頭カードに設定

### 8.9 Evidence Coverage Assessment

ソース: `grounding.py` `_assess_company_evidence_coverage()` (行 950-1003)

| coverage level | 条件 |
|---|---|
| `none` | RAG なし or カードなし |
| `weak` | `assistive` で関連テーマなし / `required` で theme_count < 2 |
| `partial` | `assistive` で関連テーマあり / `required` で theme_count >= 1 |
| `strong` | `role_grounded` + 2テーマ以上 / 通常 2テーマ+2枚以上 |

2番目の返値 `needs_second_pass` は `required` テンプレートで coverage が weak の場合に `True`。

### 8.10 Company Honorific Tokens

ソース: `grounding.py` 行 15-16

```python
COMPANY_HONORIFIC_TOKENS = ("貴社", "貴行", "貴庫", "貴所", "貴校", "貴院")
COMPANY_REFERENCE_TOKENS = ("当社", "御社", "同社", "本社", "こちらの企業")
```

`_auto_replace_gosha()` (`validation.py:558-569`) が ES 内の「御社」を `get_company_honorific()` で決定した正しい敬称に自動置換する。置換は `grounding_mode != "none"` の場合のみ実行。

---

## Chapter 9: コンテキストとユーザー事実

### 9.1 参考ES品質ヒント

ソース: `backend/app/prompts/es_reference_guidance.py`（手動キュレーション SSOT・ランタイム唯一の参照元）と `backend/app/prompts/reference_es.py`（描画のみ）

runtime では参考ES本文・JSONL・pattern JSON を読まず、**統計値も持たない**。`docs/reference/es-review/{type}.md`（実際に添削で使う現行エディトリアル）を見て `es_reference_guidance.py` に型ごと手で執筆し（ビルド時生成スクリプトは無い）、`reference_es.py` がプロンプト用ブロックへ整形する。`backend/tests/es_review/test_es_reference_guidance_contract.py` が型安全・全9型網羅・copy-safety を恒久検証する。実使用一覧は `docs/reference/es-review/USED_LOGIC_HINTS.md`。

`build_reference_quality_profile()` が返すのは型レベルの定性ヒントのみ（統計指標・`conditional_hints` は廃止）:

| キー | 説明 |
|---|---|
| `quality_hints` | この設問で意識する品質（型レベル・8項目前後） |
| `skeleton` | 文字数帯別の骨子。`char_max` から6帯（`〜100`〜`500字以上`）を選択 |
| `sentence_flow` | 文レベルの役割と接続（型レベル） |
| `char_band` | 選択帯（`le_100`/`100_200`/`200_300`/`300_400`/`400_500`/`ge_500`） |
| `is_compound` / `component_types` | 複合設問か、構成タイプ列 |

ブロック構成: `【この設問で意識する品質】`(quality_hints) + `【参考ESから抽出した骨子】`(帯別 skeleton) + `【文レベルの流れ】`(sentence_flow) + 論理構成パターン + copy-safety 警告。`basic` は専用 md が無く8型共通構造から合成。型安全は TypedDict + runtime `validate_guidance_entry()` で担保（mypy 未設定のため）。

### 9.2 複合設問のヒントマージ

ソース: `reference_es.py` `_merge_reference_guidance()`（`app.services.es_review.template_context.merge_template_specs` と同戦略）

複数設問タイプが複合した ES では、型ごと単一の `es_reference_guidance` データを runtime で primary 主導マージする（複合組合せは個別キュレーションしない）。`orchestrator.py` が `effective_template_ctx.component_types` を `build_reference_quality_profile/block` に渡す:

| 要素 | マージ戦略 |
|---|---|
| `quality_hints` | primary 全部 + 各 secondary 先頭3 → 重複除去 → 最大10 |
| `skeleton` | primary の帯別骨子を主骨格として保持し、末尾に `（複合）後半で次の観点も自然に接続する: …` を1行付す（2骨子の機械混合はしない＝構造の一貫性維持） |
| `sentence_flow` | primary を維持し `transition_pattern` に複合の補足 |
| `logic_patterns` | primary 主導 + secondary を `補助アプローチ（複合）` として最大2行（`build_logic_patterns_block` 内） |

回答適応の統計比較（旧 `_build_conditional_quality_hints`）・統計プロファイル・`reference_conditional_hints_applied` telemetry は廃止済み。

### 9.3 ユーザー事実ガイダンス

ソース: `_prompt_builder.py` `_format_user_fact_guidance()` (行 319-355)

```
【使えるユーザー事実】
- [current_answer] {事実テキスト}
- [gakuchika_summary] {タイトル}: {事実テキスト}
...

<fact_weaving_rules>
1. 数値・固有名詞（○人、○か月、ツール名等）→ そのまま転写し、言い換えない
2. 行動・役割の事実 → 2文目または3文目の主語・目的語として使う
3. 成果・結果の事実 → 行動の直後に因果でつなぐ（「〜した結果」「〜により」）
4. 元回答のキーとなる動詞句 → 書き言葉に昇格させても動詞の核は変えない
5. 上記にない経験・役割・成果・数字は追加しない
6. raw material の事実は書かれた範囲のみ使い、推定や敷衍をしない
</fact_weaving_rules>
```

`rewrite_policy.fact_priority` による追加行:
- `self` --> `本文の主軸は自分の経験・行動・学びに置く`
- `mixed` --> `本文の主軸は自分の経験を起点に、必要な範囲で企業や仕事との接点につなぐ`

短字数 (`char_max <= 220`) かつ事実2件以上:
- `短い字数制限のため、元回答の核となる表現（動詞・名詞）をそのまま活かす`

### 9.4 論理構成パターン

ソース: `backend/app/prompts/logic_patterns.py` `build_logic_patterns_block()` と `backend/app/prompts/es_reference_guidance.py`（`logic_patterns` キー）

**単一スキーマ**（v1/v2 versioning・`source_count`/`frequency_count` 等の統計フィールドは廃止）。型ごとに正規構成1つ: `approach_label` / `approach_description`(≤200字) / `persuasion_key` と任意の `structural_blueprint` / `evidence_strategy` / `transition_logic` / `section_balance` / `opening_pattern` / `closing_pattern` / `quality_markers` / `common_weaknesses`。ソースは現行 `docs/reference/es-review/{type}.md`（古い `docs/prompts/es-review/logic-patterns/*.json` は廃止し `USED_LOGIC_HINTS.md` が実使用一覧）。

**出力条件**: `CONFIDENCE_MAP[question_type]` が `high` or `medium` AND `char_max >= 260`。件数表示はしない（"主な論理アプローチ: {ラベル}" のみ）。ブロックは `_BLOCK_CHAR_BUDGET`(=1100字) を超える場合、品質指標→弱点→補助の順で削ってバジェット内に収める。複合設問では secondary を `補助アプローチ（複合）` として最大2行追加。

#### CONFIDENCE_MAP

| テンプレート | 信頼度 |
|---|---|
| basic, company_motivation, post_join_goals, intern_reason, gakuchika | `high` |
| role_course_reason, self_pr, work_values, intern_goals | `medium` |

構成パターンは `es_reference_guidance.py` に手で投入された抽象ヒントだけを整形する。旧 runtime pattern JSON・旧 `docs/prompts/es-review/logic-patterns/*.json` は削除済み。

コピー安全チェック: パターンテキスト内に既知の企業名（KPMG, PwC, トヨタ等）が含まれている場合、そのパターンは使用されない。`es_reference_guidance.py` のキュレーション時点でも非掲載（型文・抽象指針のみ）。

### 9.5 許可ユーザー事実

ソース: `grounding.py` `_build_allowed_user_facts()` (行 101-220)

| ソースタイプ | usage ラベル |
|---|---|
| `current_answer` | 具体的経験・役割・成果・数字に使ってよい |
| `document_section` | 同一ES内で既に書かれている事実として使ってよい |
| `gakuchika_summary` (action) | 行動・役割として使ってよい |
| `gakuchika_summary` (result) | 成果・学びとして使ってよい |
| `gakuchika_summary` (numbers) | 明示された数値として使ってよい |
| `gakuchika_summary` (strengths) | 要約済みの強み・学びとして使ってよい |
| `gakuchika_raw_material` (spans) | 明示文面の範囲だけを使ってよい。強みや成果の推定は禁止 |
| `gakuchika_raw_material` (excerpt) | 原文要約ではなく素材断片としてのみ参照できる |
| `profile` (university) | 背景情報として使ってよい。経験創作には使わない |
| `profile` (faculty) | 背景情報として使ってよい。経験創作には使わない |
| `profile` (target_job_types) | 志向情報として使ってよい。経験創作には使わない |
| `profile` (target_industries) | 志向情報として使ってよい。経験創作には使わない |

### 9.6 プロンプト用ユーザー事実選択

ソース: `grounding.py` `_select_prompt_user_facts()` (行 378-501)

スコアリング: `source_weight + overlap * 3`

| ソース | weight | cap (default) | cap (short band) |
|---|---|---|---|
| `current_answer` | 10 | 3 | 4 |
| `gakuchika_summary` | 8 | 2 | 2 |
| `document_section` | 7 | 2 | 2 |
| `gakuchika_raw_material` | 6 | 2 | 2 |
| `profile` | 3 | 2 | 2 |

選択の優先順序: (1) current_answer の最高スコア事実、(2) supporting sources (gakuchika_summary/document_section/gakuchika_raw_material) の最高スコア事実、(3) profile で overlap > 0 の事実、(4) 残りをスコア順。最大8件。

---

## Chapter 10: フォーカスモードとリトライ

### 10.1 17 フォーカスモード

ソース: `backend/app/prompts/es_templates/_focus_modes.py`

#### 静的モード (10個)

| モード名 | 指示テキスト（要約） |
|---|---|
| `normal` | (空 -- 指示なし) |
| `length_focus_max` | 最大字数を超えないことを最優先。意味の重複、冗長な接続、同趣旨の言い換えから先に削る |
| `style_focus` | 全文をだ・である調に統一。文末を`だ/である/体言止め`のいずれかに統一 |
| `grounding_focus` | 企業や役割との接点を1点だけ明確にする。企業根拠カードから方向性を1句拾う |
| `fact_preservation_focus` | 元回答の数値・役職名・経験名を一切改変しない。新しい実績を足さない |
| `answer_focus` | 冒頭で結論ファーストに書き、1文目で答えの核だけを置く |
| `opening_focus` | 設問文の言い換えで始めず、結論から書き出す。冒頭2文で結論+根拠のみ |
| `quantify_focus` | 抽象ラベルだけで終わらせず、行動の対象・範囲・頻度・比較を具体化する |
| `structure_focus` | 箇条書きや断片ではなく、つながった本文として書き切る |
| `positive_reframe_focus` | 自己否定語をそのまま残さず、前向きな表現へ言い換える |

#### 複合モード (6個)

| モード名 | 指示テキスト（要約） |
|---|---|
| `fact_safety_length` | 最優先は事実保全。文字数調整は既存事実の説明密度と文の接続だけで行う |
| `fact_safety_structure` | 最優先は事実保全。箇条書き・断片・前置き過多を直し、1本の本文として書き切る |
| `length_answer_focus` | Step 1: 冒頭を結論ファーストに / Step 2: 目標字数まで既存事実の展開で伸ばす |
| `length_grounding` | Step 1: 企業接点を1点に絞る / Step 2: 目標字数まで既存事実の説明密度で伸ばす |
| `length_style_structure` | Step 1: 全文をだ・である調の1本の散文にする / Step 2: 目標字数まで伸ばす |
| `length_quantify` | Step 1: 元回答にある数値を保持 / Step 2: 対象・行動・比較の説明を補い目標字数まで伸ばす |
| `company_reference_length` | Step 1: 企業敬称の誤用をなくす / Step 2: 自分の行動・工夫・学びの説明で伸ばす |

#### 動的モード (1個)

`length_focus_min`: `_dynamic_length_focus_min()` (行 33-78) が `FocusModeContext` の `delta_band` に応じて異なる戦略を生成する。

| delta_band | 戦略 |
|---|---|
| `large` (>= 70字不足) | 2〜3文追加。根拠経験→学び→企業接点を順に展開。1文30〜50字目安 |
| `medium` (>= 35字不足) | 1文追加。既存文脈の具体化か因果の補足 |
| `small` (>= 15字不足) | 1〜2箇所に修飾句を追加。行動の対象・範囲・手段を1語追加 |
| `tiny` (< 15字不足) | 1箇所に修飾語を加えるだけ。意味を変えず描写の密度を上げる |

### 10.2 Failure Code --> Focus Mode マッピング

ソース: `backend/app/services/es_review/retry.py` `_resolve_rewrite_focus_mode()` (行 228-248)

| ValidationFailureCode | focus_mode |
|---|---|
| `UNDER_MIN` | `length_focus_min` |
| `OVER_MAX` | `length_focus_max` |
| `STYLE` | `style_focus` |
| `GROUNDING` | `grounding_focus` |
| `ANSWER_FOCUS` | `answer_focus` |
| `VERBOSE_OPENING` | `opening_focus` |
| `QUANTIFY` | `quantify_focus` |
| `STRUCTURE` | `structure_focus` |
| `BULLETISH_OR_LISTLIKE` | `structure_focus` |
| `EMPTY` | `structure_focus` |
| `FRAGMENT` | `structure_focus` |
| `NEGATIVE_SELF_EVAL` | `positive_reframe_focus` |
| `COMPANY_REFERENCE_IN_COMPANYLESS` | `structure_focus` |
| `HALLUCINATION` | `fact_preservation_focus` |
| `LLM_QUALITY` | `structure_focus` |
| `FACT_PRESERVATION` | `fact_preservation_focus` |
| `GENERIC` | `structure_focus` |

### 10.3 複合リトライモード選択

ソース: `retry.py` `_select_composite_retry_mode()` (行 140-177)

failure_codes が2種以上ある場合、以下の優先順位で複合モードを選択する（1回のみ）:

1. HALLUCINATION + 長さ --> `fact_safety_length`
2. HALLUCINATION + 構造 --> `fact_safety_structure`
3. COMPANY_REFERENCE_IN_COMPANYLESS + 長さ --> `company_reference_length`
4. 長さ + GROUNDING --> `length_grounding`
5. 長さ + ANSWER_FOCUS/VERBOSE_OPENING --> `length_answer_focus`
6. UNDER_MIN + QUANTIFY --> `length_quantify`
7. 長さ + 文体/構造 --> `length_style_structure`

### 10.4 RetryPlan 構築

ソース: `retry.py` `build_rewrite_retry_plan()` (行 81-137)

1. `_select_retry_codes()` -- 最大2コードを選択（HALLUCINATION 優先、次に長さ、次に重大コード）
2. `_resolve_rewrite_length_control_mode()` -- `length_focus_min` なら `under_min_recovery`、`length_focus_max` なら `tight_length`
3. `compute_shortfall_delta_band()` -- 不足量から delta band を算出
4. `resolve_length_target_plan()` -- ステージ別の生成目標帯を計算
5. `_retry_hints_from_codes()` -- コード別の具体的なリトライヒントを生成

### 10.5 コード別リトライヒント

ソース: `retry.py` `_retry_hint_from_code()` (行 559-663)

テンプレート定義の `retry_policy.guidance_by_failure` のキーにコードが一致する場合はそちらを優先使用する。一致しない場合はデフォルトヒントを使う。生成されたヒントは `_format_retry_section()` に渡され、初回制約の全文再掲ではなく、前回失敗を直すための差分指示として `<retry>` に出力される。

retry 時にも output contract、absolute constraints、length/template/company/context は保持されるが、結論ファーストや文体などの初回用 core/style/target 指示は原則として再掲しない。必要な場合は、該当 failure code のヒントとして `<retry>` に短く出す。

| コード | デフォルトヒント |
|---|---|
| `EMPTY` | 改善案本文を必ず1件だけ返す |
| `UNDER_MIN` | 内容を薄めず {target_hint} を狙う |
| `OVER_MAX` | 冗長語を削り {target_hint} に収める |
| `STYLE` | です・ます調を使わず、だ・である調に統一する |
| `ANSWER_FOCUS` | 1文目で設問への答えを短く言い切る |
| `VERBOSE_OPENING` | 設問の言い換えから始めず、1文目は結論だけを短く置く |
| `FRAGMENT` | 本文を断片で終わらせず、最後まで言い切る |
| `HALLUCINATION` | 元回答の数値・役割・具体的経験を変更せず、そのまま保持する |
| `FACT_PRESERVATION` | 元回答の数値・役割・具体的経験を変更せず、そのまま保持する |
| `COMPANY_REFERENCE_IN_COMPANYLESS` | 「貴社」等の企業敬称を使わず、自分の経験で書く |

`UNDER_MIN` の場合は delta_band に応じた追加ヒント:
- `large`: 2~3文の追加が必要
- `medium`: 1文追加で足りる
- `small`: 修飾句を1〜2箇所に加えて到達する
- `tiny`: 既存文の1箇所に修飾語を加えるだけで到達する

### 10.6 リトライ時のコンテキスト選択

ソース: `retry.py` `_select_rewrite_prompt_context()` (行 696-770)

| 条件 | fact_limit | card_limit |
|---|---|---|
| under_min_recovery | 8 | 4 |
| short_answer | 5 | 1 |
| simplified / compact | 5-6 | 0-2 |
| デフォルト | 8 | 3-4 |

`reference_quality_block` は初回試行時と under_min_recovery 時のみ含まれる（`char_max >= 260` かつ非短字数の場合）。

---

## Chapter 11: 後処理バリデーションチェーン

### 11.1 機械的バリデーション

ソース: `backend/app/services/es_review/validation.py` `_validate_rewrite_candidate()` (行 572-769)

処理の順序:

1. **空チェック**: `_normalize_repaired_text()` 後に空文字列なら `EMPTY`
2. **箇条書きチェック**: 改行あり + `(^|\n)\s*([・\-•]|\d+[.)])` にマッチなら `BULLETISH_OR_LISTLIKE`
3. **文字数チェック**: `_fit_rewrite_text_deterministically()` でセマンティック圧縮+トリミングを試行。失敗なら `UNDER_MIN` or `OVER_MAX`
4. **御社自動置換**: `grounding_mode != "none"` の場合、`_auto_replace_gosha()` で「御社」を正しい敬称に置換
5. **Fact Guard**: `_detect_fact_hallucination_warnings()` で事実改変を検出
6. **断片チェック**: `_has_unfinished_tail()` -- 末尾が `。！？!?` でなければ `FRAGMENT`
7. **企業敬称チェック**: `grounding_mode == "none"` で COMPANY_HONORIFIC_TOKENS が含まれていれば `COMPANY_REFERENCE_IN_COMPANYLESS`
8. **ハルシネーションハードブロック**: `hard_block_codes` に該当する警告があれば `HALLUCINATION`

### 11.2 Fact Guard

ソース: `backend/app/services/es_review/fact_guard.py` `_detect_fact_hallucination_warnings()` (行 307-396)

#### 検出コードとペナルティ

| コード | ペナルティ | 説明 |
|---|---|---|
| `number_mutation` | 3.0 | 元回答の数値が改変された（例: 「30人」が「50人」に） |
| `role_title_mutation` | 3.5 | 元回答の役職名が改変された（23種の役職名を追跡） |
| `metric_fabrication` | 2.5 (company_motivation/post_join_goals は 1.5) | 元回答にない新しい数値が追加された |
| `experience_fabrication` | 2.0 | 元回答にない経験語（大会、コンテスト、留学 等）が追加された |

#### 追跡対象の23役職名

```
副会長, 副部長, 副委員長, 副代表, 副リーダー, 副幹事長, 会長, 部長, 委員長, 代表,
リーダー, 幹事長, チーフ, マネージャー, キャプテン, 監督, 幹事, 書記, 会計, 広報,
渉外, 主将, 副主将
```

#### ハードブロックコード

```python
HARD_BLOCK_HALLUCINATION_CODES = {"number_mutation", "role_title_mutation", "metric_fabrication"}
```

#### Tier 2 閾値

STRICT_PROFILE のデフォルト: 3.0。LENIENT_PROFILE: 6.0。

### 11.3 セマンティック圧縮

ソース: `validation.py` `_apply_semantic_compression_rules()` (行 291-307)

4ティアの圧縮ルール。超過量に応じてティアを選択:

| ティア | 適用条件 | ルール例 |
|---|---|---|
| TIER_1 | 常に | `することができる` --> `できる`, `させていただく` --> `する` |
| TIER_2 | 超過 > 15字 | `非常に` --> (削除), `と考えている` --> `と考える` |
| TIER_3 | 超過 > 40字 | `そのため、` --> (削除), `を行う` --> `する` |
| TIER_4 | 超過 > 70字 | `そのような状況の中で、` --> (削除), `において` --> `で` |

圧縮で不十分な場合は `_prune_low_priority_sentences()` で低優先度の文を除去し、さらに `_trim_to_safe_boundary()` で安全な文境界で切り詰める。

### 11.4 LLM バリデーション

ソース: `backend/app/services/es_review/llm_validation.py` `_validate_rewrite_with_llm()` (行 145-214)

#### 7つの評価軸

| 軸 | 判定基準 |
|---|---|
| `conclusion_first` | 1文目が設問への答えになっているか |
| `company_grounding` | 企業への言及が設問タイプに応じて適切か (required/assistive/none) |
| `style_unity` | だ・である調で統一されているか |
| `structure_clarity` | 論理の流れが追えるか。同趣旨の繰り返しがないか |
| `fact_preservation` | 元回答の事実が保持されているか。元にない事実が追加されていないか |
| `expression_diversity` | 類似フレーズの近接反復がないか |
| `theme_focus` | 本文の主題が設問タイプに合致しているか |

#### System Prompt

```
あなたはES（エントリーシート）の品質検証官である。
添削済みの本文を7つの観点で評価し、JSON で結果を返す。
```

`fact_preservation` の判定基準では、構造改善（行動の具体化、論理接続の補強、能力の抽象化、構成の再編成）は pass とし、元にない数値・固有名詞・経験の追加のみを fail とする明示的な例外規定がある。

#### 軸モード (ValidationProfile 経由)

| モード | 動作 |
|---|---|
| `required` | fail 時にリジェクト |
| `warn` | fail しても warned_checks に記録するのみ |
| `skip` | 評価しない |

`theme_focus` はガクチカの場合 `skip`（ガクチカ自体が主題なので判定不要）、それ以外は `required`。

#### 特殊処理

- `fact_preservation` が fail --> 即座にリジェクト（`is_final_attempt` に関係なく）
- `LLM_QUALITY` fail かつ `is_final_attempt` --> lenient pass（`llm_lenient_pass: True`）
- LLM 呼出失敗 --> フォールバックとして pass

### 11.5 Validation Profiles

ソース: `backend/app/services/es_review/validation_profile.py`

#### STRICT_PROFILE

```python
ValidationProfile(
    name="strict",
    conclusion_first="required",
    company_grounding="required",
    style_unity="required",
    structure_clarity="required",
    fact_preservation="required",
    fact_guard_hard_block_codes={"number_mutation", "role_title_mutation", "metric_fabrication"},
    hallucination_tier2_threshold=3.0,
    max_retry=3,
)
```

#### LENIENT_PROFILE

```python
ValidationProfile(
    name="lenient",
    company_grounding="warn",
    fact_preservation="warn",
    fact_guard_hard_block_codes={"number_mutation"},
    hallucination_tier2_threshold=6.0,
    best_effort_enabled=True,
    max_retry=2,
)
```

#### 情報密度ティア

ソース: `compute_information_density()` (行 98-120)

```python
score = char_count * 0.3 + fact_count * 30
```

| ティア | score 閾値 |
|---|---|
| `sparse` | < 30 |
| `low` | < 60 |
| `moderate` | < 120 |
| `sufficient` | >= 120 |

#### ティア別調整 (`apply_information_tier_adjustments`, 行 123-161)

- `sufficient`/`moderate` --> 調整なし
- `low` --> `fact_preservation` を `warn` に緩和、`hallucination_tier2_threshold` を 4.5 に
- `sparse` --> さらに `fact_guard_hard_block_codes` を `{number_mutation}` のみに

### 11.6 Degraded/Best-Effort 採用

ソース: `retry.py` `_best_effort_rewrite_admissible()` (行 282-308)

以下のコードを含む場合は degraded 採用を拒否:
```python
_DEGRADED_BLOCK_CODES = {EMPTY, FRAGMENT, NEGATIVE_SELF_EVAL, COMPANY_REFERENCE_IN_COMPANYLESS, HALLUCINATION, FACT_PRESERVATION}
```

### 11.7 Combined Validation Flow

ソース: `validation.py` `_validate_rewrite_combined()` (行 772-856)

1. 機械的バリデーション (`_validate_rewrite_candidate`)
2. JSON caller が利用可能であれば LLM バリデーション (`_validate_rewrite_with_llm`)
3. 機械的バリデーションで不合格なら、LLM 結果を meta に記録するのみで不合格を維持
4. 機械的バリデーション合格 + LLM 不合格:
   - `fact_preservation` fail --> 即リジェクト
   - 最終試行 (`is_final_attempt`) --> lenient pass
   - それ以外 --> `LLM_QUALITY` として再試行

---

## Chapter 12: 改善解説生成

ソース: `backend/app/services/es_review/explanation.py`

### 12.1 Explanation Prompt

#### System Prompt

```
あなたはES添削の改善内容を就活生にわかりやすく説明するアシスタントです。

元の回答と改善案を比較し、評価軸に対応する改善ポイントと主な変更点を説明してください。

出力は JSON オブジェクトのみ。Markdown、見出し、コードフェンス、前置きは禁止。

ルール:
- 就活生向けの平易な言葉を使う
- 重要度が高い改善から順に記載する
- improvement_points は最大3件、main_changes は最大2件
- 引用は要約し15字以内にする
- 元の回答を批判せず、改善案の良さを説明する
- 「〜べき」「〜しなければならない」ではなく「〜するとよい」「〜が効果的」のトーンにする
- 評価軸にない一般論だけで説明しない
- 空の配列は避け、必ず improvement_points を1件以上出す
```

#### User Prompt Template

```
【設問タイプ】{template_label}{company_line}

【評価軸】
{axes_block}

【元の回答】
{safe_original}

【改善案】
{safe_rewritten}
```

### 12.2 JSON v2 スキーマ

```json
{
  "version": 2,
  "improvement_points": [
    {"axis": "評価軸名", "point": "改善ポイントを短く", "detail": "読み手に伝わる変化を1文で"}
  ],
  "main_changes": [
    {"before_summary": "変更前の要約", "after_summary": "変更後の要約", "change": "何をどう直したかを1文で"}
  ]
}
```

### 12.3 モデルとパラメータ

| パラメータ | 値 |
|---|---|
| model | `gpt-5.4-mini` |
| temperature | 0.1 |
| max_output_tokens | 900 |
| stream | True |
| timeout | 8.0 seconds |

### 12.4 正規化

ソース: `_normalize_explanation_payload()` (行 163-199)

| フィールド | 上限文字数 |
|---|---|
| `axis` | 32 |
| `point` | 48 |
| `detail` | 110 |
| `before_summary` | 24 |
| `after_summary` | 24 |
| `change` | 90 |

`improvement_points` は最大3件、`main_changes` は最大2件に切り詰め。

---

## 付録 A: 重複・冗長性分析

本付録は、同一または近い意味の指示が複数箇所に存在するケースを、現行の `PromptPlan` / `InstructionId` 化後の状態として整理する。`InstructionId` を持つ指示は ID 単位で重複排除されるが、複数行の raw block や validation 専用 metadata は別責務として残る。

### A.1 結論ファースト

同一の「冒頭で結論を言い切る」指示は、用途別に以下の箇所で扱われる。初回プロンプトでは `InstructionId.CONCLUSION_FIRST` と style raw block の両方に近い表現が残るが、retry 時は core/style の再掲を抑制し、failure code に応じた差分だけを `<retry>` に出す。

| # | 出現箇所 | ファイル:行 | 指示テキスト |
|---|---|---|---|
| 1 | `<constraints priority="core">` | `_prompt_builder.py` | 1文目で設問への答えの核を言い切る |
| 2 | StyleRule #1 (MUST) | `es_quality_rules.py:25-28` | 1文目は設問への答えを結論として言い切る（前置きや背景説明から入らない） |
| 3 | テンプレート `evaluation_checks.head_focus_pattern` + `answer_focus_message` | 各テンプレートファイル | 冒頭で〜を短く言い切ってください |
| 4 | Focus mode `answer_focus` | `_focus_modes.py:107-112` | 冒頭で結論ファーストに書き、1文目で明確に伝わる構成にする |
| 5 | Focus mode `opening_focus` | `_focus_modes.py:113-118` | 設問文の言い換えで始めず、結論から書き出す |
| 6 | LLM validation axis `conclusion_first` | `llm_validation.py:65` | 1文目が設問への答えになっているか |

**分析**: #1 は `InstructionId.CONCLUSION_FIRST` として管理される。#2 は `<style>` raw block であり、現在は ID dedupe の対象外である。retry 時は `render_on_retry=False` により #1/#2 の再掲を抑え、#4/#5 や validation failure 由来の差分ヒントに寄せる。#6 はリライト後の検証フェーズで独立に動作するため冗長ではない。

**現行方針**: 初回の制約は維持し、retry での全文再掲を避ける。今後さらに削る場合は、StyleRule 側を validation metadata に寄せるか、style raw block を `PromptInstruction` 化して ID dedupe の対象にする。

### A.2 事実保全

| # | 出現箇所 | ファイル:行 |
|---|---|---|
| 1 | `<constraints priority="absolute">` fact_preservation_rules | `_prompt_builder.py` |
| 2 | Fact Guard 機械検出 | `fact_guard.py:307-396` |
| 3 | Focus mode `fact_preservation_focus` | `_focus_modes.py:101-106` |
| 4 | Focus mode `fact_safety_length`, `fact_safety_structure` | `_focus_modes.py:135-146` |
| 5 | LLM validation axis `fact_preservation` | `llm_validation.py:73-78` |
| 6 | Retry hints (HALLUCINATION, FACT_PRESERVATION codes) | `retry.py` |

**分析**: #1 は毎回出力される absolute 制約。#2 は機械的検出で事後的にチェック。#3, #4 は retry attempt で強くなる。#5 は LLM 検証。#6 はリトライヒントとしてプロンプトに注入される。事実保全は最重要ルールであり、多重防御が意図的に設計されている。冗長だが、削減すると事実改変率が上がるリスクがある。

**現行方針**: 事実保全は hard constraint として維持する。retry では absolute 制約を保持しつつ、HALLUCINATION / FACT_PRESERVATION の差分ヒントで修正対象を絞る。

### A.3 だ・である調

| # | 出現箇所 | ファイル:行 |
|---|---|---|
| 1 | `<output_contract>` | `_prompt_builder.py` |
| 2 | Focus mode `style_focus` | `_focus_modes.py:89-94` |
| 3 | LLM validation `style_unity` | `llm_validation.py:68` |
| 4 | Degraded 後処理 `_coerce_degraded_rewrite_dearu_style()` | `validation.py:159-202` |

**分析**: 初回プロンプトでは `STYLE_DA_DEARU` を `<output_contract>` に集約している。以前のように absolute constraints に同じ文体指定を重ねて出さない。retry で文体失敗がある場合は `style_focus` または failure code の差分ヒントとして出る。

**現行方針**: 出力契約を正本にし、validation / degraded 後処理を安全網として残す。

### A.4 企業言及制限

| # | 出現箇所 | ファイル:行 |
|---|---|---|
| 1 | テンプレート `rewrite_policy.company_usage` | 各テンプレートファイル |
| 2 | `<constraints priority="target">` company_mention_rule | `_prompt_builder.py` |
| 3 | 企業根拠カード使い方 (`_format_company_guidance`) | `_prompt_builder.py` |
| 4 | `COMPANY_REFERENCE_IN_COMPANYLESS` 検証 | `validation.py:684-688` |
| 5 | LLM validation `company_grounding` | `llm_validation.py:66-69` |
| 6 | Assistive grounding block | `_prompt_builder.py` |

**分析**: #1 はメタデータ、#2 は `InstructionId.COMPANY_GROUNDING_POLICY` として target constraints に出る企業言及方針、#3 は `<company>` 内のカード活用方法である。retry 時は target constraints を再掲しないが、`<company>` は保持されるため、企業根拠カードと grounding ルールは継続して利用できる。

**現行方針**: 企業言及の回数・敬称制御は target constraints に寄せ、カードの使い方は `<company>` に残す。`grounding_mode == "none"` の企業敬称禁止は company policy 側に統合し、重複表現を増やさない。

### A.5 テンプレート構成指示

| # | 出現箇所 | ファイル |
|---|---|---|
| 1 | `rewrite_policy.structure_short` | 各テンプレートファイル |
| 2 | `rewrite_policy.playbook` | 各テンプレートファイル (8テンプレート) |
| 3 | `validation_policy.evaluation_axes` | 各テンプレートファイル |
| 4 | `retry_policy.guidance_by_failure.structure` | 各テンプレートファイル |
| 5 | Focus mode `structure_focus` | `_focus_modes.py:124-129` |

**分析**: short band では `structure_short`、mid / long band では `playbook` を使う。以前のように short/mid/retry/required_structure が同じ構成を別表現で再掲する形はやめ、`PromptPlan` が `InstructionId` 単位で重複を抑える。

**現行方針**: 中字数構成は playbook の `opening/second/third/fourth` から生成し、short band だけ `structure_short` を使う。

---

## 付録 B: 条件付き出力マトリクス

以下のマトリクスは、`template_type` x `char_band` (short: <=220 / mid: 280-520 / long: >520) x `grounding_mode` の組み合わせで、各プロンプトセクションが含まれるか否かを示す。

### B.1 文体・長さ関連ブロック

| セクション | 出力条件 | short | mid | long |
|---|---|---|---|---|
| `prose_style_block` | `char_max > 220` | -- | YES | YES |
| `anti_ai_compact` | 初回は常に短い advisory のみ | YES | YES | YES |
| `gakuchika_bias_guard` | `template_type` != gakuchika, basic | YES | YES | YES |
| `gakuchika_allocation_guide` | `template_type` == gakuchika | YES | YES | YES |
| `short_answer_guidance` | `char_max <= 220` | YES | -- | -- |
| `midrange_length_guidance` | `280 <= char_max <= 520` AND `rewrite_policy.playbook` あり | -- | YES | -- |
| `self_count_instruction` | `char_min` or `char_max` あり | YES | YES | YES |
| `length_policy_block` | `char_min` or `char_max` あり | YES | YES | YES |

### B.2 コンテキスト関連ブロック

| セクション | 出力条件 |
|---|---|
| `reference_quality_block` | `char_max >= 260` AND 非短字数 AND (初回 or under_min_recovery) |
| `logic_patterns_block` | `char_max >= 260` AND confidence が high/medium AND 抽象ヒントが投入済み |
| `user_fact_guidance` | `allowed_user_facts` が存在する場合 |
| `fact_weaving_rules` | `allowed_user_facts` が存在する場合（user_fact_guidance 内） |

### B.3 企業接地関連ブロック

| セクション | grounding_mode=none | grounding_mode=company_general | grounding_mode=role_grounded |
|---|---|---|---|
| `deep_grounding_requirements` | -- | deep テンプレートのみ | deep テンプレートのみ |
| `assistive_grounding_block` | -- | assistive + company_name あり | assistive + company_name あり |
| `proper_noun_policy` | -- | intern_reason/intern_goals/role_course_reason のみ | intern_reason/intern_goals/role_course_reason のみ |
| `company_guidance` (カード付き) | -- | YES (RAG あり) | YES (RAG あり) |
| `company_mention_rule` | 企業名・敬称を絶対に使わない | assistive: 敬称2回まで / required: 企業名1回+敬称 | assistive: 敬称2回まで / required: 企業名1回+敬称 |

### B.4 テンプレート関連ブロック

| セクション | 出力条件 |
|---|---|
| `template_focus` | Standard 戦略のみ (Fallback では省略) |
| `rewrite_policy.required_elements` | テンプレート定義に存在する場合 |
| `evaluation_rubric` | テンプレート定義に `validation_policy.evaluation_axes` がある場合 |
| `template_guidance` | テンプレート定義に対応する TEMPLATE_GUIDANCE がある場合 |
| `rewrite_policy.anti_patterns` | テンプレート定義に存在する場合 |
| `playbook` | テンプレート定義に存在 AND `char_max >= 120` |
| `question_focus_rules` | intern_reason で設問文に特定トークンが含まれる場合のみ |
| `negative_reframe_guidance` | self_pr のみ（template セクション内） |

### B.5 リトライ関連ブロック

| セクション | 出力条件 |
|---|---|
| `focus_mode_guidance` | リトライ時（`focus_mode != "normal"` の場合） |
| `retry_items` (前回失敗の回避) | `retry_hints` が存在する場合。failure code 由来の差分指示だけを出す |
| Standard 戦略での `pass_focus_mode_context` | `True`（FocusModeContext を渡す） |
| Fallback 戦略での `pass_focus_mode_context` | `False`（FocusModeContext を渡さない） |

retry では `<retry>` に初回ルールを丸ごと再掲しない。`PromptRenderer.render(..., is_retry=True)` が `render_on_retry` を見て初回専用の role/core/target/style 指示を抑制し、失敗差分だけを retry section に残す。

---

## 付録 C: ファイルパスインデックス

| ファイルパス | 説明 |
|---|---|
| `backend/app/prompts/es_templates/_prompt_builder.py` | リライト/ドラフト生成のプロンプト組立。各セクションのフォーマッタ結果を PromptPlan に集約するコンポジタ関数 |
| `backend/app/prompts/es_templates/_focus_modes.py` | 17フォーカスモードの定義。静的ガイダンスマップと動的 length_focus_min 生成 |
| `backend/app/prompts/es_templates/_length_control.py` | 文字数制御。LengthTargetPlan、gap 計算、delta band、overshoot |
| `backend/app/prompts/es_templates/_common.py` | 共通ヘルパー。敬称決定、prose_style |
| `backend/app/prompts/es_templates/_types.py` | TemplateDef / policy 型、InstructionId、Priority、PromptSection、PromptInstruction、PromptPlan、PromptRenderer |
| `backend/app/prompts/es_templates/basic.py` | basic テンプレート定義 |
| `backend/app/prompts/es_templates/company_motivation.py` | company_motivation テンプレート定義 |
| `backend/app/prompts/es_templates/gakuchika.py` | gakuchika テンプレート定義 |
| `backend/app/prompts/es_templates/self_pr.py` | self_pr テンプレート定義 |
| `backend/app/prompts/es_templates/intern_reason.py` | intern_reason テンプレート定義 |
| `backend/app/prompts/es_templates/intern_goals.py` | intern_goals テンプレート定義 |
| `backend/app/prompts/es_templates/post_join_goals.py` | post_join_goals テンプレート定義 |
| `backend/app/prompts/es_templates/role_course_reason.py` | role_course_reason テンプレート定義 |
| `backend/app/prompts/es_templates/work_values.py` | work_values テンプレート定義 |
| `backend/app/prompts/es_quality_rules.py` | 15 StyleRule、テンプレート別ガイダンス、抽象例文 |
| `backend/app/prompts/es_reference_guidance.py` | runtime が読む参考ES由来の抽象ヒント受け皿 |
| `backend/app/prompts/reference_es.py` | 抽象ヒント、品質ヒント10項目x9テンプレ、骨子、文フローの描画 |
| `backend/app/prompts/logic_patterns.py` | 論理構成パターン描画。CONFIDENCE_MAP、スキーマ、コピー安全チェック |
| `backend/app/services/es_review/ai_smell.py` | AI-臭フレーズ検出。5カテゴリ、specificity check |
| `backend/app/services/es_review/grounding.py` | 企業接地。エビデンスカード構築、ユーザー事実抽出、coverage 評価 |
| `backend/app/services/es_review/retry.py` | リトライ制御。RetryPlan、focus mode 解決、複合モード選択、ヒント生成 |
| `backend/app/services/es_review/validation.py` | 機械的バリデーション。文字数、文体、断片、セマンティック圧縮 |
| `backend/app/services/es_review/fact_guard.py` | 事実保全ガード。数値改変、役職名改変、メトリクス捏造検出 |
| `backend/app/services/es_review/llm_validation.py` | LLM 品質検証。7軸評価、system prompt、JSON スキーマ |
| `backend/app/services/es_review/validation_profile.py` | STRICT/LENIENT プロファイル、情報密度ティア、ティア別調整 |
| `backend/app/services/es_review/explanation.py` | 改善解説生成。gpt-5.4-mini、JSON v2 スキーマ、正規化 |
| `backend/app/services/es_review/enums.py` | 全 enum 定義。ValidationFailureCode、GroundingMode/Level 等 |
