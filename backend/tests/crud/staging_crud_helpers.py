"""CRUD test assertion helpers and report row builder."""
from __future__ import annotations

from time import perf_counter
from typing import Any

LIVE_CRUD_COMPANY_PREFIX = "_live-crud-"


def assert_status(response: Any, expected: int) -> None:
    actual = getattr(response, "status_code", None)
    if actual != expected:
        body = getattr(response, "text", "")[:300]
        raise AssertionError(f"Expected status {expected}, got {actual}: {body}")


def assert_json_field(data: dict[str, Any], field: str, expected: Any) -> None:
    actual = data.get(field)
    if actual != expected:
        raise AssertionError(f"Field {field!r}: expected {expected!r}, got {actual!r}")


def build_crud_row(
    case_id: str,
    title: str,
    *,
    checks: list[dict[str, Any]] | None = None,
    fail_reasons: list[str] | None = None,
    duration_ms: int = 0,
    cleanup_ok: bool = True,
    cleanup_errors: list[str] | None = None,
) -> dict[str, Any]:
    all_checks = checks or []
    all_fails = fail_reasons or []
    passed = len(all_fails) == 0

    return {
        "caseId": case_id,
        "title": title,
        "status": "pass" if passed else "fail",
        "severity": "info" if passed else "error",
        "failureKind": "pass" if passed else "deterministic_fail",
        "durationMs": duration_ms,
        "transcript": [],
        "outputs": {},
        "deterministicFailReasons": all_fails,
        "checks": {c["name"]: c for c in all_checks},
        "judge": None,
        "cleanup": {
            "ok": cleanup_ok,
            "errors": cleanup_errors or [],
        },
    }
