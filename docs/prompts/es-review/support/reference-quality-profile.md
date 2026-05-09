# Reference ES Quality Profile Prompt Inputs

> runtime_linkage: forbidden

## Runtime Source

- `backend/app/prompts/reference_es.py`
- Used by ES rewrite / draft builders through reference quality blocks.

## Runtime Role

Reference ES data is converted into statistical and structural guidance. It is not a copy source.

Allowed runtime profile types:

- average character count / sentence count
- conclusion-first tendencies
- STAR / CBPG / template-specific structure hints
- specificity markers and quality hints
- conditional hints by template type

## Forbidden in Docs and Runtime Output

- raw reference ES body text
- distinctive phrases
- identifiable organization / applicant patterns
- detailed sentence order copied from a reference answer

## Review Criteria

- The prompt should use reference ES only as abstract quality guidance.
- The generated answer must not resemble a reference answer in wording.
- Notes-like data must not pollute statistical profile assumptions.
