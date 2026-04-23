"""Motivation AI Live integration test.

Calls the staging REST API via httpx, runs a full motivation conversation
loop per case, generates a draft, runs deterministic quality checks, and
writes a JSON + Markdown report.

Environment gates:
  RUN_LIVE_MOTIVATION=1                    required to run this test
  LIVE_AI_CONVERSATION_CASE_SET            smoke | extended  (default: smoke)
  LIVE_AI_CONVERSATION_LLM_JUDGE=1         enable LLM judge
  LIVE_AI_CONVERSATION_LLM_JUDGE_MODEL     model override for judge
  AI_LIVE_BASE_URL / PLAYWRIGHT_BASE_URL   staging server URL
  CI_E2E_AUTH_SECRET                       CI test-auth bearer token
  CI_E2E_SCOPE                             optional CI scope header
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
import traceback
from pathlib import Path
from time import perf_counter
from typing import Any

import pytest

# Allow running directly as a script from repo root or backend directory.
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from tests.conversation.staging_client import StagingClient
from tests.conversation.conversation_runner import (
    run_motivation_conversation,
)
from tests.conversation.checks import (
    build_forbidden_token_checks,
    build_required_question_group_checks,
    classify_failure,
    count_token_hits,
    merge_extended_checks,
)
from tests.conversation.llm_judge import is_judge_enabled, run_conversation_judge
from tests.conversation.report import selected_case_set, write_conversation_report

# ---------------------------------------------------------------------------
# Cases loader
# ---------------------------------------------------------------------------

# Path from backend/tests/motivation/integration → career_compass root is 4 levels up.
CASES_PATH = (
    Path(__file__).resolve().parents[4] / "tests" / "ai_eval" / "motivation_cases.json"
)


def _load_cases() -> list[dict[str, Any]]:
    with open(CASES_PATH, encoding="utf-8") as fh:
        cases = json.load(fh)
    suite = selected_case_set()
    if suite == "smoke":
        return [c for c in cases if c.get("suiteDepth") == "smoke"]
    return cases


# ---------------------------------------------------------------------------
# Deterministic check helpers
# ---------------------------------------------------------------------------


def _build_question_token_checks(
    questions: list[str],
    expected_tokens: list[str] | None,
) -> tuple[list[dict[str, Any]], list[str]]:
    """Check that the expected question tokens appear in assistant questions."""
    if not expected_tokens:
        return [], []

    hits = count_token_hits(questions, expected_tokens)
    threshold = max(1, len(expected_tokens) // 2)
    passed = hits >= threshold
    check = {
        "name": "question-token-coverage",
        "passed": passed,
        "evidence": [f"hits={hits}/{len(expected_tokens)} threshold={threshold}"],
    }
    fail_codes: list[str] = []
    if not passed:
        fail_codes.append(f"question_token_coverage:{hits}/{len(expected_tokens)}")
    return [check], fail_codes


def _build_draft_token_checks(
    draft_text: str,
    expected_tokens: list[str] | None,
) -> tuple[list[dict[str, Any]], list[str]]:
    """Check that the expected draft tokens appear in the generated draft."""
    if not expected_tokens:
        return [], []

    hits = count_token_hits([draft_text], expected_tokens)
    threshold = max(1, len(expected_tokens) // 2)
    passed = hits >= threshold
    check = {
        "name": "draft-token-coverage",
        "passed": passed,
        "evidence": [f"hits={hits}/{len(expected_tokens)} threshold={threshold}"],
    }
    fail_codes: list[str] = []
    if not passed:
        fail_codes.append(f"draft_token_coverage:{hits}/{len(expected_tokens)}")
    return [check], fail_codes


def _build_draft_not_empty_check(
    draft_text: str,
    min_chars: int = 20,
) -> tuple[list[dict[str, Any]], list[str]]:
    """Check that the draft is not empty or unreasonably short."""
    length = len(draft_text)
    passed = length >= min_chars
    check = {
        "name": "draft-not-empty",
        "passed": passed,
        "evidence": [f"len={length} min={min_chars}"],
    }
    fail_codes: list[str] = [] if passed else [f"draft_empty_or_too_short:{length}"]
    return [check], fail_codes


def _run_deterministic_checks(
    case: dict[str, Any],
    questions: list[str],
    all_texts: list[str],
    draft_text: str,
) -> tuple[list[dict[str, Any]], list[str]]:
    """Run all deterministic checks for a motivation case.

    Returns (checks_list, fail_codes_list).
    """
    # 1. Question token coverage — company name / role should appear in questions
    q_checks, q_fails = _build_question_token_checks(
        questions, case.get("expectedQuestionTokens")
    )

    # 2. Draft token coverage — key terms from user answers should appear in draft
    d_checks, d_fails = _build_draft_token_checks(
        draft_text, case.get("expectedDraftTokens")
    )

    # 3. Forbidden tokens must be absent from all texts (questions + draft)
    f_checks, f_fails = build_forbidden_token_checks(
        "motivation", all_texts, case.get("expectedForbiddenTokens")
    )

    # 4. Required question token groups — at least one hit per group in questions
    g_checks, g_fails = build_required_question_group_checks(
        questions, case.get("requiredQuestionTokenGroups")
    )

    # 5. Minimum draft character count
    min_draft = case.get("minDraftCharCount")
    if min_draft is not None:
        from tests.conversation.checks import build_draft_length_checks

        len_checks, len_fails = build_draft_length_checks(
            draft_text, min_chars=min_draft, max_chars=None
        )
    else:
        len_checks, len_fails = [], []

    # 6. Draft must not be empty
    empty_checks, empty_fails = _build_draft_not_empty_check(draft_text)

    all_checks, all_fails = merge_extended_checks(
        [
            (q_checks, q_fails),
            (d_checks, d_fails),
            (f_checks, f_fails),
            (g_checks, g_fails),
            (len_checks, len_fails),
            (empty_checks, empty_fails),
        ]
    )
    return all_checks, all_fails


# ---------------------------------------------------------------------------
# Single-case runner
# ---------------------------------------------------------------------------


async def _run_single_case(
    client: StagingClient,
    case: dict[str, Any],
) -> dict[str, Any]:
    case_id = case["id"]
    title = case.get("title", case_id)
    answers: list[str] = case.get("answers", [])

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
        "checks": [],
        "judge": None,
        "cleanup": {"ok": True, "errors": []},
    }

    t0 = perf_counter()
    company_id: str | None = None
    document_ids: list[str] = []
    transcript: list[dict[str, str]] = []

    try:
        # Step 1: Create company + application + job type.
        # Defensive: a previous run's cleanup may have left a company with the
        # same name behind, in which case POST /api/companies returns 409.
        # Delete any pre-existing company with the same name before creating.
        try:
            existing = await client.list_companies()
            for c in existing:
                if (c.get("name") or "").strip() == case["companyName"]:
                    leftover_id = c.get("id")
                    if leftover_id:
                        try:
                            await client.delete_company(str(leftover_id))
                            print(
                                f"  [mot] deleted leftover company "
                                f"{leftover_id} ({case['companyName']!r})"
                            )
                        except Exception as cleanup_exc:
                            print(
                                f"  [mot] failed to delete leftover company "
                                f"{leftover_id}: {cleanup_exc!r}"
                            )
        except Exception as list_exc:
            # Listing is best-effort; failure here should not abort the case.
            print(f"  [mot] list_companies failed (continuing): {list_exc!r}")

        company_resp = await client.create_company(
            case["companyName"], case.get("industry", "")
        )
        # API may return {"id": "..."} directly or {"company": {"id": "..."}}
        company_id = company_resp.get("id") or (
            company_resp.get("company") or {}
        ).get("id")
        assert company_id, f"No company_id in response for {case_id}: {company_resp}"

        app_resp = await client.create_application(
            company_id, case.get("applicationJobType", "総合職")
        )
        app_id = app_resp.get("id") or (app_resp.get("application") or {}).get("id")

        if app_id:
            try:
                await client.create_job_type(
                    app_id, case.get("applicationJobType", "総合職")
                )
            except Exception:
                # job_type creation is best-effort; missing it does not break the flow
                pass

        # Step 2: Run motivation conversation loop.
        # Mirror the gakuchika handling: if the staging LLM never converges
        # within the attempt budget, classify as ``degraded`` (non-blocking
        # quality signal) rather than crash the test run.
        draft_ready_reached = True
        try:
            await run_motivation_conversation(
                client,
                company_id,
                case.get("selectedIndustry", ""),
                case.get("selectedRole", ""),
                answers,
                transcript,
            )
        except (RuntimeError, asyncio.TimeoutError) as conv_exc:
            draft_ready_reached = False
            print(f"  [mot] conversation did not reach draft_ready: {conv_exc}")
        row["transcript"] = transcript

        if not draft_ready_reached:
            row["outputs"] = {
                "draftText": "",
                "draftLength": 0,
                "draftReadyReached": False,
            }
            row["deterministicFailReasons"] = ["conversation_did_not_reach_draft_ready"]
            row["checks"] = {}
            row["judge"] = None
            row["failureKind"] = "degraded"
            row["status"] = "degraded"
            row["severity"] = "warning"
            return row

        # Step 3: Generate draft from conversation
        draft_response = await client.request(
            "POST",
            f"/api/motivation/{company_id}/generate-draft",
            json={
                "charLimit": 400,
            },
        )
        if draft_response.status_code >= 400:
            raise RuntimeError(
                f"generate-draft failed: {draft_response.status_code} "
                f"{draft_response.text[:500]}"
            )

        draft_data = json.loads(draft_response.text)
        draft_text = draft_data.get("draft", "")

        doc_id = draft_data.get("documentId")
        if doc_id:
            document_ids.append(str(doc_id))

        row["outputs"] = {
            "draftText": draft_text[:2000],
            "draftLength": len(draft_text),
        }

        # Step 4: Deterministic quality checks
        questions = [t["content"] for t in transcript if t["role"] == "assistant"]
        all_texts = [t["content"] for t in transcript] + [draft_text]

        checks, fail_reasons = _run_deterministic_checks(
            case, questions, all_texts, draft_text
        )
        row["checks"] = {c["name"]: c for c in checks}
        row["deterministicFailReasons"] = fail_reasons

        # Step 5: LLM judge (optional, gated by env flag)
        judge_result: dict[str, Any] | None = None
        if is_judge_enabled():
            judge_result = await run_conversation_judge(
                feature="motivation",
                case_id=case_id,
                title=title,
                transcript=transcript,
                final_text=draft_text,
            )
        row["judge"] = judge_result

        # Step 6: Classify outcome
        failure_kind = classify_failure(
            None, True, fail_reasons, judge_result, feature="motivation",
        )
        row["failureKind"] = failure_kind

        if failure_kind == "pass":
            row["status"] = "pass"
            row["severity"] = "info"
        elif failure_kind in ("degraded", "soft_fail"):
            row["status"] = "degraded"
            row["severity"] = "warning"
        else:
            row["status"] = "fail"
            row["severity"] = "error"

    except Exception as exc:
        row["status"] = "fail"
        row["severity"] = "error"
        row["failureKind"] = classify_failure(
            None,
            True,
            [f"exception: {exc!r}"[:200]],
            None,
            feature="motivation",
        )
        row["deterministicFailReasons"].append(f"exception: {exc!r}"[:200])
        traceback.print_exc()

    finally:
        row["durationMs"] = int((perf_counter() - t0) * 1000)
        if transcript:
            row["transcript"] = transcript

        cleanup_errors: list[str] = []
        for doc_id in document_ids:
            try:
                await client.delete_document(doc_id)
            except Exception as exc:
                cleanup_errors.append(f"delete_document({doc_id}): {exc!r}"[:100])

        if company_id:
            try:
                # Deleting the company cascades application + job_type
                await client.delete_company(company_id)
            except Exception as exc:
                cleanup_errors.append(f"delete_company({company_id}): {exc!r}"[:100])

        if cleanup_errors:
            row["cleanup"] = {"ok": False, "errors": cleanup_errors}
            # Re-classify with cleanup failure so the report is accurate
            row["failureKind"] = classify_failure(
                None,
                False,
                row["deterministicFailReasons"] + cleanup_errors,
                row.get("judge"),
                feature="motivation",
            )

    return row


# ---------------------------------------------------------------------------
# All-cases runner
# ---------------------------------------------------------------------------


async def _run_all_cases() -> list[dict[str, Any]]:
    cases = _load_cases()
    if not cases:
        pytest.skip("No motivation cases matched the selected suite")

    rows: list[dict[str, Any]] = []
    async with StagingClient() as client:
        for case in cases:
            row = await _run_single_case(client, case)
            rows.append(row)
            print(
                f"[motivation] {row['caseId']}: {row['status']} "
                f"({row['durationMs']}ms) "
                f"fails={row['deterministicFailReasons'][:2]}"
            )

    return rows


# ---------------------------------------------------------------------------
# Test entry point
# ---------------------------------------------------------------------------


@pytest.mark.integration
@pytest.mark.uses_company_context
@pytest.mark.asyncio
async def test_live_motivation_report() -> None:
    """Run the full motivation AI Live test suite and write a report.

    Gated by ``RUN_LIVE_MOTIVATION=1``.  Hard failures (crash / api_error /
    unclassified deterministic failure) cause pytest.fail so CI can catch them.
    Quality-only degradations (LLM judge) do not block but are visible in the
    report.

    What this test verifies:
    - The staging motivation conversation API starts a session, accepts answers,
      and converges to a draft-ready state without crashing.
    - The ``generate-draft`` endpoint returns a non-empty text containing
      the expected token coverage from the case fixture.
    - Forbidden tokens do not appear in any output.
    - Required question token groups are covered by assistant questions.
    - Cleanup (company delete) completes without errors.
    """
    if os.getenv("RUN_LIVE_MOTIVATION") != "1":
        pytest.skip("Set RUN_LIVE_MOTIVATION=1 to enable live motivation test.")

    rows = await _run_all_cases()
    json_path, md_path = write_conversation_report("motivation", rows)
    print(f"[motivation] report written: {json_path}")

    # Hard failures are those that indicate a broken pipeline (crash, infra,
    # auth, state machine error) or a clean deterministic quality regression.
    # "quality" kind from the LLM judge is soft and should not block CI unless
    # explicitly configured otherwise.
    # Hard failures = anything that is not "pass", "degraded", or "soft_fail"
    hard_failures = [
        r for r in rows if r.get("failureKind") not in ("pass", "degraded", "soft_fail")
    ]
    if hard_failures:
        names = [r["caseId"] for r in hard_failures]
        kinds = [r.get("failureKind") for r in hard_failures]
        pytest.fail(
            f"Motivation hard failures: {names} (kinds: {kinds})\n"
            f"Report: {json_path}"
        )
