# Gakuchika ES Draft Generation Prompt

> runtime_linkage: forbidden

## Runtime Source

- Builder: `backend/app/prompts/es_templates/_prompt_builder.py` `build_template_draft_generation_prompt("gakuchika")`
- Few-shot allocation: `backend/app/prompts/gakuchika_prompts.py` `es_draft_few_shot_for`
- Caller: `backend/app/routers/gakuchika.py` `generate_es_draft`
- Feature: `gakuchika_draft`

## System Prompt

Uses the shared ES draft generation prompt for template `gakuchika`, then may append a character-limit allocation guide for 300 / 400 / 500 characters.

Runtime few-shot allocation is not copied from reference ES; it describes section proportions:

```text
- 冒頭の結論
- 状況+課題
- 行動
- 成果
- 学び
- 合計は目標字数付近、改行なしの 1 段落でまとめる
```

## User Message

Includes:

- `gakuchika_title`
- conversation / known facts / structured summary
- selected `char_limit`
- synthetic question for gakuchika ES draft

## Runtime Additions

- On quality warnings, a retry system prompt appends quality regeneration instructions.
- Retry checks include length, AI-smell, ownership, student wording, and ending quality.

## Review Criteria

- Student voice and concrete facts must remain visible.
- The draft must not over-polish into generic "leadership" prose.
- Ending must avoid abstract "実感した / 再現できる" clichés.
