"""
Conversation-history summarization for motivation flows.

When a conversation exceeds a configurable message threshold, older
messages are summarized into a compact text block via Claude Haiku.
The summary is cached inside ``conversation_context["_conv_summary"]``
to avoid redundant LLM calls on subsequent turns.
"""

from __future__ import annotations

import logging
from typing import Any

from app.routers.motivation_models import Message
from app.utils.llm import call_llm_with_error
from app.utils.secure_logger import get_logger

logger = get_logger(__name__)

_SUMMARY_THRESHOLD = 20
_RECENT_COUNT = 10

_SUMMARIZE_SYSTEM_PROMPT = """\
あなたは就活支援 AI の内部処理モジュールです。
志望動機に関する会話履歴の前半部分を受け取り、構造化された要約を返してください。

## 出力フォーマット（テキスト、JSON ではない）

【業界志望理由】{抽出内容 or 未言及}
【企業志望理由】{抽出内容 or 未言及}
【自分との接続】{抽出内容 or 未言及}
【やりたい仕事】{抽出内容 or 未言及}
【価値発揮】{抽出内容 or 未言及}
【差別化】{抽出内容 or 未言及}
【学生の主要な表現】{学生自身が使った特徴的なフレーズを原文のまま列挙}

## ルール
- 学生の回答内容のみを要約する。AI の質問は要約に含めない。
- 学生が使った具体的なフレーズ・数値・固有名詞はそのまま保持する。
- 未言及のスロットは「未言及」と書く。
- 200〜400 文字で簡潔にまとめる。
"""


async def maybe_summarize_older_messages(
    messages: list[Message],
    conversation_context: dict[str, Any] | None,
    *,
    threshold: int = _SUMMARY_THRESHOLD,
    recent_count: int = _RECENT_COUNT,
    company_name: str = "",
) -> tuple[list[Message], str | None]:
    """Return ``(recent_messages, summary_text | None)``.

    When ``len(messages) <= threshold`` the original list is returned
    unchanged with ``None`` as the summary.  Otherwise, older messages
    are summarized (or a cached summary is reused) and only the most
    recent *recent_count* messages are returned.
    """
    if len(messages) <= threshold:
        return messages, None

    older_count = len(messages) - recent_count
    cached = _get_cached_summary(conversation_context, older_count)
    if cached is not None:
        return messages[-recent_count:], cached

    summary = await _generate_conversation_summary(
        messages[:older_count], company_name=company_name
    )
    if summary is None:
        return messages, None

    _store_cached_summary(conversation_context, summary, older_count)
    return messages[-recent_count:], summary


def _get_cached_summary(
    ctx: dict[str, Any] | None, expected_older_count: int
) -> str | None:
    if not ctx:
        return None
    cache = ctx.get("_conv_summary")
    if not isinstance(cache, dict):
        return None
    if cache.get("msg_count_at_summary") != expected_older_count:
        return None
    text = cache.get("text")
    return text if isinstance(text, str) and text.strip() else None


def _store_cached_summary(
    ctx: dict[str, Any] | None, text: str, older_count: int
) -> None:
    if ctx is None:
        return
    ctx["_conv_summary"] = {"text": text, "msg_count_at_summary": older_count}


async def _generate_conversation_summary(
    older_messages: list[Message], *, company_name: str = ""
) -> str | None:
    """Call Claude Haiku to produce a structured summary. Returns None on failure."""
    conversation_lines: list[str] = []
    for msg in older_messages:
        role_label = "質問" if msg.role == "assistant" else "回答"
        conversation_lines.append(f"{role_label}: {msg.content}")
    conversation_block = "\n\n".join(conversation_lines)

    user_msg = f"以下の会話履歴（企業名: {company_name or '不明'}）を要約してください。\n\n{conversation_block}"

    try:
        result = await call_llm_with_error(
            system_prompt=_SUMMARIZE_SYSTEM_PROMPT,
            user_message=user_msg,
            max_tokens=500,
            temperature=0.2,
            feature="motivation",
            response_format="text",
        )
        if result.success and result.raw_response:
            text = result.raw_response.strip()
            if text:
                return text
        logger.warning(
            "motivation_summarize: LLM summary failed, using fallback",
            extra={"error": result.error.message if result.error else "empty"},
        )
        return None
    except Exception:
        logger.exception("motivation_summarize: unexpected error during summary")
        return None


def append_summary_to_system_prompt(
    system_prompt: str, summary_text: str | None
) -> str:
    """Append conversation summary section to a system prompt if available."""
    if not summary_text:
        return system_prompt
    return f"{system_prompt}\n\n【会話前半の要約】\n{summary_text}"
