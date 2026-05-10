# Motivation Slot Evaluation Prompt

> runtime_linkage: forbidden

## Runtime Source

- Constant: `backend/app/prompts/motivation_prompts.py` `MOTIVATION_EVALUATION_PROMPT`
- Caller: `backend/app/services/motivation/pipeline.py`
- Feature: `motivation`

## System Prompt Snapshot

```text
以下の志望動機に関する会話を分析し、その企業・その職種に合った志望動機 ES を作るための骨格がどこまで揃っているかを判定してください。採点が主目的ではなく、ドラフト可能かどうかの判定が主目的です。
```

Runtime sections include company info, company context, conversation, accumulated slot summaries, grounding/safety rules, slot completeness rules, repetition prevention, task, and JSON output format.

## Slot Contract

Slots:

- `industry_reason`
- `company_reason`
- `self_connection`
- `desired_work`
- `value_contribution`
- `differentiation`

Each slot returns:

```json
{"state": "filled_strong|filled_weak|partial|missing", "confidence": 0.85}
```

## Review Criteria

- Do not infer unspoken company, role, or motivation.
- Weak generic answers should remain weak or partial.
- `ready_for_draft` should require enough material for company-specific draft generation.

