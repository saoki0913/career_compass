import pytest

from app.prompts.es_templates import get_template_spec
from app.services.es_review.models import ReviewRequest, TemplateRequest
from app.services.es_review.orchestrator import prepare_review_context
from app.services.es_review.template_context import (
    SUPPORTED_COMPOUND_PATTERNS,
    build_effective_template_context,
    merge_template_specs,
)
from app.utils.es_template_classifier import classify_es_question


@pytest.mark.parametrize(
    ("question", "primary", "secondary", "tertiary", "variant"),
    [
        (
            "当社を志望する理由と、入社後に実現したいことを教えてください。",
            "company_motivation",
            "post_join_goals",
            None,
            None,
        ),
        (
            "学生時代に力を入れた経験と、その学びを今後の仕事でどう活かしたいか教えてください。",
            "gakuchika",
            "post_join_goals",
            None,
            None,
        ),
        (
            "インターンに参加を志望する理由と、そこで何を学びたいか教えてください。",
            "intern_reason",
            "intern_goals",
            None,
            None,
        ),
        (
            "あなたの強みと、それを入社後にどう活かしたいか教えてください。",
            "self_pr",
            "post_join_goals",
            None,
            None,
        ),
        (
            "当社を志望する理由と、どの事業領域に携わりたいか教えてください。",
            "company_motivation",
            "role_course_reason",
            None,
            None,
        ),
        (
            "働くうえで大切にしている価値観と、それを当社でどう実現したいか教えてください。",
            "work_values",
            "company_motivation",
            None,
            None,
        ),
        (
            "学生時代に力を入れた経験と、そこで発揮された強みを教えてください。",
            "gakuchika",
            "self_pr",
            None,
            None,
        ),
        (
            "人生で成し遂げたいことと、なぜ当社で実現できると考えるか教えてください。",
            "post_join_goals",
            "company_motivation",
            None,
            None,
        ),
        (
            "あなたの強みと弱みを、それぞれエピソード付きで教えてください。",
            "self_pr",
            "self_pr",
            None,
            "strength_weakness",
        ),
        (
            "インターンを志望する理由と、プログラムで発揮できる強みを教えてください。",
            "intern_reason",
            "self_pr",
            None,
            None,
        ),
        (
            "挑戦し成長した経験、そこで得た強み、当社でどう活かすかを教えてください。",
            "gakuchika",
            "self_pr",
            "post_join_goals",
            None,
        ),
    ],
)
def test_classifier_detects_all_supported_compound_patterns(
    question: str,
    primary: str,
    secondary: str,
    tertiary: str | None,
    variant: str | None,
) -> None:
    result = classify_es_question(question)

    assert result.is_compound is True
    assert result.predicted_template_type == primary
    assert result.compound_secondary_type == secondary
    assert result.compound_tertiary_type == tertiary
    assert result.compound_variant == variant
    assert result.compound_template_types == [item for item in [primary, secondary, tertiary] if item]


def test_supported_compound_pattern_registry_has_eleven_patterns() -> None:
    assert len(SUPPORTED_COMPOUND_PATTERNS) == 11


def test_effective_context_merges_secondary_spec_and_max_grounding() -> None:
    classification = classify_es_question(
        "あなたの強みと、それを入社後にどう活かしたいか教えてください。"
    )

    context = build_effective_template_context(classification)

    assert context.primary_type == "self_pr"
    assert context.secondary_type == "post_join_goals"
    assert context.tertiary_type is None
    assert context.requires_company_rag is True
    assert context.effective_grounding_level == "standard"
    assert context.rag_profile_type == "post_join_goals"
    assert "強みの核" in context.merged_spec["required_elements"]
    assert "やりたいことの核" in context.merged_spec["required_elements"]
    assert len(context.effective_evaluation_axes) <= 7



def test_effective_context_honors_payload_compound_overrides() -> None:
    classification = classify_es_question("自己PRを教えてください。")

    context = build_effective_template_context(
        classification,
        primary_type_override="self_pr",
        secondary_type_overrides=["post_join_goals"],
        pattern_id_override="ui_self_pr_post_join",
        is_compound_override=True,
    )

    assert context.primary_type == "self_pr"
    assert context.secondary_types == ["post_join_goals"]
    assert context.pattern_id == "ui_self_pr_post_join"
    assert context.is_compound is True
    assert context.requires_company_rag is True
    assert context.rag_profile_type == "post_join_goals"
    assert "やりたいことの核" in context.merged_spec["required_elements"]


@pytest.mark.asyncio
async def test_prepare_review_context_uses_template_request_compound_fields() -> None:
    ctx = await prepare_review_context(
        request=ReviewRequest(
            content="私の強みは課題を整理して行動に移せることです。",
            section_title="自己PRを教えてください。",
            template_request=TemplateRequest(
                template_type="self_pr",
                question="自己PRを教えてください。",
                answer="私の強みは課題を整理して行動に移せることです。",
                is_compound=True,
                compound_secondary_types=["post_join_goals"],
                compound_pattern_id="ui_self_pr_post_join",
            ),
        ),
        rag_sources=[],
        company_rag_available=False,
    )

    assert ctx.effective_template_ctx.is_compound is True
    assert ctx.effective_template_ctx.secondary_types == ["post_join_goals"]
    assert ctx.effective_template_ctx.pattern_id == "ui_self_pr_post_join"


def test_strength_weakness_variant_adds_required_elements_and_structure() -> None:
    classification = classify_es_question("あなたの長所と短所をそれぞれ説明してください。")

    context = build_effective_template_context(classification)

    assert context.variant == "strength_weakness"
    assert context.primary_type == "self_pr"
    assert context.secondary_type == "self_pr"
    assert context.requires_company_rag is False
    assert "弱みの認識と克服姿勢" in context.merged_spec["required_elements"]
    assert "弱みを自己否定で終わらせる" in context.merged_spec["anti_patterns"]
    assert "弱み" in str(context.merged_spec["recommended_structure"])
    assert any(axis["name"] == "弱みの制御と成長" for axis in context.effective_evaluation_axes)


def test_triple_compound_merges_three_specs_with_company_rag_profile() -> None:
    classification = classify_es_question(
        "挑戦し成長した経験、そこで得た学びや強み、入社後にどう活かすかを教えてください。"
    )

    context = build_effective_template_context(classification)

    assert context.component_types == ["gakuchika", "self_pr", "post_join_goals"]
    assert context.tertiary_type == "post_join_goals"
    assert context.requires_company_rag is True
    assert context.effective_grounding_level == "standard"
    assert context.rag_profile_type == "post_join_goals"
    assert "取り組みの核" in context.merged_spec["required_elements"]
    assert "強みの核" in context.merged_spec["required_elements"]
    assert "やりたいことの核" in context.merged_spec["required_elements"]
    assert len(context.effective_evaluation_axes) <= 7


def test_merge_template_specs_does_not_mutate_base_template_defs() -> None:
    before = list(get_template_spec("self_pr")["required_elements"])

    merged = merge_template_specs("self_pr", "post_join_goals", "strength_weakness")

    assert "弱みの認識と克服姿勢" in merged["required_elements"]
    assert get_template_spec("self_pr")["required_elements"] == before
