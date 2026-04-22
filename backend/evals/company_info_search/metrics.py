"""
IR metrics computation for search evaluation.

Provides:
- MRR (Mean Reciprocal Rank) at candidate and raw levels
- Precision@K and Hit Rate@K
- NDCG with graded relevance
- Score distribution analysis
- Summary statistics (backward compatible)
"""

from __future__ import annotations

import math
from collections import Counter
from dataclasses import dataclass, field
from typing import Any, Optional

from evals.company_info_search.models import (
    HybridRawResult,
    JudgmentGrade,
    RunJudgment,
    RunRecord,
)


# =========================================================================
# Graded Relevance for NDCG
# =========================================================================

def compute_relevance_grade(
    raw_result: dict[str, Any] | HybridRawResult,
    kind: str,
) -> int:
    """Assign graded relevance 0-3 to a search result.

    Grade 3 (Perfect): Official domain + correct content type + year match
    Grade 2 (Highly Relevant): Official domain + correct content type
    Grade 1 (Partially Relevant): Official domain wrong section / related company right content
    Grade 0 (Not Relevant): Non-official domain
    """
    if isinstance(raw_result, HybridRawResult):
        is_official = raw_result.is_official
        is_subsidiary = raw_result.is_subsidiary
        is_parent = raw_result.is_parent
        company_matched = raw_result.company_name_matched
        year_matched = raw_result.year_matched
        url = raw_result.url
    else:
        is_official = raw_result.get("is_official", False)
        is_subsidiary = raw_result.get("is_subsidiary", False)
        is_parent = raw_result.get("is_parent", False)
        company_matched = raw_result.get("company_name_matched", False)
        year_matched = raw_result.get("year_matched", False)
        url = raw_result.get("url", "")

    if not is_official and not is_subsidiary and not is_parent:
        return 0

    # Determine content type match from URL
    url_lower = url.lower()

    if kind.startswith("content_type:"):
        from evals.company_info_search.fixtures.search_expectations import _url_has_content_pattern

        content_type = kind.split(":", 1)[1]
        url_pattern_ok = _url_has_content_pattern(url, content_type)
    elif kind.startswith("recruitment_"):
        url_pattern_ok = any(
            pat in url_lower
            for pat in [
                "/recruit", "/career", "/saiyo", "/saiyou",
                "/newgrad", "/intern", "/entry", "/fresh",
                "/graduate", "/careers",
            ]
        )
    else:
        url_pattern_ok = True

    if is_official:
        if url_pattern_ok:
            if kind.startswith("recruitment_") and year_matched:
                return 3  # Perfect: official + content match + year
            elif kind.startswith("content_type:"):
                return 3  # Perfect for corporate (no year requirement)
            else:
                return 2  # Highly relevant: official + content match
        else:
            return 2  # Official domain without exact URL pattern is still highly relevant

    # Subsidiary or parent
    if (is_subsidiary or is_parent) and url_pattern_ok and company_matched:
        return 1

    return 0


# =========================================================================
# MRR
# =========================================================================

def compute_mrr(
    records: list[RunRecord],
    mode: str,
) -> dict[str, Any]:
    """Compute MRR at candidate and raw levels.

    Returns:
        {
            "candidate_mrr": float,
            "raw_mrr": float,
            "candidate_rrs": list[float],  # per-query for statistical testing
            "raw_rrs": list[float],
        }
    """
    candidate_rrs: list[float] = []
    raw_rrs: list[float] = []

    for r in records:
        if r.mode != mode or r.kind == "company_context":
            continue

        j = r.judgment
        # Candidate-level RR
        if j and j.official_found and j.official_rank:
            candidate_rrs.append(1.0 / j.official_rank)
        else:
            candidate_rrs.append(0.0)

        # Raw-level RR
        raw_items = r.hybrid_raw_top or r.legacy_raw_top
        raw_rr = 0.0
        for idx, item in enumerate(raw_items):
            is_off = (
                item.is_official
                if isinstance(item, HybridRawResult)
                else item.get("is_official", False)
            )
            if is_off:
                raw_rr = 1.0 / (idx + 1)
                break
        raw_rrs.append(raw_rr)

    return {
        "candidate_mrr": sum(candidate_rrs) / len(candidate_rrs) if candidate_rrs else 0.0,
        "raw_mrr": sum(raw_rrs) / len(raw_rrs) if raw_rrs else 0.0,
        "candidate_rrs": candidate_rrs,
        "raw_rrs": raw_rrs,
    }


# =========================================================================
# Precision@K and Hit Rate@K
# =========================================================================

def compute_precision_hit_rate(
    records: list[RunRecord],
    mode: str,
    k_values: list[int] | None = None,
) -> dict[str, Any]:
    """Compute Precision@K and Hit Rate@K.

    Returns dict with keys like "hit_rate@1", "precision@5", etc.
    Also includes per-query hit vectors for statistical testing.
    """
    if k_values is None:
        k_values = [1, 3, 5, 10]

    results: dict[str, Any] = {}

    for k in k_values:
        hits: list[int] = []  # 1/0 per query
        precision_sum = 0.0
        total = 0

        for r in records:
            if r.mode != mode or r.kind == "company_context":
                continue
            total += 1

            raw_items = r.hybrid_raw_top or r.legacy_raw_top
            top_k = raw_items[:k]

            n_relevant = 0
            for item in top_k:
                is_off = (
                    item.is_official
                    if isinstance(item, HybridRawResult)
                    else item.get("is_official", False)
                )
                if is_off:
                    n_relevant += 1

            hits.append(1 if n_relevant > 0 else 0)
            precision_sum += n_relevant / k if top_k else 0

        results[f"hit_rate@{k}"] = sum(hits) / total if total else 0.0
        results[f"precision@{k}"] = precision_sum / total if total else 0.0
        results[f"hit_vector@{k}"] = hits

    return results


# =========================================================================
# NDCG
# =========================================================================

def _dcg_at_k(relevances: list[float], k: int) -> float:
    """Compute DCG@K with log2 discounting."""
    dcg = 0.0
    for i, rel in enumerate(relevances[:k]):
        dcg += rel / math.log2(i + 2)
    return dcg


def _ndcg_at_k(relevances: list[float], k: int) -> float:
    """Compute NDCG@K."""
    actual_dcg = _dcg_at_k(relevances, k)
    ideal_relevances = sorted(relevances, reverse=True)
    ideal_dcg = _dcg_at_k(ideal_relevances, k)
    if ideal_dcg == 0:
        return 0.0
    return actual_dcg / ideal_dcg


def compute_ndcg(
    records: list[RunRecord],
    mode: str,
    k_values: list[int] | None = None,
) -> dict[str, Any]:
    """Compute mean NDCG@K across all runs.

    Returns dict with keys like "ndcg@5", each containing
    {"mean": float, "median": float, "std": float, "per_query": list[float]}.
    """
    if k_values is None:
        k_values = [3, 5, 10]

    results: dict[str, Any] = {}
    for k in k_values:
        ndcg_scores: list[float] = []
        for r in records:
            if r.mode != mode or r.kind == "company_context":
                continue
            raw_items = r.hybrid_raw_top or r.legacy_raw_top
            relevances = [
                float(compute_relevance_grade(item, r.kind)) for item in raw_items
            ]
            ndcg = _ndcg_at_k(relevances, k)
            ndcg_scores.append(ndcg)

        if ndcg_scores:
            mean = sum(ndcg_scores) / len(ndcg_scores)
            sorted_scores = sorted(ndcg_scores)
            median = sorted_scores[len(sorted_scores) // 2]
            variance = sum((x - mean) ** 2 for x in ndcg_scores) / len(ndcg_scores)
            std = variance ** 0.5
        else:
            mean = median = std = 0.0

        results[f"ndcg@{k}"] = {
            "mean": round(mean, 4),
            "median": round(median, 4),
            "std": round(std, 4),
            "per_query": ndcg_scores,
        }

    return results


# =========================================================================
# Score Distribution Analysis
# =========================================================================

def _compute_stats(values: list[float]) -> dict[str, Any]:
    """Compute summary statistics for a list of values."""
    if not values:
        return {"n": 0}
    values_sorted = sorted(values)
    n = len(values)
    mean = sum(values) / n
    variance = sum((x - mean) ** 2 for x in values) / n
    return {
        "n": n,
        "mean": round(mean, 4),
        "median": round(values_sorted[n // 2], 4),
        "std": round(variance ** 0.5, 4),
        "p5": round(values_sorted[max(0, int(n * 0.05))], 4),
        "p25": round(values_sorted[int(n * 0.25)], 4),
        "p75": round(values_sorted[int(n * 0.75)], 4),
        "p95": round(values_sorted[min(n - 1, int(n * 0.95))], 4),
        "min": round(values_sorted[0], 4),
        "max": round(values_sorted[-1], 4),
    }


def compute_score_distributions(
    records: list[RunRecord],
    mode: str,
) -> dict[str, Any]:
    """Compute score distributions, separated by official/non-official."""
    official_scores: dict[str, list[float]] = {"combined": [], "rrf": [], "rerank": []}
    other_scores: dict[str, list[float]] = {"combined": [], "rrf": [], "rerank": []}

    for r in records:
        if r.mode != mode or r.kind == "company_context":
            continue
        for item in r.hybrid_raw_top:
            bucket = official_scores if item.is_official else other_scores
            bucket["combined"].append(item.combined_score)
            bucket["rrf"].append(item.rrf_score)
            bucket["rerank"].append(item.rerank_score)

    return {
        "official": {k: _compute_stats(v) for k, v in official_scores.items()},
        "non_official": {k: _compute_stats(v) for k, v in other_scores.items()},
    }


# =========================================================================
# Grade Distribution
# =========================================================================

def compute_grade_distribution(
    records: list[RunRecord],
    mode: str,
) -> dict[str, int]:
    """Count judgments by grade."""
    dist: dict[str, int] = {g.value: 0 for g in JudgmentGrade}
    for r in records:
        if r.mode != mode or r.kind == "company_context":
            continue
        if r.judgment:
            dist[r.judgment.grade.value] += 1
    return dist


# =========================================================================
# Legacy Summary Stats (backward compatible)
# =========================================================================

def _rate(passed: int, total: int) -> float:
    return round(passed / total, 4) if total > 0 else 0.0


def _stat(records: list[RunRecord]) -> dict[str, Any]:
    total = len(records)
    passed = sum(1 for r in records if r.judgment and r.judgment.passed)
    hard_passed = sum(1 for r in records if r.judgment and r.judgment.hard_pass)
    soft_failed = sum(1 for r in records if r.judgment and r.judgment.gate_level.value == "soft_fail")
    hard_failed = sum(1 for r in records if r.judgment and r.judgment.gate_level.value == "hard_fail")
    errors = sum(1 for r in records if r.error)
    return {
        "total": total,
        "passed": passed,
        "failed": total - passed,
        "errors": errors,
        "rate": _rate(passed, total),
        "hard_passed": hard_passed,
        "soft_failed": soft_failed,
        "hard_failed": hard_failed,
        "hard_pass_rate": _rate(hard_passed, total),
        "soft_fail_rate": _rate(soft_failed, total),
        "hard_fail_rate": _rate(hard_failed, total),
    }


class MetricsComputer:
    """Compute comprehensive search evaluation metrics."""

    def compute(
        self,
        run_records: list[RunRecord],
        modes: list[str],
        company_industry_map: dict[str, str],
    ) -> dict[str, Any]:
        """Compute all metrics: legacy summary + IR metrics.

        Returns a dict compatible with the existing summary format,
        plus additional ir_metrics, grade_distribution, and score_distributions.
        """
        search_runs = [
            r for r in run_records
            if r.mode != "meta" and r.kind != "company_context"
        ]

        # ------------------------------------------------------------------
        # Legacy summary stats (backward compatible)
        # ------------------------------------------------------------------
        overall: dict[str, Any] = {}
        for mode in modes:
            mode_runs = [r for r in search_runs if r.mode == mode]
            overall[mode] = _stat(mode_runs)

        recruitment: dict[str, Any] = {}
        for mode in modes:
            mode_runs = [
                r for r in search_runs
                if r.mode == mode and r.kind.startswith("recruitment_")
            ]
            recruitment[mode] = _stat(mode_runs)

        corporate: dict[str, Any] = {}
        for mode in modes:
            mode_runs = [
                r for r in search_runs
                if r.mode == mode and r.kind.startswith("content_type:")
            ]
            corporate[mode] = _stat(mode_runs)

        all_kinds = sorted(set(r.kind for r in search_runs))
        by_content_type: dict[str, dict[str, Any]] = {}
        for kind in all_kinds:
            by_content_type[kind] = {}
            for mode in modes:
                mode_runs = [r for r in search_runs if r.mode == mode and r.kind == kind]
                by_content_type[kind][mode] = _stat(mode_runs)

        all_industries = sorted(set(company_industry_map.values()))
        by_industry: dict[str, dict[str, Any]] = {}
        for industry in all_industries:
            industry_companies = {
                c for c, ind in company_industry_map.items() if ind == industry
            }
            by_industry[industry] = {}
            for mode in modes:
                mode_runs = [
                    r for r in search_runs
                    if r.mode == mode and r.company_name in industry_companies
                ]
                by_industry[industry][mode] = _stat(mode_runs)

        # Metadata accuracy
        metadata_accuracy: dict[str, dict[str, Any]] = {}
        metadata_fields = [
            "source_type_correct",
            "company_match_correct",
            "year_match_correct",
            "confidence_appropriate",
            "url_pattern_match",
        ]
        for mf in metadata_fields:
            metadata_accuracy[mf] = {}
            for mode in modes:
                mode_runs = [
                    r for r in search_runs
                    if r.mode == mode and r.judgment and not r.error
                ]
                if mf == "year_match_correct":
                    mode_runs = [r for r in mode_runs if r.kind.startswith("recruitment_")]
                elif mf == "url_pattern_match":
                    mode_runs = [r for r in mode_runs if r.kind.startswith("content_type:")]

                total = len(mode_runs)
                correct = sum(1 for r in mode_runs if getattr(r.judgment, mf, False))
                metadata_accuracy[mf][mode] = {
                    "correct": correct,
                    "total": total,
                    "rate": _rate(correct, total),
                }

        # Failure analysis (legacy)
        failure_reasons: Counter[str] = Counter()
        failure_codes: Counter[str] = Counter()
        failure_codes_by_kind: dict[str, Counter[str]] = {}
        failure_codes_by_mode: dict[str, Counter[str]] = {}
        failing_companies: Counter[str] = Counter()
        for r in search_runs:
            if r.judgment and not r.judgment.passed:
                for reason in r.judgment.failure_reasons:
                    failure_reasons[reason] += 1
                for code in r.judgment.failure_codes:
                    failure_codes[code] += 1
                    failure_codes_by_kind.setdefault(r.kind, Counter())
                    failure_codes_by_kind[r.kind][code] += 1
                    failure_codes_by_mode.setdefault(r.mode, Counter())
                    failure_codes_by_mode[r.mode][code] += 1
                failing_companies[r.company_name] += 1

        # ------------------------------------------------------------------
        # NEW: IR Metrics
        # ------------------------------------------------------------------
        ir_metrics: dict[str, Any] = {}
        grade_distributions: dict[str, Any] = {}
        score_dists: dict[str, Any] = {}

        for mode in modes:
            mrr = compute_mrr(search_runs, mode)
            pk_hr = compute_precision_hit_rate(search_runs, mode)
            ndcg = compute_ndcg(search_runs, mode)
            grades = compute_grade_distribution(search_runs, mode)
            scores = compute_score_distributions(search_runs, mode)

            # Mean grade score
            mode_runs = [r for r in search_runs if r.mode == mode and r.judgment]
            mean_grade = (
                sum(r.judgment.grade_score for r in mode_runs) / len(mode_runs)
                if mode_runs
                else 0.0
            )

            ir_metrics[mode] = {
                "candidate_mrr": round(mrr["candidate_mrr"], 4),
                "raw_mrr": round(mrr["raw_mrr"], 4),
                "mean_grade_score": round(mean_grade, 4),
                # Flatten hit_rate and precision
                **{
                    k: round(v, 4)
                    for k, v in pk_hr.items()
                    if not k.startswith("hit_vector")
                },
                # NDCG means
                **{
                    k: v["mean"]
                    for k, v in ndcg.items()
                },
            }

            # Store per-query vectors for statistical testing (not serialized to JSON)
            ir_metrics[f"{mode}_per_query"] = {
                "candidate_rrs": mrr["candidate_rrs"],
                "raw_rrs": mrr["raw_rrs"],
                **{k: v for k, v in pk_hr.items() if k.startswith("hit_vector")},
                **{k: v["per_query"] for k, v in ndcg.items()},
            }

            grade_distributions[mode] = grades
            score_dists[mode] = scores

        # ------------------------------------------------------------------
        # Mode comparison
        # ------------------------------------------------------------------
        mode_comparison: dict[str, Any] = {}
        if len(modes) >= 2:
            mode_a, mode_b = modes[0], modes[1]
            hits_a: dict[tuple, int] = {}
            hits_b: dict[tuple, int] = {}
            for r in search_runs:
                key = (r.company_name, r.kind)
                hit = 1 if (r.judgment and r.judgment.passed) else 0
                if r.mode == mode_a:
                    hits_a[key] = hit
                elif r.mode == mode_b:
                    hits_b[key] = hit

            common = sorted(set(hits_a.keys()) & set(hits_b.keys()))
            a_only = sum(1 for k in common if hits_a[k] == 1 and hits_b[k] == 0)
            b_only = sum(1 for k in common if hits_a[k] == 0 and hits_b[k] == 1)
            both_pass = sum(1 for k in common if hits_a[k] == 1 and hits_b[k] == 1)
            both_fail = sum(1 for k in common if hits_a[k] == 0 and hits_b[k] == 0)

            mode_comparison = {
                "pair": f"{mode_a}_vs_{mode_b}",
                f"{mode_a}_only_pass": a_only,
                f"{mode_b}_only_pass": b_only,
                "both_pass": both_pass,
                "both_fail": both_fail,
                "net_advantage": (
                    f"{mode_a}+{a_only - b_only}"
                    if a_only >= b_only
                    else f"{mode_b}+{b_only - a_only}"
                ),
            }

        return {
            # Legacy structure
            "overall": overall,
            "recruitment": recruitment,
            "corporate": corporate,
            "by_content_type": by_content_type,
            "by_industry": by_industry,
            "metadata_accuracy": metadata_accuracy,
            "failure_analysis": {
                "top_reasons": failure_reasons.most_common(10),
                "top_failure_codes": failure_codes.most_common(15),
                "failure_codes_by_kind": {
                    kind: counter.most_common(10)
                    for kind, counter in failure_codes_by_kind.items()
                },
                "failure_codes_by_mode": {
                    mode: counter.most_common(10)
                    for mode, counter in failure_codes_by_mode.items()
                },
                "failing_companies": failing_companies.most_common(10),
            },
            # New IR metrics
            "ir_metrics": ir_metrics,
            "grade_distribution": grade_distributions,
            "score_distributions": score_dists,
            "mode_comparison": mode_comparison,
        }
