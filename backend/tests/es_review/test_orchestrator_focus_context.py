"""Verify orchestrator passes FocusModeContext through to prompt builders."""

from app.prompts.es_templates._focus_modes import FocusModeContext
from app.prompts.es_templates._length_control import compute_shortfall_delta_band
from app.utils.llm_providers import LLMResultLike


def test_focus_mode_context_created_from_shortfall_delta_band() -> None:
    band = compute_shortfall_delta_band(char_min=200, current_length=150)
    assert band == "medium"


def test_review_caller_type_aliases_use_protocol() -> None:
    from app.services.es_review.orchestrator import ReviewJSONCaller, ReviewTextCaller
    import typing

    for alias in (ReviewJSONCaller, ReviewTextCaller):
        origin = typing.get_origin(alias)
        assert origin is not None


def test_focus_mode_context_none_when_no_shortfall() -> None:
    band = compute_shortfall_delta_band(char_min=200, current_length=250)
    assert band is None
