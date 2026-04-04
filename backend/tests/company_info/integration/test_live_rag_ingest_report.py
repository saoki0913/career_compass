from __future__ import annotations

import os
import sys
import uuid
from dataclasses import dataclass
from pathlib import Path
from time import perf_counter
from typing import Any

import pytest

from tests.company_info.integration.live_feature_report import (
    selected_case_set,
    write_live_feature_report,
)


@dataclass(frozen=True)
class LiveRagIngestCase:
    case_id: str
    company_name: str
    content_type: str
    content_channel: str


SMOKE_CASES = [
    LiveRagIngestCase(
        case_id="toyota-corporate-site",
        company_name="トヨタ自動車",
        content_type="corporate_site",
        content_channel="corporate_general",
    ),
    LiveRagIngestCase(
        case_id="sony-ir-materials",
        company_name="ソニーグループ",
        content_type="ir_materials",
        content_channel="corporate_ir",
    ),
]

EXTENDED_CASES = [
    *SMOKE_CASES,
    LiveRagIngestCase(
        case_id="nttdata-midterm-plan",
        company_name="NTTデータグループ",
        content_type="midterm_plan",
        content_channel="corporate_ir",
    ),
]


def _selected_cases() -> list[LiveRagIngestCase]:
    return EXTENDED_CASES if selected_case_set() == "extended" else SMOKE_CASES


def _cleanup_payload(ok: bool, removed_ids: list[str] | None = None, note: str | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {"ok": ok, "removedIds": removed_ids or []}
    if note:
        payload["note"] = note
    return payload


def _append_check(checks: list[dict[str, Any]], name: str, passed: bool, *evidence: object) -> None:
    checks.append(
        {
            "name": name,
            "passed": passed,
            "evidence": [str(item) for item in evidence if item is not None and str(item) != ""],
        }
    )


@pytest.mark.integration
@pytest.mark.slow
@pytest.mark.asyncio
async def test_live_rag_ingest_report() -> None:
    if os.getenv("RUN_LIVE_RAG_INGEST") != "1":
        pytest.skip("Set RUN_LIVE_RAG_INGEST=1 to enable live RAG ingest report test.")

    backend_root = Path(__file__).resolve().parents[3]
    if str(backend_root) not in sys.path:
        sys.path.insert(0, str(backend_root))

    from app.routers.company_info import (
        CrawlCorporateRequest,
        DeleteByUrlsRequest,
        SearchCorporatePagesRequest,
        crawl_corporate_pages,
        delete_rag,
        delete_rag_by_urls,
        get_detailed_rag_status,
        search_corporate_pages,
    )
    from app.utils.embeddings import resolve_embedding_backend
    from app.utils.web_search import HAS_DDGS

    if not HAS_DDGS:
        pytest.skip("ddgs is not installed; live company RAG ingest is unavailable.")
    if resolve_embedding_backend() is None:
        pytest.skip("No embedding backend is configured for live RAG ingest.")

    rows: list[dict[str, Any]] = []

    for case in _selected_cases():
        started = perf_counter()
        company_id = f"ai-live-rag-{case.case_id}-{uuid.uuid4().hex[:10]}"
        checks: list[dict[str, Any]] = []
        deterministic_fail_reasons: list[str] = []
        cleanup = _cleanup_payload(ok=True)
        candidate_url: str | None = None

        try:
            candidates_payload = await search_corporate_pages(
                SearchCorporatePagesRequest(
                    company_name=case.company_name,
                    content_type=case.content_type,
                    max_results=3,
                    strict_company_match=True,
                    allow_aggregators=False,
                    cache_mode="refresh",
                ),
                request=None,
            )
            candidates = list(candidates_payload.get("candidates") or [])
            candidate_url = candidates[0].url if candidates else None
            _append_check(checks, "search_candidates_found", bool(candidates), f"count={len(candidates)}")

            if not candidates or candidate_url is None:
                deterministic_fail_reasons.append("crawl_failure")
                rows.append(
                    {
                        "caseId": case.case_id,
                        "title": f"{case.company_name} {case.content_type}",
                        "status": "failed",
                        "severity": "failed",
                        "durationMs": int((perf_counter() - started) * 1000),
                        "deterministicFailReasons": deterministic_fail_reasons,
                        "checks": checks,
                        "cleanup": cleanup,
                    }
                )
                continue

            crawl_response = await crawl_corporate_pages(
                CrawlCorporateRequest(
                    company_id=company_id,
                    company_name=case.company_name,
                    urls=[candidate_url],
                    content_type=case.content_type,
                    content_channel=case.content_channel,
                ),
                request=None,
            )

            _append_check(
                checks,
                "crawl_success",
                bool(crawl_response.success),
                f"pages_crawled={crawl_response.pages_crawled}",
                f"chunks_stored={crawl_response.chunks_stored}",
            )
            if not crawl_response.success or crawl_response.pages_crawled <= 0:
                deterministic_fail_reasons.append("crawl_failure")
            if crawl_response.chunks_stored <= 0:
                deterministic_fail_reasons.append("chunks_stored_zero")

            status_response = await get_detailed_rag_status(company_id, request=None)
            _append_check(
                checks,
                "rag_status_available",
                bool(status_response.has_rag),
                f"total_chunks={status_response.total_chunks}",
            )
            if not status_response.has_rag or status_response.total_chunks <= 0:
                deterministic_fail_reasons.append("store_failure")

            url_cleanup = await delete_rag_by_urls(
                company_id,
                DeleteByUrlsRequest(urls=[candidate_url]),
                request=None,
            )
            await delete_rag(company_id, request=None)
            final_status = await get_detailed_rag_status(company_id, request=None)
            cleanup_ok = bool(url_cleanup.success) and not final_status.has_rag
            cleanup = _cleanup_payload(
                ok=cleanup_ok,
                removed_ids=[candidate_url],
                note=f"chunks_deleted={url_cleanup.chunks_deleted}",
            )
            _append_check(
                checks,
                "cleanup_rag_removed",
                cleanup_ok,
                f"chunks_deleted={url_cleanup.chunks_deleted}",
                f"has_rag_after_cleanup={final_status.has_rag}",
            )
            if not cleanup_ok:
                deterministic_fail_reasons.append("cleanup_failed")

            rows.append(
                {
                    "caseId": case.case_id,
                    "title": f"{case.company_name} {case.content_type}",
                    "status": "passed" if crawl_response.success else "failed",
                    "severity": "passed" if not deterministic_fail_reasons else "failed",
                    "durationMs": int((perf_counter() - started) * 1000),
                    "sourceUrl": candidate_url,
                    "deterministicFailReasons": deterministic_fail_reasons,
                    "checks": checks,
                    "cleanup": cleanup,
                }
            )
        except Exception as exc:
            try:
                await delete_rag(company_id, request=None)
                final_status = await get_detailed_rag_status(company_id, request=None)
                cleanup = _cleanup_payload(ok=not final_status.has_rag, removed_ids=[candidate_url] if candidate_url else [])
            except Exception:
                cleanup = _cleanup_payload(ok=False, removed_ids=[candidate_url] if candidate_url else [])
            rows.append(
                {
                    "caseId": case.case_id,
                    "title": f"{case.company_name} {case.content_type}",
                    "status": "failed",
                    "severity": "failed",
                    "durationMs": int((perf_counter() - started) * 1000),
                    "sourceUrl": candidate_url,
                    "deterministicFailReasons": ["crawl_failure"],
                    "checks": checks,
                    "cleanup": cleanup,
                    "error": str(exc),
                }
            )

    json_path, md_path = write_live_feature_report(
        report_type="rag_ingest",
        display_name="企業RAG取り込み",
        rows=rows,
    )
    assert json_path.exists()
    assert md_path.exists()
