# ES Draft Generation Prompt

> runtime_linkage: forbidden

## Runtime Source

- Builder: `backend/app/prompts/es_templates/_prompt_builder.py` `build_template_draft_generation_prompt`
- Callers:
  - `backend/app/routers/gakuchika.py` `generate_es_draft`
  - `backend/app/services/motivation/draft.py`
  - `backend/app/services/motivation/facade.py`
- Features: `gakuchika_draft`, `motivation_draft`

## System Prompt

The runtime system prompt uses the selected ES template role and the shared template definition. It instructs the model to create a draft from provided material, not to invent facts, and to follow the selected `template_type` structure.

Key runtime rules:

```text
- ユーザーが提供した材料の範囲で ES 下書きを作る
- 元情報にない経験・役割・成果・数字・企業施策を追加しない
- 設問に正面から答える
- 目標字数に合わせて本文のみを返す
- だ・である調を基本にする
```

For `gakuchika`, runtime may append character-limit few-shot allocation from `backend/app/prompts/gakuchika_prompts.py`.

## User Message

The user prompt contains:

- target question / synthetic question
- target character count
- user material from conversation, profile, gakuchika summary, or company context
- company reference information when available

## Runtime Additions

- Motivation draft can run quality retry and multipass refinement.
- Gakuchika draft can run one quality retry with AI-smell / ownership / length hints.
- Reference quality profile may be included as statistical guidance, never as copy source.

## Review Criteria

- Draft must preserve user-provided facts and student voice.
- Draft must not convert sparse material into polished but fabricated achievements.
- Company specificity must be grounded in supplied company context.
- Output must be a single ES draft body, not analysis.

