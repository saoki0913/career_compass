"""Tests for cancellation token propagation in motivation streaming.

The deeper shim -> stream service -> ``call_llm_streaming_fields`` propagation
contracts live in ``test_streaming_cancellation.py`` and
``test_stream_service_cancellation.py`` (named to match the implementation
modules so the test-first guard resolves them).
"""
from __future__ import annotations

import inspect

import pytest


def test_generate_next_question_progress_accepts_cancellation_token():
    from app.services.motivation.streaming import _generate_next_question_progress

    sig = inspect.signature(_generate_next_question_progress)
    assert "cancellation_token" in sig.parameters
