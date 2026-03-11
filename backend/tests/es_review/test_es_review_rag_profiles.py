from app.prompts.es_templates import get_template_rag_profile


def test_role_course_reason_profile_keeps_company_focused_retrieval() -> None:
    profile = get_template_rag_profile("role_course_reason")

    assert profile["expand_queries"] is True
    assert profile["rerank"] is True
    assert profile["use_bm25"] is True
    assert profile["profile_overrides"]["max_total_queries"] == 2


def test_gakuchika_profile_is_lightweight() -> None:
    profile = get_template_rag_profile("gakuchika")

    assert profile["expand_queries"] is False
    assert profile["rerank"] is False
    assert profile["use_bm25"] is False
    assert profile["profile_overrides"]["max_total_queries"] == 1
