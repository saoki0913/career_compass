# JSON Repair Prompt

> runtime_linkage: forbidden

## Runtime Source

- `backend/app/utils/llm.py`
  - `_json_repair_system_prompt(require_valid=False|True)`
  - `_json_repair_user_prompt(repair_source)`
  - `_repair_json_with_same_model(...)`
- Streaming parse repair is controlled from `backend/app/utils/llm_streaming.py`.

## System Prompt

When valid JSON is required:

```text
あなたはJSON修復の専門家です。必ず有効なJSONのみを返してください。
```

Default:

```text
あなたはJSON修復の専門家です。必ずJSONのみ出力してください。
```

## User Message

```text
以下のテキストを有効なJSONに修復してください。JSON以外は出力しないでください。

{repair_source}
```

## Runtime Additions

- Provider JSON append may be added before the repair call.
- Google provider receives an additional instruction forbidding explanatory prefaces such as `Here is the JSON`.
- If `json_schema` is supplied, the repair call is expected to return an object matching that schema.

## Review Criteria

- The repair prompt must not change semantic content, only parseability.
- It must not accept Markdown fences, explanatory prose, or partial non-JSON output.
- Schema-driven calls should preserve required fields and enum values.

