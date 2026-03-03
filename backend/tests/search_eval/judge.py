"""
Result judgment with graded scoring.

Wraps existing judgment logic from search_expectations.py and adds
JudgmentGrade for finer-grained evaluation.
"""

from __future__ import annotations

from dataclasses import asdict
from typing import Any, Optional

from tests.fixtures.search_expectations import (
    RunJudgment as LegacyRunJudgment,
    judge_corporate_run,
    judge_recruitment_run,
)
from tests.search_eval.models import (
    GateLevel,
    HybridRawResult,
    JudgmentGrade,
    RunJudgment,
    RunRecord,
)
from tests.search_eval.config import SearchTestConfig


def _compute_metadata_score(judgment: RunJudgment, kind: str) -> float:
    """Compute composite metadata correctness score (0-1).

    Weights:
    - source_type_correct: 0.25
    - company_match_correct: 0.25
    - confidence_appropriate: 0.20
    - year_match_correct (recruitment only): 0.15
    - url_pattern_match (corporate only): 0.15
    """
    score = 0.0
    total_weight = 0.0

    score += 0.25 * int(judgment.source_type_correct)
    total_weight += 0.25

    score += 0.25 * int(judgment.company_match_correct)
    total_weight += 0.25

    score += 0.20 * int(judgment.confidence_appropriate)
    total_weight += 0.20

    if kind.startswith("recruitment_"):
        score += 0.15 * int(judgment.year_match_correct)
        total_weight += 0.15
        # Remaining 0.15 for url_pattern not applicable
        total_weight += 0.15
        score += 0.15  # N/A = full credit
    elif kind.startswith("content_type:"):
        score += 0.15 * int(judgment.url_pattern_match)
        total_weight += 0.15
        # Remaining 0.15 for year_match not applicable
        total_weight += 0.15
        score += 0.15  # N/A = full credit
    else:
        total_weight += 0.30
        score += 0.30  # N/A = full credit

    return round(score / total_weight, 4) if total_weight > 0 else 0.0


def _compute_grade(
    rank: Optional[int],
    metadata_score: float,
    raw_official_rank: Optional[int],
) -> JudgmentGrade:
    """Assign grade based on rank and metadata quality.

    Grade assignment:
      rank 1 + metadata >= 0.7 -> PERFECT
      rank 1-3               -> GOOD
      rank 4-5               -> ACCEPTABLE
      raw_rank 1-10 (not in candidates) -> MARGINAL
      None or not found      -> FAIL
    """
    if rank is not None:
        if rank == 1 and metadata_score >= 0.7:
            return JudgmentGrade.PERFECT
        if rank <= 3:
            return JudgmentGrade.GOOD
        if rank <= 5:
            return JudgmentGrade.ACCEPTABLE

    # Not in candidates top-5 but in raw top-10
    if raw_official_rank is not None and raw_official_rank <= 10:
        return JudgmentGrade.MARGINAL

    return JudgmentGrade.FAIL


def _find_raw_official_rank(record: RunRecord) -> Optional[int]:
    """Find the 1-indexed rank of the first official result in raw results."""
    raw_items: list[Any] = []
    if record.hybrid_raw_top:
        raw_items = record.hybrid_raw_top
    elif record.legacy_raw_top:
        raw_items = record.legacy_raw_top

    for idx, item in enumerate(raw_items):
        if isinstance(item, HybridRawResult):
            if item.is_official:
                return idx + 1
        elif isinstance(item, dict):
            if item.get("is_official", False):
                return idx + 1

    return None


def _convert_legacy_judgment(
    legacy: LegacyRunJudgment,
    record: RunRecord,
) -> RunJudgment:
    """Convert a legacy RunJudgment to our enhanced RunJudgment with grade."""
    j = RunJudgment(
        passed=legacy.passed,
        official_found=legacy.official_found,
        official_rank=legacy.official_rank,
        source_type_correct=legacy.source_type_correct,
        company_match_correct=legacy.company_match_correct,
        year_match_correct=legacy.year_match_correct,
        url_pattern_match=legacy.url_pattern_match,
        confidence_appropriate=legacy.confidence_appropriate,
        details=legacy.details,
        failure_reasons=list(legacy.failure_reasons),
    )

    # Compute raw official rank
    j.raw_official_rank = _find_raw_official_rank(record)

    # Compute metadata score
    j.metadata_score = _compute_metadata_score(j, record.kind)

    # Compute grade
    if record.error:
        j.grade = JudgmentGrade.ERROR
    else:
        j.grade = _compute_grade(
            rank=j.official_rank,
            metadata_score=j.metadata_score,
            raw_official_rank=j.raw_official_rank,
        )
    j.grade_score = j.grade.score

    # Ensure passed is consistent with grade
    j.passed = j.grade.is_pass

    return j


def _required_signals_ok(judgment: RunJudgment, kind: str) -> bool:
    if not judgment.source_type_correct or not judgment.company_match_correct:
        return False
    if kind.startswith("recruitment_"):
        return judgment.year_match_correct
    if kind.startswith("content_type:"):
        return judgment.url_pattern_match
    return True


def _build_failure_codes(judgment: RunJudgment, kind: str) -> list[str]:
    codes: list[str] = []
    if not judgment.official_found:
        codes.append("no_official_in_top_n")
    if not judgment.source_type_correct:
        codes.append("wrong_source_type")
    if not judgment.company_match_correct:
        codes.append("company_name_mismatch")
    if not judgment.confidence_appropriate:
        codes.append("low_confidence")
    if kind.startswith("recruitment_") and not judgment.year_match_correct:
        codes.append("year_mismatch")
    if kind.startswith("content_type:") and not judgment.url_pattern_match:
        codes.append("url_pattern_mismatch")
    return codes


class ResultJudge:
    """Apply graded judgments to run records."""

    def __init__(self, config: SearchTestConfig):
        self.pass_top_n = config.pass_top_n
        self.hard_max_official_rank = config.hard_max_official_rank
        self.hard_min_metadata_score = config.hard_min_metadata_score
        self.soft_max_official_rank = config.soft_max_official_rank
        self.soft_min_metadata_score = config.soft_min_metadata_score
        self._patterns_cache: dict[str, list[str]] = {}

    def judge(self, record: RunRecord, domain_patterns: list[str]) -> RunJudgment:
        """Apply graded judgment to a completed run."""
        if record.error:
            return RunJudgment(
                passed=False,
                official_found=False,
                grade=JudgmentGrade.ERROR,
                grade_score=0.0,
                gate_level=GateLevel.HARD_FAIL,
                details=f"Error: {record.error[:200]}",
                failure_codes=["error"],
                failure_reasons=["error"],
            )

        # Build raw list (dicts) from either hybrid or legacy raw
        raw_dicts: list[dict[str, Any]] = []
        if record.hybrid_raw_top:
            raw_dicts = [asdict(r) for r in record.hybrid_raw_top]
        elif record.legacy_raw_top:
            raw_dicts = record.legacy_raw_top

        # Call existing judgment functions
        if record.kind.startswith("recruitment_"):
            legacy_j = judge_recruitment_run(
                candidates=record.candidates,
                raw_results=raw_dicts,
                domain_patterns=domain_patterns,
                top_n=self.pass_top_n,
            )
        elif record.kind.startswith("content_type:"):
            content_type = record.kind.split(":", 1)[1]
            legacy_j = judge_corporate_run(
                candidates=record.candidates,
                raw_results=raw_dicts,
                domain_patterns=domain_patterns,
                content_type=content_type,
                top_n=self.pass_top_n,
            )
        else:
            return RunJudgment(
                passed=True,
                official_found=True,
                grade=JudgmentGrade.PERFECT,
                grade_score=1.0,
                details="Meta/skip",
            )

        # Convert to enhanced judgment with grade
        judgment = _convert_legacy_judgment(legacy_j, record)
        judgment.failure_codes = _build_failure_codes(judgment, record.kind)

        required_ok = _required_signals_ok(judgment, record.kind)
        hard_rank_ok = (
            judgment.official_rank is not None
            and judgment.official_rank <= self.hard_max_official_rank
        )
        soft_rank_ok = (
            judgment.official_rank is not None
            and judgment.official_rank <= self.soft_max_official_rank
        )
        hard_metadata_ok = judgment.metadata_score >= self.hard_min_metadata_score
        soft_metadata_ok = judgment.metadata_score >= self.soft_min_metadata_score

        judgment.hard_pass = bool(
            judgment.official_found and hard_rank_ok and hard_metadata_ok and required_ok
        )
        judgment.soft_pass = bool(
            not judgment.hard_pass
            and judgment.official_found
            and soft_rank_ok
            and soft_metadata_ok
        )
        if judgment.hard_pass:
            judgment.gate_level = GateLevel.PASS
        elif judgment.soft_pass:
            judgment.gate_level = GateLevel.SOFT_FAIL
            if "metadata_below_threshold" not in judgment.failure_codes and not hard_metadata_ok:
                judgment.failure_codes.append("metadata_below_threshold")
        else:
            judgment.gate_level = GateLevel.HARD_FAIL

        if not hard_rank_ok and "official_rank_too_low" not in judgment.failure_codes:
            judgment.failure_codes.append("official_rank_too_low")
        if not hard_metadata_ok and "metadata_below_threshold" not in judgment.failure_codes:
            judgment.failure_codes.append("metadata_below_threshold")

        if record.error and "error" not in judgment.failure_codes:
            judgment.failure_codes.append("error")
        if not judgment.failure_codes and not judgment.hard_pass:
            judgment.failure_codes.append("quality_gate_failed")

        if judgment.failure_codes:
            judgment.failure_reasons = list(dict.fromkeys(judgment.failure_reasons + judgment.failure_codes))

        judgment.passed = judgment.hard_pass
        return judgment

    def judge_all(
        self,
        records: list[RunRecord],
        get_patterns_fn: Any = None,
    ) -> None:
        """Judge all records in-place.

        Args:
            get_patterns_fn: callable(company_name) -> list[str]
                Function to get domain patterns for a company.
                If None, uses cached patterns.
        """
        for record in records:
            if record.mode == "meta" and record.kind == "company_context":
                continue

            if record.company_name not in self._patterns_cache:
                if get_patterns_fn:
                    self._patterns_cache[record.company_name] = get_patterns_fn(
                        record.company_name
                    )
                else:
                    self._patterns_cache[record.company_name] = []

            patterns = self._patterns_cache[record.company_name]
            record.judgment = self.judge(record, patterns)
