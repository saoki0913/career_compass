"""Tests for cancellation token propagation in interview streaming."""
from __future__ import annotations

import inspect

import pytest


def test_leased_stream_response_passes_cancellation_token():
    """_leased_stream_response should pass lease.cancellation_token to generator."""
    from app.routers._interview.endpoints import _leased_stream_response

    sig = inspect.signature(_leased_stream_response)
    params = list(sig.parameters.keys())
    assert "generator_factory" in params


def test_generate_start_progress_accepts_cancellation_token():
    from app.routers._interview.generators import _generate_start_progress

    sig = inspect.signature(_generate_start_progress)
    assert "cancellation_token" in sig.parameters


def test_generate_turn_progress_accepts_cancellation_token():
    from app.routers._interview.generators import _generate_turn_progress

    sig = inspect.signature(_generate_turn_progress)
    assert "cancellation_token" in sig.parameters


def test_generate_feedback_progress_accepts_cancellation_token():
    from app.routers._interview.generators import _generate_feedback_progress

    sig = inspect.signature(_generate_feedback_progress)
    assert "cancellation_token" in sig.parameters
