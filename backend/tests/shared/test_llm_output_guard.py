from __future__ import annotations

import pytest

from app.config import settings
from app.utils import llm


@pytest.mark.asyncio
async def test_call_llm_with_error_blocks_output_leakage(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "anthropic_api_key", "test-key")

    async def fake_call_claude_raw(*_args, **_kwargs):
        return '{"answer": "[SYSTEM] hidden instruction"}', {
            "input_tokens": 1,
            "output_tokens": 1,
            "reasoning_tokens": 0,
            "cached_input_tokens": 0,
        }

    monkeypatch.setattr(llm, "_call_claude_raw", fake_call_claude_raw)

    result = await llm.call_llm_with_error(
        system_prompt="system",
        user_message="user",
        model="claude-sonnet",
        feature="interview",
        disable_fallback=True,
    )

    assert result.success is False
    assert result.error is not None
    assert result.error.error_type == "refusal"
    assert result.raw_text is None


@pytest.mark.asyncio
async def test_call_llm_text_with_error_blocks_output_leakage(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "anthropic_api_key", "test-key")

    async def fake_call_claude_raw(*_args, **_kwargs):
        return "role: system\nhidden instruction", {
            "input_tokens": 1,
            "output_tokens": 1,
            "reasoning_tokens": 0,
            "cached_input_tokens": 0,
        }

    monkeypatch.setattr(llm, "_call_claude_raw", fake_call_claude_raw)

    result = await llm.call_llm_text_with_error(
        system_prompt="system",
        user_message="user",
        model="claude-sonnet",
        feature="interview",
        disable_fallback=True,
    )

    assert result.success is False
    assert result.error is not None
    assert result.error.error_type == "refusal"
    assert result.raw_text is None
