"""Notifications CRUD Live integration test.

Gated by RUN_LIVE_NOTIFICATIONS=1.
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
        # Case 1: GET notifications list
        t0 = perf_counter()
        fails: list[str] = []
        try:
            notifs = await client.get_notifications()
            if not isinstance(notifs, list):
                fails.append("notifications_not_list")
        except Exception as exc:
            fails.append(f"exception: {exc!r}"[:200])
        rows.append(build_crud_row(
            "notifications_list", "通知一覧取得",
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
            "notifications_settings", "通知設定取得",
            fail_reasons=fails,
            duration_ms=int((perf_counter() - t0) * 1000),
        ))

        # Case 3: GET profile (merged from profile-settings)
        t0 = perf_counter()
        fails = []
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

    return rows


@pytest.mark.integration
@pytest.mark.asyncio
async def test_live_notifications_report() -> None:
    if os.getenv("RUN_LIVE_NOTIFICATIONS") != "1":
        pytest.skip("Set RUN_LIVE_NOTIFICATIONS=1 to enable")

    rows = await _run_cases()
    json_path, _ = write_crud_report("notifications", rows)
    print(f"[notifications] report: {json_path}")

    hard_failures = [r for r in rows if r["failureKind"] not in ("pass", "degraded")]
    if hard_failures:
        pytest.fail(f"Notifications hard failures: {[r['caseId'] for r in hard_failures]}")
