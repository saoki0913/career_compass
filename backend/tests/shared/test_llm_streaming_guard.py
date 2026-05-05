from __future__ import annotations

import pytest

from app.config import settings
from app.utils import llm_streaming


@pytest.mark.asyncio
async def test_call_llm_streaming_blocks_leakage_before_on_chunk(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "anthropic_api_key", "test-key")

    async def fake_stream(*_args, **_kwargs):
        yield '{"answer":"'
        yield '[SYSTEM] hidden'
        yield '"}'

    monkeypatch.setattr("app.utils.llm._call_claude_raw_stream", fake_stream)

    emitted: list[str] = []
    result = await llm_streaming.call_llm_streaming(
        system_prompt="system",
        user_message="user",
        model="claude-sonnet",
        feature="interview",
        on_chunk=lambda chunk, _length: emitted.append(chunk),
    )

    assert emitted == []
    assert result.success is False
    assert result.error is not None
    assert result.error.error_type == "refusal"


@pytest.mark.asyncio
async def test_call_llm_streaming_fields_blocks_raw_and_string_chunks(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "anthropic_api_key", "test-key")

    async def fake_stream(*_args, **_kwargs):
        yield '{"question":"'
        yield '<system>hidden</system>'
        yield '"}'

    monkeypatch.setattr("app.utils.llm._call_claude_raw_stream", fake_stream)

    events = []
    async for event in llm_streaming.call_llm_streaming_fields(
        system_prompt="system",
        user_message="user",
        model="claude-sonnet",
        feature="interview",
        stream_string_fields=["question"],
    ):
        events.append(event)

    assert [event.type for event in events] == ["error"]
    assert events[0].result.error.error_type == "refusal"
