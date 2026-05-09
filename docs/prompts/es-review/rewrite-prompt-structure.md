# Rewrite Prompt 構造（改善後）

## 概要

ES添削の rewrite prompt を3層の constraints 階層 + MUST/SHOULD/WATCH の文体指導に再構成した。
プロンプト指示は SSOT（Single Source of Truth）で管理し、重複を排除した。

## Constraints 階層

### `<constraints priority="absolute">` — 違反 = hard block

LLM が絶対に守るべき制約。違反した場合は rewrite を reject する。

- 元回答の具体的事実の保持
- ユーザー事実にない情報を足さない
- 事実保持ルール（`_format_fact_preservation_rules()`）
- だ・である調の統一
- 参考 ES のコピー防止（`_format_reference_copy_safety_rules()`）

### `<constraints priority="core">` — 違反 = retry

品質の核となる制約。違反した場合は retry hint 付きで再試行する。

- 設問に正面から答える
- 結論ファーストで書く
- 最終文は具体的な行動や貢献で締める
- 冗長な接続詞で文字数を浪費しない
- role_name があっても別職種を仮定しない

### `<constraints priority="target">` — 違反 = lenient retry

リクエスト固有の可変制約。最終 attempt では緩和される。

- 企業情報の使い方（設問タイプ依存）
- 企業固有表現の扱い
- 企業敬称ルール（`company_mention_rule`）
- 文字数制約（`_format_self_count_instruction()`）

## `<core_style>` — MUST/SHOULD/WATCH

`_build_contextual_rules()` が `STYLE_RULES` をフィルタリングして出力する文体指導。
constraints とは補完関係:
- constraints = 違反の硬度（どこまで retry するか）
- core_style = 文体の指導強度（どの程度守るべきか）

### MUST（絶対守る）

1. 1文目は設問への答えを結論として言い切る（前置きや背景説明から入らない）
2. ユーザーの元回答に含まれる数値・固有名詞は必ず保持する

### SHOULD（できる限り）

1. 各文は役割を1つに絞り、同趣旨を言い換えて引き延ばさない
2. 企業接点・貢献・活かし方は必要なら1文に圧縮してよい
3. 「整理した」「取り組んだ」のような抽象動詞だけで済ませず、具体的な行動を含める
4. 同じ文末表現が連続しないよう、語尾を変化させる
5. 「貢献する」「成長する」だけで終わらず、何にどう貢献するかを具体化する
6. 複数の施策・エピソード・理由を書くときは (1)(2) や「1点目 / 2点目」で番号を明示する
7. （テンプレート固有ルール: self_pr/work_values の抽象ラベル具体化など）

### WATCH（注意）

- 指定の字数下限を下回らないよう注意
- 下限が200字超の設問では具体を削りすぎない
- 短い字数制限では冗長な修飾を削る
- 「関係者を巻き込みながら」等のLLM特有フレーズはユーザー元回答にない限り使わない

## テンプレート別完結パターン

`TEMPLATE_GUIDANCE` に各テンプレートの完結パターンを追加:

| テンプレート | 完結パターン |
|---|---|
| gakuchika | 「課題→施策(何をどうした)→成果(何が変わった)」 |
| company_motivation | 「根拠(経験)→企業接点→貢献像」 |
| intern_reason | 「参加理由→経験接点→学び目標」 |
| intern_goals | 「学びたいこと→現状の課題→成長後の姿」 |
| post_join_goals | 「目標→原体験→企業での実現方法」 |
| role_course_reason | 「職種の魅力→適性の根拠→将来の貢献」 |
| self_pr | 「強み→場面→行動→結果」 |
| work_values | 「価値観→場面→行動→変化」 |
| basic | 「主張→根拠→展望」 |

## 敬称ポリシー

| grounding_mode | ポリシー |
|---|---|
| `none` | 企業名・企業敬称を絶対に使わない |
| `assistive` | 「{honorific}」を使う。本文全体で2回までにとどめる |
| `required` | 企業名は1回まで、2回目以降は「{honorific}」を使う |

`get_company_honorific()` が業種別に適切な敬称を返す（銀行→貴行、信用金庫→貴庫 等）。

## SSOT 管理表

| プロンプト指示 | SSOT 場所 | 出力先 |
|---|---|---|
| 結論ファースト | `STYLE_RULES[0]` | `<core_style>` MUST |
| 文末表現連続禁止 | `STYLE_RULES` | `<core_style>` SHOULD |
| ナンバリング指示 | `STYLE_RULES` | `<core_style>` SHOULD（全テンプレート共通） |
| LLM特有フレーズ禁止 | `STYLE_RULES` | `<core_style>` WATCH |
| 敬称ポリシー | `company_mention_rule` | `<constraints priority="target">` |
| テンプレート完結パターン | `TEMPLATE_GUIDANCE` | 【テンプレート別ガイダンス】 |
| 構造化リトライ | `retry_guidance["structure"]` | 【前回失敗の回避】 |
