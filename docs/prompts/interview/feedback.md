# Interview Feedback Prompt

> runtime_linkage: forbidden

## Runtime Source

- Template: `backend/app/routers/_interview/contracts.py` `_FEEDBACK_FALLBACK`
- Builder: `backend/app/routers/_interview/prompting.py` `_build_feedback_prompt`
- Feature: `interview_feedback`

## Runtime Role

Generates final feedback after an interview conversation. It uses grounding core and scoring rubric, not new-question legal prompt blocks.

## Inputs

- company and role setup
- interview plan
- full conversation history
- turn events
- applicant materials

## Output Contract

JSON streamed fields include feedback text such as overall comment, score axes, strengths, weaknesses, improved answer, and next practice recommendation.

## Review Criteria

- Feedback must cite only what the candidate actually said.
- Scores must be based on evidence, not inferred personality.
- Improved answer must not invent experiences or company facts.
- Tone should be useful and firm, not demeaning.

