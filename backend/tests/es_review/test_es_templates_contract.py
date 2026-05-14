from __future__ import annotations

import importlib

from app.prompts import es_templates
from app.prompts.es_templates import _dedupe_text_items
from app.services.es_review.models import ReviewMeta, ReviewResponse, ReviewTokenUsage


def test_es_templates_package_preserves_legacy_import_surface() -> None:
    module = importlib.import_module("app.prompts.es_templates")

    for name in (
        "TEMPLATE_DEFS",
        "TEMPLATE_RAG_PROFILES",
        "TEMPLATE_ROLES",
        "build_template_rewrite_prompt",
        "build_template_fallback_rewrite_prompt",
        "build_template_draft_generation_prompt",
        "get_template_rag_profile",
        "get_template_evaluation_axes",
        "resolve_length_control_profile",
        "get_company_honorific",
        "_format_template_required_elements",
        "_format_template_evaluation_rubric",
        "RewriteStrategy",
    ):
        assert hasattr(module, name), name


def test_all_templates_define_evaluation_axes() -> None:
    for template_type in sorted(es_templates.TEMPLATE_DEFS):
        axes = es_templates.get_template_evaluation_axes(template_type)
        assert axes, template_type
        for axis in axes:
            assert axis["name"].strip()
            assert axis["pass_condition"].strip()
            assert axis["rewrite_instruction"].strip()


def test_rewrite_and_fallback_prompts_include_rubric() -> None:
    system_prompt, _ = es_templates.build_template_rewrite_prompt(
        template_type="gakuchika",
        company_name=None,
        industry=None,
        question="学生時代に力を入れたことを教えてください。",
        answer="サークルで参加率を改善した。",
        char_min=200,
        char_max=300,
        company_evidence_cards=[],
        has_rag=False,
    )
    fallback_prompt, _ = es_templates.build_template_fallback_rewrite_prompt(
        template_type="gakuchika",
        company_name=None,
        industry=None,
        question="学生時代に力を入れたことを教えてください。",
        answer="サークルで参加率を改善した。",
        char_min=200,
        char_max=300,
        company_evidence_cards=[],
        has_rag=False,
    )
    assert "<evaluation_rubric>" in system_prompt
    assert "課題の明確さ" in system_prompt
    assert "<evaluation_rubric>" in fallback_prompt


def test_review_response_model_dump_excludes_internal_meta_fields() -> None:
    response = ReviewResponse(
        rewrites=["改善後の本文"],
        review_meta=ReviewMeta(
            token_usage=ReviewTokenUsage(input_tokens=10, output_tokens=5),
            rewrite_rejection_reasons=["under_min"],
            rewrite_attempt_trace=[{"stage": "retry"}],
            rewrite_total_rewrite_attempts=3,
            ai_smell_warnings=[{"code": "abstract_buzzword", "detail": "debug"}],
            llm_quality_failed_checks=["structure_clarity"],
            llm_quality_warned_checks=["fact_preservation"],
            llm_quality_lenient_pass=True,
            llm_quality_failure_count=1,
        ),
    )

    dumped_meta = response.model_dump()["review_meta"]

    for field in (
        "token_usage",
        "rewrite_rejection_reasons",
        "rewrite_attempt_trace",
        "rewrite_total_rewrite_attempts",
        "ai_smell_warnings",
    ):
        assert field not in dumped_meta
    assert dumped_meta["llm_quality_failed_checks"] == ["structure_clarity"]
    assert dumped_meta["llm_quality_warned_checks"] == ["fact_preservation"]
    assert dumped_meta["llm_quality_lenient_pass"] is True
    assert dumped_meta["llm_quality_failure_count"] == 1


_COMMON_PARAMS = dict(
    company_name=None,
    industry=None,
    question="学生時代に力を入れたことを教えてください。",
    answer="サークルで参加率を改善した。",
    char_min=200,
    char_max=300,
    company_evidence_cards=[],
    has_rag=False,
)


def test_fallback_strategy_excludes_template_focus_and_uses_safe_role() -> None:
    """FALLBACK strategy omits <template_focus> and uses the generic safe role;
    STANDARD strategy includes <template_focus> and uses the template-specific role.
    """
    fallback_system, _ = es_templates.build_template_fallback_rewrite_prompt(
        template_type="gakuchika", **_COMMON_PARAMS
    )
    standard_system, _ = es_templates.build_template_rewrite_prompt(
        template_type="gakuchika", **_COMMON_PARAMS
    )

    # Fallback must NOT include template focus block
    assert "<template_focus>" not in fallback_system, (
        "FALLBACK should exclude <template_focus> but it was found in the system prompt"
    )
    # Fallback must use the safe generic role identity
    assert "日本語のES編集者" in fallback_system, (
        "FALLBACK should declare '日本語のES編集者' as the role"
    )

    # Standard MUST include template focus block
    assert "<template_focus>" in standard_system, (
        "STANDARD should include <template_focus> but it was not found"
    )
    # Standard must NOT use the safe fallback role
    assert "日本語のES編集者" not in standard_system, (
        "STANDARD should use the template-specific role, not '日本語のES編集者'"
    )


def test_prompt_token_size_within_budget() -> None:
    """Prompt system strings stay within a generous character budget after restructuring."""
    # 1. gakuchika short — no RAG
    system_gakuchika, _ = es_templates.build_template_rewrite_prompt(
        template_type="gakuchika",
        company_name=None,
        industry=None,
        question="学生時代に力を入れたことを教えてください。",
        answer="サークルで参加率を改善した。",
        char_min=150,
        char_max=200,
        company_evidence_cards=[],
        has_rag=False,
    )
    assert len(system_gakuchika) < 12000, (
        f"gakuchika short system prompt too large: {len(system_gakuchika)} chars"
    )

    # 2. company_motivation mid — with RAG card
    system_motivation, _ = es_templates.build_template_rewrite_prompt(
        template_type="company_motivation",
        company_name="テスト株式会社",
        industry=None,
        question="志望動機を教えてください。",
        answer="御社の事業に興味があります。",
        char_min=300,
        char_max=400,
        company_evidence_cards=[
            {
                "content_type": "company_page",
                "title": "事業概要",
                "content": "テスト事業の概要です。",
                "source_url": "https://example.com",
            }
        ],
        has_rag=True,
    )
    assert len(system_motivation) < 18000, (
        f"company_motivation mid system prompt too large: {len(system_motivation)} chars"
    )

    # 3. self_pr long — no RAG
    system_self_pr, _ = es_templates.build_template_rewrite_prompt(
        template_type="self_pr",
        company_name=None,
        industry=None,
        question="自己PRをしてください。",
        answer="リーダーシップを発揮した経験があります。",
        char_min=400,
        char_max=500,
        company_evidence_cards=[],
        has_rag=False,
    )
    assert len(system_self_pr) < 14000, (
        f"self_pr long system prompt too large: {len(system_self_pr)} chars"
    )


def test_dedupe_text_items_basic_cases() -> None:
    """_dedupe_text_items preserves order, removes duplicates, and strips blanks."""
    # Empty list
    assert _dedupe_text_items([]) == []

    # Removes exact duplicate
    assert _dedupe_text_items(["a", "b", "a"]) == ["a", "b"]

    # Removes empty strings
    assert _dedupe_text_items(["", "a", "", "b"]) == ["a", "b"]

    # Strips whitespace before dedup so "  a  " and "a" collapse to one entry
    assert _dedupe_text_items(["  a  ", "a"]) == ["a"]
