from __future__ import annotations

from typing import Any, Optional

from fastapi import HTTPException

from app.utils.llm import PromptSafetyError, sanitize_user_prompt_text


def format_conversation(messages: list[Any]) -> str:
    """Format conversation history for prompts."""
    formatted: list[str] = []
    for msg in messages:
        role_label = "質問" if msg.role == "assistant" else "回答"
        content = sanitize_user_prompt_text(msg.content, max_length=3000) if msg.role == "user" else msg.content
        formatted.append(f"{role_label}: {content}")
    return "\n\n".join(formatted)


def prompt_safety_http_error() -> HTTPException:
    return HTTPException(
        status_code=400,
        detail="内部設定や秘匿情報に関する指示は受け付けられません。",
    )


def sanitize_request_messages(messages: list[Any]) -> None:
    for msg in messages:
        if msg.role == "user":
            msg.content = sanitize_user_prompt_text(msg.content, max_length=3000)


def sanitize_request_text(value: Optional[str], *, max_length: int = 200) -> Optional[str]:
    if value is None:
        return None
    sanitized = sanitize_user_prompt_text(value, max_length=max_length)
    return sanitized.strip() or None


def sanitize_next_question_request(request: Any) -> None:
    request.company_name = sanitize_request_text(request.company_name, max_length=200) or request.company_name
    request.industry = sanitize_request_text(request.industry, max_length=100)
    request.generated_draft = sanitize_request_text(request.generated_draft, max_length=8000)
    sanitize_request_messages(request.conversation_history)


def sanitize_generate_draft_request(request: Any) -> None:
    request.company_name = sanitize_request_text(request.company_name, max_length=200) or request.company_name
    request.industry = sanitize_request_text(request.industry, max_length=100)
    sanitize_request_messages(request.conversation_history)
    if isinstance(request.slot_summaries, dict):
        request.slot_summaries = {
            key: sanitize_request_text(value, max_length=400) if isinstance(value, str) else None
            for key, value in request.slot_summaries.items()
            if isinstance(key, str)
        }
    if isinstance(request.slot_evidence_sentences, dict):
        request.slot_evidence_sentences = {
            key: [
                sentence
                for sentence in (
                    sanitize_request_text(item, max_length=220)
                    for item in value[:4]
                    if isinstance(item, str)
                )
                if sentence
            ]
            for key, value in request.slot_evidence_sentences.items()
            if isinstance(key, str) and isinstance(value, list)
        }


def sanitize_generate_draft_from_profile_request(request: Any) -> None:
    request.company_name = sanitize_request_text(request.company_name, max_length=200) or request.company_name
    request.industry = sanitize_request_text(request.industry, max_length=100)
    request.selected_role = sanitize_request_text(request.selected_role, max_length=200) or request.selected_role


__all__ = [
    "PromptSafetyError",
    "format_conversation",
    "prompt_safety_http_error",
    "sanitize_generate_draft_from_profile_request",
    "sanitize_generate_draft_request",
    "sanitize_next_question_request",
    "sanitize_request_messages",
    "sanitize_request_text",
]
