# Provider Append Prompts

> runtime_linkage: forbidden

## Runtime Source

- `backend/app/utils/llm.py`
  - `_augment_system_prompt_for_provider_json(...)`
- Applies at send time, not in feature prompt builders.

## JSON Responses

Provider-specific append text is used to force strict JSON output, especially for Google-compatible providers.

Review expectations:

- No Markdown fences.
- No explanation before or after JSON.
- JSON object must match requested schema or JSON object mode.

## ES Text Responses

For ES review text generation, provider-specific text augmentation is not used. Claude, OpenAI, and Gemini receive the same feature prompt built by `backend/app/prompts/es_templates/_prompt_builder.py`.

## Review Criteria

- Provider append must not override feature-specific safety rules.
- JSON append should not introduce new field semantics.
