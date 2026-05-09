# ES Review プロンプト全面監査・品質改善計画

## 1. 背景と問題定義

ES添削機能でバリデーション再試行が多発し、最終的な出力品質が低い。全面監査の結果、以下の根本原因を特定した。

### 1.1 根本原因

| # | 原因 | 影響 |
|---|------|------|
| 1 | **機械的バリデーションの偽陽性** | regex ベースの answer_focus / style / grounding チェックが良質な出力を誤リジェクト → 無駄なリトライ多発 (推定リトライ率 2.0-2.5回/実行) |
| 2 | **構造ヒントの欠落** | 「ナンバリング」「各施策の完結」指示が gakuchika テンプレート限定で他8テンプレートに届いていない |
| 3 | **敬称ポリシーの矛盾** | ES慣習（貴社使用）と assistive テンプレートの「貴社禁止」指示が矛盾 → 正しい ES を reject |
| 4 | **結論ファーストの過剰制約** | 「1文目20-45字」の文字数指定が内容を圧迫。伝わるかどうかが本質であり文字数は不要 |

### 1.2 決定事項

- Validation を GPT-5.4-mini ベースの LLM 判定に全面切替（機械チェックは length/empty/fragment/bulletish のみ残す）
- 「複数施策の構造化」+ ナンバリングを全9テンプレート共通ルールに（ただし完結パターンはテンプレート別に設定）
- 全テンプレートで貴社/貴行等の敬称を許可
- Length-fix パスは廃止（LLM Validation の寛容性 + deterministic compression で代替）
- 結論ファーストの「20-45字」文字数指定を削除

---

## 2. 現状アーキテクチャ（As-Is）

### 2.1 ES Review 4段階パイプライン

```
prepare_review_context → execute_rewrite_loop → execute_recovery_pipeline → assemble_review_response
```

- `execute_rewrite_loop`: LLM rewrite → mechanical validation → retry (max 3回)
- `execute_recovery_pipeline`: length-fix pass (char_max 超過時に追加 LLM 呼び出し)
- validation: 全て regex/substring ベースの機械チェック

### 2.2 対象テンプレート (9種)

| テンプレート | 用途 | 現状の構造ガイダンス |
|---|---|---|
| `gakuchika` | ガクチカ | あり (唯一ナンバリング指示あり) |
| `company_motivation` | 志望動機 | なし |
| `intern_reason` | インターン志望理由 | なし |
| `intern_goals` | インターンで学びたいこと | なし |
| `post_join_goals` | 入社後の目標 | なし |
| `role_course_reason` | 職種・コース選択理由 | なし |
| `self_pr` | 自己PR | なし |
| `work_values` | 大切にしている価値観 | なし |
| `basic` | 汎用 | なし |

### 2.3 現状バリデーションの問題点

| チェック | 問題 |
|---------|------|
| `style_invalid` | `"です" in text` で引用文内のです/ますを誤検出 |
| `focus_code` (answer_focus) | 設問タイプ別の regex パターンが狭く、正しい結論を見逃す |
| `grounding_invalid` | 企業名の exact substring 一致で「貴社」を使った正しい ES を reject |
| `assistive_honorific_detected` | ES慣習の「貴社」を禁止 → 矛盾 |
| `negative_self_eval_invalid` | 文脈無視の substring チェック |

---

## 3. 改善計画

### Phase 1: Structural Hint Expansion + Honorific Policy Fix

**Goal**: プロンプトのガイダンス品質を向上（additive 変更のみ、低リスク）

#### 3.1.1 テンプレート別の構造化ルール追加 (1-A)

**対象ファイル**: `backend/app/prompts/es_quality_rules.py`

既存の gakuchika 限定ルール (line 57-61) と company 系ルール (line 63-74) を書き直す。

**全テンプレート共通ルール**:

```python
StyleRule(
    "複数の施策・エピソード・理由を書くときは (1)(2) や「まず / 次に」で番号・順序を明示し、並列のまま放置しない",
    "all",
    None,  # 全テンプレート共通
    priority="should",
),
```

各テンプレートの完結パターンは TEMPLATE_GUIDANCE (3.1.2) で設問タイプ固有に指定する。

#### 3.1.2 TEMPLATE_GUIDANCE の拡充 — テンプレート別完結パターン (1-B)

**対象ファイル**: `backend/app/prompts/es_quality_rules.py`

参考ESコーパス分析に基づき、各テンプレートに設問タイプ固有の構造完結パターンをガイダンスとして追加:

| テンプレート | 完結パターン | 根拠 |
|---|---|---|
| `gakuchika` | 複数の施策がある場合は、各施策を「課題→施策(何をどうした)→成果(何が変わった)」で完結させる | コーパス: 課題解決型が67%。各施策に「行動→成果」を対応させる構成が高評価 |
| `company_motivation` | 志望理由を複数述べるときは、各理由を「根拠(経験)→企業接点→貢献像」で完結させる | コーパス: 多軸構成が47%。各軸に企業接点を対応させる構成が主流 |
| `intern_reason` | 参加理由が複数ある場合は、各理由を「参加理由→経験接点→学び目標」で完結させる | コーパス: 動機+学び連結型が主流 |
| `intern_goals` | 学びたいことが複数ある場合は、各目標を「学びたいこと→現状の課題→成長後の姿」で完結させる | コーパス: 課題認識→成長ビジョンの対比型 |
| `post_join_goals` | 入社後の目標が複数ある場合は、各目標を「目標→原体験→企業での実現方法」で完結させる | コーパス: 原体験接続型が71% |
| `role_course_reason` | 選択理由が複数ある場合は、各理由を「職種の魅力→適性の根拠→将来の貢献」で完結させる | コーパス: 適性証明型が主流 |
| `self_pr` | 強みの根拠エピソードが複数ある場合は、各エピソードを「強み→場面→行動→結果」で完結させる | コーパス: STAR型バリエーション |
| `work_values` | 価値観の裏付けが複数ある場合は、各エピソードを「価値観→場面→行動→変化」で完結させる | コーパス: 全件が複数経験並列構成 |
| `basic` | 主張が複数ある場合は、各項目を「主張→根拠→展望」で完結させる | 汎用3段構成 |

#### 3.1.3 retry_guidance["structure"] の全テンプレート追加 (1-C)

**対象ファイル**: 各テンプレートの `TEMPLATE_DEF`

| テンプレート | retry_guidance["structure"] |
|---|---|
| `self_pr.py` | "複数のエピソードは番号付け（(1)(2)）で整理し、各々「場面→行動→変化」を完結させる" |
| `work_values.py` | "複数の実証エピソードは番号付けで整理し、各々「場面→行動→変化」を完結させる" |
| `company_motivation.py` | "志望理由の複数軸は「1点目/2点目」で整理し、各々「根拠→企業接点→貢献」を完結させる" |
| `intern_reason.py` | "参加理由は番号付けで整理し、各々に経験根拠と学び目標を完結させる" |
| `intern_goals.py` | "学習目標は番号付けで整理し、各々に課題と成長イメージを完結させる" |
| `post_join_goals.py` | "入社後目標は番号付けで整理し、各々に経験と企業接続を完結させる" |
| `role_course_reason.py` | "選択理由は番号付けで整理し、各々に適性根拠を完結させる" |

注: `gakuchika.py` は既に retry_guidance["structure"] を持つため変更不要。`basic.py` は汎用テンプレートのため追加任意。

#### 3.1.4 敬称ポリシーの統一: 全テンプレートで貴社許可 (1-D)

**対象ファイル**:

1. `backend/app/prompts/es_templates/_prompt_builder.py`:
   - `effective_company_grounding == "assistive"` 時の `company_mention_rule` を変更:
     - 現状: "企業に言及するときは企業名で触れ... 敬称（貴社・御社等）は使わない"
     - 変更後: "企業に言及するときは「貴社」等の敬称を使う。企業名の直接記述は不要"
   - `assistive_honorific_detected` のバリデーション rejection を無効化

2. `backend/app/services/es_review/validation.py`:
   - `assistive_honorific_detected` (lines 867-871) の failure code 生成を削除
   - `_auto_replace_gosha()` は維持（御社→貴社/貴行の自動置換は有用）

**理由**: ESでは「貴社」「貴行」「貴法人」が標準的な敬称。企業名を直接記述するのはESのマナー的に不適切とされる場合が多い。

#### 3.1.5 結論ファーストの文字数制約撤廃 (1-E)

**対象ファイル**: `backend/app/prompts/es_templates/_prompt_builder.py`, `backend/app/prompts/es_quality_rules.py`

| 箇所 | 変更前 | 変更後 |
|------|--------|--------|
| `_prompt_builder.py` `<constraints>` 内 | "1文目は設問への答えを20〜45字で言い切り" | "1文目で結論ファーストに書き、読み手に伝えたいことが明確に伝わるようにする" |
| `es_quality_rules.py` STYLE_RULES[0] | "1文目は設問への答えを20〜45字で結論として短く言い切る" | "1文目は設問への答えを結論として言い切る（前置きや背景説明から入らない）" |

---

### Phase 2: LLM-Based Validation (GPT-5.4-mini) + Length-Fix 廃止

**Goal**: 機械的バリデーションの偽陽性を根絶し、リトライを最小化する

#### 3.2.1 LLM Validation 関数の新規作成 (2-A)

**対象ファイル**: `backend/app/services/es_review/validation.py` (新規関数)

```python
async def _validate_rewrite_with_llm(
    candidate: str,
    *,
    template_type: str,
    question: str,
    user_answer: str,
    company_name: str | None,
    char_min: int | None,
    char_max: int | None,
    grounding_mode: str,
) -> tuple[bool, list[str], str]:
    """GPT-5.4-mini で品質判定。機械チェック (length/empty/fragment) は別途実施。"""
```

**LLM Validation Prompt** (GPT-5.4-mini に渡す):

```
以下のES改善案を5項目で判定してください。各項目について pass/fail と理由を返してください。

判定項目:
1. 結論ファースト: 冒頭で設問への答えが明確に伝わるか
2. 企業接地: 企業への言及が適切か（設問タイプに応じた深度で）
3. 文体統一: だ・である調で統一されているか
4. 構造明快: 論理の流れが追えるか、複数論点がある場合は整理されているか
5. 事実保全: 元回答の具体的事実（数値・固有名詞・経験）が保持されているか

設問タイプ: {template_type}
設問: {question}
元回答: {user_answer}
改善案: {candidate}

JSON で返してください:
{
  "checks": [
    {"name": "conclusion_first", "pass": true/false, "reason": "..."},
    {"name": "company_grounding", "pass": true/false, "reason": "..."},
    {"name": "style_unity", "pass": true/false, "reason": "..."},
    {"name": "structure_clarity", "pass": true/false, "reason": "..."},
    {"name": "fact_preservation", "pass": true/false, "reason": "..."}
  ],
  "overall_pass": true/false,
  "retry_hint": "..."  // overall_pass=false の場合のみ
}
```

**判定ロジック**:
- `overall_pass = true` → validation 通過
- `overall_pass = false` → `retry_hint` を次の rewrite に渡す
- `fact_preservation` が fail → hard block (hallucination 相当)
- それ以外の 1-2 項目 fail → retry hint で指示し再試行

**コスト/レイテンシ**:
- GPT-5.4-mini: ~$0.001/call, ~200-400ms
- 現状のリトライ3回 (各 $0.03-0.05) を 1-2 回に削減 → 総コスト減

#### 3.2.2 機械チェックの残存範囲 (2-B)

LLM validation に移行後も残す機械チェック:

| チェック | 理由 | 実装 |
|---------|------|------|
| empty | LLM不要。空文字の即判定 | `not normalized.strip()` |
| fragment | 末尾句読点チェックは確実 | `_has_unfinished_tail()` |
| char_min/char_max | 文字数は deterministic に計測 | `len(text)` 比較 |
| bulletish | `\n` + bullet marker は確実に検出可能 | 現行 regex 維持 |

**削除するチェック** (LLM validation に移行):
- `style_invalid` (です/ます検出) → LLM の `style_unity` に統合
- `focus_code` (answer_focus / verbose_opening) → LLM の `conclusion_first` に統合
- `grounding_invalid` → LLM の `company_grounding` に統合
- `negative_self_eval_invalid` → LLM の `structure_clarity` で判定
- `companyless_honorific_detected` → 廃止（貴社許可のため不要）
- `assistive_honorific_detected` → Phase 1 で既に削除
- hallucination の hard_block 判定 → LLM の `fact_preservation` に統合

#### 3.2.3 Length-Fix パスの廃止 (2-C)

**対象ファイル**: `backend/app/services/es_review/orchestrator.py`

- `execute_recovery_pipeline()` から length-fix ロジックを削除
- `build_template_length_fix_prompt()` の呼び出しを廃止

**代替手段**:
1. プロンプト内の文字数指示で初回から適切な長さを狙う
2. Deterministic semantic compression (`_fit_rewrite_text_deterministically()`) で微調整
3. ±10% の範囲なら LLM validation で soft pass

**廃止理由**: Length-fix は1回限りで length 以外の問題を修正しない。LLM validation の寛容性と deterministic compression の組み合わせで十分カバーできる。

#### 3.2.4 Retry Loop の簡素化 (2-D)

**対象ファイル**: `backend/app/services/es_review/orchestrator.py`

改善後のフロー:

```
Attempt 1:
  - LLM rewrite
  - 機械チェック (empty, fragment, bulletish, length)
  - LLM validation (GPT-5.4-mini)
  - Pass → 完了
  - Fail → retry_hint を取得

Attempt 2:
  - LLM rewrite (retry_hint 付き)
  - 機械チェック + LLM validation
  - Pass → 完了
  - Fail → best rejected candidate を保持

Attempt 3 (最終):
  - LLM rewrite (accumulated hints 付き)
  - 機械チェック + LLM validation (lenient mode: fact_preservation のみ hard block)
  - length が char_min の 90% 以上 → accept
  - それ以外 → best rejected を返却 (degraded)
```

**重要設計判断**: 機械チェック fail であっても LLM validation を常に実行する。

理由: 機械チェック fail のみで即 retry すると、それ以外の問題（構造・事実保全等）が特定できずに盲目的にリトライしてしまう。LLM validation を常に実行することで、全失敗原因を一度に把握し retry_hint に反映できる。

**Max attempts**: 3（変更なし。LLM validation の精度向上でリトライ率は大幅減の見込み）

#### 3.2.5 orchestrator.py の変更 (2-E)

- `_validate_rewrite_candidate()` の呼び出しを `_validate_rewrite_combined()` に置換:
  1. 機械チェック (empty, fragment, bulletish, length)
  2. **常に** `_validate_rewrite_with_llm()` を呼ぶ（機械チェックの pass/fail に関わらず）
  3. 機械チェック fail の情報 + LLM validation の retry_hint を統合して次の retry に渡す
- `execute_recovery_pipeline()`: length-fix 削除、best-effort adoption ロジックを簡素化
- `LENGTH_FIX_REWRITE_ATTEMPTS` 定数を削除

---

### Phase 3: Prompt Structure Optimization

**Goal**: プロンプトの情報密度を最適化し、LLM の指示追従性を最大化する

#### 3.3.1 制約の階層化表現 (3-A)

**対象ファイル**: `backend/app/prompts/es_templates/_prompt_builder.py`

ユーザー確認済みの優先度割当:

| 優先度 | 項目 | 内容 |
|--------|------|------|
| **absolute** | A. 事実保全 | 元回答の数値・固有名詞を保持する |
| **absolute** | B. ハルシネーション禁止 | ユーザー事実にない経験・数字を足さない |
| **absolute** | C. だ・である調統一 | 文体を統一する |
| **core** | D. 結論ファースト | 冒頭で設問への答えが伝わるようにする |
| **core** | E. 構造明快 | 複数論点がある場合はナンバリングし、各項目をテンプレート別完結パターンで完結させる |
| **target** | F. 文字数 | {char_min}〜{char_max}字 |
| **target** | G. 企業接地 | 企業に言及する場合は貴社等の敬称を使う |

**プロンプト内での表現**:

```xml
<constraints priority="absolute">
- 元回答の数値・固有名詞を保持する
- ユーザー事実にない経験・数字を足さない
- だ・である調で統一する
</constraints>

<constraints priority="core">
- 結論ファーストで書き、読み手に伝えたいことを明確にする
- 複数の施策・理由がある場合は番号付けし、各項目をテンプレート別完結パターンで完結させる
</constraints>

<constraints priority="target">
- 文字数: {char_min}〜{char_max}字
- 企業に言及する場合は貴社等の敬称を使う
</constraints>
```

#### 3.3.2 Short-Answer Prompt Variant (3-B) — レビュー対象提案

**注意**: この案は適切かどうか未検証のため、実装前にレビュー用ドキュメントを作成しユーザーに提示する。承認なしで実装しない。

**提案内容** (`char_max <= 220` の場合の軽量プロンプト):
- company_guidance → PRIMARY カード1枚の1行要約のみ
- user_fact_guidance → 最重要 fact 2つのみ
- reference_quality_guidance → 品質ヒント3行以内
- evaluation_axes → 上位3軸のみ
- 目標: system prompt 2,000 tokens 以下

**実装手順**: Phase 3-A/3-C とは独立。レビュードキュメントを `docs/design/short-answer-prompt-variant.md` に書き出し、ユーザー承認後に実装する。

#### 3.3.3 Prompt Block 冗長削減 (3-C)

- `_format_reference_quality_guidance()`: STYLE_RULES と重複するヒント行を除外
- `_GLOBAL_CONCLUSION_FIRST_RULES` (unused fallback): 廃止

---

## 4. 変更対象ファイル一覧

| ファイル | Phase | 変更内容 |
|---------|-------|----------|
| `backend/app/prompts/es_quality_rules.py` | 1 | StyleRule 全テンプレート化 + TEMPLATE_GUIDANCE 拡充 |
| `backend/app/prompts/es_templates/self_pr.py` | 1 | retry_guidance["structure"] 追加 |
| `backend/app/prompts/es_templates/work_values.py` | 1 | retry_guidance["structure"] 追加 |
| `backend/app/prompts/es_templates/company_motivation.py` | 1 | retry_guidance["structure"] 追加 |
| `backend/app/prompts/es_templates/intern_reason.py` | 1 | retry_guidance["structure"] 追加 |
| `backend/app/prompts/es_templates/intern_goals.py` | 1 | retry_guidance["structure"] 追加 |
| `backend/app/prompts/es_templates/post_join_goals.py` | 1 | retry_guidance["structure"] 追加 |
| `backend/app/prompts/es_templates/role_course_reason.py` | 1 | retry_guidance["structure"] 追加 |
| `backend/app/prompts/es_templates/_prompt_builder.py` | 1,3 | 敬称ポリシー変更 + 結論ファースト修正 + 階層化 |
| `backend/app/services/es_review/validation.py` | 1,2 | assistive_honorific 削除 + LLM validation 新規追加 + 機械チェック削減 |
| `backend/app/services/es_review/orchestrator.py` | 2 | length-fix 廃止 + retry loop 簡素化 |
| `backend/app/services/es_review/retry.py` | 2 | length-fix 関連定数削除 |
| `backend/tests/es_review/test_es_review_prompt_structure.py` | 1 | 新規 StyleRule テスト |
| `backend/tests/es_review/test_es_review_validation.py` | 2 | LLM validation テスト |

---

## 5. 再利用する既存ユーティリティ

| ユーティリティ | 場所 | 用途 |
|---|---|---|
| `_build_contextual_rules()` | `es_quality_rules.py:166-205` | StyleRule スコープフィルタリング |
| `format_template_guidance()` | `es_quality_rules.py:208-212` | TEMPLATE_GUIDANCE 出力 |
| `_fit_rewrite_text_deterministically()` | `validation.py` | semantic compression (length-fix 代替) |
| `_coerce_degraded_rewrite_dearu_style()` | `validation.py` | deterministic style fix |
| `call_llm_with_error()` or lightweight LLM caller | — | GPT-5.4-mini 呼び出し基盤 |
| `_auto_replace_gosha()` | `validation.py` | 御社→貴社自動置換（維持） |

---

## 6. 検証戦略

### 6.1 Unit Tests (Phase 1)

- 新規 StyleRule (全テンプレート共通) が各テンプレートの system prompt に含まれることを assert
- TEMPLATE_GUIDANCE 追加分が `format_template_guidance()` output に含まれることを assert
- retry_guidance["structure"] が全テンプレートの TEMPLATE_DEF に存在することを parametrize テスト
- 敬称ポリシー: assistive テンプレートでも「貴社」が reject されないことを assert
- 結論ファースト: prompt 内に「20〜45字」が含まれないことを assert

### 6.2 LLM Validation Tests (Phase 2)

- GPT-5.4-mini validation prompt が正しい JSON を返すことを mock テスト
- 明らかに良質な出力 → `overall_pass: true` を返すことを assert
- 明らかに低品質な出力 → `overall_pass: false` + 適切な `retry_hint` を返すことを assert
- Length-fix 廃止後: deterministic compression だけで char_max 内に収まることを assert (既存テストケース)

### 6.3 Integration Tests (Live AI)

- 複数施策 gakuchika (300字) → 番号付け + 各行動完結
- 複数エピソード self_pr (400字) → 番号付け + 各エピソード完結
- company_motivation 二点構成 → 各理由完結
- 全テンプレートで「貴社」使用 → validation pass

### 6.4 Retry Rate Monitoring (目標値)

| 指標 | 現状推定 | 改善後目標 |
|------|---------|-----------|
| 平均リトライ回数 | 2.0-2.5回 | 1.2回以下 |
| 「劣化版」出力率 | 15-20% | 3%以下 |
| LLM validation コスト | — | +$0.001/call x 1-2回 |
| Total コスト | 高 (無駄なリトライ) | 削減見込み |

---

## 7. 実装順序

| 順序 | Phase | 内容 | リスク |
|------|-------|------|--------|
| 1 | Phase 1 | 1-A → 1-B → 1-C → 1-D → 1-E → Unit Test | 低（additive + policy 変更のみ） |
| 2 | Phase 2 | 2-A → 2-B → 2-C → 2-D → 2-E → LLM Validation Test → Retry Rate 計測 | 中（validation アーキテクチャ変更） |
| 3 | Phase 3 | 3-A → 3-B (レビュー後) → 3-C → A/B 品質比較 | 中（プロンプト構造変更） |

**依存関係**:
- Phase 2 は Phase 1 完了後に開始（Phase 1 で削除した assistive_honorific を前提として LLM validation 設計）
- Phase 3 は Phase 2 安定後に開始（LLM validation が安定してから制約階層化を適用）
- Phase 3-B (Short-Answer) は独立。ユーザーレビュー承認後に実装

**注意事項**:
- Phase 2 の LLM validation prompt は empirical tuning (prompt-engineer skill) で品質最適化が必要
- Length-fix 廃止は Phase 2-C/2-D と同時に実施
- 全テンプレートの regression テストは各 Phase 完了時に必須
