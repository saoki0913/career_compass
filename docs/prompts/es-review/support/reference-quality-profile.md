# Reference ES Quality Profile Prompt Inputs

> runtime_linkage: forbidden

## Runtime Source

- `backend/app/prompts/es_reference_guidance.py`
- `backend/app/prompts/reference_es.py`
- Used by ES rewrite / fallback builders through `QualityBlueprint`.

## Runtime Role

Reference ES data is converted into hand-curated abstract structural guidance. It is not a copy source and is not passed to the normal rewrite prompt as a long raw block. Runtime does not read raw reference ES bodies.

Allowed runtime profile types:

- quality hints
- skeleton
- sentence flow
- character-count band label
- compound metadata
- compact `QualityBlueprint` fields: `flow`, `must_improve`, `avoid`, `compound_note`

## Runtime Flow

1. `orchestrator.py` calls `build_reference_quality_profile()`.
2. `reference_es.py` reads hand-curated guidance from `es_reference_guidance.py`.
3. If quality hints and skeleton are empty, `build_reference_quality_profile()` returns `None`.
4. `build_template_rewrite_prompt()` / `build_template_fallback_rewrite_prompt()` pass the profile to `build_quality_blueprint()`.
5. The generated prompt receives one `<quality_blueprint priority="primary">` block.
6. Long reference quality blocks remain available for draft generation or compatibility/debug paths, but normal rewrite generation does not insert them into `<context>`.

## Compound Handling

Compound questions are handled primary-first. The primary type keeps the main skeleton, and secondary types add capped supplemental quality hints. Runtime does not mechanically merge multiple full skeletons.

## Forbidden in Docs and Runtime Output

- raw reference ES body text
- distinctive phrases
- identifiable organization / applicant patterns
- detailed sentence order copied from a reference answer

## Review Criteria

- The prompt should use reference ES only as abstract quality guidance.
- The generated answer must not resemble a reference answer in wording.
- Raw bodies and company-specific phrases must not appear in docs or runtime prompt output.
- `<quality_blueprint>` should appear once and should precede `<fact_boundary>`.
