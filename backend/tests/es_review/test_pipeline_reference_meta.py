"""Regression for the reference-statistics removal in the ES review meta builder.

Conditional-hints telemetry was removed together with the statistics feature it
described, so ``_build_review_meta`` must no longer accept or emit it.
"""

from __future__ import annotations

import inspect

import pytest

from app.services.es_review.models import ReviewRequest, TemplateRequest
from app.services.es_review.pipeline import _build_review_meta


def _request() -> ReviewRequest:
    return ReviewRequest(
        content="テスト用の自己PRです。",
        section_title="自己PR",
        template_request=TemplateRequest(
            template_type="self_pr",
            question="自己PRを書いてください",
            answer="テスト用の自己PRです。",
        ),
    )


def test_build_review_meta_signature_has_no_conditional_hints_param():
    params = inspect.signature(_build_review_meta).parameters
    assert "reference_conditional_hints_applied" not in params
    assert "reference_hint_count" in params


def test_build_review_meta_rejects_conditional_hints_kwarg():
    with pytest.raises(TypeError):
        _build_review_meta(
            _request(),
            grounding_mode="none",
            triggered_enrichment=False,
            injection_risk=None,
            reference_conditional_hints_applied=True,
        )


def test_build_review_meta_emits_no_conditional_hints_field():
    meta = _build_review_meta(
        _request(),
        grounding_mode="none",
        triggered_enrichment=False,
        injection_risk=None,
        reference_hint_count=7,
    )
    assert not hasattr(meta, "reference_conditional_hints_applied")
    assert meta.reference_hint_count == 7
