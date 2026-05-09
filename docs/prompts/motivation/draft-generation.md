# Motivation Draft Generation Prompt

> runtime_linkage: forbidden

## Runtime Source

- Builder: `backend/app/prompts/es_templates/_prompt_builder.py` `build_template_draft_generation_prompt("company_motivation")`
- Callers:
  - `backend/app/services/motivation/draft.py`
  - `backend/app/services/motivation/facade.py`
- Feature: `motivation_draft`

## System Prompt

Uses shared ES draft generation for template `company_motivation`.

Runtime requirements:

- Use only conversation/profile/gakuchika/company evidence supplied to the prompt.
- Connect the student's experience to company/role motivation.
- Preserve company-specificity without overusing RAG proper nouns.
- Return draft body and structured metadata where the caller expects JSON.

## User Message

Includes:

- company name / industry / selected role
- question and target character count
- conversation-derived motivation grounding
- profile / gakuchika material if available
- company RAG summary or evidence cards

## Runtime Additions

- Up to initial LLM retries may occur.
- Quality retry appends `## 品質再生成指示`.
- Multipass refinement can append focused improvement hints.

## Review Criteria

- The draft must not invent company programs or user experiences.
- `desired_work` and `value_contribution` should be distinct.
- Generic "御社に貢献したい" endings are weak.

