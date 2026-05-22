# Rewrite Prompt 構造（quality-first）

## 概要

ES添削の rewrite prompt は、元回答を弱いまま保存するための事実保全プロンプトではなく、設問タイプに合う高品質な提出ESへ再構成するためのプロンプトとして設計する。

実行時の正本は `backend/app/prompts/es_templates/_prompt_builder.py`、`backend/app/prompts/es_templates/_types.py`、`backend/app/prompts/es_templates/_quality_blueprint.py` である。この文書は手動監査用であり、runtime から読み込まれない。

## 優先順位

| 優先 | 役割 |
|---|---|
| P0 | 出力契約・参考ESコピー防止・明確なハードファクト捏造の機械ブロック |
| P1 | 参考ESヒント由来の `QualityBlueprint` に沿った高品質ESへの改善 |
| P2 | `FactBoundary`（数値・役職・固有名詞・未経験イベントを作らない境界） |
| P3 | 文字数・文体・企業接地・固有名詞の使い方 |
| P4 | retry 差分 |

`FactBoundary` は P2 であり、absolute constraints には置かない。事実保全は目的ではなく、ハードファクト捏造を防ぐ境界条件である。

## System Prompt 順序

`PromptRenderer.section_order` は次の全順序で描画する。実際の rewrite prompt では、phase と instruction の有無により `core`、`target`、`length`、`style`、`template` が空または最小化されることがある。

```text
あなたは{role}である。

<role_task>
元回答を、設問タイプに合う高品質な提出ESへ再構成する。
単なる事実の保存ではなく、評価される構成・論理・表現への改善を主目的とする。
</role_task>

<output_contract>
...
</output_contract>

<constraints priority="absolute">
...
</constraints>

<quality_blueprint priority="primary">
...
</quality_blueprint>

<template_special_cases>
...
</template_special_cases>

<fact_boundary>
...
</fact_boundary>

<length_style>
...
</length_style>

<constraints priority="core">
...
</constraints>

<constraints priority="target">
...
</constraints>

<length>
...
</length>

<style>
...
</style>

<template>
...
</template>

<company>
...
</company>

<context>
...
</context>

<retry>
...
</retry>
```

## Absolute Constraints

`<constraints priority="absolute">` は、出力契約の補助と参考ESコピー防止を担う。ここに「元回答の具体的事実は保ち」のような事実保全を主目的化する文言を置かない。

主な内容:

- 参考ESは品質傾向だけを参考にし、本文・語句・特徴的な言い回し・個別エピソードを再利用しない
- 参考ES由来の事実をユーザー事実や企業根拠として扱わない

## QualityBlueprint

`QualityBlueprint` は、生成プロンプトを肥大化させないための統合層である。以下を最大件数つきで圧縮する。

- `reference_quality_profile["quality_hints"]`
- `reference_quality_profile["skeleton"]`
- `reference_quality_profile["sentence_flow"]`
- `TemplateDef.rewrite_policy.required_elements`
- `TemplateDef.rewrite_policy.anti_patterns`
- `logic_patterns`
- 設問タイプ別の評価される核
- 複合設問の補助観点

出力上限:

- `flow`: 最大5件
- `must_improve`: 最大3件
- `avoid`: 最大3件
- `compound_note`: 最大1〜2文

通常生成プロンプトでは、`evaluation_rubric` や reference quality block の長文をそのまま出さない。

`TemplateDef.rewrite_policy.playbook` は `QualityBlueprint` の直接入力ではない。中字数ガイドなど、別の描画処理で参照される。参考ES由来の `enumeration_phrasing` が文字数帯に合う場合は、`QualityBlueprint.must_improve` の先頭に入る。

## TemplateSpecialCases

`<template_special_cases>` は、設問タイプ固有で本当に必要な短い補助指示だけを置く。例: ガクチカの配分目安、ハードファクト境界と個人情報の扱い、自己PRの強み主役化、職種志望理由を企業志望理由に寄せない指示。長文の template guidance 全量は戻さない。

## FactBoundary

`FactBoundary` は、品質改善を止める制約ではなく、ハードファクト捏造を止める境界である。

```text
- 高品質なESへの改善を主目的とする。元回答を弱い表現のまま保存しない
- 新しく作ってはいけないもの: 数値、役職、受賞、成果、固有名詞、未経験の出来事、企業カード外の固有施策・制度・事業内容
- 積極的に改善してよいもの: 文の順序、論理接続、行動の目的・対象・工夫、経験の意味づけ、強み・学びの抽象化、貢献像、キャリア接続
- 情報が不足する場合は、未確認の固有事実を足さず、一般化した表現で自然につなぐ
- 数値・固有名詞・役職・期間などのハードファクトは、元回答または使えるユーザー事実にある場合だけ使う
```

## LengthStyle

`<length_style>` は旧 `<length>` と `<style>` の通常 rewrite 用圧縮版である。文字数帯、生成目標帯、字数不足・超過時の操作、文体、AI臭い定型句の抑止を短く伝える。

短字数・中字数の特殊ガイドは必要時のみ追加する。

## Retry

retry prompt は差分中心とする。再掲するのは出力契約、短縮版 `QualityBlueprint`、`FactBoundary`、`length_style`、最大2件の retry delta を中心とし、長文の参考ES品質ブロック、`evaluation_rubric`、logic patterns、テンプレートガイダンス全量は出さない。

## SSOT 管理表

| プロンプト指示 | SSOT 場所 | 出力先 |
|---|---|---|
| 出力契約 | `_format_output_contract()` | `<output_contract>` |
| 参考ESコピー防止 | `_format_reference_copy_safety_rules()` | `<constraints priority="absolute">` |
| 品質改善の主構成 | `build_quality_blueprint()` | `<quality_blueprint>` |
| テンプレート固有の短い補助指示 | `_format_template_special_cases()` | `<template_special_cases>` |
| ハードファクト境界 | `_format_fact_boundary_rules()` | `<fact_boundary>` |
| 文字数・文体圧縮 | `_format_length_style_section()` | `<length_style>` |
| 企業接地 | `_format_company_section()` / company policy instruction | `<company>` |
| 使えるユーザー事実 | `_format_context_section()` | `<context>` |
| リトライ差分 | `_format_retry_section()` | `<retry>` |

## Fact Guard 照合元

LLM への指示だけでなく、検証時にも使える事実の範囲を制限する。照合元は、元回答、選抜済みユーザー事実、当該試行で渡した企業根拠カード要約、会社名、職種名、インターン名である。
