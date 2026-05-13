# LLM Validation アーキテクチャ

## 概要

ES添削の品質検証を、regex ベースの機械チェックから LLM ベースの意味的チェックに移行する。
機械チェックは安全保障（空文・断片・箇条書き・文字数）のみに限定し、
品質判定（結論ファースト・企業接地・文体統一・構造明瞭性・事実保持）は LLM が担う。

## 責務分担

### 機械チェック（hard block）

| チェック | 説明 | 失敗時 |
|---|---|---|
| `empty` | 出力が空 | reject → retry |
| `fragment` / `_has_unfinished_tail()` | 文が途中で切れている | reject → retry |
| `bulletish_or_listlike` | 箇条書き・リスト形式 | reject → retry |
| `char_min` / `char_max` | 文字数が範囲外 | reject → retry |
| `companyless_honorific_detected` | grounding_mode="none" で敬称使用 | reject → retry |

### LLM Validation（品質チェック）

| 項目 | 判定内容 | 失敗時 |
|---|---|---|
| `conclusion_first` | 冒頭で設問への答えが明確に伝わるか | retry hint 付きで再試行 |
| `company_grounding` | 企業への言及が適切か（required/assistive に応じて） | retry hint 付きで再試行 |
| `style_unity` | だ・である調で統一されているか | retry hint 付きで再試行 |
| `structure_clarity` | 論理の流れが追えるか | retry hint 付きで再試行 |
| `fact_preservation` | 元回答の具体的事実が保持されているか | **hard block** → retry |

## Fail-Open 設計

LLM validation は品質向上のためのチェックであり、安全保障は機械チェックが担保する。
LLM 呼び出しが失敗した場合の挙動:

- **通常の LLM 失敗**（API エラー、タイムアウト、レート制限）→ validation pass 扱い
- **JSON parse 失敗** → `retry_on_parse=True` で自動リペア、それでも失敗なら pass 扱い
- **例外**: `fact_preservation` は Fail-Open 対象外。LLM 失敗時は既存の `_detect_fact_hallucination_warnings()` による機械的 hard block を維持

### 理由

1. 機械チェック（empty/fragment/bulletish/length）が最低限の品質を保証
2. LLM validation 障害時にリトライが無限ループするリスクを排除
3. `fact_preservation` のみ例外とすることで、事実改変のリスクを Fail-Open でも防止

## LLM Validation Prompt

### システムプロンプト

```
あなたはES（エントリーシート）の品質検証官である。
添削済みの本文を5つの観点で評価し、JSON で結果を返す。

<evaluation_criteria>
1. conclusion_first: 1文目が設問への答えになっているか。前置きや背景説明から入っていないか。
2. company_grounding: 企業への言及が設問タイプに応じて適切か。
   - required: 企業固有の根拠が1点以上含まれている
   - assistive: 企業言及が0〜2回で補助的に使われている（なくても可）
   - none: 企業言及がない
3. style_unity: だ・である調で統一されているか。「です」「ます」が混在していないか。
4. structure_clarity: 論理の流れが追えるか。各文に役割があり、同趣旨の繰り返しがないか。
5. fact_preservation: 元回答の具体的事実（数値、固有名詞、経験、役割）が保持されているか。元にない事実が追加されていないか。
</evaluation_criteria>

<output_format>
JSON で以下の構造を返す:
{
  "conclusion_first": {"pass": true/false, "reason": "..."},
  "company_grounding": {"pass": true/false, "reason": "..."},
  "style_unity": {"pass": true/false, "reason": "..."},
  "structure_clarity": {"pass": true/false, "reason": "..."},
  "fact_preservation": {"pass": true/false, "reason": "..."}
}
- pass=false の場合、reason に具体的な問題箇所と改善方向を30字以内で書く
- pass=true の場合、reason は空文字列
</output_format>
```

### ユーザープロンプト

```
<context>
設問タイプ: {template_type}
設問: {question}
企業接地モード: {grounding_mode}
企業名: {company_name}
</context>

<original_answer>
{user_answer}
</original_answer>

<rewritten_text>
{candidate}
</rewritten_text>
```

## モデル設定

| 設定 | 値 |
|---|---|
| 環境変数 | `MODEL_ES_REVIEW_VALIDATION` |
| デフォルト | `gpt-mini` (GPT-5.4-mini) |
| config.py フィールド | `model_es_review_validation` |
| feature 名 | `es_review_validation` |
| max_tokens | 600 |
| temperature | 0.1 |
| response_format | `json_object` |

変更方法:
```bash
# .env に追加
MODEL_ES_REVIEW_VALIDATION=claude-haiku
```

## Retry Loop との統合

```
Attempt N:
  1. LLM rewrite（retry_hint 付き、N>1）
  2. _validate_rewrite_combined():
     a. 機械チェック（empty, fragment, bulletish, length, companyless_honorific）
     b. LLM validation（常に実行 — 機械チェック fail でも実行して hint を収集）
     c. 統合判定
  3. 結果:
     - 全 pass → 完了
     - 機械 hard block → reject + LLM hint を含めて retry
     - fact_preservation fail → hard block（retry）
     - 他 LLM fail → retry_hint を統合して次の attempt へ
  4. Attempt 3（最終）: lenient mode（fact_preservation のみ hard block）
```

## AI Smell 検出（AI臭検出）

LLM が生成した ES 本文に含まれる AI 特有のフレーズを検出し、品質観測とリトライヒントに活用する。

SSOT: `backend/app/services/es_review/ai_smell.py`

### 5カテゴリ

| カテゴリ | コード | ペナルティ | 検出条件 |
|---|---|---|---|
| A. 抽象バズワード | `abstract_buzzword` | 2.0 | 元回答になし + 同一文に具体性なし |
| B. 価値創出系 | `value_creation` | 2.5 | 同上 |
| C. 成長常套句 | `growth_cliche` | 1.5 | 同上 |
| D. 関係性抽象化 | `relation_abstract` | 2.0 | 同上 |
| I. 空の強調 | `empty_emphasis` | 1.0 | 元回答になし（具体性チェック不要） |

### 検出ロジック

- **A〜D**: ユーザーの元回答にないフレーズ + 同一文内に具体性がない場合のみ検出
- **I**: ユーザーの元回答にないフレーズの単純存在チェック
- **具体性判定** (`_sentence_has_specificity()`): 数値+単位, カタカナ固有名詞(3文字以上), 組織固有名詞, 具体的行動動詞

### スコアリングとTier

- **Tier 0**: スコア 0（検出なし）
- **Tier 1**: 0 < スコア < 閾値（軽微）
- **Tier 2**: スコア >= 閾値（顕著）

閾値はテンプレートと文字数バンド(`short` / `mid_long`)で変動する。

### リトライ戦略

AI臭専用リトライは行わない。他の理由（文字数、文体等）でリトライが発生した際に、AI臭ヒントを同乗させる。ES添削・motivation 両サービスで統一。

### プロンプト側防御

`_format_anti_ai_phrase_block()` が `ai_smell.py` の `format_anti_ai_phrase_lines()` を呼び、`<anti_ai_phrase>` ブロックをプロンプトに注入する。rewrite / fallback / draft の全プロンプトに統合済み。カテゴリ定義は SSOT から生成されるため、検出ロジックとプロンプト指示が乖離しない。

### SSOT 設計

`AiSmellCategoryDef` がカテゴリ定義・ペナルティ・プロンプト用短文・リトライヒント文を一元管理し、以下の消費者がすべて同じ定義から生成する:

- `detect_ai_smell_patterns()` — 検出
- `compute_ai_smell_score()` — スコアリング
- `build_ai_smell_retry_hints()` — リトライヒント
- `format_anti_ai_phrase_lines()` — プロンプト注入

## 3サービス共通化

`_validate_rewrite_with_llm()` は ES review だけでなく以下でも使用:

- **gakuchika draft**: router 内の品質チェックで呼び出し
- **motivation draft**: LLM validation による品質チェック

共通パラメータ:
- `candidate`: 検証対象テキスト
- `template_type`: テンプレート種別
- `question`: 設問文（nullable）
- `user_answer`: 元回答
- `company_name`: 企業名（nullable）
- `grounding_mode`: 企業接地モード
- `json_caller`: LLM 呼び出し関数（DI でテスト可能）
