from __future__ import annotations

import os
import time
from dataclasses import dataclass

import pytest

from app.routers.company_info import (
    FetchRequest,
    SearchPagesRequest,
    _fetch_schedule_response,
    search_company_pages,
)
from app.utils.web_search import HAS_DDGS
from tests.company_info.integration.live_feature_report import (
    selected_case_set,
    write_live_feature_report,
)


def _unwrap_route(fn):
    return getattr(fn, "__wrapped__", fn)


@dataclass(frozen=True)
class LiveSelectionScheduleCase:
    case_id: str
    company_name: str
    graduation_year: int
    selection_type: str


SMOKE_CASES: tuple[LiveSelectionScheduleCase, ...] = (
    LiveSelectionScheduleCase(
        case_id="accenture_main_2027",
        company_name="アクセンチュア",
        graduation_year=2027,
        selection_type="main_selection",
    ),
    LiveSelectionScheduleCase(
        case_id="nttdata_main_2027",
        company_name="NTTデータ",
        graduation_year=2027,
        selection_type="main_selection",
    ),
)

EXTENDED_CASES: tuple[LiveSelectionScheduleCase, ...] = SMOKE_CASES + (
    LiveSelectionScheduleCase(
        case_id="nri_main_2027",
        company_name="野村総合研究所",
        graduation_year=2027,
        selection_type="main_selection",
    ),
    LiveSelectionScheduleCase(
        case_id="mufg_main_2027",
        company_name="三菱UFJ銀行",
        graduation_year=2027,
        selection_type="main_selection",
    ),
)


def _cases_for(case_set: str) -> tuple[LiveSelectionScheduleCase, ...]:
    return EXTENDED_CASES if case_set == "extended" else SMOKE_CASES


def _row_status(reasons: list[str]) -> tuple[str, str]:
    if reasons:
        return "failed", "failed"
    return "passed", "passed"


async def _evaluate_case(case: LiveSelectionScheduleCase) -> dict[str, object]:
    started = time.perf_counter()
    reasons: list[str] = []
    source_url = ""
    deadline_count = 0
    parsed_deadlines = 0
    max_confidence = ""
    search_confidence = ""
    response_success = False
    partial_success = False
    search_candidate_count = 0
    source_type = ""
    year_matched = None
    search_company_pages_impl = _unwrap_route(search_company_pages)

    try:
        candidates_payload = await search_company_pages_impl(
            SearchPagesRequest(
                company_name=case.company_name,
                graduation_year=case.graduation_year,
                selection_type=case.selection_type,
                max_results=3,
                allow_snippet_match=False,
            ),
            None,  # type: ignore[arg-type]
        )
        candidates = list(candidates_payload.get("candidates") or [])
        search_candidate_count = len(candidates)
        if not candidates:
            reasons.append("search_candidate_missing")
            status, severity = _row_status(reasons)
            return {
                "caseId": case.case_id,
                "title": f"{case.company_name} / {case.graduation_year}",
                "status": status,
                "severity": severity,
                "candidateCount": search_candidate_count,
                "deterministicFailReasons": reasons,
                "checks": {
                    "search_candidates_found": False,
                },
                "durationMs": round((time.perf_counter() - started) * 1000),
            }

        candidate = candidates[0]
        source_url = candidate.url
        search_confidence = candidate.confidence

        response = await _fetch_schedule_response(
            FetchRequest(
                url=source_url,
                company_name=case.company_name,
                graduation_year=case.graduation_year,
                selection_type=case.selection_type,
            ),
            feature="selection_schedule",
        )
        response_success = response.success
        partial_success = response.partial_success
        source_type = response.source_type
        year_matched = response.year_matched
        source_url = response.source_url or source_url

        deadlines = response.data.deadlines if response.data else []
        deadline_count = len(deadlines)
        parsed_deadlines = sum(1 for deadline in deadlines if deadline.due_date)
        confidences = [deadline.confidence for deadline in deadlines if deadline.confidence]
        if confidences:
            max_confidence = "high" if "high" in confidences else "medium" if "medium" in confidences else "low"

        if not response.success and not response.partial_success:
            reasons.append("schedule_fetch_failed")
        if not response.deadlines_found or deadline_count <= 0:
            reasons.append("deadline_missing")
        if deadline_count > 0 and parsed_deadlines <= 0:
            reasons.append("date_parse_failed")
        if response.year_matched is False:
            reasons.append("year_mismatch")
        if deadline_count > 0 and max_confidence == "low":
            reasons.append("confidence_low_only")
        if response.deadlines_found and not response.source_url:
            reasons.append("source_follow_failed")
    except Exception as exc:
        reasons.append("schedule_fetch_failed")
        reasons.append(f"exception:{type(exc).__name__}")

    status, severity = _row_status(reasons)
    return {
        "caseId": case.case_id,
        "title": f"{case.company_name} / {case.graduation_year}",
        "status": status,
        "severity": severity,
        "companyName": case.company_name,
        "graduationYear": case.graduation_year,
        "selectionType": case.selection_type,
        "candidateCount": search_candidate_count,
        "sourceUrl": source_url,
        "searchConfidence": search_confidence,
        "sourceType": source_type,
        "responseSuccess": response_success,
        "partialSuccess": partial_success,
        "deadlineCount": deadline_count,
        "parsedDeadlines": parsed_deadlines,
        "yearMatched": year_matched,
        "maxDeadlineConfidence": max_confidence,
        "deterministicFailReasons": reasons,
        "checks": {
            "search_candidates_found": search_candidate_count > 0,
            "response_success": response_success or partial_success,
            "deadlines_found": deadline_count > 0,
            "due_date_present": parsed_deadlines > 0,
            "year_matched": year_matched is not False,
        },
        "durationMs": round((time.perf_counter() - started) * 1000),
    }


@pytest.mark.integration
@pytest.mark.slow
@pytest.mark.asyncio
async def test_live_selection_schedule_report() -> None:
    if os.getenv("RUN_LIVE_SELECTION_SCHEDULE") != "1":
        pytest.skip(
            "Set RUN_LIVE_SELECTION_SCHEDULE=1 to enable live selection schedule report."
        )
    if not HAS_DDGS:
        pytest.skip("ddgs is not installed; live web search is unavailable.")

    case_set = selected_case_set()
    rows = [await _evaluate_case(case) for case in _cases_for(case_set)]
    json_path, md_path = write_live_feature_report(
        report_type="selection_schedule",
        display_name="選考スケジュール取得",
        rows=rows,
    )

    assert json_path.exists()
    assert md_path.exists()
    assert len(rows) == len(_cases_for(case_set))
