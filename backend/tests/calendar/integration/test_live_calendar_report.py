"""Calendar CRUD Live integration test — OAuth-free endpoints only.

Gated by RUN_LIVE_CALENDAR=1.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path
from time import perf_counter
from typing import Any

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from tests.conversation.staging_client import StagingClient
from tests.crud.staging_crud_helpers import build_crud_row
from tests.crud.report import write_crud_report


async def _run_cases() -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    async with StagingClient() as client:
        # Case 1: GET calendar settings
        t0 = perf_counter()
        fails: list[str] = []
        try:
            settings = await client.get_calendar_settings()
            if not isinstance(settings, dict):
                fails.append("calendar_settings_not_dict")
        except Exception as exc:
            fails.append(f"exception: {exc!r}"[:200])
        rows.append(build_crud_row(
            "calendar_settings_get", "カレンダー設定取得",
            fail_reasons=fails,
            duration_ms=int((perf_counter() - t0) * 1000),
        ))

        # Case 2: GET connection status
        t0 = perf_counter()
        fails = []
        try:
            status = await client.get_calendar_connection_status()
            if not isinstance(status, dict):
                fails.append("connection_status_not_dict")
        except Exception as exc:
            fails.append(f"exception: {exc!r}"[:200])
        rows.append(build_crud_row(
            "calendar_connection_status", "カレンダー接続状態確認",
            fail_reasons=fails,
            duration_ms=int((perf_counter() - t0) * 1000),
        ))

    return rows


@pytest.mark.integration
@pytest.mark.asyncio
async def test_live_calendar_report() -> None:
    if os.getenv("RUN_LIVE_CALENDAR") != "1":
        pytest.skip("Set RUN_LIVE_CALENDAR=1 to enable")

    rows = await _run_cases()
    json_path, _ = write_crud_report("calendar", rows)
    print(f"[calendar] report: {json_path}")

    hard_failures = [r for r in rows if r["failureKind"] not in ("pass", "degraded")]
    if hard_failures:
        pytest.fail(f"Calendar hard failures: {[r['caseId'] for r in hard_failures]}")
