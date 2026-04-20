from __future__ import annotations

import os
from pathlib import Path

import pytest

from app.routers.interview import (
    INTERVIEW_FEEDBACK_SCHEMA,
    SEVEN_AXIS_KEYS,
    _build_feedback_prompt,
    _normalize_feedback,
)
from app.utils.llm import call_llm_with_error
from tests.interview.harness.calibration_judge import run_calibration_judge
from tests.interview.harness.calibration_metrics import (
    compute_faceted_agreement,
    compute_overall_agreement,
    compute_per_axis_agreement,
)
from tests.interview.harness.calibration_report import write_calibration_report
from tests.interview.harness.fixtures import HARNESS_CASES, make_feedback_payload


async def _run_claude_feedback(case_id: int) -> dict:
    payload = make_feedback_payload(case_id)
    result = await call_llm_with_error(
        system_prompt=_build_feedback_prompt(payload),
        user_message="最終講評をJSONで生成してください。",
        temperature=0.1,
        max_tokens=1600,
        feature="interview_feedback",
        response_format="json_schema",
        json_schema=INTERVIEW_FEEDBACK_SCHEMA,
    )
    assert result.success and isinstance(result.data, dict), f"Claude feedback failed for case {case_id}: {result.error}"
    return _normalize_feedback(result.data)


def _report_output_dir() -> Path:
    return Path(__file__).resolve().parents[2] / "output"


@pytest.mark.slow
@pytest.mark.calibration
@pytest.mark.integration
@pytest.mark.asyncio
async def test_interview_calibration() -> None:
    if os.getenv("RUN_INTERVIEW_CALIBRATION") != "1":
        pytest.skip("Set RUN_INTERVIEW_CALIBRATION=1 to run interview calibration.")

    results: list[dict] = []
    claude_scores: list[dict[str, int]] = []
    judge_scores: list[dict[str, int]] = []

    for case in HARNESS_CASES:
        payload = make_feedback_payload(case["case_id"])
        claude_feedback = await _run_claude_feedback(case["case_id"])
        judge_feedback = await run_calibration_judge(
            case=case,
            conversation_history=payload.conversation_history,
            company_info={
                "name": payload.company_name,
                "summary": payload.company_summary,
                "industry": payload.selected_industry,
            },
        )
        assert judge_feedback is not None, f"Calibration judge failed for case {case['case_id']}"

        claude_axis_scores = {
            axis: int(claude_feedback["scores"].get(axis, 0))
            for axis in SEVEN_AXIS_KEYS
        }
        judge_axis_scores = {
            axis: int(judge_feedback["scores"].get(axis, 0))
            for axis in SEVEN_AXIS_KEYS
        }
        claude_scores.append(claude_axis_scores)
        judge_scores.append(judge_axis_scores)
        results.append(
            {
                "case_id": case["case_id"],
                "format": case["format"],
                "strictness": case["strictness"],
                "interviewer": case["interviewer"],
                "role_track": case["role_track"],
                "claude_scores": claude_axis_scores,
                "judge_scores": judge_axis_scores,
                "judge_rationale_by_axis": judge_feedback["rationale_by_axis"],
            }
        )

    per_axis = compute_per_axis_agreement(claude_scores, judge_scores, axes=SEVEN_AXIS_KEYS)
    overall = compute_overall_agreement(per_axis)
    facets = compute_faceted_agreement(claude_scores, judge_scores, HARNESS_CASES, axes=SEVEN_AXIS_KEYS)
    metrics = {
        "overall": overall,
        "per_axis": per_axis,
        "facets": facets,
    }
    json_path, md_path = write_calibration_report(results, metrics, _report_output_dir())
    print(f"Calibration reports: {json_path} / {md_path}")
    assert len(results) == 24
    assert overall["macro_kappa"] is not None
    assert overall["macro_kappa"] >= 0.3
