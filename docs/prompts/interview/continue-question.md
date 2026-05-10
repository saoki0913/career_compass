# Interview Continue Question Prompt

> runtime_linkage: forbidden

## Runtime Source

- Template: `backend/app/routers/_interview/contracts.py` `_CONTINUE_FALLBACK`
- Builder: `backend/app/routers/_interview/prompting.py` `_build_continue_prompt`
- Feature: `interview`

## Runtime Role

This prompt resumes an interview after feedback or interruption. It uses a compact setup and latest feedback summary instead of the full prompt budget.

## System Prompt Contents

- interview setup
- company summary
- compact interview plan
- trimmed conversation history
- latest feedback summary
- behavioral block with grounding core, strictness, interviewer, stage, question design

## User Message

```text
次の面接質問をJSONで生成してください。
```

## Review Criteria

- Continue question should build from the latest feedback and not restart the interview.
- It should avoid asking for already-covered basics.
- It must stay inside fair hiring and grounding constraints.

