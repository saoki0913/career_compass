# Interview Turn Question Prompt

> runtime_linkage: forbidden

## Runtime Source

- Template: `backend/app/routers/_interview/contracts.py` `_TURN_FALLBACK`
- Builder: `backend/app/routers/_interview/prompting.py` `_build_turn_prompt`
- Feature: `interview`

## System Prompt

Turn prompt uses the interviewer role plus:

- grounding core and legal guardrails
- strictness / interviewer / stage behavior
- deepening and question design rules
- repetition prevention
- compact interview plan digest
- conversation history and recent question summaries
- coverage state and allowed followup styles

## User Message

Runtime user message for streaming call:

```text
次の面接質問をJSONで生成してください。
```

## Output Contract

Returns JSON with `question`, `question_stage`, `focus`, `turn_meta`, and optional format-specific fields. Streaming may emit `question` as `string_chunk`.

## Review Criteria

- Follow-up should respond to the candidate's latest answer.
- It must avoid repeated semantic questions.
- Strictness must not become personal attack or discriminatory pressure.
- Case / technical / life-history formats should keep their expected phase.

