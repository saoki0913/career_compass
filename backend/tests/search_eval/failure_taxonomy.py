"""
Hierarchical failure root cause classification.

Taxonomy:
  A. Query-Level Issues (DDG returned nothing useful)
     A.1 empty_response    — DDG returned 0 results
     A.2 rate_limited      — DDG throttling/error
     A.3 query_ambiguity   — Company name too generic

  B. Domain Pattern Issues (results exist but is_official matching fails)
     B.1 pattern_missing   — No patterns in company_mappings
     B.2 pattern_mismatch  — Pattern doesn't match actual domain
     B.3 pattern_too_narrow — Sub-domain not covered

  C. Ranking Issues (official exists but ranked too low)
     C.1 low_rerank_score  — Cross-encoder assigned low relevance
     C.2 low_rrf_score     — Low frequency across query variations
     C.3 competitor_dominance — Non-official outscored

  D. Filtering Issues (raw has official but candidates don't)
     D.1 candidate_filter  — Post-ranking filter removed official
     D.2 aggregator_penalty — Incorrectly classified as aggregator
"""

from __future__ import annotations

import re
from collections import Counter
from typing import Any
from urllib.parse import urlparse

from tests.search_eval.models import HybridRawResult, RunRecord


def _name_fragments(name: str) -> list[str]:
    """Extract potential domain fragments from company name."""
    clean = re.sub(r"(株式会社|ホールディングス|グループ|HD|（.*?）|\(.*?\))", "", name)
    clean = clean.strip()
    fragments = [clean.lower().replace(" ", "").replace("　", "")]
    return [f for f in fragments if len(f) >= 2]


def classify_failure(record: RunRecord) -> str:
    """Classify a failed run into the root cause taxonomy.

    Returns a string like "A.1:empty_response" or "PASS" if not failed.
    """
    j = record.judgment
    if not j or j.passed:
        return "PASS"

    candidates = record.candidates
    raw: list[Any] = record.hybrid_raw_top or record.legacy_raw_top

    # Category A: No results at all
    if not candidates and not raw:
        if record.error:
            err_lower = (record.error or "").lower()
            if "rate" in err_lower or "429" in err_lower or "throttl" in err_lower:
                return "A.2:rate_limited"
            return "A.1:empty_response"
        name = record.company_name
        # Short/ambiguous names
        if len(name) <= 3 or all(c.isascii() and c.isalpha() for c in name.replace(" ", "")):
            return "A.3:query_ambiguity"
        return "A.1:empty_response"

    # Category D: Raw has results but candidates empty
    if not candidates and raw:
        has_official_in_raw = _any_official(raw)
        if has_official_in_raw:
            return "D.1:candidate_filter"
        # Results exist but none is_official -> likely domain pattern issue
        return "B.2:pattern_mismatch"

    # Category B/C: Has candidates but official not in top-N
    if candidates:
        official_raw_rank = _find_official_rank_in_raw(raw)

        if official_raw_rank is not None:
            # Official exists in raw but not top-5 candidates
            if official_raw_rank <= 5:
                return "D.1:candidate_filter"
            else:
                # Check why it's ranked low
                item = raw[official_raw_rank - 1]
                rerank = _get_score(item, "rerank_score")
                rrf = _get_score(item, "rrf_score")
                if rerank < 0.3:
                    return "C.1:low_rerank_score"
                elif rrf < 0.005:
                    return "C.2:low_rrf_score"
                else:
                    return "C.3:competitor_dominance"
        else:
            # Official not found in any results
            # Check if top candidate domain looks like it should be official
            if candidates:
                top_url = candidates[0].get("url", "")
                try:
                    top_domain = urlparse(top_url).netloc.lower()
                except Exception:
                    top_domain = ""
                name_frags = _name_fragments(record.company_name)
                if any(frag in top_domain for frag in name_frags if frag):
                    return "B.2:pattern_mismatch"

            return "B.1:pattern_missing"

    return "A.1:empty_response"


def _any_official(raw: list[Any]) -> bool:
    """Check if any item in raw results has is_official=True."""
    for item in raw:
        if isinstance(item, HybridRawResult):
            if item.is_official:
                return True
        elif isinstance(item, dict):
            if item.get("is_official", False):
                return True
    return False


def _find_official_rank_in_raw(raw: list[Any]) -> int | None:
    """Find 1-indexed rank of first official result in raw."""
    for idx, item in enumerate(raw):
        if isinstance(item, HybridRawResult):
            if item.is_official:
                return idx + 1
        elif isinstance(item, dict):
            if item.get("is_official", False):
                return idx + 1
    return None


def _get_score(item: Any, field: str) -> float:
    """Safely extract a score field from raw result."""
    if isinstance(item, HybridRawResult):
        return float(getattr(item, field, 0.0) or 0.0)
    elif isinstance(item, dict):
        return float(item.get(field, 0.0) or 0.0)
    return 0.0


class FailureTaxonomy:
    """Aggregate failure classifications across runs."""

    def __init__(self, records: list[RunRecord]):
        self.records = [
            r for r in records
            if r.mode != "meta" and r.kind != "company_context"
        ]

    def classify_all(self) -> dict[str, str]:
        """Classify all failed runs. Returns {run_key: category}."""
        result: dict[str, str] = {}
        for r in self.records:
            if r.judgment and not r.judgment.passed:
                key = f"{r.company_name}::{r.mode}::{r.kind}"
                result[key] = classify_failure(r)
        return result

    def aggregate_by_category(self) -> dict[str, int]:
        """Count failures by taxonomy category."""
        counts: Counter[str] = Counter()
        for r in self.records:
            if r.judgment and not r.judgment.passed:
                counts[classify_failure(r)] += 1
        return dict(counts.most_common())

    def aggregate_by_mode(self) -> dict[str, dict[str, int]]:
        """Count failures by mode and category."""
        by_mode: dict[str, Counter[str]] = {}
        for r in self.records:
            if r.judgment and not r.judgment.passed:
                by_mode.setdefault(r.mode, Counter())
                by_mode[r.mode][classify_failure(r)] += 1
        return {m: dict(c.most_common()) for m, c in by_mode.items()}

    def aggregate_by_industry(
        self,
        company_industry_map: dict[str, str],
    ) -> dict[str, dict[str, int]]:
        """Cross-tabulate failure categories by industry."""
        by_industry: dict[str, Counter[str]] = {}
        for r in self.records:
            if r.judgment and not r.judgment.passed:
                industry = company_industry_map.get(r.company_name, "unknown")
                by_industry.setdefault(industry, Counter())
                by_industry[industry][classify_failure(r)] += 1
        return {ind: dict(c.most_common()) for ind, c in by_industry.items()}
