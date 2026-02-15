from app.routers.es_review import (
    _evaluate_template_rag_availability,
    _resolve_template_keyword_count,
)


def test_rag_availability_context_short_disables_rag() -> None:
    is_available, reason = _evaluate_template_rag_availability(
        rag_context="短い",
        rag_sources=[{"source_id": "S1"}],
        min_context_length=10,
    )

    assert is_available is False
    assert reason == "context_short"


def test_rag_availability_context_sufficient_without_sources_keeps_rag() -> None:
    is_available, reason = _evaluate_template_rag_availability(
        rag_context="a" * 210,
        rag_sources=[],
        min_context_length=200,
    )

    assert is_available is True
    assert reason == "sources_missing_but_continue"


def test_keyword_count_falls_back_when_template_requires_rag_but_unavailable() -> None:
    keyword_count, fallback_reason = _resolve_template_keyword_count(
        template_type="post_join_goals",
        requires_company_rag=True,
        default_keyword_count=2,
        company_rag_available=False,
        rag_sources=[{"source_id": "S1"}],
    )

    assert keyword_count == 0
    assert fallback_reason == "rag_unavailable"


def test_keyword_count_falls_back_when_sources_missing() -> None:
    keyword_count, fallback_reason = _resolve_template_keyword_count(
        template_type="post_join_goals",
        requires_company_rag=True,
        default_keyword_count=2,
        company_rag_available=True,
        rag_sources=[],
    )

    assert keyword_count == 0
    assert fallback_reason == "sources_missing"


def test_keyword_count_keeps_default_when_rag_and_sources_available() -> None:
    keyword_count, fallback_reason = _resolve_template_keyword_count(
        template_type="post_join_goals",
        requires_company_rag=True,
        default_keyword_count=2,
        company_rag_available=True,
        rag_sources=[{"source_id": "S1"}],
    )

    assert keyword_count == 2
    assert fallback_reason is None
