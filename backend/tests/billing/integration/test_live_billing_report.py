"""Billing CRUD Live integration test — read-only.

Gated by RUN_LIVE_BILLING=1.
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
        # Case 1: GET credits
        t0 = perf_counter()
        fails: list[str] = []
        try:
            data = await client.get_credits()
            if "balance" not in data and "credits" not in data:
                fails.append("credits_response_missing_balance")
        except Exception as exc:
            fails.append(f"exception: {exc!r}"[:200])
        rows.append(build_crud_row(
            "billing_get_credits", "クレジット残高取得",
            fail_reasons=fails,
            duration_ms=int((perf_counter() - t0) * 1000),
        ))

    return rows


@pytest.mark.integration
@pytest.mark.asyncio
async def test_live_billing_report() -> None:
    if os.getenv("RUN_LIVE_BILLING") != "1":
        pytest.skip("Set RUN_LIVE_BILLING=1 to enable")

    rows = await _run_cases()
    json_path, _ = write_crud_report("billing", rows)
    print(f"[billing] report: {json_path}")

    hard_failures = [r for r in rows if r["failureKind"] not in ("pass", "degraded")]
    if hard_failures:
        pytest.fail(f"Billing hard failures: {[r['caseId'] for r in hard_failures]}")
