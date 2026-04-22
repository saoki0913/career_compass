"""
Phase 3 comparison: before/after gakuchika baseline runs.

Loads two baseline run summaries (e.g. baseline_20260418 and after_phase2_20260418),
computes per-axis Δ + pooled σ + Δ/2σ ratio, and runs AB/BA pairwise judge on
training case drafts.

Usage:
    cd backend
    LIVE_AI_CONVERSATION_LLM_JUDGE=1 \
    python scripts/compare_gakuchika_runs.py \
        --before-label baseline_20260418 \
        --after-label after_phase2_20260418 \
        --output-dir ../docs/review/feature/gakuchika_baseline_runs

Outputs:
    <output-dir>/<after-label>_vs_<before-label>_comparison.json
    Console report with judgment per axis + pairwise winrate.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import math
import statistics
import sys
from pathlib import Path
from typing import Any

_BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

from tests.conversation.gakuchika_golden_set import HOLDOUT_CASES, TRAINING_CASES
from tests.conversation.judge_sampling import run_judge_pairwise_ab_ba

JUDGE_AXES_GAKUCHIKA = [
    "star_completeness",
    "user_fact_preservation",
    "logical_flow",
    "question_depth",
    "naturalness",
]


def _load_summary(output_dir: Path, label: str) -> dict[str, Any]:
    path = output_dir / f"{label}_summary.json"
    if not path.exists():
        raise SystemExit(f"summary not found: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def _load_drafts(output_dir: Path, label: str) -> list[dict[str, Any]]:
    path = output_dir / f"{label}_drafts.json"
    if not path.exists():
        raise SystemExit(f"drafts not found: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def _pooled_sd(values_a: list[int | float], values_b: list[int | float]) -> float:
    if len(values_a) < 2 and len(values_b) < 2:
        return 0.0
    n_a, n_b = len(values_a), len(values_b)
    var_a = statistics.pvariance(values_a) if n_a >= 2 else 0.0
    var_b = statistics.pvariance(values_b) if n_b >= 2 else 0.0
    pooled_var = ((n_a * var_a) + (n_b * var_b)) / max(n_a + n_b, 1)
    return math.sqrt(pooled_var)


def _axis_values(judge_per_case: dict[str, dict], axis: str) -> list[int]:
    """Flatten all per-sample raw values for an axis across all cases in a run."""
    values: list[int] = []
    for case in judge_per_case.values():
        axis_info = case.get("axes", {}).get(axis)
        if not axis_info:
            continue
        values.extend(axis_info.get("values", []))
    return values


def _per_case_axis_means(
    judge_per_case: dict[str, dict],
) -> dict[str, dict[str, float]]:
    out: dict[str, dict[str, float]] = {}
    for case_id, case in judge_per_case.items():
        out[case_id] = {
            axis: case.get("axes", {}).get(axis, {}).get("mean", 0.0)
            for axis in JUDGE_AXES_GAKUCHIKA
        }
    return out


def compute_axis_comparison(
    before: dict[str, Any], after: dict[str, Any], scope_case_ids: set[str]
) -> dict[str, dict[str, Any]]:
    before_jpc = before["judge_per_case"]
    after_jpc = after["judge_per_case"]

    out: dict[str, dict[str, Any]] = {}
    for axis in JUDGE_AXES_GAKUCHIKA:
        before_vals: list[int] = []
        after_vals: list[int] = []
        for case_id, case in before_jpc.items():
            if case_id not in scope_case_ids:
                continue
            before_vals.extend(case.get("axes", {}).get(axis, {}).get("values", []))
        for case_id, case in after_jpc.items():
            if case_id not in scope_case_ids:
                continue
            after_vals.extend(case.get("axes", {}).get(axis, {}).get("values", []))
        if not before_vals or not after_vals:
            continue
        before_mean = statistics.mean(before_vals)
        after_mean = statistics.mean(after_vals)
        sigma = _pooled_sd(before_vals, after_vals)
        delta = after_mean - before_mean
        ratio = delta / sigma if sigma > 0 else float("inf") if delta != 0 else 0.0
        out[axis] = {
            "before_mean": round(before_mean, 3),
            "after_mean": round(after_mean, 3),
            "delta": round(delta, 3),
            "pooled_sd": round(sigma, 3),
            "delta_over_2sigma": round(ratio / 2, 3),
            "improved_with_2sigma": (sigma > 0 and abs(ratio) >= 2 and delta > 0),
            "n_before": len(before_vals),
            "n_after": len(after_vals),
        }
    return out


async def run_pairwise_for_training(
    before_drafts: list[dict[str, Any]],
    after_drafts: list[dict[str, Any]],
    training_case_ids: set[str],
) -> dict[str, Any]:
    before_index = {(d["case_id"], d["sample_idx"]): d for d in before_drafts}
    after_index = {(d["case_id"], d["sample_idx"]): d for d in after_drafts}

    pairs: list[tuple[str, int]] = []
    for case_id in training_case_ids:
        for sample_idx in range(10):
            if (case_id, sample_idx) in before_index and (case_id, sample_idx) in after_index:
                pairs.append((case_id, sample_idx))

    pairwise_results: list[dict[str, Any]] = []
    win_after, win_before, tie = 0, 0, 0
    consistent_count = 0

    for idx, (case_id, sample_idx) in enumerate(pairs, start=1):
        before_d = before_index[(case_id, sample_idx)]
        after_d = after_index[(case_id, sample_idx)]
        print(
            f"[compare] ({idx}/{len(pairs)}) pairwise case={case_id} sample={sample_idx}"
        )
        result = await run_judge_pairwise_ab_ba(
            feature="gakuchika",
            case_id=f"{case_id}__s{sample_idx}",
            title=before_d["title"],
            transcript=before_d["transcript"],
            final_text_a=before_d["draft"],
            final_text_b=after_d["draft"],
        )
        # Note: in our setup A=before, B=after; result["winner"] is which
        # of (A,B) wins.  Map to before/after labels.
        winner = result.get("winner", "tie")
        if winner == "a":
            win_before += 1
        elif winner == "b":
            win_after += 1
        else:
            tie += 1
        if result.get("consistent"):
            consistent_count += 1
        pairwise_results.append(
            {
                "case_id": case_id,
                "sample_idx": sample_idx,
                "winner": "before" if winner == "a" else ("after" if winner == "b" else "tie"),
                "consistent_ab_ba": result.get("consistent"),
                "ab": result.get("ab", {}),
                "ba": result.get("ba", {}),
            }
        )

    total = max(len(pairs), 1)
    return {
        "pairs": pairwise_results,
        "summary": {
            "total_pairs": len(pairs),
            "win_after": win_after,
            "win_before": win_before,
            "tie": tie,
            "winrate_after": round(win_after / total, 3),
            "winrate_before": round(win_before / total, 3),
            "tie_rate": round(tie / total, 3),
            "consistent_rate": round(consistent_count / total, 3),
            "improved_with_winrate_threshold_0_8": (win_after / total >= 0.8),
        },
    }


def compute_battery_d_delta(before: dict[str, Any], after: dict[str, Any]) -> dict[str, Any]:
    bd_before = before.get("battery_d_overall", {})
    bd_after = after.get("battery_d_overall", {})
    return {
        "quote_retention": {
            "before": round(bd_before.get("mean_quote_retention", 0.0), 3),
            "after": round(bd_after.get("mean_quote_retention", 0.0), 3),
            "delta": round(
                bd_after.get("mean_quote_retention", 0.0)
                - bd_before.get("mean_quote_retention", 0.0),
                3,
            ),
        },
        "combined_fact_retention": {
            "before": round(bd_before.get("mean_combined_fact_retention", 0.0), 3),
            "after": round(bd_after.get("mean_combined_fact_retention", 0.0), 3),
            "delta": round(
                bd_after.get("mean_combined_fact_retention", 0.0)
                - bd_before.get("mean_combined_fact_retention", 0.0),
                3,
            ),
        },
    }


async def run_comparison(args: argparse.Namespace) -> int:
    output_dir = Path(args.output_dir).resolve()
    before_summary = _load_summary(output_dir, args.before_label)
    after_summary = _load_summary(output_dir, args.after_label)

    training_ids = {c["case_id"] for c in TRAINING_CASES}
    holdout_ids = {c["case_id"] for c in HOLDOUT_CASES}

    print("\n=== Pointwise axis comparison (training) ===")
    training_axes = compute_axis_comparison(before_summary, after_summary, training_ids)
    for axis, info in training_axes.items():
        marker = "✓" if info["improved_with_2sigma"] else " "
        print(
            f"  {marker} {axis:<24} "
            f"before={info['before_mean']:.3f} → after={info['after_mean']:.3f} "
            f"(Δ={info['delta']:+.3f}, σ={info['pooled_sd']:.3f}, Δ/2σ={info['delta_over_2sigma']:+.3f})"
        )

    print("\n=== Pointwise axis comparison (holdout, non-regression check) ===")
    holdout_axes = compute_axis_comparison(before_summary, after_summary, holdout_ids)
    holdout_regressions: list[str] = []
    for axis, info in holdout_axes.items():
        non_regress = info["after_mean"] >= info["before_mean"] - info["pooled_sd"]
        marker = "✓" if non_regress else "⚠"
        if not non_regress:
            holdout_regressions.append(axis)
        print(
            f"  {marker} {axis:<24} "
            f"before={info['before_mean']:.3f} → after={info['after_mean']:.3f} "
            f"(Δ={info['delta']:+.3f}, σ={info['pooled_sd']:.3f}, after≥before-σ: {non_regress})"
        )

    battery_d = compute_battery_d_delta(before_summary, after_summary)
    print("\n=== Battery D (facts retention) Δ ===")
    for key, info in battery_d.items():
        marker = "✓" if info["delta"] >= -0.02 else "⚠"
        print(
            f"  {marker} {key:<24} "
            f"before={info['before']:.3f} → after={info['after']:.3f} (Δ={info['delta']:+.3f})"
        )

    # Pairwise (AB/BA, training only — holdout is for non-regression detection)
    pairwise: dict[str, Any] | None = None
    if not args.skip_pairwise:
        before_drafts = _load_drafts(output_dir, args.before_label)
        after_drafts = _load_drafts(output_dir, args.after_label)
        pairwise = await run_pairwise_for_training(
            before_drafts, after_drafts, training_ids
        )
        print("\n=== Pairwise AB/BA (training) ===")
        s = pairwise["summary"]
        print(
            f"  total={s['total_pairs']} after_wins={s['win_after']} "
            f"before_wins={s['win_before']} tie={s['tie']}"
        )
        print(
            f"  winrate_after={s['winrate_after']:.2f} (threshold 0.80) "
            f"consistent_rate={s['consistent_rate']:.2f}"
        )
        verdict_pairwise = "✓ improved" if s["improved_with_winrate_threshold_0_8"] else "⚠ inconclusive"
        print(f"  verdict: {verdict_pairwise}")

    output = {
        "before_label": args.before_label,
        "after_label": args.after_label,
        "training_axes": training_axes,
        "holdout_axes": holdout_axes,
        "holdout_regressions": holdout_regressions,
        "battery_d": battery_d,
        "pairwise": pairwise,
    }
    out_path = (
        output_dir / f"{args.after_label}_vs_{args.before_label}_comparison.json"
    )
    out_path.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nWrote: {out_path}")
    return 0


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--before-label", required=True)
    p.add_argument("--after-label", required=True)
    p.add_argument(
        "--output-dir",
        default="../docs/review/feature/gakuchika_baseline_runs",
    )
    p.add_argument(
        "--skip-pairwise",
        action="store_true",
        help="Skip pairwise judge calls (axis comparison only).",
    )
    return p.parse_args()


def main() -> int:
    args = parse_args()
    return asyncio.run(run_comparison(args))


if __name__ == "__main__":
    raise SystemExit(main())
