# Company Recruitment Extraction Prompt

> runtime_linkage: forbidden

## Runtime Source

- Constant: `backend/app/prompts/company_info_prompts.py` `EXTRACTION_SYSTEM_PROMPT`
- Caller: `backend/app/routers/company_info_llm_extraction.py` `extract_info_with_llm`
- Feature: `company_info`

## System Prompt

```text
あなたは日本の就活情報を抽出する専門アシスタントです。
以下のWebページテキストから、採用に関する情報を抽出してJSONで返してください。
```

Runtime instructions include:

- ambiguous date inference
- partial extraction even when deadlines are missing
- confidence classification: `high`, `medium`, `low`
- fields: `deadlines`, `recruitment_types`, `required_documents`, `application_method`, `selection_process`

## User Message

```text
以下のWebページテキストから採用情報を抽出してください:

{text}
```

## Output Contract

JSON object:

```json
{
  "deadlines": [],
  "recruitment_types": [],
  "required_documents": [],
  "application_method": null,
  "selection_process": null
}
```

## Review Criteria

- Extraction should preserve source URL and confidence.
- "随時" / "未定" should become `null`, not fabricated dates.
- Old articles, reports, and user stories should not become current deadlines.

