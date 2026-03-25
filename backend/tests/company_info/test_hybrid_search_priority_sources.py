from app.utils.hybrid_search import _apply_priority_source_boost


def test_priority_source_boost_only_applies_to_allowed_content_types() -> None:
    results = [
        {
            "id": "doc-priority",
            "metadata": {
                "source_url": "https://example.com/custom.pdf",
                "content_type": "employee_interviews",
            },
            "boosted_score": 1.0,
        },
        {
            "id": "doc-blocked",
            "metadata": {
                "source_url": "https://example.com/custom.pdf",
                "content_type": "ir_materials",
            },
            "boosted_score": 1.0,
        },
    ]

    boosted = _apply_priority_source_boost(
        results,
        ["https://example.com/custom.pdf"],
        content_type_boosts={
            "employee_interviews": 1.18,
            "ir_materials": 0.0,
        },
        boost_multiplier=1.25,
    )

    by_id = {item["id"]: item for item in boosted}
    assert by_id["doc-priority"]["priority_source_match"] is True
    assert by_id["doc-priority"]["boosted_score"] == 1.25
    assert by_id["doc-blocked"]["priority_source_match"] is False
    assert by_id["doc-blocked"]["boosted_score"] == 1.0
