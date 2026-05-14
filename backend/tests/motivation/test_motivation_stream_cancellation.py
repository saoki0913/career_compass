"""Tests for cancellation token propagation in motivation streaming."""
from __future__ import annotations

import inspect

import pytest


def test_generate_next_question_progress_accepts_cancellation_token():
    from app.services.motivation.streaming import _generate_next_question_progress

    sig = inspect.signature(_generate_next_question_progress)
    assert "cancellation_token" in sig.parameters
