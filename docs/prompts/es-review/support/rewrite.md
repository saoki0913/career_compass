# ES Rewrite Prompt

> runtime_linkage: forbidden

## Runtime Source

- Builder: `backend/app/prompts/es_templates/_prompt_builder.py` `build_template_rewrite_prompt`
- Renderer: `backend/app/prompts/es_templates/_types.py` `PromptRenderer`
- Quality: `backend/app/prompts/es_templates/_quality_blueprint.py` `build_quality_blueprint`
- Caller: `backend/app/services/es_review/orchestrator.py`
- Feature: `es_review` / template-specific review feature
- Output mode: text-only rewrite

## System Prompt

The runtime builder composes a quality-first system prompt in this order.

```text
あなたは{template_role}である。

<role_task>
元回答を、設問タイプに合う高品質な提出ESへ再構成する。
単なる事実の保存ではなく、評価される構成・論理・表現への改善を主目的とする。
</role_task>

<output_contract>
- 出力は改善案本文のみ。1文字目から本文を書き始める
- 説明、前置き、後書き、箇条書き、引用符、JSON、コードブロックは禁止
- 「以下が改善案です」等のメタ説明は禁止
- だ・である調で統一（「です」「ます」は1箇所も使わない）
- 改行・空行を入れず、1段落の連続した文章として出力する
</output_contract>

<constraints priority="absolute">
- 参考ESは品質傾向だけを参考にし、本文・語句・特徴的な言い回し・個別エピソードを再利用しない
- 参考ES由来の事実をユーザー事実や企業根拠として扱わない
</constraints>

<quality_blueprint priority="primary">
...
</quality_blueprint>

<template_special_cases>
...
</template_special_cases>

<fact_boundary>
- 高品質なESへの改善を主目的とする。元回答を弱い表現のまま保存しない
- 新しく作ってはいけないもの: 数値、役職、受賞、成果、固有名詞、未経験の出来事、企業カード外の固有施策・制度・事業内容
- 積極的に改善してよいもの: 文の順序、論理接続、行動の目的・対象・工夫、経験の意味づけ、強み・学びの抽象化、貢献像、キャリア接続
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

`<quality_blueprint>` は参考ES品質ヒント、論理構成パターン、テンプレート必須要素、避ける点を圧縮した監査対象である。実行時の正本は `build_quality_blueprint()`。`rewrite_policy.playbook` は `QualityBlueprint` の直接入力ではなく、中字数ガイドなど別の描画処理で使う。`<template_special_cases>` は短い設問固有ルールだけをタグ付きで出す。通常生成プロンプトには `evaluation_rubric` や参考ES品質ブロックの長文をそのまま再掲しない。

## User Message

```text
【条件】
{conditions}

【元の回答】
{answer}

この回答を、提出できる改善案に書き直してください。改善案本文のみを返してください。
```

## Dynamic Inputs

- `template_type`, `template_role`, `template_def`
- `question`, `answer`, `company_name`, `industry`, `internship_name`, `role_name`
- target character range, focus modes, reference quality profile, allowed user facts, company evidence cards

Fact Guard の照合元は、元回答、選抜済みユーザー事実、当該試行で渡した企業根拠カード要約、会社名、職種名、インターン名である。

## Review Criteria

- 主目的は、設問タイプに合う高品質な提出ESへの再構成である。
- 参考ESは品質傾向だけに使い、語句・本文・個別エピソードをコピーしない。
- 事実保全は目的ではなく、ハードファクト捏造を防ぐ境界として扱う。
- 文字数不足や retry でも、新事実追加ではなく既存事実の目的・対象・行動・結果・学び・接続の具体化で調整する。
- 企業情報は設問タイプと grounding mode に応じて使い、企業根拠カードにない固有施策・制度・数値を断定しない。
- 本文のみを返し、説明や診断を混ぜない。
