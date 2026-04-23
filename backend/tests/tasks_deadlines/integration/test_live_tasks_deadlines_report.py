"""Tasks & Deadlines CRUD Live integration test.

Gated by RUN_LIVE_TASKS_DEADLINES=1.
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
        # Case 1: GET tasks list
        t0 = perf_counter()
        fails: list[str] = []
        try:
            tasks_list = await client.get_tasks()
            if not isinstance(tasks_list, list):
                fails.append("tasks_not_list")
        except Exception as exc:
            fails.append(f"exception: {exc!r}"[:200])
        rows.append(build_crud_row(
            "tasks_list", "タスク一覧取得",
            fail_reasons=fails,
            duration_ms=int((perf_counter() - t0) * 1000),
        ))

        # Case 2: GET deadlines list
        t0 = perf_counter()
        fails = []
        try:
            deadlines_list = await client.get_deadlines()
            if not isinstance(deadlines_list, list):
                fails.append("deadlines_not_list")
        except Exception as exc:
            fails.append(f"exception: {exc!r}"[:200])
        rows.append(build_crud_row(
            "deadlines_list", "締切一覧取得",
            fail_reasons=fails,
            duration_ms=int((perf_counter() - t0) * 1000),
        ))

    return rows


@pytest.mark.integration
@pytest.mark.asyncio
async def test_live_tasks_deadlines_report() -> None:
    if os.getenv("RUN_LIVE_TASKS_DEADLINES") != "1":
        pytest.skip("Set RUN_LIVE_TASKS_DEADLINES=1 to enable")

    rows = await _run_cases()
    json_path, _ = write_crud_report("tasks_deadlines", rows)
    print(f"[tasks_deadlines] report: {json_path}")

    hard_failures = [r for r in rows if r["failureKind"] not in ("pass", "degraded")]
    if hard_failures:
        pytest.fail(f"Tasks/Deadlines hard failures: {[r['caseId'] for r in hard_failures]}")
