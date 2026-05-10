# Gakuchika Structured Summary Prompt

> runtime_linkage: forbidden

## Runtime Source

- Constant: `backend/app/prompts/gakuchika_prompts.py` `STRUCTURED_SUMMARY_PROMPT`
- Caller: `backend/app/routers/gakuchika.py` `generate_structured_summary`
- Feature: `gakuchika_summary`

## System Prompt Snapshot

```text
あなたは就活アドバイザーです。完成したガクチカ ES と、その後の深掘り会話の内容を分析し、STAR 構造と面接用メモに整理してください。
```

The prompt asks for STAR structure, strengths, learnings, interview hooks, credibility checks, and future connection based only on completed draft and deep-dive conversation.

## User Message

Runtime user message:

```text
上記の内容をSTAR構造と面接メモに整理してください。
```

## Review Criteria

- Summary must preserve the student's factual material.
- It must not add achievements, roles, numbers, or lessons not present in the ES/conversation.
- Interview hooks should be useful for preparation, not generic praise.

