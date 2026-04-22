from __future__ import annotations

import math
import statistics
from collections import defaultdict
from typing import Any


def weighted_cohens_kappa(
    scores_a: list[int],
    scores_b: list[int],
    num_categories: int = 6,
) -> float | None:
    if len(scores_a) != len(scores_b) or len(scores_a) < 2:
        return None
    if len(set(scores_a)) <= 1 or len(set(scores_b)) <= 1:
        return None

    total = len(scores_a)
    matrix = [[0.0 for _ in range(num_categories)] for _ in range(num_categories)]
    for a, b in zip(scores_a, scores_b, strict=True):
        if not 0 <= a < num_categories or not 0 <= b < num_categories:
            return None
        matrix[a][b] += 1.0

    row_marginals = [sum(row) for row in matrix]
    col_marginals = [sum(matrix[row][col] for row in range(num_categories)) for col in range(num_categories)]

    observed = 0.0
    expected = 0.0
    denom = float((num_categories - 1) ** 2) or 1.0
    for i in range(num_categories):
        for j in range(num_categories):
            weight = ((i - j) ** 2) / denom
            observed += weight * (matrix[i][j] / total)
            expected += weight * ((row_marginals[i] / total) * (col_marginals[j] / total))

    if math.isclose(expected, 0.0):
        return None
    return 1.0 - (observed / expected)


def _pearson_r(values_a: list[int], values_b: list[int]) -> float | None:
    if len(values_a) != len(values_b) or len(values_a) < 2:
        return None
    if len(set(values_a)) <= 1 or len(set(values_b)) <= 1:
        return None

    mean_a = statistics.fmean(values_a)
    mean_b = statistics.fmean(values_b)
    centered_a = [value - mean_a for value in values_a]
    centered_b = [value - mean_b for value in values_b]
    numerator = sum(a * b for a, b in zip(centered_a, centered_b, strict=True))
    denom_a = math.sqrt(sum(a * a for a in centered_a))
    denom_b = math.sqrt(sum(b * b for b in centered_b))
    if math.isclose(denom_a, 0.0) or math.isclose(denom_b, 0.0):
        return None
    return numerator / (denom_a * denom_b)


def compute_per_axis_agreement(
    claude_scores: list[dict[str, int]],
    judge_scores: list[dict[str, int]],
    axes: tuple[str, ...],
) -> dict[str, dict[str, Any]]:
    per_axis: dict[str, dict[str, Any]] = {}
    for axis in axes:
        claude_axis = [int(scores.get(axis, 0)) for scores in claude_scores]
        judge_axis = [int(scores.get(axis, 0)) for scores in judge_scores]
        paired_diffs = [abs(a - b) for a, b in zip(claude_axis, judge_axis, strict=True)]
        sample_size = len(paired_diffs)
        exact_matches = sum(1 for diff in paired_diffs if diff == 0)
        within_one = sum(1 for diff in paired_diffs if diff <= 1)
        per_axis[axis] = {
            "n": sample_size,
            "kappa": weighted_cohens_kappa(claude_axis, judge_axis),
            "pearson_r": _pearson_r(claude_axis, judge_axis),
            "mad": statistics.fmean(paired_diffs) if paired_diffs else None,
            "exact_match_pct": (exact_matches / sample_size) * 100 if sample_size else None,
            "within_1_pct": (within_one / sample_size) * 100 if sample_size else None,
        }
    return per_axis


def compute_overall_agreement(per_axis: dict[str, dict[str, Any]]) -> dict[str, Any]:
    kappas = [float(row["kappa"]) for row in per_axis.values() if row.get("kappa") is not None]
    mads = [float(row["mad"]) for row in per_axis.values() if row.get("mad") is not None]
    macro_kappa = statistics.fmean(kappas) if kappas else None
    mean_mad = statistics.fmean(mads) if mads else None

    if macro_kappa is None:
        calibration_label = "weak"
    elif macro_kappa >= 0.6:
        calibration_label = "strong"
    elif macro_kappa >= 0.4:
        calibration_label = "moderate"
    else:
        calibration_label = "weak"

    return {
        "macro_kappa": macro_kappa,
        "mean_mad": mean_mad,
        "calibration_label": calibration_label,
    }


def compute_faceted_agreement(
    claude_scores: list[dict[str, int]],
    judge_scores: list[dict[str, int]],
    cases: list[dict[str, Any]],
    axes: tuple[str, ...],
) -> dict[str, dict[str, dict[str, Any]]]:
    facets: dict[str, dict[str, dict[str, Any]]] = {}
    for facet_key in ("format", "strictness", "interviewer"):
        grouped_indices: dict[str, list[int]] = defaultdict(list)
        for index, case in enumerate(cases):
            grouped_indices[str(case.get(facet_key, "unknown"))].append(index)

        rows: dict[str, dict[str, Any]] = {}
        for facet_value, indices in grouped_indices.items():
            subset_claude = [claude_scores[index] for index in indices]
            subset_judge = [judge_scores[index] for index in indices]
            per_axis = compute_per_axis_agreement(subset_claude, subset_judge, axes)
            rows[facet_value] = {
                "n": len(indices),
                "macro_kappa": compute_overall_agreement(per_axis)["macro_kappa"],
            }
        facets[facet_key] = rows
    return facets
