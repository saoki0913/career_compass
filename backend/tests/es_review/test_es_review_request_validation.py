import pytest
from pydantic import ValidationError

from app.routers.es_review_models import ReviewRequest


def test_review_request_rejects_short_content() -> None:
    with pytest.raises(ValidationError):
        ReviewRequest(content="短い", section_title="志望動機")


def test_review_request_rejects_long_content() -> None:
    with pytest.raises(ValidationError):
        ReviewRequest(content="あ" * 1501, section_title="志望動機")


def test_review_request_requires_nonblank_section_title() -> None:
    with pytest.raises(ValidationError):
        ReviewRequest(content="志望理由です", section_title="   ")


def test_review_request_rejects_out_of_range_char_limit() -> None:
    with pytest.raises(ValidationError):
        ReviewRequest(content="志望理由です", section_title="志望動機", section_char_limit=1501)


def test_review_request_rejects_bff_only_fields() -> None:
    with pytest.raises(ValidationError):
        ReviewRequest(
            content="志望理由です",
            section_title="志望動機",
            user_id="user-1",
            credit_cost=6,
        )


def test_review_request_normalizes_valid_text_fields() -> None:
    request = ReviewRequest(
        content="  志望理由です  ",
        section_title="  志望動機  ",
        section_char_limit=400,
    )

    assert request.content == "志望理由です"
    assert request.section_title == "志望動機"
