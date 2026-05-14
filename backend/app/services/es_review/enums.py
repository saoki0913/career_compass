"""Wire-compatible enum definitions for ES review contracts."""

from __future__ import annotations

from enum import Enum


class ValidationFailureCode(str, Enum):
    OK = "ok"
    SOFT_OK = "soft_ok"
    EMPTY = "empty"
    FRAGMENT = "fragment"
    UNDER_MIN = "under_min"
    OVER_MAX = "over_max"
    HALLUCINATION = "hallucination"
    FACT_PRESERVATION = "fact_preservation"
    NEGATIVE_SELF_EVAL = "negative_self_eval"
    COMPANY_REFERENCE_IN_COMPANYLESS = "company_reference_in_companyless"
    BULLETISH_OR_LISTLIKE = "bulletish_or_listlike"
    STYLE = "style"
    ANSWER_FOCUS = "answer_focus"
    VERBOSE_OPENING = "verbose_opening"
    STRUCTURE = "structure"
    GROUNDING = "grounding"
    QUANTIFY = "quantify"
    LLM_QUALITY = "llm_quality"
    GENERIC = "generic"


class GroundingMode(str, Enum):
    NONE = "none"
    COMPANY_GENERAL = "company_general"
    ROLE_GROUNDED = "role_grounded"


class GroundingLevel(str, Enum):
    NONE = "none"
    LIGHT = "light"
    STANDARD = "standard"
    DEEP = "deep"


class EvidenceCoverageLevel(str, Enum):
    NOT_APPLICABLE = "not_applicable"
    NONE = "none"
    WEAK = "weak"
    PARTIAL = "partial"
    STRONG = "strong"


class ValidationStatus(str, Enum):
    STRICT_OK = "strict_ok"
    SOFT_OK = "soft_ok"
    DEGRADED = "degraded"


class FinalAcceptanceSource(str, Enum):
    REWRITE = "rewrite"
    SAFE_REWRITE = "safe_rewrite"
    DEGRADED_BEST_EFFORT = "degraded_best_effort"


class HallucinationGuardMode(str, Enum):
    ADVISORY = "advisory"
    HARD_BLOCK = "hard_block"
    STRICT = "strict"


class CompanyGroundingPolicy(str, Enum):
    REQUIRED = "required"
    ASSISTIVE = "assistive"


class ClassificationConfidence(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class LengthPolicy(str, Enum):
    STRICT = "strict"
    SOFT_OK = "soft_ok"


class ReferenceProfileVariance(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


__all__ = [
    "ClassificationConfidence",
    "CompanyGroundingPolicy",
    "EvidenceCoverageLevel",
    "FinalAcceptanceSource",
    "GroundingLevel",
    "GroundingMode",
    "HallucinationGuardMode",
    "LengthPolicy",
    "ReferenceProfileVariance",
    "ValidationFailureCode",
    "ValidationStatus",
]
