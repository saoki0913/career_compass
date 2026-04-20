"""Search query CRUD Live integration test.

Gated by RUN_LIVE_SEARCH_QUERY=1.
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
        # Case 1: Basic search
        t0 = perf_counter()
        fails: list[str] = []
        try:
            result = await client.search("テスト")
            if not isinstance(result, dict):
                fails.append("search_result_not_dict")
        except Exception as exc:
            fails.append(f"exception: {exc!r}"[:200])
        rows.append(build_crud_row(
            "search_basic", "基本検索",
            fail_reasons=fails,
            duration_ms=int((perf_counter() - t0) * 1000),
        ))

        # Case 2: Empty query — 400 is valid (server rejects empty queries)
        t0 = perf_counter()
        fails = []
        try:
            result = await client.search("")
            if not isinstance(result, dict):
                fails.append("empty_search_not_dict")
        except Exception as exc:
            if "400" not in str(exc):
                fails.append(f"exception: {exc!r}"[:200])
        rows.append(build_crud_row(
            "search_empty", "空クエリ検索",
            fail_reasons=fails,
            duration_ms=int((perf_counter() - t0) * 1000),
        ))

    return rows


@pytest.mark.integration
@pytest.mark.asyncio
async def test_live_search_query_report() -> None:
    if os.getenv("RUN_LIVE_SEARCH_QUERY") != "1":
        pytest.skip("Set RUN_LIVE_SEARCH_QUERY=1 to enable")

    rows = await _run_cases()
    json_path, _ = write_crud_report("search_query", rows)
    print(f"[search_query] report: {json_path}")

    hard_failures = [r for r in rows if r["failureKind"] not in ("pass", "degraded")]
    if hard_failures:
        pytest.fail(f"Search query hard failures: {[r['caseId'] for r in hard_failures]}")
