# Interview Weakness Drill Prompts

> runtime_linkage: forbidden

## Runtime Source

- Builders:
  - `backend/app/routers/_interview/prompting.py` `_build_drill_start_prompt`
  - `backend/app/routers/_interview/prompting.py` `_build_drill_score_prompt`
- Endpoints: `backend/app/routers/_interview/endpoints.py`
- Features: `interview`, `interview_feedback`

## Drill Start Prompt

Generates four JSON fields for the weakest feedback axis:

- `why_weak`
- `improvement_pattern`
- `model_rewrite`
- `retry_question`

Runtime inputs include company, selected role, interview format, interviewer type, strictness, weakest axis, original score, weakest question, weakest answer, and evidence.

## Drill Score Prompt

Scores retry answer on seven axes:

- company_fit
- role_fit
- specificity
- logic
- persuasiveness
- consistency
- credibility

## Review Criteria

- Drill should target the weakest axis, not give generic advice.
- Model rewrite must not create facts absent from the original answer.
- Retry scoring should reward concrete improvement and consistency.
