# Safety and Leakage Guardrails

> runtime_linkage: forbidden

## Runtime Source

- Prompt input sanitization: `backend/app/utils/llm_prompt_safety.py`
- Shared LLM callers: `backend/app/utils/llm.py`, `backend/app/utils/llm_streaming.py`
- Reference ES safety tests: `backend/tests/es_review/test_reference_es_copy_safety.py`

## Never Copy Into Docs

- secrets, API keys, OAuth client secrets, Stripe webhook secrets, Supabase service role keys
- session / CSRF / guest / internal proxy tokens
- real cookies, `guest_device_token`, `x-device-token`
- raw reference ES text or distinctive phrasing from `docs/reference/es-review/**`
- raw user ES, real student profiles, application documents, email, phone, address, student number
- private fixtures, `backend/tests/output/**`, production logs, live AI output
- copyrighted examples from books, blogs, company PDFs, competitor tools, or paid materials

## Allowed Review Material

- fixed prompt strings already committed in `backend/app/prompts/**`
- placeholder names such as `{input_text}`, `{company_name}`, `{conversation}`
- abstract rubrics, enum names, field names, validation rules
- short synthetic examples written from scratch and explicitly non-identifying
- quality risks and eval ideas

## Review Criteria

- Prompt docs must not contain real personal data or private corpus text.
- Prompt docs must describe grounding rules and hallucination risks.
- Prompt docs must keep runtime source paths separate from review-only Markdown.
- Any implementation change based on these docs must be a separate task touching `backend/app/prompts/**` or related services explicitly.
