"""
Data models for search evaluation.

Extracted from test_live_company_info_search_report.py (lines 249-278)
and search_expectations.py (lines 95-108), with additions for graded judgments.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from enum import Enum
from typing import Any, Optional


class JudgmentGrade(Enum):
    """Graded judgment replacing binary pass/fail.

    Provides finer-grained signal than the original boolean:
    - PERFECT/GOOD/ACCEPTABLE all map to passed=True for backward compat
    - MARGINAL captures "almost there" cases (raw results but not top-5)
    - FAIL/ERROR are clear failures
    """

    PERFECT = "perfect"       # rank 1 + metadata correct
    GOOD = "good"             # rank 1-3 + most metadata correct
    ACCEPTABLE = "acceptable" # rank 4-5
    MARGINAL = "marginal"     # rank 6-10 (in raw but not top-5 candidates)
    FAIL = "fail"             # official domain not found
    ERROR = "error"           # search error

    @property
    def score(self) -> float:
        """Numeric score for aggregation."""
        return _GRADE_SCORES[self]

    @property
    def is_pass(self) -> bool:
        """Backward-compatible pass check (grade <= ACCEPTABLE)."""
        return self in {JudgmentGrade.PERFECT, JudgmentGrade.GOOD, JudgmentGrade.ACCEPTABLE}


_GRADE_SCORES: dict[JudgmentGrade, float] = {
    JudgmentGrade.PERFECT: 1.0,
    JudgmentGrade.GOOD: 0.8,
    JudgmentGrade.ACCEPTABLE: 0.6,
    JudgmentGrade.MARGINAL: 0.3,
    JudgmentGrade.FAIL: 0.0,
    JudgmentGrade.ERROR: 0.0,
}


class GateLevel(Enum):
    """Gate result used by CI-style pass/fail logic."""

    PASS = "pass"
    SOFT_FAIL = "soft_fail"
    HARD_FAIL = "hard_fail"


@dataclass
class RunJudgment:
    """Judgment result for a single search run.

    Extends the original RunJudgment from search_expectations.py with:
    - grade: JudgmentGrade enum for finer-grained evaluation
    - raw_official_rank: rank of official result in pre-filter raw results
    - metadata_score: composite metadata correctness score (0-1)
    """

    passed: bool
    official_found: bool
    official_rank: Optional[int] = None
    raw_official_rank: Optional[int] = None  # rank in hybrid_raw_top (pre-filter)
    grade: JudgmentGrade = JudgmentGrade.FAIL
    grade_score: float = 0.0
    metadata_score: float = 0.0
    source_type_correct: bool = False
    company_match_correct: bool = False
    year_match_correct: bool = False
    url_pattern_match: bool = False
    confidence_appropriate: bool = False
    hard_pass: bool = False
    soft_pass: bool = False
    gate_level: GateLevel = GateLevel.HARD_FAIL
    failure_codes: list[str] = field(default_factory=list)
    details: str = ""
    failure_reasons: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dict, converting enum to string."""
        d = asdict(self)
        d["grade"] = self.grade.value
        d["gate_level"] = self.gate_level.value
        return d

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> RunJudgment:
        """Deserialize from dict."""
        d = dict(data)
        grade_str = d.pop("grade", "fail")
        gate_level_str = d.pop("gate_level", "hard_fail")
        try:
            grade = JudgmentGrade(grade_str)
        except ValueError:
            grade = JudgmentGrade.FAIL
        try:
            gate_level = GateLevel(gate_level_str)
        except ValueError:
            gate_level = GateLevel.HARD_FAIL
        return cls(grade=grade, gate_level=gate_level, **d)


@dataclass
class HybridRawResult:
    """Raw search result with all scoring signals.

    Extracted from test_live_company_info_search_report.py lines 249-263.
    """

    url: str
    domain: str = ""
    title: str = ""
    snippet: str = ""
    rrf_score: float = 0.0
    rerank_score: float = 0.0
    combined_score: float = 0.0
    source_type: str = ""
    is_official: bool = False
    is_parent: bool = False
    is_subsidiary: bool = False
    company_name_matched: bool = False
    year_matched: bool = False


@dataclass
class RunRecord:
    """Single search run result.

    Extracted from test_live_company_info_search_report.py lines 266-278.
    """

    mode: str
    kind: str
    company_name: str
    params: dict[str, Any] = field(default_factory=dict)
    queries: list[str] = field(default_factory=list)
    candidates: list[dict[str, Any]] = field(default_factory=list)
    hybrid_raw_top: list[HybridRawResult] = field(default_factory=list)
    legacy_raw_top: list[dict[str, Any]] = field(default_factory=list)
    error: Optional[str] = None
    judgment: Optional[RunJudgment] = None
    industry: Optional[str] = None
