"""Contract tests for the BFF <-> FastAPI wire schema."""
from __future__ import annotations

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.schemas.contracts import (
    CareerPrincipalPayload,
    EsReviewStreamRequest,
    FastApiStreamEvent,
    GakuchikaFieldCompleteEvent,
    StreamBillingPolicy,
)


FIXTURE_PATH = (
    Path(__file__).resolve().parents[3]
    / "tests"
    / "fixtures"
    / "bff-fastapi-contract-fixtures.json"
)


def _fixtures() -> dict:
    return json.loads(FIXTURE_PATH.read_text())


@pytest.mark.parametrize(
    "key",
    [
        "progress",
        "stringChunk",
        "gakuchikaFieldComplete",
        "gakuchikaComplete",
        "motivationComplete",
        "esReviewComplete",
        "interviewComplete",
        "error",
    ],
)
def test_stream_event_fixtures_parse(key: str) -> None:
    event = FastApiStreamEvent.validate_python(_fixtures()["streamEvents"][key])

    assert event.type in {"progress", "string_chunk", "field_complete", "complete", "error"}


def test_es_review_complete_uses_result_key_not_data() -> None:
    event = FastApiStreamEvent.validate_python(_fixtures()["streamEvents"]["esReviewComplete"])

    assert event.type == "complete"
    assert hasattr(event, "result")
    assert not hasattr(event, "data")
    assert event.result.rewrites == [
        "私はチームの課題を整理し、改善施策を実行しました。"
    ]
    assert event.result.billing_outcome.success is True
    assert event.internal_telemetry is not None
    assert event.internal_telemetry["total_tokens"] == 15


def test_es_review_stream_request_fixture_matches_fastapi_contract() -> None:
    request = EsReviewStreamRequest.model_validate(_fixtures()["esReviewStreamRequest"])

    assert request.section_title == "志望動機"
    assert request.template_request is not None
    assert request.template_request["template_type"] == "company_motivation"


def test_es_review_stream_request_rejects_bff_only_fields() -> None:
    payload = {
        **_fixtures()["esReviewStreamRequest"],
        "user_id": "user-1",
        "credit_cost": 6,
    }

    with pytest.raises(ValidationError):
        EsReviewStreamRequest.model_validate(payload)


def test_gakuchika_remaining_questions_estimate_is_non_negative_integer() -> None:
    valid = GakuchikaFieldCompleteEvent.model_validate(
        _fixtures()["streamEvents"]["gakuchikaFieldComplete"]
    )

    assert valid.path == "remaining_questions_estimate"
    assert valid.value == 0

    with pytest.raises(ValidationError):
        GakuchikaFieldCompleteEvent.model_validate(
            {"type": "field_complete", "path": "remaining_questions_estimate", "value": -1}
        )


def test_principal_fixtures_parse() -> None:
    principals = _fixtures()["principals"]

    assert CareerPrincipalPayload.model_validate(principals["companyUser"]).company_id == "company-1"
    assert CareerPrincipalPayload.model_validate(principals["aiStreamGuest"]).company_id is None


def test_company_principal_requires_company_id() -> None:
    principal = {**_fixtures()["principals"]["companyUser"], "company_id": None}

    with pytest.raises(ValidationError):
        CareerPrincipalPayload.model_validate(principal)


def test_stream_billing_policy_fixtures_parse() -> None:
    parsed = [
        StreamBillingPolicy.validate_python(policy).kind
        for policy in _fixtures()["billingPolicies"]
    ]

    assert parsed == ["post_success", "three_phase", "free"]
