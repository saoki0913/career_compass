# ガクチカ作成機能 品質監査レポート

**監査日:** 2026-04-12
**監査レベル:** 外部コンサルレビューレベル（プロンプト品質重点 + 競合比較 + Live AI 検証の 3 軸）
**対象 Git SHA:** cbf9de8
**対象モデル:** gpt-5.4-mini (質問生成), claude-sonnet-4-6 (ドラフト生成 / 構造化サマリー)
**プロンプト実装ソース:** `gakuchika_prompts.py` (managed prompts + fallback), `es_templates.py` (ドラフト生成 — `build_template_draft_generation_prompt("gakuchika")`)
**Temperature:** 0.35–0.4 (質問生成), 0.3 (ドラフト / サマリー)

---

## 1. エグゼクティブサマリー

### 8 軸評価マトリクス

| 軸 | 評価 | 判定根拠 |
|---|:---:|---|
| **プロンプト設計（質問生成系）** | **B** | 3 段階入力分類、禁止表現パターン、トーンルールは整備。ただし few-shot 例ゼロ、コーチペルソナ未設定、system/user メッセージ未分離。結果として「安全だが凡庸」な質問になりやすい |
| **ES 下書き生成** | **B-** | `es_templates.py` の `TEMPLATE_DEFS["gakuchika"]` は `required_elements` / `anti_patterns` / `evaluation_checks` を持ち構造は良好。しかし AI 臭排除指示が不十分、few-shot 見本ゼロ、学生の言葉遣い保存指示なし |
| **ES 作成判定ロジック** | **C** | パターンマッチによる 6 項目品質チェック + 4 因果ギャップは設計として健全。しかし Live AI テストで **draft_ready に一度も到達していない**。偽陰性率が高く、context/task の暗黙的表現を捉えられない |
| **深掘り・STAR 整理ロジック** | **B+** | 3 フェーズ設計（es_aftercare → evidence_enhancement → interview_expansion）は就活指導の実態に合致。構造化サマリー 20+ フィールドは面接準備として充実。ただし深掘り完了後の extended_deep_dive_round がフロントエンド任せで増分未管理 |
| **テストカバレッジ** | **D** | `test_gakuchika_flow_evaluators.py` が ImportError で collect 不能。全 Live AI テスト FAILED（infra / rate limit / state 未達）。エンドポイント統合テスト / SSE ストリーミングテスト / ドラフト生成テストがゼロ |
| **コード品質・保守性** | **C+** | 1616 行の巨大ルーター、request シャドウイングによる rate limit バイパスリスク、`_evaluate_deepdive_completion` の union 型オーバーロード。ただしセキュリティ（プロンプトインジェクション対策、認可チェック）は適切 |
| **フロントエンド UX** | **B** | SSE ストリーミング実装、STAR プログレスバー、マルチセッション管理は優秀。30 個の useState、912 行リストページ、サマリーポーリング（最大 12 秒待機）が課題 |
| **安全性** | **A-** | `sanitize_user_prompt_text` / `PromptSafetyError` / owner 判定 / クレジット成功時のみ消費。ゲスト AI アクセス制限も適切。request シャドウイングの rate limit 問題のみ減点 |

### 総合スコア: 52/100 (グレード C)

| 評価領域 | 配点 | 得点 | 根拠 |
|---------|---:|---:|---|
| プロンプト設計（質問生成系） | 15 | 9 | 構造は良好だが few-shot/ペルソナ不在で質問の深さが安定しない |
| ES 下書き生成 | 15 | 8 | es_templates.py ベースで健全だが AI 臭排除・個性保存が弱い |
| ES 作成判定ロジック | 15 | 6 | Live テストで draft_ready 未達。偽陰性が実運用を阻害する可能性 |
| 深掘り・STAR 整理ロジック | 10 | 7 | 設計は優秀だが Live テストで深掘りフェーズに到達できていない |
| テストカバレッジ | 15 | 4 | ImportError / 全 Live FAILED / エンドポイント統合テストゼロ |
| コード品質・保守性 | 10 | 6 | 1616 行ルーター / request シャドウイング / union 型オーバーロード |
| フロントエンド UX | 10 | 7 | ストリーミング UX 優秀、状態管理肥大 |
| 安全性 | 10 | 8 | プロンプトインジェクション対策・認可・クレジット管理は適切 |
| 競合比較加点 | — | -3 | LP 訴求ゼロ / テンプレページ SEO 不足で機能の存在が認知されない |

### 最重要改善 5 点

1. **[致命的] Live AI テストで draft_ready に一度も到達していない** — smoke/extended 全 run で FAILED。ユーザーが同一回答を繰り返すと AI が同じ質問の微小言い換えを延々ループし、`blocked_focuses` / `focus_attempt_counts` が機能していない。`gakuchika.py` L818-823 のブロック機構が会話ループを防止できていない
2. **[致命的] `test_gakuchika_flow_evaluators.py` が ImportError で collect 不能** — `_should_retry_gakuchika_draft` が `gakuchika.py` に存在しない。8 テスト全体が CI をすり抜けている可能性（`gakuchika.py` L8）
3. **[重大] request シャドウイングによる rate limit バイパスリスク** — `gakuchika.py` L1373, L1452, L1471, L1543 で `request = payload` により FastAPI の `Request` オブジェクトが上書きされ、`@limiter.limit` が IP 取得に失敗する可能性
4. **[重大] ES 作成判定の偽陰性率が高い** — `TASK_PATTERNS` が「課題」「問題」等の明示的キーワードのみ。「〜がなかった」「〜を始めた」等の暗黙的タスク表現を捉えられず、十分な回答でも `task_clarity=false` になる
5. **[重大] AI 臭排除指示の不足** — 「この経験を通じて〜の重要性を学んだ」「〜に貢献したいと考える」等の就活テンプレート表現の明示的禁止がない。プロ講師が最重視する「学生の言葉を残す」指示も欠如

---

## 2. プロンプト品質分析（質問生成系）

### 2.1 初回質問プロンプト (INITIAL_QUESTION_PROMPT) — B

**良い点:**
- `_classify_input_richness` による 3 段階分岐（`seed_only` / `rough_episode` / `almost_draftable`）は学生の入力密度に応じた初手の自動調整として有効
- JSON 出力スキーマが `question` / `focus_key` / `answer_hint` / `progress_label` / `missing_elements` を含み構造化されている

**問題点:**
- **system prompt に全コンテキストを詰め込んでいる。** 学生の入力（`gakuchika_title` + `gakuchika_content`）が system prompt 内にインライン展開され、user message は固定の「最初の質問を生成してください。」のみ（`gakuchika.py` L1185-1191）。role-following 精度の観点で system/user を分離すべき
- **few-shot 例がゼロ。** 「良い初回質問」の具体例がなく、LLM は JSON フォーマット例のみ参照。質問のトーン・深さが安定しない
- **コーチペルソナが未設定。** 「自然な丁寧語」のみで、面接官口調 / 先輩口調 / キャリアセンター職員口調のいずれかが不定

**根拠:** `gakuchika_prompts.py` L94-138, `gakuchika.py` L1158-1219

### 2.2 ES 材料収集質問プロンプト (ES_BUILD_AND_QUESTION_PROMPT) — B+

**良い点:**
- `missing_elements` / `draft_quality_checks` / `causal_gaps` の 3 層品質評価を LLM に伝える設計
- `known_facts` セクションで直近ユーザー回答を要約として渡す工夫
- `ready_for_draft` の判定条件を詳細に記載（L172-177）

**問題点:**
- **質問ルールが「何をしないか」に偏っている。** 禁止は豊富だが「プロコーチならこう聞く」というポジティブガイダンスが薄い
- **`known_facts` が最後 4 件限定。** `_build_known_facts` が `user_answers[-4:]` のみ参照し、序盤の context/task 情報が欠落する（`gakuchika.py` L682）
- **会話履歴フォーマットが単純。** 「質問: / 回答:」のラベリングのみで、ターン番号や文脈の構造化なし

**根拠:** `gakuchika_prompts.py` L141-213, `gakuchika.py` L1098-1113

### 2.3 深掘りフェーズプロンプト (STAR_EVALUATE_AND_QUESTION_PROMPT) — A-

**良い点:**
- 3 段階フェーズ設計（`es_aftercare` → `evidence_enhancement` → `interview_expansion`）が就活面接の深掘り実態に合致
- `draft_diagnostics_json` を深掘りコンテキストに渡し、ドラフトの弱点を深掘りの焦点にできる
- `future` / `backstory` の追加は面接対策として正しい

**問題点:**
- **「STAR の点数評価は不要です」の否定文が冒頭にある。** モデルに概念を想起させてから否定する形で、プロンプト効率が悪い。「面接で話せる粒度まで解像度を上げる」に絞るべき
- **深掘り完了はサーバー側判定だが、LLM にその境界が伝わりにくい。** 「必ず次の 1 問を返す」指示により、十分深まった状態でも無理に質問を生成する

**根拠:** `gakuchika_prompts.py` L216-264, `gakuchika.py` L1116-1155

### 2.4 構造化サマリープロンプト (STRUCTURED_SUMMARY_PROMPT) — B+

**良い点:**
- 出力項目が充実（STAR 要素、強み、学び、数字、面接官フック、判断理由、前後比較、信憑性メモ、再現原則、2 分版骨子等 17+ 項目）

**問題点:**
- **17 項目を一度に要求。** LLM の注意が分散し各項目の品質が薄くなるリスク。`one_line_core_answer` / `two_minute_version_outline` は面接準備の核だが 17 項目中に埋もれる
- **文字数制約が不均一。** `action_text` は「80-120 字」だが `one_line_core_answer` は「30-50 字程度」と曖昧

**根拠:** `gakuchika_prompts.py` L267-340

### 2.5 禁止表現チェック (PROHIBITED_EXPRESSIONS) — B-

**現在の禁止リスト（6 パターン）:**
1. 「〜してください」で終わる依頼文
2. 「もう少し」「詳しく」「具体的に」
3. 「他にありますか」「何かありますか」
4. 「どうでしたか」「いかがでしたか」
5. 「先ほど『〇〇』とおっしゃいましたが」
6. 毎回同じ書き出し

**不足パターン:**
- 「それは素晴らしいですね」系の過剰肯定 — AI 質問前のお世辞頻出パターン
- 「〜という理解でよろしいでしょうか」系の確認質問 — 材料収集段階では確認より前進優先
- 「もう一歩踏み込んで」— 「もう少し」の変形だが未カバー
- 「〜を振り返って」— ES 材料収集で内省要求は時間浪費
- 複合質問（「A と B について」）— 1 問 1 論点ルールはあるが禁止表現リストに具体例なし
- 「印象に残っている範囲で伺えますか」— Live テストで実際に繰り返し出現（後述 8.2）

**根拠:** `gakuchika_prompts.py` L23-33, Live AI transcript（8.2 参照）

### 2.6 Notion Registry managed prompts の状態

`notion_prompts.json` のガクチカ関連全 9 エントリが `"content": ""` / `"version": 0`。`get_managed_prompt_content()` は**常に fallback 値を返す**。

| prompt_id | content | version | 状態 |
|---|---|---|---|
| `gakuchika.question_tone` | `""` | 0 | 未稼働 |
| `gakuchika.prohibited_expressions` | `""` | 0 | 未稼働 |
| `gakuchika.es_build_principles` | `""` | 0 | 未稼働 |
| `gakuchika.deepdive_principles` | `""` | 0 | 未稼働 |
| `gakuchika.initial_question` | `""` | 0 | 未稼働 |
| `gakuchika.es_build_and_question` | `""` | 0 | 未稼働 |
| `gakuchika.deepdive_question` | `""` | 0 | 未稼働 |
| `gakuchika.structured_summary` | `""` | 0 | 未稼働 |
| `gakuchika.reference_guide_rubric` | `""` | 0 | 未稼働 |

**リスク:** Notion 側で content を入れた場合、fallback で積み上げた改善がすべて上書きされる。品質回帰テストなし。

**根拠:** `backend/app/prompts/generated/notion_prompts.json` L69-131

---

## 3. ES 下書き生成分析

### 3.1 実装アーキテクチャ

ガクチカの ES 下書き生成は `es_templates.py` の `build_template_draft_generation_prompt("gakuchika")` が正本。旧 `gakuchika.draft_generation` managed prompt は廃止済み（`docs/PROGRESS.md:15`, `docs/features/AI_PROMPTS.md:595`）。

**生成フロー:**
```
POST /api/gakuchika/generate-es-draft
  → char_limit ∈ {300, 400, 500} バリデーション
  → 会話履歴サニタイズ (max 3000 chars/msg)
  → build_template_draft_generation_prompt("gakuchika", ...)
    → system: role + task + output_contract + constraints + length_policy
           + core_style (_GLOBAL_CONCLUSION_FIRST_RULES) + template_focus
           + required_elements + anti_patterns + guidance blocks
    → user: meta_lines + 材料ブロック + "上記のみを根拠にJSONを出力してください。"
  → LLM (claude-sonnet, max_tokens=1400, temperature=0.3)
  → JSON parse → normalize_es_draft_single_paragraph()
  → _build_draft_diagnostics() → 応答
```

**`TEMPLATE_DEFS["gakuchika"]` の構造:**
- `required_elements`: STAR 4 要素 + learning
- `anti_patterns`: 抽象動詞、形容詞単独使用等
- `recommended_structure`: 結論ファースト
- `evaluation_checks`: 文字数、結論優先、具体性
- `company_usage: "none"`, `grounding_mode: "none"` — 企業接続不要

**根拠:** `es_templates.py` L1354-1435, `gakuchika.py` L1540-1616, `docs/features/AI_PROMPTS.md` L595-612

### 3.2 プロンプト品質

**良い点:**
- `_GLOBAL_CONCLUSION_FIRST_RULES` が具体的：「抽象動詞だけで済ませない」「形容詞を単独で使わない」「ユーザーの元回答に含まれる数値・固有名詞は必ず保持する」
- `grounding_mode: "none"` でガクチカに無理な企業接続を入れない設計は正しい
- `char_min = int(char_limit * 0.9)` で文字数下限を自動設定

**問題点:**
- **「だ・である調で統一」が唯一の文体指定。** アカデミック調 / ビジネス調 / エッセイ調の選択肢なし。学生の個性が出る余地がない
- **few-shot の ES 見本がゼロ。** 300/400/500 字の各バンドで「この品質を目指せ」という具体例なし。LLM は「選考通過レベル」を推測するしかない

### 3.3 AI 臭リスク評価

| パターン | リスク | 根拠 |
|---|:---:|---|
| 「この経験を通じて〜の重要性を学んだ」 | **高** | 明示的禁止なし |
| 「〜に貢献したいと考える」 | **高** | 明示的禁止なし |
| 「そのため / その結果」の過剰接続 | **中** | 「冗長な接続詞で文字数を浪費しない」はあるが弱い |
| 四字熟語・堅い漢語表現の多用 | **中** | 禁止なし。「だ・である調」が硬い文体を誘発 |
| 文末の「〜と考える」「〜と感じた」連続 | **低** | 「同じ文末表現を 2 文連続で使わない」で部分カバー |
| 主語省略の不自然さ | **中** | 「私は」出現を促す指示はあるが過剰出現の抑制なし |

**プロ講師との最大の差:** プロ講師は「その子らしさ」を残す。会話中の独特な言い回し・逡巡・素朴な感想を ES に織り込む。現プロンプトには「学生の言葉遣いや思考の癖を文体に反映する」指示がない。

### 3.4 文字数制御

`char_min = int(char_limit * 0.9)` で下限を自動設定。300 字指定なら 270 字以上を要求。`_format_length_policy_block` で「超過は不可、下回りは許容範囲内」を指示。

### 3.5 フォールバック（正規表現抽出）の信頼性

LLM が有効 JSON を返さない場合、`gakuchika.py` L1582-1597 で正規表現 `r'"draft"\s*:\s*"((?:[^"\\]|\\.)*)'` による抽出を試みる。

**リスク:**
- Unicode エスケープ `\uXXXX` 未処理 — 日本語文字が壊れる可能性
- 100 字以上なら採用するが、トランケートされた不完全な文を返すリスク
- ログなし（サイレントフォールバック）

---

## 4. ES 作成判定ロジック分析（server-side deterministic evaluator）

### 4.1 品質チェック 6 項目 (`_build_draft_quality_checks`)

| 項目 | 判定ロジック | 根拠行 |
|---|---|---|
| `task_clarity` | `TASK_PATTERNS` + `CONNECTIVE_PATTERNS` の AND | L424-425 |
| `action_ownership` | `ACTION_PATTERNS` + (`"私"` \| `"自分"` \| `ROLE_CLARITY_PATTERNS`) | L426-429 |
| `role_required` | `ROLE_REQUIRED_HINT_PATTERNS` OR (`RESULT_PATTERNS` + 数字) | L430-431 |
| `role_clarity` | (`role_required` でない) OR `ROLE_CLARITY_PATTERNS` あり | L432-433 |
| `result_traceability` | `RESULT_PATTERNS` + action 固有 + `CONNECTIVE_PATTERNS` | L434-436 |
| `learning_reusability` | `LEARNING_PATTERNS` + (`"活か"` \| `"次"` \| `"今後"` \| `"再現"` \| `"原則"`) | L437-440 |

**根拠:** `gakuchika.py` L424-440

### 4.2 因果ギャップ検出 4 パターン (`_build_causal_gaps`)

| ギャップ | 条件 | 根拠行 |
|---|---|---|
| `causal_gap_task_action` | task + action 明確だが action_reason なし | L443-447 |
| `causal_gap_action_result` | action 明確だが result が action に接続しない | L448-450 |
| `learning_too_generic` | learning あるが reusability 語なし | L451-453 |
| `role_scope_missing` | role_required だが role_clarity なし | L454-456 |

### 4.3 `ready_for_draft` 判定条件

```
ready_for_draft = true の条件:
  1. core_ready = context + task + action + result 全て missing_elements から消えている
  2. task_clarity = true
  3. action_ownership = true
  4. role_clarity = true OR role_required = false
  5. critical_causal_gaps なし (task↔action, action↔result)
  6. question_count >= MIN_USER_ANSWERS_FOR_ES_DRAFT_READY (default: 4)
```

**根拠:** `gakuchika.py` L883-906

### 4.4 偽陽性パターン（不十分なのに通過する具体例）

```
「課題は売上が低迷していたので、改善を提案した。その結果、10%向上した。」
```
- `task_clarity`: True（「課題」+ 接続詞「ので」）
- `action_ownership`: True（「提案」が ACTION_PATTERNS に該当）
- `result_traceability`: True（数字 + ACTION_PATTERNS + 接続詞）

**問題:** 「何を」「どう」提案したかの具体性が皆無。プロ講師なら「提案の中身を書きなさい」と指摘する。

### 4.5 偽陰性パターン（十分なのに不足扱いになる具体例）

**パターン 1: 暗黙的タスク表現**
```
「私が中心となって月次の振り返り会を始め、各自の担当範囲を可視化した。」
```
- `task_clarity`: **False**（`TASK_PATTERNS`=「課題」「問題」等が含まれない）
- 実際には「振り返り会がなかった」→「始めた」という行動自体がタスクの含意

**パターン 2: 暗黙的コンテキスト**
```
「インターンで新機能の設計を任された。」
```
- `_context_core_satisfied`: 「インターン」(5 文字) はヒントパターンに該当するが 6 文字未満なので条件次第で不足扱い（L752-757 の `>=12 chars OR (>=6 chars + hint)` 判定）

### 4.6 入力濃度分類の精度

| 分類 | 条件 | 問題 |
|---|---|---|
| `seed_only` | ≤18 字, ≤1 文, パターンなし | 妥当 |
| `rough_episode` | パターン 1-2 個, ≥55 字 | 妥当 |
| `almost_draftable` | パターン 3+ AND 接続詞, ≥55 字 | **脆弱**: 「アルバイトで挑戦して成果がでた。」は task+action+result パターンだが接続詞なし → `rough_episode` に落ちる |

### 4.7 Live テストでの判定ロジック障害

**extended run (20260405T081750Z):** 16+ ターン会話で `draft_ready` 未達。E2E テストのユーザー回答（4 件）を使い切った後、テストフレームワークが同一 fallback 回答を繰り返す。AI は result/変化 について聞き続けるが、ユーザーが role の回答を繰り返すため `result` の `missing_elements` が解消されない。

**根本原因:** `_normalize_es_build_payload` が LLM 応答の `missing_elements` をサーバー側で再計算する際、**会話全体のテキスト結合**に対してパターンマッチを行う（L860-862）。しかし E2E テストの fallback 回答は role に関する内容のみのため、result パターンが永久に検出されない。

---

## 5. 深掘り・STAR 整理ロジック分析

### 5.1 3 フェーズ設計

| フェーズ | question_count | 焦点 |
|---|---|---|
| `es_aftercare` | ≤2 | challenge, role, action_reason |
| `evidence_enhancement` | 3-5 | result_evidence, credibility, learning_transfer |
| `interview_expansion` | >5 | future, backstory, learning_transfer |

**根拠:** `gakuchika.py` L835-840

### 5.2 深掘り完了判定 (`_evaluate_deepdive_completion`)

完了条件：role, challenge, action_reason, result_evidence, learning_transfer, credibility の 6 要素すべてがテキストから検出されること + `question_count >= 8`。

**問題:**
- 第 2 引数が `str | list[Message]` の union 型で、`list[Message]` 受信時に暗黙の再帰呼び出し（L563）。型安全性の観点で問題
- 信憑性リスク検出（「先輩が担当」「他のメンバーが担当」等）はパターンマッチのみ。「最初は先輩に指導されたが、後半は私が主導した」でも誤検出

**根拠:** `gakuchika.py` L557-608

### 5.3 ドラフト診断 (`_build_draft_diagnostics`)

| カテゴリ | タグ例 | 判定方法 |
|---|---|---|
| `strength_tags` | `action_visible`, `result_visible`, `ownership_visible` | パターンマッチ |
| `issue_tags` | `action_specificity_weak`, `result_evidence_thin`, `learning_missing` | パターンマッチ |
| `deepdive_recommendation_tags` | `deepen_action_reason`, `collect_result_evidence` | issue_tags から導出 |
| `credibility_risk_tags` | `ownership_ambiguous` | role パターンチェック |

**根拠:** `gakuchika.py` L507-554

### 5.4 フォーカス追跡・ブロック機構

```
asked_focuses: 全質問済みフォーカス
resolved_focuses: STAR要素確認済み + learning_reusable
deferred_focuses: ES phase で未解決の learning 等
blocked_focuses: 2回以上聞いても未解決のフォーカス
focus_attempt_counts: リトライ回数辞書
```

**問題:** ブロック機構は `_derive_focus_tracking`（L791-825）で管理されるが、**Live テストでブロックが発火しても別の未解決フォーカスが残っていると、そちらに切り替わらず同じテーマの言い換えが続く。** smoke run では同じ「result/変化」について 20 回以上の質問バリエーションが生成された。

### 5.5 `extended_deep_dive_round` の実装状態

`extended_deep_dive_round` は `conversation_state` から読み取られるが、**バックエンド側で増分されない**（L1119 で読み取り、L1117-1126 でプロンプトに含めるが、応答で +1 しない）。フロントエンドが増分する前提の設計だが、明示的なドキュメントなし。

---

## 6. コード品質・テスト分析

### 6.1 Critical（即座に修正必要）

| ファイル | 行 | 問題 | 修正案 |
|---|---|---|---|
| `backend/tests/gakuchika/test_gakuchika_flow_evaluators.py` | L8 | `_should_retry_gakuchika_draft` が `gakuchika.py` に存在せず ImportError。テストファイル全体が collect 不能 | import と該当テストを削除するか、関数を実装する |
| `backend/app/routers/gakuchika.py` | L1373, L1452, L1471, L1543 | `request = payload` で FastAPI `Request` オブジェクトをシャドウイング。`@limiter.limit` が IP 取得に失敗し rate limit バイパスの可能性 | パラメータ名を分離: `payload: NextQuestionRequest, request: Request` として `request = payload` を削除 |

### 6.2 Major（リリース前に修正推奨）

| ファイル | 行 | 問題 |
|---|---|---|
| `gakuchika.py` | L557-608 | `_evaluate_deepdive_completion` の `str | list[Message]` union 型オーバーロードと暗黙再帰呼び出し |
| `gakuchika.py` | L1582-1597 | 正規表現による draft 抽出フォールバック — Unicode エスケープ未処理、サイレント動作 |
| `test_gakuchika_flow_evaluators.py` | L42-62 | `test_build_known_facts_keeps_early_context` の assertion が `_build_known_facts` の実装（最後 4 件のみ）と矛盾 |
| `stream/route.ts` | L88-89 | ゲスト→ログイン移行パスで owner 判定がブロックされる可能性 |
| `useGakuchikaConversationController.ts` | L54-83 | 30 個の `useState` 宣言。相互依存の状態更新で不整合リスク |

### 6.3 Minor（改善余地あり）

| ファイル | 問題 |
|---|---|
| `gakuchika.py` L15 | `Optional` import 不要（`from __future__ import annotations` 有効） |
| `gakuchika.py` L386, L390 | `_contains_digit` / `_normalize_text` の regex 毎回コンパイル |
| `page.tsx` L123 | エラーメッセージが「一覧読み込み失敗」だが実際は作成失敗 |
| `[id]/page.tsx` L37-51 | インライン SVG コンポーネント（lucide-react に同等あり） |
| `useGakuchikaConversationController.ts` L602 | `useMemo` 依存配列 33 項目（memo 効果希薄） |

### 6.4 テストカバレッジマトリクス

| 対象 | テスト有無 | 備考 |
|---|:---:|---|
| `_is_deepdive_request` | **有** (2 ケース) | |
| `_normalize_es_build_payload` | **有** (6 ケース) | focus align, quality threshold, draft_ready 等 |
| `_normalize_deepdive_payload` | **有** (1 ケース) | interview_ready 判定のみ |
| `_classify_input_richness` | **有** (3 ケース) | seed/rough/almost |
| `_build_draft_diagnostics` | **有** (1 ケース) | |
| `_evaluate_deepdive_completion` | **有** (2 ケース) | ただし ImportError で実行不能 |
| `_build_draft_quality_checks` | **有** (1 ケース) | ただし ImportError で実行不能 |
| fallback 禁止フレーズ | **有** (1 ケース) | |
| streaming partial success | **有** (1 ケース) | |
| `get_next_question` エンドポイント | **無** | HTTP レベルテストなし |
| `get_next_question_stream` SSE | **無** | ストリーミングテストなし |
| `generate_es_draft` エンドポイント | **無** | |
| `generate_structured_summary` | **無** | |
| `_generate_initial_question` | **無** | フォールバックパス未検証 |
| `_derive_focus_tracking` | **無** | ステートマシン遷移未検証 |
| PromptSafetyError ハンドリング | **無** | |
| クレジット消費 | **無** | |
| フロントエンド hook | **無** | 30 状態変数の相互作用未テスト |
| Next.js API route (stream) | **無** | DB 保存 + クレジット + サマリーの複合ロジック 500 行が無テスト |

### 6.5 リファクタリング提案

**`gakuchika.py` (1616 行) → 4 モジュール分割:**

| 新モジュール | 対象 | 行数概算 |
|---|---|---|
| `gakuchika.py` | ルーターエンドポイント 4 本 + SSE generator + モデル定義 | ~350 行 |
| `services/gakuchika_state.py` | `_default_state`, `_resolve_next_action`, `_normalize_*_payload`, `_derive_focus_tracking` | ~450 行 |
| `services/gakuchika_evaluators.py` | `_classify_input_richness`, `_build_draft_quality_checks`, `_build_causal_gaps`, `_build_draft_diagnostics`, パターン定数 | ~350 行 |
| `services/gakuchika_prompts_builder.py` | `_build_es_prompt`, `_build_deepdive_prompt`, `_generate_initial_question`, fallback 辞書 | ~250 行 |

---

## 7. フロントエンド UX 分析

### 7.1 会話フロー体験

**良い点:**
- SSE ストリーミングで質問がトークン単位で表示される（`useStreamingTextPlayback`）
- STAR プログレスバーが 4 要素の進捗をリアルタイム表示
- `DraftReadyPanel` で文字数選択（300/400/500）+ 「もう少し整える」の 2 アクション
- `CompletionSummary` で 2 分版骨子 + 予想質問 + 弱点がワンビューで見える
- `NavigationGuard` で会話中の誤離脱を防止

**問題点:**
- テーマ + 内容が両方必須（`NewGakuchikaModal`）。LINEbot 型はテーマだけで開始可能で、初回入力の敷居が高い
- AI 会話はログインユーザー限定（ゲスト不可）。体験前にログインを要求する

### 7.2 状態管理の複雑度

`useGakuchikaConversationController` に 30 個の `useState` が宣言されている。`messages`, `conversationState`, `streamingTargetText`, `pendingCompleteData` 等が相互依存し、不整合リスクが高い。

**推奨:** 3 グループの `useReducer` に分割
1. conversation 状態（messages, questionCount, conversationState, sessions）
2. streaming 状態（streamingTargetText, isTextStreaming, assistantPhase, pendingCompleteData）
3. UI 状態（error, isStarting, answer, isSummaryLoading）

### 7.3 エラーハンドリング

- エラーボックスに「もう一度試す」リトライボタンあり
- ストリーミング中断時はオプティミスティック更新をロールバック
- 各アクション（send, generateDraft, startDeepDive）で同一の try/catch + `reportUserFacingError` パターン

**問題:** リトライに指数バックオフなし。サマリーポーリングは最大 8 回 × 1.5 秒 = 12 秒待機で UX に影響。

### 7.4 アクセシビリティ

| 項目 | 状態 |
|---|---|
| ARIA ラベル | 有（ドラッグ、ピン、削除ボタン） |
| フォームラベル | 有（`<Label htmlFor>`) |
| ドラッグ並び替えのキーボード操作 | **不足**（Framer Motion Reorder のキーボードサポート未確認） |
| ストリーミングアニメーション | **prefers-reduced-motion 未対応** |
| チャットメッセージリスト | **aria-live 未設定** |

### 7.5 パフォーマンス

- **N+1 クエリ:** GET /api/gakuchika が各ガクチカの最新会話を個別フェッチ
- **サマリーポーリング:** 最大 12 秒待機（WebSocket 未使用）
- **大規模 JSON 直列化:** 100+ メッセージの会話は 100KB+ の JSON を毎ターン DB に書き込み

---

## 8. Live AI テスト検証

### 8.1 テスト実行結果サマリー

| Run | Suite | 状態 | 失敗原因 | 会話ターン | Duration |
|---|---|---|---|---|---|
| 20260405T073459Z | smoke | FAILED | infra（report rows 未捕捉） | 0 | 0ms |
| 20260405T075347Z | smoke | FAILED | 429 Rate Limited | 31 | 44,922ms |
| 20260405T065704Z | extended | FAILED | draft_ready 未達 | 16 | 24,099ms |
| 20260405T081750Z | extended | FAILED | draft_ready 未達 | 16+ | 42,413ms |

**全 live test が FAILED。成功した run は存在しない。**

### 8.2 実会話ログからの質問品質評価

#### Smoke Run (20260405T075347Z) — 31 ターン会話分析

**初回質問（良好）:**
> 「塾講師として校舎改善に取り組んだ場面の中で、特にご自身が最も力を入れたのは、担当生徒の学習進捗の改善と保護者対応の改善のどちらでしたか。そう判断した理由も含めて、当時の役割に沿って教えてください。」

- 二択で焦点を絞る設計は良い
- ただし 1 問で「どちら？」「理由は？」「役割に沿って」と 3 論点を含み、1 問 1 論点ルールに違反

**2-3 問目（良好）:**
> 「その改善が必要だと判断した当時の状況は、どの時期に、どのくらいの人数や担当範囲の生徒を見ていた場面でしたか。」

- context（時期・規模・範囲）を具体的に聞いており適切

**4 問目以降（致命的劣化）:**

ユーザーが 4 問目以降で同一回答を繰り返し始めた時点で、AI は以下のパターンに陥った:

| ターン | AI の質問 | 実質的に同一の質問 |
|---|---|---|
| 5 | 「声かけを増やす以外の打ち手よりも先にそれを選んだのは、何を根拠に...」 | result/action_reason |
| 6 | 「最初に『ここが原因だ』と切り分けた根拠は何でしたか。」 | 同上 |
| 7 | 「何との比較でそう判断したのか。」 | 同上 |
| 8 | 「何と比較してそのやり方が一番効くと判断しましたか。」 | 同上 |
| 9-20 | 「一番改善したと判断した指標は何で...」の 12 バリエーション | result |

**20 回以上、実質同じ質問（result の変化/指標）の微小言い換えが続いた。** `blocked_focuses` / `focus_attempt_counts` によるブロック機構が機能していない。

**禁止表現の出現:**
- 「印象に残っている範囲で伺えますか」が extended run で 8 回出現 — 禁止表現リストに「印象に残っている範囲で」が含まれていない
- 「教えてください」が初回質問に 1 回出現 — 禁止表現「〜してください」に該当するが、LLM が無視

#### Extended Run (20260405T081750Z) — 質問品質分析

**初回質問（良好）:**
> 「塾講師のアルバイトで校舎改善に取り組まれた際、まずどのような状況や課題があったのかを教えてください。」

- シンプルで context/task に焦点。ただし「教えてください」が禁止表現違反

**3 問目（良好）:**
> 「その共有フォーマットを作る際に、どの情報を揃えるようにして、講師間で何を見える化しようとしたのかを教えてください。」

- action の具体化を促す適切な質問

**4 問目以降（同一パターン劣化）:**
> 「共有フォーマットを整えたことで、講師間の対応や生徒の様子にどのような変化が見られたか、印象に残っている範囲で伺えますか。」

この質問の微妙な言い換えが **10 回以上**繰り返された。

### 8.3 テストケース設計の評価

`gakuchika_cases.json` の 6 ケースは多様性に優れている:

| ケース | テーマ | 字数 | 焦点 |
|---|---|---|---|
| scope_and_role | 塾講師 | 400 | 役割/分担 |
| process_over_result | 大学祭企画 | 500 | プロセス/再現性 |
| retail_shift_coordination | コンビニ | 300 | シフト/在庫連携 |
| engineering_team_latency | 開発チーム | 400 | レビュー遅延 |
| volunteer_outreach | ボランティア | 500 | 参加者獲得 |
| research_lab_reproducibility | 研究室 | 400 | 再現実験 |

**問題:**
- smoke ケースは answers が 4 件だが、`MIN_USER_ANSWERS_FOR_ES_DRAFT_READY` = 4 のため、全回答が消費された後に fallback 回答がループする
- extended ケースは answers が 3 件のみ — さらに早く fallback に突入する
- `expectedQuestionTokens` の検証が live test では disabled（`judge: null`）

### 8.4 E2E テストフレームワークの成熟度

`runGakuchikaCase()` は `e2e/live-ai-conversations.spec.ts` L786-1028 に実装されているが:
- ユーザー回答が尽きた後の fallback 回答が**全ケースで role に関する同一文面**（L737-743）。result/learning の fallback がないため、AI が result を聞いても永久に解消されない
- draft_ready 到達判定は `conversationState.readyForDraft === true` のポーリングだが、タイムアウト設定が短い

---

## 9. 競合比較・業界水準分析

### 9.1 競合マップ

| カテゴリ | 代表サービス | ガクチカ対応 | 特徴 |
|---|---|---|---|
| LINEbot 型 ES 生成 | ES 添削くん, 内定くん, 就活 AI | フォーム入力 → 1 回完結 | LINE 友達追加のみで無料。文脈保持なし |
| フォーム入力型 | ES メーカー | 基本情報 + 自己 PR 欄 | ステップ式 → PDF。AI 深掘りなし |
| 汎用 AI チャット | ChatGPT / Claude 直接利用 | ユーザーのプロンプト依存 | 構造化ガイドなし |
| 就活塾 / 有料添削 | 我究館, Abuild | 個別対応。STAR 法指導 | 月 3-10 万円。人間メンター |
| 就活メディア | unistyle, OneCareer | 記事・例文提供 | AI 機能なし |
| **統合型 AI 就活支援** | **就活 Pass** | 会話型 STAR 深掘り + ES 生成 + 面接準備 | 4-6 問収集 → 300/400/500 字生成 → 深掘り → サマリー |

### 9.2 機能比較マトリクス

| 機能 | 就活 Pass | LINEbot 型 | ChatGPT | 就活塾 |
|---|:---:|:---:|:---:|:---:|
| 会話型ステップ深掘り | ★ | △ | △ | ★ |
| STAR 構造化 + 進捗表示 | ★ | x | x | ★ |
| ES 下書き自動生成（複数字数） | ★ | ★ | ★ | △ |
| 品質チェック（因果/信憑性） | ★ | x | x | ★ |
| 面接深掘り対策（3 フェーズ） | ★ | x | x | ★ |
| 構造化サマリー（20+ フィールド） | ★ | x | x | △ |
| 文脈保持（全会話保存） | ★ | x | △ | ★ |
| アクセス障壁 | 中 | 低 | 中 | 高 |
| 料金 | 0-2,980 円/月 | 無料 | 0-3,000 円/月 | 3-10 万円/月 |

### 9.3 業界基準との対比

**「選考通過レベル」のガクチカに必要な 7 要素（unistyle/reashu.com 総合）:**

| 要素 | 就活 Pass 対応 |
|---|---|
| 因果が通った STAR 骨格 | ★ `causal_gaps` 検出で対応 |
| 判断理由（なぜその行動を選んだか） | ★ `action_reason` 深掘りで焦点化 |
| 主体性を示す役割の明示 | ★ `role_clarity` / `role_required` |
| 定量的・定性的な前後差 | ★ `result_traceability` / `_contains_digit` |
| 学びの再現性 | ★ `learning_reusability` / `reusable_principles` |
| 等身大の信憑性 | ★ `credibility_risk_tags` |
| 文字数・構成の最適化 | ★ `char_min = int(char_limit * 0.9)` + 結論ファースト |

**8 ステップ構成（reashu.com 推奨）との対応:**

| ステップ | 就活 Pass 対応 |
|---|---|
| 1. 動機（何をしたか） | ★ overview/context |
| 2. 背景（なぜ始めたか） | ★ context + backstory |
| 3. 目標（何を目指したか） | △ task に含まれるが独立項目として未管理 |
| 4. 困難（何が障壁か） | ★ task |
| 5. 対処法（どう解決したか） | ★ action |
| 6. 結果（数字で示す） | ★ result |
| 7. 学び（何を学んだか） | ★ learning |
| 8. 活用（入社後どう活かすか） | △ `future` 深掘りで対応するが ES 本文には含まれにくい |

### 9.4 LP/SEO/テンプレートの訴求評価

| 項目 | 状態 | 問題 |
|---|---|---|
| LP のガクチカセクション | **なし** | `FeatureInterviewSection.tsx` は志望動機のみ。主要機能が LP で認知されない |
| テンプレートページ `/templates/gakuchika-star` | 約 300 語 | SEO 上位に必要な 2,000 字以上を大幅に下回る |
| Before/After 表示 | **なし** | ソーシャルプルーフなし |
| 完成例・ユーザー実績 | **なし** | |

---

## 10. 「選考通過レベル」達成度評価

### 10.1 プロ講師の添削との差分

| 観点 | プロ講師 | 就活 Pass 現状 |
|---|---|---|
| 「その子らしさ」の保存 | 会話中の言い回しや思考の癖を ES に織り込む | **指示なし** — 言い回し保存は数値・固有名詞のみ |
| 質問の深さの調整 | 学生の反応を見て質問の角度を変える | パターンマッチ依存で同一フォーカスの言い換えループ |
| 行動の具体性の追求 | 「何を提案したの？」「比較した他の案は？」 | `action_ownership` は「提案」があれば true。具体性未評価 |
| 「盛りすぎ」の指摘 | 「本当にあなた一人でやったの？」 | `credibility_risk_tags` はあるが深掘り段階のみ |
| 文字数配分の最適化 | 結論 15%/本論 70%/学び 15% の黄金比率 | 文字数配分の指示なし |

### 10.2 達成している品質要素

- STAR 4 要素の段階的収集フロー
- 因果ギャップの自動検出（task↔action, action↔result）
- 信憑性リスクの早期警告
- 面接準備パッケージ（2 分版骨子、予想質問、弱点、再現原則）
- 複数字数対応（300/400/500）
- 結論ファーストルール

### 10.3 不足している品質要素

- **会話ループの防止** — 最大の実運用リスク。同じ回答が来た時の脱出戦略なし
- **行動の具体性評価** — 「提案した」だけで action_ownership=true。「何を」「どう」の具体性は未評価
- **文字数配分の最適化** — 結論/本論/学びの比率指示なし
- **AI 臭の排除** — 就活テンプレート表現の明示的禁止なし
- **学生の個性の反映** — 言い回し・思考の癖を ES に織り込む指示なし
- **few-shot による品質アンカー** — 「この品質を目指せ」の具体例なし
- **企業別ガクチカの使い分け** — 企業理念との接合機能なし
- **面接ロールプレイ** — 予想質問は生成するが練習機能なし

### 10.4 品質向上ロードマップ

```
現在: C (52/100)
  ↓ P0/P1 修正後
短期: B (65-70/100)
  ↓ P2 修正後
中期: B+ (75-80/100)
  ↓ P3 完了後
長期: A- (85-90/100) ← 就活塾の添削品質に迫る
```

---

## 11. 改善提案一覧（優先度付き）

### P0: 即時対応（CI/安全性）

| # | 提案 | 対象ファイル | インパクト |
|---|---|---|---|
| P0-1 | `_should_retry_gakuchika_draft` の import 不整合を修正（import 削除 or 関数実装） | `test_gakuchika_flow_evaluators.py` L8 | テスト 8 件が実行可能に |
| P0-2 | `request = payload` シャドウイングを解消（パラメータ名分離） | `gakuchika.py` L1373, L1452, L1471, L1543 | rate limit が正常動作 |
| P0-3 | E2E テストの fallback 回答を result/learning を含む多様な内容に差し替え | `e2e/live-ai-conversations.spec.ts` L737-743 | Live AI テストが draft_ready に到達可能に |

### P1: 1 週間以内（品質直結）

| # | 提案 | インパクト |
|---|---|---|
| P1-1 | 同一回答繰り返し検出 + 脱出戦略の実装（直前回答と類似度比較 → フォーカス強制切替 or 次フェーズ遷移） | 会話ループ防止 |
| P1-2 | ES 下書きプロンプトに AI 臭排除指示を追加（「この経験を通じて」「〜の重要性を学んだ」「〜に貢献したいと考える」等の明示的禁止、学生の言葉遣い保存指示） | ES 品質向上 |
| P1-3 | `PROHIBITED_EXPRESSIONS` に「印象に残っている範囲で」「過剰肯定」「確認質問」「複合質問」を追加 | 質問品質向上 |
| P1-4 | `TASK_PATTERNS` に暗黙的タスク表現（「〜がなかった」「〜を始めた」等の否定形/開始形）を追加 | 偽陰性率低下 |
| P1-5 | 質問生成モデルを深掘りフェーズのみ claude-sonnet に変更（ES 材料収集は gpt-mini 維持） | 深掘り質問の質向上 |

### P2: 2-4 週間（体験向上）

| # | 提案 | インパクト |
|---|---|---|
| P2-1 | 質問プロンプトにコーチペルソナを設定（「大手企業の採用経験あり、年間 200 人以上の ES を読んできた就活コーチ」） | 質問の深さと一貫性 |
| P2-2 | 初回質問 / ES 下書きに各 3 つの few-shot 例を追加（`input_richness_mode` 別 / 300/400/500 字別） | 出力品質のアンカー |
| P2-3 | 初回入力の簡略化: content を任意に変更し `seed_only` パスで対応 | 初回障壁の低減 |
| P2-4 | 構造化サマリーの 2 段階化（基本 STAR 層 + 面接戦術層に分離、2 回の LLM 呼び出し） | 各項目の品質向上 |
| P2-5 | `gakuchika.py` の 4 モジュール分割（evaluators → prompts_builder → state → router） | 保守性向上 |
| P2-6 | エンドポイント統合テスト + SSE ストリーミングテストの追加 | テストカバレッジ回復 |

### P3: 中長期（競争力強化）

| # | 提案 | インパクト |
|---|---|---|
| P3-1 | LP に FeatureGakuchika セクション追加 | 変換率向上 |
| P3-2 | テンプレページ拡充（2,000 字以上 + 例文 + HowTo JSON-LD） | SEO 流入獲得 |
| P3-3 | ES 下書きに企業名・業界を渡して文脈化 | 業界基準カバー率向上 |
| P3-4 | 面接練習モード（`likely_followup_questions` への回答練習） | 深掘り対策の完結 |
| P3-5 | ES 生成後のセルフレビュー機構（AI が自身の生成物をプロ講師視点でチェック） | AI 臭の自動修正 |
| P3-6 | ゲスト体験: 最初の 1 問だけログインなしで試行可能に | 障壁低減 |

---

## 付録 A: リスク一覧

| ID | 重大度 | 概要 | 対象ファイル:行 |
|---|---|---|---|
| R-01 | **Critical** | Live AI テストで draft_ready に一度も到達していない | smoke/extended 全 run |
| R-02 | **Critical** | `test_gakuchika_flow_evaluators.py` が ImportError で collect 不能 | `test_gakuchika_flow_evaluators.py:8` |
| R-03 | **Critical** | request シャドウイングによる rate limit バイパスリスク | `gakuchika.py:1373,1452,1471,1543` |
| R-04 | **High** | 同一回答繰り返し時の会話ループ（blocked_focuses 機構の不全） | `gakuchika.py:818-823` |
| R-05 | **High** | ES 作成判定の偽陰性（TASK_PATTERNS の暗黙的表現非対応） | `gakuchika.py:424-425` |
| R-06 | **High** | AI 臭排除指示の不足（就活テンプレート表現の未禁止） | `es_templates.py` |
| R-07 | **High** | 禁止表現の不足（「印象に残っている範囲で」「過剰肯定」等） | `gakuchika_prompts.py:23-33` |
| R-08 | **High** | Notion Registry 全件空 — 品質回帰テストなし | `notion_prompts.json:69-131` |
| R-09 | **Medium** | `_evaluate_deepdive_completion` の union 型オーバーロード | `gakuchika.py:557-608` |
| R-10 | **Medium** | 正規表現 draft 抽出の Unicode エスケープ未処理 | `gakuchika.py:1582-1597` |
| R-11 | **Medium** | `extended_deep_dive_round` がバックエンドで増分されない | `gakuchika.py:1119` |
| R-12 | **Medium** | `known_facts` が最後 4 件限定（序盤のコンテキスト欠落） | `gakuchika.py:682` |
| R-13 | **Medium** | 30 個の useState（フロントエンド状態管理の肥大化） | `useGakuchikaConversationController.ts:54-83` |
| R-14 | **Medium** | LP にガクチカ訴求セクションなし | LP 構成 |
| R-15 | **Low** | `_context_core_satisfied` の 12 文字 / 6 文字閾値が不安定 | `gakuchika.py:752-757` |
| R-16 | **Low** | role_clarity の偽陽性（「主担当は先輩」でも true） | `gakuchika.py:417-421` |

---

## 付録 B: 監査根拠一覧

| 根拠種別 | ファイルパス | 参照箇所 |
|---|---|---|
| **コード** | `backend/app/routers/gakuchika.py` | L424-456, L459-475, L507-608, L682, L752-757, L791-825, L843-976, L979-1083, L1098-1219, L1370-1616 |
| **コード** | `backend/app/prompts/gakuchika_prompts.py` | L12-340 (全プロンプト定義) |
| **コード** | `backend/app/prompts/es_templates.py` | L1354-1435 (`build_template_draft_generation_prompt`) |
| **コード** | `backend/app/prompts/generated/notion_prompts.json` | L69-131 (ガクチカ managed prompts) |
| **コード** | `backend/app/config.py` | L173-183 (モデル設定) |
| **コード** | `src/app/(product)/gakuchika/page.tsx` | L1-912 (リストページ) |
| **コード** | `src/app/(product)/gakuchika/[id]/page.tsx` | L1-610 (詳細ページ) |
| **コード** | `src/hooks/useGakuchikaConversationController.ts` | L1-696 (会話コントローラー) |
| **コード** | `src/app/api/gakuchika/[id]/conversation/stream/route.ts` | L40-499 (SSE ストリーミング) |
| **コード** | `src/lib/gakuchika/conversation-state.ts` | L29-57 (ConversationState 定義) |
| **コード** | `src/components/gakuchika/STARProgressBar.tsx` | L1-173 |
| **コード** | `src/components/gakuchika/CompletionSummary.tsx` | L1-150+ |
| **テスト** | `backend/tests/gakuchika/test_gakuchika_next_question.py` | L1-362 (17 テスト) |
| **テスト** | `backend/tests/gakuchika/test_gakuchika_flow_evaluators.py` | L1-118 (8 テスト — ImportError) |
| **Live 出力** | `backend/tests/output/local_ai_live/smoke_20260405T074629Z/_feature_runs/gakuchika/.../live_gakuchika_smoke_20260405T075347Z.json` | 31 ターン会話 |
| **Live 出力** | `backend/tests/output/local_ai_live/extended_20260405T081115Z/_feature_runs/gakuchika/.../live_gakuchika_extended_20260405T081750Z.json` | 16+ ターン会話 |
| **Live 出力** | `backend/tests/output/live_gakuchika_smoke_20260405T073459Z.json` | infra 失敗 |
| **テストケース** | `tests/ai_eval/gakuchika_cases.json` | 6 ケース定義 |
| **テストケース** | `e2e/live-ai-conversations.spec.ts` | L737-743 (fallback answers), L786-1028 (runGakuchikaCase) |
| **仕様** | `docs/features/GAKUCHIKA_DEEP_DIVE.md` | L1-258 (正本仕様) |
| **仕様** | `docs/features/AI_PROMPTS.md` | L580-660 (プロンプト実装リファレンス) |
| **仕様** | `docs/SPEC.md` | L839 付近 (ビジネスルール) |
| **仕様** | `docs/PROGRESS.md` | L15 (ドラフト生成アーキテクチャ変更) |
| **Web 検索** | unistyle.co.jp, reashu.com | 業界基準、8 ステップ構成、内定者分析 |
| **Web 検索** | ES 添削くん、内定くん、就活 AI | 競合機能調査 |
