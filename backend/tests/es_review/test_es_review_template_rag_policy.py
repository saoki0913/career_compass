from app.prompts.es_templates import get_template_company_grounding_policy
from app.routers.es_review import (
    _assess_company_evidence_coverage,
    _build_company_evidence_cards,
    _evaluate_template_rag_availability,
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


def test_company_grounding_policy_matches_template_family() -> None:
    assert get_template_company_grounding_policy("company_motivation") == "required"
    assert get_template_company_grounding_policy("gakuchika") == "assistive"
    assert get_template_company_grounding_policy("self_pr") == "assistive"


def test_build_company_evidence_cards_keeps_single_card_for_assistive_templates() -> None:
    cards = _build_company_evidence_cards(
        [
            {
                "content_type": "employee_interviews",
                "title": "社員インタビュー",
                "excerpt": "顧客起点で価値を出す",
            }
        ],
        template_type="gakuchika",
        question="学生時代に力を入れたことを教えてください。",
        answer="研究室で進捗管理の仕組みを見直した。",
        role_name=None,
        intern_name=None,
        grounding_mode="company_general",
    )

    assert len(cards) == 1


def test_build_company_evidence_cards_limits_assistive_templates_to_one_card() -> None:
    cards = _build_company_evidence_cards(
        [
            {
                "content_type": "corporate_site",
                "title": "企業理念",
                "excerpt": "顧客起点で挑戦を重ねる",
            },
            {
                "content_type": "employee_interviews",
                "title": "社員インタビュー",
                "excerpt": "自律的に学び価値を広げる",
            },
        ],
        template_type="self_pr",
        question="あなたの強みを教えてください。",
        answer="周囲を巻き込んで改善を進める点が強みだ。",
        role_name=None,
        intern_name=None,
        grounding_mode="company_general",
    )

    assert len(cards) == 1


def test_company_evidence_coverage_is_scored_for_assistive_templates() -> None:
    level, weak_notice = _assess_company_evidence_coverage(
        template_type="self_pr",
        role_name=None,
        company_rag_available=True,
        company_evidence_cards=[
            {
                "theme": "企業理解",
                "claim": "顧客起点を重視する",
                "excerpt": "価値観の一致を示す",
            }
        ],
        grounding_mode="company_general",
    )

    assert level in {"weak", "partial"}
    assert weak_notice is False
