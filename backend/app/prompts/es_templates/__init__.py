"""Compatibility facade for ES template prompt builders."""

from __future__ import annotations

from ._common import (
    _format_prose_style_block,
    get_company_honorific,
)
from ._focus_modes import _dedupe_text_items, _format_focus_mode_guidance
from ._length_control import (
    LengthBand,
    LengthControlProfile,
    LengthTargetPlan,
    _format_char_condition,
    _format_length_policy_block,
    _format_target_char_window,
    compute_internal_target_gap,
    format_acceptance_band,
    format_generation_target,
    resolve_length_control_profile,
    resolve_length_target_plan,
)
from app.prompts.es_quality_rules import _build_contextual_rules
from ._prompt_builder import (
    DRAFT_SYNTHETIC_QUESTION_GAKUCHIKA,
    TEMPLATE_DEFS,
    TEMPLATE_ROLES,
    _draft_generation_output_contract_json,
    _format_company_guidance,
    _format_gakuchika_allocation_guide,
    _format_gakuchika_fact_and_pii_rules,
    _format_gakuchika_student_expressions,
    _format_question_specific_guidance,
    _format_reference_copy_safety_rules,
    _format_reference_quality_guidance,
    _format_required_template_playbook,
    _format_self_count_instruction,
    _format_short_answer_guidance,
    _format_template_anti_patterns,
    _format_template_evaluation_rubric,
    _format_template_required_elements,
    _format_user_fact_guidance,
    build_template_draft_generation_prompt,
    build_template_fallback_rewrite_prompt,
    build_template_rewrite_prompt,
    draft_synthetic_question_company_motivation,
    get_template_company_grounding_policy,
    get_template_default_grounding_level,
    get_template_evaluation_axes,
    get_template_evaluation_checks,
    get_template_fact_priority,
    get_template_retry_policy_guidance,
    get_template_spec,
    grounding_level_to_policy,
    RewriteStrategy,
)
from ._rag_profiles import (
    TEMPLATE_RAG_PROFILES,
    get_template_content_type_boosts,
    get_template_rag_profile,
    get_template_source_family_priority_name,
)
