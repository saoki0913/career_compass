"""Company CRUD Live integration test.

Gated by RUN_LIVE_COMPANY_CRUD=1.
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
from tests.crud.staging_crud_helpers import LIVE_CRUD_COMPANY_PREFIX, build_crud_row
from tests.crud.report import write_crud_report


def _crud_company_name(case_id: str) -> str:
    from datetime import datetime, timezone
    ts = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    return f"{LIVE_CRUD_COMPANY_PREFIX}{case_id}-{ts}"


async def _run_cases() -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    async with StagingClient() as client:
        # Case 1: Create + Read + Delete
        t0 = perf_counter()
        fails: list[str] = []
        company_id: str | None = None
        try:
            name = _crud_company_name("crud-create")
            resp = await client.create_company(name, "IT")
            company_id = resp.get("id") or (resp.get("company") or {}).get("id")
            if not company_id:
                fails.append("create_no_id")

            companies = await client.list_companies()
            found = any(c.get("id") == company_id for c in companies)
            if not found:
                fails.append("created_company_not_in_list")
        except Exception as exc:
            fails.append(f"exception: {exc!r}"[:200])
        finally:
            if company_id:
                try:
                    await client.delete_company(company_id)
                except Exception:
                    pass
        rows.append(build_crud_row(
            "company_create_read_delete", "企業の作成・取得・削除",
            fail_reasons=fails,
            duration_ms=int((perf_counter() - t0) * 1000),
        ))

        # Case 2: List companies
        t0 = perf_counter()
        fails = []
        try:
            companies = await client.list_companies()
            if not isinstance(companies, list):
                fails.append("list_not_array")
        except Exception as exc:
            fails.append(f"exception: {exc!r}"[:200])
        rows.append(build_crud_row(
            "company_list", "企業一覧取得",
            fail_reasons=fails,
            duration_ms=int((perf_counter() - t0) * 1000),
        ))

    return rows


@pytest.mark.integration
@pytest.mark.asyncio
async def test_live_company_crud_report() -> None:
    if os.getenv("RUN_LIVE_COMPANY_CRUD") != "1":
        pytest.skip("Set RUN_LIVE_COMPANY_CRUD=1 to enable")

    rows = await _run_cases()
    json_path, _ = write_crud_report("company_crud", rows)
    print(f"[company_crud] report: {json_path}")

    hard_failures = [r for r in rows if r["failureKind"] not in ("pass", "degraded")]
    if hard_failures:
        pytest.fail(f"Company CRUD hard failures: {[r['caseId'] for r in hard_failures]}")
