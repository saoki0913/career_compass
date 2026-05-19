from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass, asdict
from typing import Any, cast

from app.prompts.es_templates import get_template_spec
from app.prompts.es_templates._types import (
    EvaluationAxis,
    TemplateDef,
    retry_policy,
    validation_policy,
    rewrite_policy,
)
from app.utils.es_template_classifier import ESQuestionClassification


GROUNDING_LEVEL_ORDER = {"none": 0, "light": 1, "standard": 2, "deep": 3}
SELF_FOCUSED_TYPES = {"basic", "gakuchika", "self_pr", "work_values"}
COMPANY_CONNECTED_TYPES = {
    "company_motivation",
    "role_course_reason",
    "intern_reason",
    "intern_goals",
    "post_join_goals",
}

SUPPORTED_COMPOUND_PATTERNS: tuple[tuple[str, ...], ...] = (
    ("company_motivation", "post_join_goals"),
    ("gakuchika", "post_join_goals"),
    ("intern_reason", "intern_goals"),
    ("self_pr", "post_join_goals"),
    ("company_motivation", "role_course_reason"),
    ("work_values", "company_motivation"),
    ("gakuchika", "self_pr"),
    ("post_join_goals", "company_motivation"),
    ("self_pr", "self_pr"),
    ("intern_reason", "self_pr"),
    ("gakuchika", "self_pr", "post_join_goals"),
)


@dataclass(frozen=True)
class EffectiveTemplateContext:
    primary_type: str
    secondary_type: str | None
    tertiary_type: str | None
    secondary_types: list[str]
    pattern_id: str | None
    variant: str | None
    is_compound: bool
    component_types: list[str]
    merged_spec: TemplateDef
    effective_grounding_level: str
    requires_company_rag: bool
    effective_evaluation_axes: list[EvaluationAxis]
    rag_profile_type: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _template_spec(template_type: str) -> TemplateDef:
    return cast(TemplateDef, deepcopy(get_template_spec(template_type)))


def _dedupe_strings(items: list[str]) -> list[str]:
    seen: set[str] = set()
    deduped: list[str] = []
    for item in items:
        normalized = str(item or "").strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        deduped.append(normalized)
    return deduped


def _dedupe_axes(axes: list[EvaluationAxis], *, cap: int) -> list[EvaluationAxis]:
    seen: set[str] = set()
    deduped: list[EvaluationAxis] = []
    for axis in axes:
        name = str(axis.get("name") or "").strip()
        if not name or name in seen:
            continue
        seen.add(name)
        deduped.append(cast(EvaluationAxis, dict(axis)))
        if len(deduped) >= cap:
            break
    return deduped


def _max_grounding_level(component_specs: list[TemplateDef]) -> str:
    levels = [str(validation_policy(spec).get("grounding_level") or "light") for spec in component_specs]
    return max(levels or ["light"], key=lambda level: GROUNDING_LEVEL_ORDER.get(level, 0))


def _append_to_structure_short(structure_short: str, addition: str) -> str:
    base = structure_short.strip()
    if not base:
        return addition
    return f"{base}。後半では{addition}"


def _merge_retry_policy_guidance(primary: TemplateDef, secondary_specs: list[TemplateDef]) -> dict[str, str]:
    merged = dict(retry_policy(primary).get("guidance_by_failure") or {})
    for index, spec in enumerate(secondary_specs, start=2):
        for key, value in dict(retry_policy(spec).get("guidance_by_failure") or {}).items():
            if key not in merged:
                merged[key] = str(value)
            else:
                merged[f"component_{index}_{key}"] = str(value)
    return merged


def _resolve_rag_profile_type(primary_type: str, secondary_types: list[str]) -> str:
    if primary_type not in SELF_FOCUSED_TYPES:
        return primary_type
    for template_type in secondary_types:
        if template_type in COMPANY_CONNECTED_TYPES:
            return template_type
    return primary_type


def _component_types(
    primary_type: str,
    secondary_type: str | None,
    tertiary_type: str | None,
) -> list[str]:
    return [
        template_type
        for template_type in [primary_type, secondary_type, tertiary_type]
        if template_type
    ]


def _unique_component_types(component_types: list[str]) -> list[str]:
    unique: list[str] = []
    for template_type in component_types:
        if template_type not in unique:
            unique.append(template_type)
    return unique


def merge_template_specs(
    primary_type: str,
    secondary_type: str | None = None,
    variant: str | None = None,
    tertiary_type: str | None = None,
) -> TemplateDef:
    component_types = _component_types(primary_type, secondary_type, tertiary_type)
    unique_types = _unique_component_types(component_types)
    primary_spec = _template_spec(primary_type)
    component_specs = [_template_spec(template_type) for template_type in unique_types]
    secondary_specs = component_specs[1:]

    merged = cast(TemplateDef, deepcopy(primary_spec))
    merged_rewrite = dict(rewrite_policy(merged))
    merged_validation = dict(validation_policy(merged))
    merged_retry = dict(retry_policy(merged))

    merged_rewrite["required_elements"] = _dedupe_strings(
        [
            str(item)
            for spec in component_specs
            for item in list(rewrite_policy(spec).get("required_elements") or [])
        ]
    )
    merged_rewrite["anti_patterns"] = _dedupe_strings(
        [
            str(item)
            for spec in component_specs
            for item in list(rewrite_policy(spec).get("anti_patterns") or [])
        ]
    )
    primary_axes = list(validation_policy(primary_spec).get("evaluation_axes") or [])
    supplemental_axes = [
        axis
        for spec in secondary_specs
        for axis in list(validation_policy(spec).get("evaluation_axes") or [])[:2]
    ]
    merged_validation["evaluation_axes"] = _dedupe_axes(primary_axes + supplemental_axes, cap=7)
    merged_validation["evaluation_checks"] = dict(validation_policy(primary_spec).get("evaluation_checks") or {})
    merged_validation["grounding_level"] = _max_grounding_level(component_specs)
    merged_validation["requires_company_rag"] = any(
        bool(validation_policy(spec).get("requires_company_rag")) for spec in component_specs
    )
    merged_rewrite["company_usage"] = (
        "required"
        if bool(merged_validation["requires_company_rag"])
        else str(rewrite_policy(primary_spec).get("company_usage") or "assistive")
    )
    merged_rewrite["fact_priority"] = (
        "mixed"
        if any(str(rewrite_policy(spec).get("fact_priority") or "") == "mixed" for spec in component_specs)
        else str(rewrite_policy(primary_spec).get("fact_priority") or "self")
    )
    merged_retry["guidance_by_failure"] = _merge_retry_policy_guidance(primary_spec, secondary_specs)

    if len(unique_types) > 1:
        labels = [str(spec.get("label") or template_type) for spec, template_type in zip(component_specs, unique_types)]
        merged["label"] = " + ".join(labels)
        merged_rewrite["description"] = " / ".join(
            str(rewrite_policy(spec).get("description") or "") for spec in component_specs if rewrite_policy(spec).get("description")
        )

    if variant == "strength_weakness":
        merged["label"] = "自己PR（強み・弱み）"
        merged_rewrite["required_elements"] = _dedupe_strings(
            list(merged_rewrite.get("required_elements") or []) + ["弱みの認識と克服姿勢"]
        )
        merged_rewrite["anti_patterns"] = _dedupe_strings(
            list(merged_rewrite.get("anti_patterns") or []) + ["弱みを自己否定で終わらせる"]
        )
        merged_rewrite["structure_short"] = _append_to_structure_short(
            str(merged_rewrite.get("structure_short") or ""),
            "弱みの認識から改善行動、成長につなげる",
        )
        merged_validation["evaluation_axes"] = _dedupe_axes(
            list(merged_validation.get("evaluation_axes") or [])
            + [
                {
                    "name": "弱みの制御と成長",
                    "pass_condition": "弱みが自己否定で終わらず、改善行動や成長姿勢につながっている",
                    "rewrite_instruction": "弱みはリスクの告白ではなく、認識、対策、改善の順で示す",
                }
            ],
            cap=7,
        )
        retry_failure_guidance = dict(merged_retry.get("guidance_by_failure") or {})
        retry_failure_guidance["strength_weakness"] = "強みは根拠経験、弱みは認識と改善行動を分けて示す"
        merged_retry["guidance_by_failure"] = retry_failure_guidance

    merged["rewrite_policy"] = cast(Any, merged_rewrite)
    merged["validation_policy"] = cast(Any, merged_validation)
    merged["retry_policy"] = cast(Any, merged_retry)

    return merged


def build_effective_template_context(
    classification: ESQuestionClassification,
    *,
    primary_type_override: str | None = None,
    secondary_type_overrides: list[str] | None = None,
    variant_override: str | None = None,
    pattern_id_override: str | None = None,
    is_compound_override: bool | None = None,
) -> EffectiveTemplateContext:
    primary_type = primary_type_override or classification.predicted_template_type
    raw_component_types = [*list(secondary_type_overrides or [])]
    if classification.is_compound or not secondary_type_overrides:
        raw_component_types.extend(
            [
                classification.predicted_template_type,
                classification.compound_secondary_type,
                classification.compound_tertiary_type,
            ]
        )
    if not secondary_type_overrides:
        raw_component_types.extend(list(classification.secondary_candidates or []))
    secondary_candidates: list[str] = []
    for template_type in raw_component_types:
        if template_type and template_type != primary_type and template_type not in secondary_candidates:
            secondary_candidates.append(template_type)
    if (
        (variant_override or classification.compound_variant) == "strength_weakness"
        and not secondary_candidates
    ):
        secondary_candidates.append(primary_type)
    if not classification.is_compound and not secondary_type_overrides:
        secondary_candidates = list(classification.secondary_candidates or [])
    secondary_type = secondary_candidates[0] if secondary_candidates else None
    tertiary_type = secondary_candidates[1] if len(secondary_candidates) >= 2 else None
    component_types = _component_types(primary_type, secondary_type, tertiary_type)
    merged_spec = merge_template_specs(
        primary_type,
        secondary_type,
        variant_override or classification.compound_variant,
        tertiary_type,
    )
    effective_axes = [
        cast(EvaluationAxis, dict(axis))
        for axis in list(validation_policy(merged_spec).get("evaluation_axes") or [])
    ]
    secondary_types = [template_type for template_type in component_types[1:]]

    return EffectiveTemplateContext(
        primary_type=primary_type,
        secondary_type=secondary_type,
        tertiary_type=tertiary_type,
        secondary_types=secondary_types,
        pattern_id=pattern_id_override or (classification.matched_rule if classification.is_compound else None),
        variant=variant_override or classification.compound_variant,
        is_compound=bool(
            is_compound_override
            if is_compound_override is not None
            else classification.is_compound or secondary_candidates
        ),
        component_types=component_types,
        merged_spec=merged_spec,
        effective_grounding_level=str(validation_policy(merged_spec).get("grounding_level") or "light"),
        requires_company_rag=bool(validation_policy(merged_spec).get("requires_company_rag")),
        effective_evaluation_axes=effective_axes,
        rag_profile_type=_resolve_rag_profile_type(primary_type, secondary_types),
    )
