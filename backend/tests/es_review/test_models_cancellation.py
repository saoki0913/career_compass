from __future__ import annotations

from app.services.es_review.models import ReviewContext, ReviewMeta
from app.utils.cancellation import CancellationTokenLike, noop_token


def test_review_context_default_cancellation_token():
    ctx = ReviewContext(
        template_type="gakuchika",
        template_request=None,
        request=None,
        json_caller=None,
        text_caller=None,
        review_feature="es_review",
        llm_provider="claude",
        llm_model=None,
        review_variant="standard",
        injection_risk=None,
        progress_queue=None,
    )
    assert isinstance(ctx.cancellation_token, CancellationTokenLike)
    assert ctx.cancellation_token is noop_token()
    assert not ctx.cancellation_token.is_cancelled


def test_review_meta_dropped_conditional_hints_telemetry():
    """Regression: reference statistics were removed, so the now-permanently-dead
    conditional-hints telemetry field must not exist on ReviewMeta."""
    assert "reference_conditional_hints_applied" not in ReviewMeta.model_fields
    meta = ReviewMeta()
    assert not hasattr(meta, "reference_conditional_hints_applied")
    # Surviving qualitative telemetry is still present.
    assert "reference_hint_count" in ReviewMeta.model_fields
