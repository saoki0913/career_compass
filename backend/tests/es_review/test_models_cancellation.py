from __future__ import annotations

from app.services.es_review.models import ReviewContext
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
