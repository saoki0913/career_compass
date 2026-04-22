"""Tests for motivation conversation summarization."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from app.routers.motivation_models import Message
from app.routers.motivation_summarize import (
    append_summary_to_system_prompt,
    maybe_summarize_older_messages,
)


def _make_messages(n: int) -> list[Message]:
    return [
        Message(role="user" if i % 2 == 0 else "assistant", content=f"msg {i}")
        for i in range(n)
    ]


class TestMaybeSummarizeOlderMessages:
    @pytest.mark.asyncio
    async def test_below_threshold_returns_unchanged(self) -> None:
        msgs = _make_messages(15)
        result_msgs, summary = await maybe_summarize_older_messages(msgs, None)
        assert result_msgs is msgs
        assert summary is None

    @pytest.mark.asyncio
    async def test_empty_list_returns_unchanged(self) -> None:
        result_msgs, summary = await maybe_summarize_older_messages([], None)
        assert result_msgs == []
        assert summary is None

    @pytest.mark.asyncio
    async def test_above_threshold_returns_trimmed_with_summary(self) -> None:
        msgs = _make_messages(30)
        mock_result = AsyncMock()
        mock_result.return_value.success = True
        mock_result.return_value.raw_response = "【業界志望理由】IT業界への関心"

        with patch(
            "app.routers.motivation_summarize.call_llm_with_error",
            mock_result,
        ):
            result_msgs, summary = await maybe_summarize_older_messages(msgs, {})

        assert len(result_msgs) == 10
        assert result_msgs == msgs[-10:]
        assert summary == "【業界志望理由】IT業界への関心"

    @pytest.mark.asyncio
    async def test_llm_failure_returns_fallback(self) -> None:
        msgs = _make_messages(30)
        mock_result = AsyncMock()
        mock_result.return_value.success = False
        mock_result.return_value.error = type("E", (), {"message": "timeout"})()
        mock_result.return_value.raw_response = None

        with patch(
            "app.routers.motivation_summarize.call_llm_with_error",
            mock_result,
        ):
            result_msgs, summary = await maybe_summarize_older_messages(msgs, {})

        assert result_msgs is msgs
        assert summary is None

    @pytest.mark.asyncio
    async def test_cached_summary_reused(self) -> None:
        msgs = _make_messages(30)
        ctx: dict = {
            "_conv_summary": {"text": "cached summary", "msg_count_at_summary": 20}
        }

        with patch(
            "app.routers.motivation_summarize.call_llm_with_error",
            new_callable=AsyncMock,
        ) as mock_llm:
            result_msgs, summary = await maybe_summarize_older_messages(msgs, ctx)

        mock_llm.assert_not_called()
        assert len(result_msgs) == 10
        assert summary == "cached summary"

    @pytest.mark.asyncio
    async def test_stale_cache_triggers_regeneration(self) -> None:
        msgs = _make_messages(32)
        ctx: dict = {
            "_conv_summary": {"text": "old summary", "msg_count_at_summary": 18}
        }
        mock_result = AsyncMock()
        mock_result.return_value.success = True
        mock_result.return_value.raw_response = "new summary"

        with patch(
            "app.routers.motivation_summarize.call_llm_with_error",
            mock_result,
        ):
            result_msgs, summary = await maybe_summarize_older_messages(msgs, ctx)

        assert summary == "new summary"
        assert ctx["_conv_summary"]["msg_count_at_summary"] == 22


class TestAppendSummaryToSystemPrompt:
    def test_none_summary_returns_unchanged(self) -> None:
        prompt = "You are a helpful assistant."
        assert append_summary_to_system_prompt(prompt, None) == prompt

    def test_empty_summary_returns_unchanged(self) -> None:
        prompt = "You are a helpful assistant."
        assert append_summary_to_system_prompt(prompt, "") == prompt

    def test_summary_appended(self) -> None:
        prompt = "You are a helpful assistant."
        result = append_summary_to_system_prompt(prompt, "summary text")
        assert "【会話前半の要約】" in result
        assert result.startswith(prompt)
        assert result.endswith("summary text")
