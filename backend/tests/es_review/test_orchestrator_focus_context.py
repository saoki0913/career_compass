"""Verify orchestrator passes FocusModeContext through to prompt builders."""

from app.prompts.es_templates._focus_modes import FocusModeContext
from app.prompts.es_templates._length_control import compute_shortfall_delta_band


def test_focus_mode_context_created_from_shortfall_delta_band() -> None:
    band = compute_shortfall_delta_band(char_min=200, current_length=150)
    assert band == "medium"

    ctx = FocusModeContext(
        char_min=200,
        char_max=300,
        current_length=150,
        shortfall=50,
        delta_band=band,
        template_type="self_pr",
    )
    assert ctx.delta_band == "medium"
    assert ctx.shortfall == 50


def test_focus_mode_context_none_when_no_shortfall() -> None:
    band = compute_shortfall_delta_band(char_min=200, current_length=250)
    assert band is None
