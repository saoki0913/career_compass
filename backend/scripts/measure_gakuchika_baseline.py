"""
Battery C + D orchestration script for gakuchika prompt quality measurement.

Generates ES drafts via the production-equivalent pipeline (build_template_draft_generation_prompt
+ call_llm_with_error) for every TRAINING and HOLDOUT case, then judges each draft via
run_judge_pointwise_n. Saves drafts and judge results to JSON for before/after diffing.
Battery D facts retention metrics are computed from the saved drafts.

Usage:
    cd backend
    LIVE_AI_CONVERSATION_LLM_JUDGE=1 \
    GAKUCHIKA_JUDGE_SAMPLES=3 \
    python -m scripts.measure_gakuchika_baseline \
        --label baseline_20260418 \
        --output-dir ../docs/review/feature/gakuchika_baseline_runs

Required env:
    LIVE_AI_CONVERSATION_LLM_JUDGE=1   judge enabled
    OPENAI_API_KEY or other provider key (auto-resolved via app.utils.llm)

Plan: /Users/saoki/.claude/plans/gakuchika-quality-improvement-plan-web-a-cheerful-marshmallow.md
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import statistics
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

# Make tests/ importable as a top-level package alongside app/
_BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

from app.normalization.gakuchika_payload import _extract_student_expressions
from app.prompts.es_templates import (
    DRAFT_SYNTHETIC_QUESTION_GAKUCHIKA,
    build_template_draft_generation_prompt,
)
from app.prompts.gakuchika_prompts import es_draft_few_shot_for
from app.utils.llm import call_llm_with_error
from tests.conversation.gakuchika_golden_set import HOLDOUT_CASES, TRAINING_CASES
from tests.conversation.judge_sampling import (
    estimate_pointwise_cost,
    run_judge_pointwise_n,
)
from tests.gakuchika.test_gakuchika_facts_retention import (
    analyze_drafts_from_file,
)


_ES_DRAFT_GAKUCHIKA_FEATURE = "gakuchika_draft"


@dataclass
class GeneratedDraft:
    case_id: str
    sample_idx: int
    transcript: list[dict]
    draft: str
    char_count: int
    title: str
    char_limit: int
    error: str | None = None


@dataclass
class CaseScore:
    case_id: str
    sample_idx: int
    scores: dict[str, int]
    raw: dict[str, Any] = field(default_factory=dict)


def _conversation_text(transcript: list[dict]) -> str:
    """Mimic _format_conversation in routers/gakuchika.py for the draft prompt."""
    out: list[str] = []
    for turn in transcript:
        role = turn.get("role")
        content = (turn.get("content") or "").strip()
        if not content:
            continue
        if role == "assistant":
            out.append(f"質問: {content}")
        elif role == "user":
            out.append(f"回答: {content}")
    return "\n\n".join(out)


def _student_only_messages(transcript: list[dict]) -> list[dict]:
    """_extract_student_expressions takes ConversationTurn-like objects.

    Re-shape transcript dicts into a minimal compatible form: only role/content.
    """
    return [{"role": t.get("role", ""), "content": t.get("content") or ""} for t in transcript]


def _normalize_draft_text(text: str) -> str:
    """Light cleanup: strip, collapse triple newlines."""
    text = (text or "").strip()
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text


async def generate_one_draft(
    case: dict[str, Any],
    sample_idx: int,
    char_limit: int,
) -> GeneratedDraft:
    """Mimic routers/gakuchika.py::generate_es_draft for a single case+sample."""
    transcript = case["transcript"]
    title = case["title"]
    case_id = case["case_id"]

    primary_body = f"テーマ: {title}\n\n{_conversation_text(transcript)}"
    student_expressions = _extract_student_expressions(
        _student_only_messages(transcript), max_items=5
    )
    char_min = int(char_limit * 0.9)

    system_prompt, user_prompt = build_template_draft_generation_prompt(
        "gakuchika",
        company_name=None,
        industry=None,
        question=DRAFT_SYNTHETIC_QUESTION_GAKUCHIKA,
        char_min=char_min,
        char_max=char_limit,
        primary_material_heading="【テーマと会話】",
        primary_material_body=primary_body,
        output_json_kind="gakuchika",
        role_name=None,
        company_evidence_cards=None,
        has_rag=False,
        grounding_mode="none",
        student_expressions=student_expressions,
    )

    few_shot = es_draft_few_shot_for(char_limit)
    if few_shot:
        system_prompt = f"{system_prompt}\n\n{few_shot}"

    llm_result = await call_llm_with_error(
        system_prompt=system_prompt,
        user_message=user_prompt,
        max_tokens=1400,
        temperature=0.3,
        feature=_ES_DRAFT_GAKUCHIKA_FEATURE,
        retry_on_parse=True,
        disable_fallback=True,
    )

    if not llm_result.success or llm_result.data is None:
        err_msg = ""
        if llm_result.error is not None:
            err_msg = getattr(llm_result.error, "message", str(llm_result.error))
        return GeneratedDraft(
            case_id=case_id,
            sample_idx=sample_idx,
            transcript=transcript,
            draft="",
            char_count=0,
            title=title,
            char_limit=char_limit,
            error=err_msg or "LLM failure",
        )

    raw_draft = ""
    if isinstance(llm_result.data, dict):
        raw_draft = str(llm_result.data.get("draft") or "").strip()

    draft_text = _normalize_draft_text(raw_draft)

    return GeneratedDraft(
        case_id=case_id,
        sample_idx=sample_idx,
        transcript=transcript,
        draft=draft_text,
        char_count=len(draft_text),
        title=title,
        char_limit=char_limit,
        error=None,
    )


async def measure_case(
    case: dict[str, Any],
    n_samples: int,
    char_limit: int,
) -> tuple[list[GeneratedDraft], dict[str, Any]]:
    """Generate N drafts for a case, then judge each draft once.

    Returns (drafts, aggregated_scores) where aggregated_scores has the same shape
    as run_judge_pointwise_n's ``axes`` field.
    """
    drafts: list[GeneratedDraft] = []
    for idx in range(n_samples):
        d = await generate_one_draft(case, idx, char_limit)
        drafts.append(d)

    # Judge each successfully-generated draft.  We call run_judge_pointwise_n with
    # n_samples=1 per draft so each (transcript, draft) pair gets exactly one judge
    # score.  The aggregation across samples happens here.
    per_sample_axes: dict[str, list[int]] = {}
    judge_errors: list[str] = []

    for d in drafts:
        if d.error or not d.draft:
            judge_errors.append(f"sample_{d.sample_idx}: generation failed ({d.error})")
            continue
        result = await run_judge_pointwise_n(
            feature="gakuchika",
            case_id=f"{d.case_id}__s{d.sample_idx}",
            title=d.title,
            transcript=d.transcript,
            final_text=d.draft,
            n_samples=1,
        )
        for sample in result.get("samples", []):
            scores = sample.get("scores") or {}
            for axis, value in scores.items():
                if isinstance(value, int) and value >= 1:
                    per_sample_axes.setdefault(axis, []).append(value)
        for err in result.get("errors", []):
            judge_errors.append(f"sample_{d.sample_idx}: {err}")

    axes_summary: dict[str, dict[str, Any]] = {}
    for axis, values in per_sample_axes.items():
        if not values:
            continue
        axes_summary[axis] = {
            "mean": round(statistics.mean(values), 3),
            "sd": round(statistics.pstdev(values), 3) if len(values) > 1 else 0.0,
            "values": values,
            "n": len(values),
        }

    overall = {
        "mean_of_axis_means": round(
            statistics.mean([a["mean"] for a in axes_summary.values()]), 3
        )
        if axes_summary
        else 0.0,
        "errors": judge_errors,
    }

    return drafts, {"axes": axes_summary, "overall": overall}


def _serialize_draft(d: GeneratedDraft) -> dict[str, Any]:
    return {
        "case_id": d.case_id,
        "sample_idx": d.sample_idx,
        "title": d.title,
        "char_limit": d.char_limit,
        "char_count": d.char_count,
        "transcript": d.transcript,
        "draft": d.draft,
        "error": d.error,
    }


async def run_full_measurement(args: argparse.Namespace) -> int:
    n_samples = args.n_samples or int(os.getenv("GAKUCHIKA_JUDGE_SAMPLES", "3"))

    selected_cases: list[dict[str, Any]] = []
    if "training" in args.cases:
        selected_cases.extend(TRAINING_CASES)
    if "holdout" in args.cases:
        selected_cases.extend(HOLDOUT_CASES)

    if not selected_cases:
        print("[measure_gakuchika] no cases selected (use --cases training,holdout)")
        return 2

    # Pre-flight cost estimate
    cost_estimate = estimate_pointwise_cost(
        n_cases=len(selected_cases),
        n_samples=n_samples,
        axes_per_case=5,
    )
    # Add generation cost (rough): each generation ~3000 input + ~600 output tokens.
    total_gen_calls = len(selected_cases) * n_samples
    print(
        f"[measure_gakuchika] cases={len(selected_cases)} samples_per_case={n_samples} "
        f"generations={total_gen_calls} judge_calls={total_gen_calls}"
    )
    print(
        f"[measure_gakuchika] judge cost estimate (pointwise): "
        f"~${cost_estimate.get('estimated_cost_usd', 0.0):.2f}"
    )
    print(
        f"[measure_gakuchika] generation cost estimate (rough): "
        f"~${total_gen_calls * 0.0015:.2f} (assumes ~3K in / ~600 out / gpt-5.4-mini)"
    )

    if args.dry_run:
        print("[measure_gakuchika] --dry-run set, exiting before any LLM call")
        return 0

    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    drafts_path = output_dir / f"{args.label}_drafts.json"
    judge_path = output_dir / f"{args.label}_judge.json"
    summary_path = output_dir / f"{args.label}_summary.json"
    facts_path = output_dir / f"{args.label}_facts_retention.json"

    all_drafts: list[GeneratedDraft] = []
    judge_per_case: dict[str, dict[str, Any]] = {}

    started_at = time.time()
    for idx, case in enumerate(selected_cases, start=1):
        case_id = case["case_id"]
        print(
            f"[measure_gakuchika] ({idx}/{len(selected_cases)}) measuring case={case_id} ..."
        )
        drafts, judge_summary = await measure_case(case, n_samples, args.char_limit)
        all_drafts.extend(drafts)
        judge_per_case[case_id] = judge_summary

        # Snapshot to disk after every case so a partial run is recoverable
        drafts_path.write_text(
            json.dumps([_serialize_draft(d) for d in all_drafts], ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        judge_path.write_text(
            json.dumps(judge_per_case, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    elapsed = time.time() - started_at
    print(f"[measure_gakuchika] all cases done in {elapsed:.1f}s")

    # Battery D: facts retention from saved drafts
    battery_d = analyze_drafts_from_file(drafts_path)
    facts_path.write_text(
        json.dumps(battery_d, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    # Aggregated summary
    summary: dict[str, Any] = {
        "label": args.label,
        "n_cases": len(selected_cases),
        "n_samples_per_case": n_samples,
        "char_limit": args.char_limit,
        "elapsed_sec": round(elapsed, 1),
        "judge_per_case": {
            case_id: {
                "axes": judge["axes"],
                "overall_mean_of_axis_means": judge["overall"]["mean_of_axis_means"],
                "errors": judge["overall"]["errors"],
            }
            for case_id, judge in judge_per_case.items()
        },
        "battery_d_overall": battery_d.get("overall", {}),
        "battery_d_per_case": battery_d.get("per_case", {}),
        "outputs": {
            "drafts": str(drafts_path),
            "judge": str(judge_path),
            "facts_retention": str(facts_path),
            "summary": str(summary_path),
        },
    }
    summary_path.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    # Console summary
    print("\n=== Per-case judge means ===")
    for case_id, judge in judge_per_case.items():
        axes = judge["axes"]
        line = ", ".join(f"{ax}={info['mean']:.2f}" for ax, info in axes.items())
        print(
            f"  {case_id}: {line} | mean={judge['overall']['mean_of_axis_means']:.2f}"
        )
    print("\n=== Battery D overall ===")
    overall = battery_d.get("overall", {})
    print(
        f"  quote_retention={overall.get('mean_quote_retention', 0.0):.2f} | "
        f"combined_fact_retention={overall.get('mean_combined_fact_retention', 0.0):.2f}"
    )
    print(f"\nWrote: {summary_path}")
    return 0


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--label",
        required=True,
        help="Output filename label (e.g. baseline_20260418, after_phase2_20260418).",
    )
    p.add_argument(
        "--output-dir",
        default="../docs/review/feature/gakuchika_baseline_runs",
        help="Where to write JSON outputs (relative to backend/).",
    )
    p.add_argument(
        "--n-samples",
        type=int,
        default=None,
        help="Override sample count per case. Default: GAKUCHIKA_JUDGE_SAMPLES env or 3.",
    )
    p.add_argument(
        "--cases",
        default="training,holdout",
        help="Which case sets to run (comma-separated: training,holdout). Default: both.",
    )
    p.add_argument(
        "--char-limit",
        type=int,
        default=400,
        choices=[300, 400, 500],
        help="ES draft character limit (default: 400).",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Print cost estimate and exit before any LLM call.",
    )
    return p.parse_args()


def main() -> int:
    args = parse_args()
    if not os.getenv("LIVE_AI_CONVERSATION_LLM_JUDGE"):
        print(
            "[measure_gakuchika] LIVE_AI_CONVERSATION_LLM_JUDGE is not set. "
            "Judge will be skipped — set it to '1' to enable.",
            file=sys.stderr,
        )
    return asyncio.run(run_full_measurement(args))


if __name__ == "__main__":
    raise SystemExit(main())
