"""Interview AI Live integration test.

Environment gates:
  RUN_LIVE_INTERVIEW=1
  LIVE_AI_CONVERSATION_CASE_SET  smoke | extended
"""
from __future__ import annotations

import json
import os
import traceback
from pathlib import Path
from time import perf_counter
from typing import Any

import pytest

import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from tests.conversation.staging_client import StagingClient
from tests.conversation.conversation_runner import (
    run_gakuchika_conversation,
    run_motivation_conversation,
    run_interview_flow,
    parse_sse_events,
    collect_chunks,
    parse_complete_data,
)
from tests.conversation.checks import run_case_checks, classify_failure
from tests.conversation.llm_judge import run_conversation_judge
from tests.conversation.report import write_conversation_report, selected_case_set

CASES_PATH = Path(__file__).resolve().parents[4] / "tests" / "ai_eval" / "interview_cases.json"
_STALE_PREFIX = "_live-ai-conversations-"


def _load_cases() -> list[dict[str, Any]]:
    with open(CASES_PATH, encoding="utf-8") as f:
        cases = json.load(f)
    suite = selected_case_set()
    if suite == "smoke":
        return [c for c in cases if c.get("suiteDepth") == "smoke"]
    return cases


async def _cleanup_stale_companies(client: StagingClient) -> None:
    """Delete leftover test companies from previous runs."""
    try:
        companies = await client.list_companies()
        for company in companies:
            name = company.get("name", "")
            cid = company.get("id", "")
            if name.startswith(_STALE_PREFIX) and cid:
                try:
                    await client.delete_company(cid)
                    print(f"[interview] cleaned stale company: {name}")
                except Exception:
                    pass
    except Exception:
        pass  # Non-fatal


async def _run_single_case(client: StagingClient, case: dict[str, Any]) -> dict[str, Any]:
    case_id = case["id"]
    title = case.get("title", case_id)
    motivation_cfg = case.get("motivation", {})
    gakuchika_cfg = case.get("gakuchika", {})
    interview_cfg = case.get("interview", {})

    row: dict[str, Any] = {
        "caseId": case_id,
        "title": title,
        "status": "fail",
        "severity": "error",
        "failureKind": "crash",
        "durationMs": 0,
        "transcript": [],
        "outputs": {},
        "deterministicFailReasons": [],
        "checks": {},
        "judge": None,
        "cleanup": {"ok": True, "errors": []},
    }

    t0 = perf_counter()
    company_id: str | None = None
    gakuchika_id: str | None = None
    document_ids: list[str] = []

    try:
        # 1. Create company with unique name
        company_name = f"{_STALE_PREFIX}{case_id}"
        company_resp = await client.create_company(company_name, case.get("industry", ""))
        company_id = company_resp.get("id") or company_resp.get("company", {}).get("id")
        assert company_id, f"Failed to create company for {case_id}"

        # 2. Create application + job type
        app_resp = await client.create_application(
            company_id, case.get("applicationJobType", "総合職")
        )
        app_id = app_resp.get("id") or app_resp.get("application", {}).get("id")
        if app_id:
            await client.create_job_type(app_id, case.get("applicationJobType", "総合職"))

        # 3. Run motivation setup (prerequisite)
        motivation_transcript: list[dict[str, str]] = []
        await run_motivation_conversation(
            client,
            company_id,
            case.get("selectedIndustry", ""),
            case.get("selectedRole", ""),
            motivation_cfg.get("answers", []),
            motivation_transcript,
        )

        # 4. Generate motivation draft
        mot_draft_resp = await client.request(
            "POST",
            f"/api/motivation/{company_id}/generate-draft-direct",
            json={
                "selectedIndustry": case.get("selectedIndustry", ""),
                "selectedRole": case.get("selectedRole", ""),
            },
        )
        if mot_draft_resp.status_code < 400:
            mot_events = parse_sse_events(mot_draft_resp.text)
            try:
                mot_complete = parse_complete_data(mot_events)
                mot_doc_id = mot_complete.get("documentId") or mot_complete.get("document", {}).get("id")
                if mot_doc_id:
                    document_ids.append(mot_doc_id)
            except ValueError:
                pass

        # 5. Create gakuchika
        gak_resp = await client.create_gakuchika(
            title=gakuchika_cfg["title"],
            content=gakuchika_cfg["content"],
            char_limit_type=gakuchika_cfg.get("charLimitType", "400"),
        )
        gakuchika_id = gak_resp.get("id") or gak_resp.get("gakuchika", {}).get("id")
        assert gakuchika_id, f"Failed to create gakuchika for {case_id}"

        # 6. Run gakuchika conversation
        gak_transcript: list[dict[str, str]] = []
        await run_gakuchika_conversation(
            client, gakuchika_id, gakuchika_cfg.get("answers", []), gak_transcript
        )

        # 7. Generate gakuchika draft
        gak_draft_resp = await client.request(
            "POST",
            f"/api/gakuchika/{gakuchika_id}/generate-es-draft",
            json={"charLimit": gakuchika_cfg.get("charLimitType", "400")},
        )
        gak_draft_text = ""
        if gak_draft_resp.status_code < 400:
            gak_events = parse_sse_events(gak_draft_resp.text)
            gak_draft_text = collect_chunks(gak_events, "draft") or collect_chunks(gak_events, "content") or ""
            try:
                gak_complete = parse_complete_data(gak_events)
                gak_doc_id = gak_complete.get("documentId") or gak_complete.get("document", {}).get("id")
                if gak_doc_id:
                    document_ids.append(gak_doc_id)
            except ValueError:
                pass

        # 8. Create ES document with gakuchika draft (for interview context)
        if gak_draft_text:
            try:
                es_doc = await client.create_document(
                    title=gakuchika_cfg["title"],
                    type="gakuchika",
                    company_id=company_id,
                    content=[{"type": "text", "text": gak_draft_text}],
                )
                es_doc_id = es_doc.get("id") or es_doc.get("document", {}).get("id")
                if es_doc_id:
                    document_ids.append(es_doc_id)
            except Exception:
                pass  # Non-fatal for interview

        # 9. Run interview flow
        interview_transcript: list[dict[str, str]] = []
        feedback_dict, feedback_text = await run_interview_flow(
            client,
            company_id,
            interview_cfg.get("answers", []),
            interview_transcript,
        )

        row["transcript"] = interview_transcript
        row["outputs"] = {
            "feedbackText": feedback_text[:2000] if feedback_text else "",
            "feedbackLength": len(feedback_text) if feedback_text else 0,
            "hasFeedback": feedback_dict is not None,
        }

        # 10. Deterministic checks
        questions = [t["content"] for t in interview_transcript if t["role"] == "assistant"]

        fail_reasons, checks = run_case_checks(
            case_config=interview_cfg,
            questions=questions,
            feedback_text=feedback_text,
        )

        if not feedback_text or len(feedback_text) < 10:
            fail_reasons.append("feedback_empty_or_too_short")
            checks["feedbackNotEmpty"] = {"passed": False, "actual": len(feedback_text) if feedback_text else 0}

        row["deterministicFailReasons"] = fail_reasons
        row["checks"] = checks

        # 11. LLM judge
        judge_result = await run_conversation_judge(
            feature="interview",
            case_id=case_id,
            title=title,
            transcript=interview_transcript,
            final_text=feedback_text or "",
        )
        row["judge"] = judge_result

        # 12. Classify
        row["failureKind"] = classify_failure(None, True, fail_reasons, judge_result)
        row["status"] = "pass" if row["failureKind"] == "pass" else "fail"
        if row["failureKind"] == "degraded":
            row["status"] = "degraded"
            row["severity"] = "warning"
        elif row["status"] == "pass":
            row["severity"] = "info"

    except Exception as exc:
        row["status"] = "fail"
        row["severity"] = "error"
        row["failureKind"] = "crash"
        row["deterministicFailReasons"] = [f"exception: {exc!r}"[:200]]
        traceback.print_exc()
    finally:
        row["durationMs"] = int((perf_counter() - t0) * 1000)

        cleanup_errors: list[str] = []
        for doc_id in document_ids:
            try:
                await client.delete_document(doc_id)
            except Exception as e:
                cleanup_errors.append(f"delete_document({doc_id}): {e!r}"[:100])
        if gakuchika_id:
            try:
                await client.delete_gakuchika(gakuchika_id)
            except Exception as e:
                cleanup_errors.append(f"delete_gakuchika: {e!r}"[:100])
        if company_id:
            try:
                await client.delete_company(company_id)
            except Exception as e:
                cleanup_errors.append(f"delete_company: {e!r}"[:100])

        row["cleanup"] = {"ok": len(cleanup_errors) == 0, "errors": cleanup_errors}

    return row


async def _run_all_cases() -> list[dict[str, Any]]:
    cases = _load_cases()
    if not cases:
        pytest.skip("No interview cases matched the selected suite")

    rows: list[dict[str, Any]] = []
    async with StagingClient() as client:
        await _cleanup_stale_companies(client)
        for case in cases:
            row = await _run_single_case(client, case)
            rows.append(row)
            print(f"[interview] {row['caseId']}: {row['status']} ({row['durationMs']}ms)")

    return rows


@pytest.mark.integration
@pytest.mark.asyncio
async def test_live_interview_report():
    if os.getenv("RUN_LIVE_INTERVIEW") != "1":
        pytest.skip("RUN_LIVE_INTERVIEW != 1")

    rows = await _run_all_cases()
    json_path, md_path = write_conversation_report("interview", rows)
    print(f"[interview] report: {json_path}")

    hard_failures = [r for r in rows if r["failureKind"] in ("crash", "api_error", "deterministic_fail")]
    if hard_failures:
        names = [r["caseId"] for r in hard_failures]
        pytest.fail(f"Interview hard failures: {names}")
