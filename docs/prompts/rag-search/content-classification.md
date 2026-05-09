# RAG Content Classification Prompt

> runtime_linkage: forbidden

## Runtime Source

- `backend/app/utils/content_classifier.py` `classify_content_category_with_llm`
- Feature: `rag_classify`

## System Prompt Role

The LLM fallback classifies a source URL, channel, heading, and excerpt into one of the committed `CONTENT_TYPES`.

## User Message Snapshot

```text
source_url: {source_url}
source_channel: {source_channel}
見出し: {heading}
本文抜粋: {excerpt}

出力形式:
{"category": "..." }

出力例:
{"category":"new_grad_recruitment"}
```

On retry:

```text
前回のエラー: {retry_reason}
JSONのみを出力してください。説明文やコードブロックは禁止です。
```

## Output Contract

JSON schema requires:

```json
{"category": "..."}
```

`category` must be one of runtime `CONTENT_TYPES`.

## Review Criteria

- Classification should distinguish recruitment, employee interview, IR, midterm plan, sustainability, and corporate pages.
- It should not classify based on source channel alone when excerpt contradicts it.
- Ambiguous pages should not be overconfidently pushed into recruitment.
