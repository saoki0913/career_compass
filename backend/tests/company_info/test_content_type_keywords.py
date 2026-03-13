from app.utils.content_type_keywords import (
    detect_content_type_from_url,
    url_matches_content_type,
)


def test_url_matches_content_type_with_aliases() -> None:
    assert url_matches_content_type(
        "https://example.co.jp/investors/library/financial-results",
        "ir_materials",
    )
    assert url_matches_content_type(
        "https://example.co.jp/about/top-message/",
        "ceo_message",
    )
    assert url_matches_content_type(
        "https://example.co.jp/recruit/people/voice01",
        "employee_interviews",
    )


def test_detect_content_type_from_url_with_aliases() -> None:
    assert (
        detect_content_type_from_url(
            "https://example.co.jp/ir/investors/disclosure/library"
        )
        == "ir_materials"
    )
    assert (
        detect_content_type_from_url("https://example.co.jp/company/top-message/")
        == "ceo_message"
    )
