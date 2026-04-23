"""Profile settings CRUD Live integration test.

Gated by RUN_LIVE_PROFILE_SETTINGS=1.
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
        # Case 1: GET profile
        t0 = perf_counter()
        fails: list[str] = []
        try:
            profile = await client.get_profile()
            if not isinstance(profile, dict):
                fails.append("profile_not_dict")
        except Exception as exc:
            fails.append(f"exception: {exc!r}"[:200])
        rows.append(build_crud_row(
            "profile_get", "プロフィール取得",
            fail_reasons=fails,
            duration_ms=int((perf_counter() - t0) * 1000),
        ))

        # Case 2: GET notification settings
        t0 = perf_counter()
        fails = []
        try:
            settings = await client.get_notification_settings()
            if not isinstance(settings, dict):
                fails.append("notification_settings_not_dict")
        except Exception as exc:
            fails.append(f"exception: {exc!r}"[:200])
        rows.append(build_crud_row(
            "notification_settings_get", "通知設定取得",
            fail_reasons=fails,
            duration_ms=int((perf_counter() - t0) * 1000),
        ))

    return rows


@pytest.mark.integration
@pytest.mark.asyncio
async def test_live_profile_settings_report() -> None:
    if os.getenv("RUN_LIVE_PROFILE_SETTINGS") != "1":
        pytest.skip("Set RUN_LIVE_PROFILE_SETTINGS=1 to enable")

    rows = await _run_cases()
    json_path, _ = write_crud_report("profile_settings", rows)
    print(f"[profile_settings] report: {json_path}")

    hard_failures = [r for r in rows if r["failureKind"] not in ("pass", "degraded")]
    if hard_failures:
        pytest.fail(f"Profile settings hard failures: {[r['caseId'] for r in hard_failures]}")
