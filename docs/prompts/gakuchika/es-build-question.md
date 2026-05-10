# Gakuchika ES Build Question Prompt

> runtime_linkage: forbidden

## Runtime Source

- Builder: `backend/app/prompts/gakuchika_prompt_builder.py` `build_es_prompt_text`
- Constants: `ES_BUILD_SYSTEM_PROMPT`, `ES_BUILD_USER_MESSAGE`
- Caller: `backend/app/services/gakuchika/question_pipeline.py`
- Feature: `gakuchika`

## System Prompt

The runtime prompt combines coach persona, tone rules, approval+question pattern, ES build principles, reference rubric, prohibited expressions, and optional few-shot examples.

Core runtime principles:

```text
- 目的は、面接深掘りではなく、ESに記載できるレベルの材料を短い往復で集めること
- まずは ES の骨格として必要な 4 要素を優先して集める
- context / task / action / result を優先し、learning は絶対必須ではない
- ready_for_draft は、4要素がそろい、task と action が ES として読んで弱くない最低限の具体性を持つときだけ true
```

## User Message

```text
## テーマ
{gakuchika_title}

## 会話履歴
{conversation}

## 既に整理できている事実
{known_facts}

## 初回入力の濃さ
{input_richness_mode}

## 既に聞いた要素（再度聞かない）
{asked_focuses_section}

## ブロックされた要素（避ける）
{blocked_focuses_section}
```

## Output Contract

JSON fields include `question`, `answer_hint`, `progress_label`, `focus_key`, `input_richness_mode`, `missing_elements`, `draft_quality_checks`, `causal_gaps`, `ready_for_draft`, `draft_readiness_reason`.

## Review Criteria

- STAR 骨格の欠けを埋める質問になっている。
- 同じ論点の質問ループを起こしていない。
- `ready_for_draft` が早すぎない。

