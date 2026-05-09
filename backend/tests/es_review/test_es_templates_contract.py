from __future__ import annotations

import importlib

from app.prompts import es_templates
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
            ai_smell_warnings=[{"code": "repetitive_ending", "detail": "debug"}],
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
