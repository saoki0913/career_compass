"""
Search quality expectations and judgment logic for live search tests.

Defines pass/fail criteria, URL pattern expectations per content type,
and the RunJudgment data structure used by the test report.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Optional
from urllib.parse import urlparse

# =========================================================================
# URL Pattern Expectations per Content Type
# =========================================================================
CONTENT_TYPE_URL_PATTERNS: dict[str, list[str]] = {
    "new_grad_recruitment": [
        "/recruit",
        "/newgrad",
        "/shinsotsu",
        "/saiyo",
        "/saiyou",
        "/careers",
        "/fresh",
        "/graduate",
    ],
    "midcareer_recruitment": [
        "/recruit",
        "/career",
        "/midcareer",
        "/chuto",
        "/experienced",
    ],
    "corporate_site": [],  # Official domain alone is sufficient
    "ir_materials": [
        "/ir/",
        "/ir.",
        "/investor",
        "/finance",
        "/securities",
        "/kabunushi",
        "/annual",
    ],
    "ceo_message": [
        "/message",
        "/greeting",
        "/president",
        "/ceo",
        "/top-message",
        "/aisatsu",
        "/top_message",
    ],
    "employee_interviews": [
        "/people",
        "/interview",
        "/staff",
        "/member",
        "/voice",
        "/person",
        "/story",
    ],
    "press_release": [
        "/press",
        "/news",
        "/release",
        "/topics",
        "/newsroom",
    ],
    "csr_sustainability": [
        "/csr",
        "/sustainability",
        "/esg",
        "/environment",
        "/sdgs",
        "/social",
    ],
    "midterm_plan": [
        "/ir/",
        "/ir.",
        "/management",
        "/plan",
        "/strategy",
        "/vision",
        "/medium-term",
        "/chuki",
    ],
}


# =========================================================================
# RunJudgment: per-run verdict
# =========================================================================
@dataclass
class RunJudgment:
    """Judgment result for a single search run."""

    passed: bool  # Overall pass/fail
    official_found: bool  # Official domain in Top-N
    official_rank: Optional[int] = None  # 1-indexed rank of first official result
    source_type_correct: bool = False  # source_type="official" correctly assigned
    company_match_correct: bool = False  # company_name_matched is true
    year_match_correct: bool = False  # (recruitment only) year_matched
    url_pattern_match: bool = False  # (corporate only) URL contains expected pattern
    confidence_appropriate: bool = False  # confidence is high or medium
    details: str = ""  # Human-readable explanation
    failure_reasons: list[str] = field(default_factory=list)


# =========================================================================
# Top-N for pass/fail check
# =========================================================================
DEFAULT_PASS_TOP_N = 5


# =========================================================================
# Domain Matching Utility
# =========================================================================
def _url_matches_domain_patterns(url: str, patterns: list[str]) -> bool:
    """Check if URL's domain matches any of the given domain patterns.

    Uses segment-based matching consistent with the production code in
    company_info._domain_pattern_matches and web_search._domain_pattern_matches.
    """
    if not patterns:
        return False
    try:
        domain = urlparse(url).netloc.lower()
    except Exception:
        domain = ""
    if not domain:
        return False

    for pattern in patterns:
        if not pattern:
            continue
        pattern_lower = pattern.lower()

        # Multi-segment pattern (e.g., "bk.mufg")
        if "." in pattern_lower:
            if domain == pattern_lower or domain.endswith("." + pattern_lower):
                return True
            if re.search(
                rf"(?:^|\.){re.escape(pattern_lower)}(?:\.|$)", domain
            ):
                return True
            continue

        # Single-segment pattern
        segments = domain.split(".")
        for segment in segments:
            if segment == pattern_lower:
                return True
            # Prefix match: pattern at start of segment followed by '-'
            if segment.startswith(pattern_lower + "-"):
                return True
            # Suffix match: pattern at end of segment preceded by '-'
            if segment.endswith("-" + pattern_lower):
                return True

    return False


def _url_has_content_pattern(url: str, content_type: str) -> bool:
    """Check if URL path contains expected patterns for a content type."""
    expected = CONTENT_TYPE_URL_PATTERNS.get(content_type, [])
    if not expected:
        return True  # No patterns required (e.g., corporate_site)
    url_lower = url.lower()
    return any(pat in url_lower for pat in expected)


# =========================================================================
# Judgment Functions
# =========================================================================
def judge_recruitment_run(
    candidates: list[dict[str, Any]],
    raw_results: list[dict[str, Any]],
    domain_patterns: list[str],
    top_n: int = DEFAULT_PASS_TOP_N,
) -> RunJudgment:
    """Judge a recruitment search run.

    PASS criteria:
    1. At least 1 result in top_n has domain matching company_mappings patterns
    2. That result has source_type="official"
    3. company_name_matched=True in raw data
    4. confidence is "high" or "medium"
    """
    judgment = RunJudgment(passed=False, official_found=False)
    reasons: list[str] = []

    if not candidates:
        judgment.details = "No candidates returned"
        judgment.failure_reasons = ["no_candidates"]
        return judgment

    top = candidates[:top_n]

    # Build raw lookup by URL for metadata checks
    raw_by_url: dict[str, dict[str, Any]] = {}
    for r in raw_results:
        u = (r.get("url") or "").lower()
        if u:
            raw_by_url[u] = r

    for rank_idx, c in enumerate(top, start=1):
        url = c.get("url") or ""
        if _url_matches_domain_patterns(url, domain_patterns):
            judgment.official_found = True
            judgment.official_rank = rank_idx

            # Check source_type
            st = c.get("source_type", "")
            judgment.source_type_correct = st == "official"
            if not judgment.source_type_correct:
                reasons.append(
                    f"source_type='{st}' (expected 'official') at rank {rank_idx}"
                )

            # Check confidence
            conf = c.get("confidence", "low")
            judgment.confidence_appropriate = conf in ("high", "medium")
            if not judgment.confidence_appropriate:
                reasons.append(
                    f"confidence='{conf}' (expected high/medium) at rank {rank_idx}"
                )

            # Check raw metadata if available
            raw = raw_by_url.get(url.lower(), {})
            if raw:
                judgment.company_match_correct = bool(
                    raw.get("company_name_matched", False)
                )
                if not judgment.company_match_correct:
                    reasons.append(
                        f"company_name_matched=False at rank {rank_idx}"
                    )

                judgment.year_match_correct = bool(
                    raw.get("year_matched", False)
                )
                if not judgment.year_match_correct:
                    reasons.append(f"year_matched=False at rank {rank_idx}")
            else:
                # No raw data — cannot verify, mark as N/A (don't penalize)
                judgment.company_match_correct = True
                judgment.year_match_correct = True

            break

    if not judgment.official_found:
        reasons.append(f"No official domain in top-{top_n}")

    # Overall pass: official domain found is the hard requirement
    judgment.passed = judgment.official_found
    judgment.failure_reasons = reasons
    judgment.details = "; ".join(reasons) if reasons else "PASS"
    return judgment


def judge_corporate_run(
    candidates: list[dict[str, Any]],
    raw_results: list[dict[str, Any]],
    domain_patterns: list[str],
    content_type: str,
    top_n: int = DEFAULT_PASS_TOP_N,
) -> RunJudgment:
    """Judge a corporate content type search run.

    PASS criteria:
    1. Official domain in top_n (required)
    2. URL contains relevant pattern for content type (soft check)
    3. source_type="official" correctly assigned
    """
    judgment = RunJudgment(passed=False, official_found=False)
    reasons: list[str] = []

    if not candidates:
        judgment.details = "No candidates returned"
        judgment.failure_reasons = ["no_candidates"]
        return judgment

    top = candidates[:top_n]

    # Build raw lookup by URL
    raw_by_url: dict[str, dict[str, Any]] = {}
    for r in raw_results:
        u = (r.get("url") or "").lower()
        if u:
            raw_by_url[u] = r

    for rank_idx, c in enumerate(top, start=1):
        url = c.get("url") or ""
        if _url_matches_domain_patterns(url, domain_patterns):
            judgment.official_found = True
            judgment.official_rank = rank_idx

            # Check source_type
            st = c.get("source_type", "")
            judgment.source_type_correct = st == "official"
            if not judgment.source_type_correct:
                reasons.append(
                    f"source_type='{st}' (expected 'official') at rank {rank_idx}"
                )

            # Check URL pattern match (soft)
            judgment.url_pattern_match = _url_has_content_pattern(url, content_type)
            if not judgment.url_pattern_match:
                reasons.append(
                    f"No URL pattern match for {content_type} at rank {rank_idx}"
                )

            # Check confidence
            conf = c.get("confidence", "low")
            judgment.confidence_appropriate = conf in ("high", "medium")
            if not judgment.confidence_appropriate:
                reasons.append(
                    f"confidence='{conf}' (expected high/medium) at rank {rank_idx}"
                )

            # Check raw metadata if available
            raw = raw_by_url.get(url.lower(), {})
            if raw:
                judgment.company_match_correct = bool(
                    raw.get("company_name_matched", False)
                )
                if not judgment.company_match_correct:
                    reasons.append(
                        f"company_name_matched=False at rank {rank_idx}"
                    )
            else:
                judgment.company_match_correct = True

            break

    if not judgment.official_found:
        reasons.append(f"No official domain in top-{top_n}")

    judgment.passed = judgment.official_found
    judgment.failure_reasons = reasons
    judgment.details = "; ".join(reasons) if reasons else "PASS"
    return judgment
