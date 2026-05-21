"""Validation profile definitions and information-density scoring."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

from app.services.es_review.enums import ValidationFailureCode
from app.services.es_review.fact_guard import (
    _extract_experience_terms,
    _extract_numeric_expressions,
    _extract_role_titles,
)

InformationTier = Literal["sparse", "low", "moderate", "sufficient"]
LlmAxisMode = Literal["required", "warn", "skip"]

_CHAR_WEIGHT = 0.3
_FACT_WEIGHT = 30
_TIER_THRESHOLDS = {"sparse": 30, "low": 60, "moderate": 120}


@dataclass(frozen=True)
class InformationDensity:
    char_count: int
    fact_count: int
    score: float
    tier: InformationTier


@dataclass(frozen=True)
class ValidationProfile:
    name: str
    conclusion_first: LlmAxisMode = "required"
    company_grounding: LlmAxisMode = "required"
    style_unity: LlmAxisMode = "required"
    structure_clarity: LlmAxisMode = "required"
    fact_preservation: LlmAxisMode = "required"
    answer_completeness: LlmAxisMode = "required"
    fact_guard_hard_block_codes: frozenset[str] = field(
        default_factory=lambda: frozenset(
            {
                "number_mutation",
                "role_title_mutation",
                "metric_fabrication",
                "experience_fabrication",
                "award_fabrication",
                "proper_noun_fabrication",
            }
        )
    )
    hallucination_tier2_threshold: float = 3.0
    degraded_block_codes: frozenset[str] = field(
        default_factory=lambda: frozenset(
            {
                ValidationFailureCode.EMPTY.value,
                ValidationFailureCode.FRAGMENT.value,
                ValidationFailureCode.NEGATIVE_SELF_EVAL.value,
                ValidationFailureCode.COMPANY_REFERENCE_IN_COMPANYLESS.value,
                ValidationFailureCode.HALLUCINATION.value,
                ValidationFailureCode.FACT_PRESERVATION.value,
            }
        )
    )
    best_effort_enabled: bool = False
    max_retry: int = 3

    def axis_modes(self) -> dict[str, LlmAxisMode]:
        return {
            "conclusion_first": self.conclusion_first,
            "company_grounding": self.company_grounding,
            "style_unity": self.style_unity,
            "structure_clarity": self.structure_clarity,
            "fact_preservation": self.fact_preservation,
            "answer_completeness": self.answer_completeness,
        }


STRICT_PROFILE = ValidationProfile(name="strict")

QUALITY_FIRST_PROFILE = ValidationProfile(
    name="quality_first",
    fact_preservation="warn",
    fact_guard_hard_block_codes=frozenset(
        {
            "number_mutation",
            "role_title_mutation",
            "metric_fabrication",
            "experience_fabrication",
            "award_fabrication",
            "proper_noun_fabrication",
        }
    ),
    degraded_block_codes=frozenset(
        {
            ValidationFailureCode.EMPTY.value,
            ValidationFailureCode.FRAGMENT.value,
            ValidationFailureCode.NEGATIVE_SELF_EVAL.value,
            ValidationFailureCode.COMPANY_REFERENCE_IN_COMPANYLESS.value,
            ValidationFailureCode.HALLUCINATION.value,
            ValidationFailureCode.FACT_PRESERVATION.value,
            ValidationFailureCode.LLM_QUALITY.value,
        }
    ),
    best_effort_enabled=True,
    max_retry=3,
)

LENIENT_PROFILE = ValidationProfile(
    name="lenient",
    company_grounding="warn",
    fact_preservation="warn",
    fact_guard_hard_block_codes=frozenset({"number_mutation"}),
    hallucination_tier2_threshold=6.0,
    degraded_block_codes=frozenset(
        {
            ValidationFailureCode.EMPTY.value,
            ValidationFailureCode.FRAGMENT.value,
            ValidationFailureCode.NEGATIVE_SELF_EVAL.value,
            ValidationFailureCode.COMPANY_REFERENCE_IN_COMPANYLESS.value,
        }
    ),
    best_effort_enabled=True,
    max_retry=2,
)


def count_facts(text: str) -> int:
    numeric = _extract_numeric_expressions(text)
    roles = _extract_role_titles(text)
    experiences = _extract_experience_terms(text)
    return len(numeric) + len(roles) + len(experiences)


def compute_information_density(
    text: str,
    *,
    fact_count: int | None = None,
) -> InformationDensity:
    char_count = len(text or "")
    if fact_count is None:
        fact_count = count_facts(text)
    score = char_count * _CHAR_WEIGHT + fact_count * _FACT_WEIGHT
    if score < _TIER_THRESHOLDS["sparse"]:
        tier: InformationTier = "sparse"
    elif score < _TIER_THRESHOLDS["low"]:
        tier = "low"
    elif score < _TIER_THRESHOLDS["moderate"]:
        tier = "moderate"
    else:
        tier = "sufficient"
    return InformationDensity(
        char_count=char_count,
        fact_count=fact_count,
        score=score,
        tier=tier,
    )


def apply_information_tier_adjustments(
    profile: ValidationProfile,
    tier: InformationTier,
) -> ValidationProfile:
    if profile.name == "quality_first":
        return profile
    if profile.name != "strict":
        return profile
    if tier in ("sufficient", "moderate"):
        return profile
    if tier == "low":
        return ValidationProfile(
            name="strict",
            fact_preservation="warn",
            fact_guard_hard_block_codes=frozenset(
                {"number_mutation", "role_title_mutation"}
            ),
            hallucination_tier2_threshold=4.5,
            degraded_block_codes=frozenset(
                {
                    ValidationFailureCode.EMPTY.value,
                    ValidationFailureCode.FRAGMENT.value,
                    ValidationFailureCode.NEGATIVE_SELF_EVAL.value,
                    ValidationFailureCode.COMPANY_REFERENCE_IN_COMPANYLESS.value,
                }
            ),
        )
    return ValidationProfile(
        name="strict",
        fact_preservation="warn",
        fact_guard_hard_block_codes=frozenset({"number_mutation"}),
        hallucination_tier2_threshold=6.0,
        degraded_block_codes=frozenset(
            {
                ValidationFailureCode.EMPTY.value,
                ValidationFailureCode.FRAGMENT.value,
                ValidationFailureCode.NEGATIVE_SELF_EVAL.value,
                ValidationFailureCode.COMPANY_REFERENCE_IN_COMPANYLESS.value,
            }
        ),
    )


def resolve_profile(feature: str) -> ValidationProfile:
    if feature == "es_review":
        return QUALITY_FIRST_PROFILE
    if feature in ("gakuchika", "motivation"):
        return LENIENT_PROFILE
    return STRICT_PROFILE


__all__ = [
    "InformationDensity",
    "InformationTier",
    "LENIENT_PROFILE",
    "LlmAxisMode",
    "QUALITY_FIRST_PROFILE",
    "STRICT_PROFILE",
    "ValidationProfile",
    "apply_information_tier_adjustments",
    "compute_information_density",
    "count_facts",
    "resolve_profile",
]
