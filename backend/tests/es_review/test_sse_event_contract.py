from __future__ import annotations

import re
from pathlib import Path
from typing import Type

from app.services.es_review.enums import (
    ClassificationConfidence,
    CompanyGroundingPolicy,
    EvidenceCoverageLevel,
    FinalAcceptanceSource,
    GroundingLevel,
    GroundingMode,
    HallucinationGuardMode,
    LengthPolicy,
    ReferenceProfileVariance,
    ValidationFailureCode,
    ValidationStatus,
)
from app.services.es_review.models import LLMInfo, ReviewMeta


ROOT = Path(__file__).resolve().parents[3]
CONTRACT_PATH = ROOT / "src/shared/contracts/es-review-sse.ts"


def _read_contract_values(const_name: str) -> list[str]:
    source = CONTRACT_PATH.read_text(encoding="utf-8")
    match = re.search(
        rf"export const {const_name} = \[(?P<body>.*?)\] as const;",
        source,
        flags=re.S,
    )
    assert match, f"{const_name} is missing from {CONTRACT_PATH}"
    return re.findall(r'"([^"]+)"', match.group("body"))


def _enum_values(enum_class: Type) -> list[str]:
    return [member.value for member in enum_class]


def test_python_enum_values_match_typescript_contract() -> None:
    expected = {
        "VALIDATION_FAILURE_CODES": ValidationFailureCode,
        "GROUNDING_MODES": GroundingMode,
        "GROUNDING_LEVELS": GroundingLevel,
        "EVIDENCE_COVERAGE_LEVELS": EvidenceCoverageLevel,
        "VALIDATION_STATUSES": ValidationStatus,
        "FINAL_ACCEPTANCE_SOURCES": FinalAcceptanceSource,
        "HALLUCINATION_GUARD_MODES": HallucinationGuardMode,
        "CLASSIFICATION_CONFIDENCES": ClassificationConfidence,
        "COMPANY_GROUNDING_POLICIES": CompanyGroundingPolicy,
        "LENGTH_POLICIES": LengthPolicy,
        "REFERENCE_PROFILE_VARIANCES": ReferenceProfileVariance,
    }

    for const_name, enum_class in expected.items():
        assert _read_contract_values(const_name) == _enum_values(enum_class)


def test_public_sse_event_types_are_explicit() -> None:
    assert _read_contract_values("PUBLIC_SSE_EVENT_TYPES") == [
        "progress",
        "complete",
        "error",
        "rewrite_delta",
        "rewrite_complete",
        "explanation_complete",
        "source_added",
    ]


def test_review_meta_submodels_are_excluded_from_wire_dump() -> None:
    meta = ReviewMeta(
        llm_provider="openai",
        llm_model="gpt-5.1",
        llm_info=LLMInfo(provider="openai", model="gpt-5.1", model_alias="fast"),
    )

    dumped = meta.model_dump()
    assert dumped["llm_provider"] == "openai"
    assert "llm_info" not in dumped
