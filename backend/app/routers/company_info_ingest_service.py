"""Company info PDF and crawl orchestration service."""

from __future__ import annotations

import asyncio
import time
from typing import Optional
from urllib.parse import urlparse

from fastapi import HTTPException

from app.routers.company_info_models import (
    CrawlCorporateEstimateResponse,
    CrawlCorporateRequest,
    CrawlCorporateResponse,
    EstimateCorporatePdfResponse,
    UploadCorporatePdfResponse,
)
from app.routers.company_info_pdf import (
    _build_pdf_estimate_response,
    _extract_text_from_pdf_with_page_routing,
    _is_garbled_text,
    _normalize_rag_pdf_billing_plan,
    _pdf_ingest_telemetry_line,
)
from app.utils.http_fetch import extract_text_from_html
from app.utils.secure_logger import get_logger

logger = get_logger(__name__)


def _looks_like_pdf_payload(url: str, payload: bytes) -> bool:
    return url.lower().endswith(".pdf") or payload[:5] == b"%PDF-"


def _looks_like_html_payload(payload: bytes) -> bool:
    sample = payload[:512].lower()
    return b"<html" in sample or b"<!doctype html" in sample or b"<body" in sample


async def estimate_corporate_pdf_upload_impl(
    company_id: str,
    source_url: str,
    content_type: Optional[str],
    billing_plan: str,
    remaining_free_pdf_pages: int,
    pdf_bytes: bytes,
    filename: str,
) -> EstimateCorporatePdfResponse:
    plan = _normalize_rag_pdf_billing_plan(billing_plan)
    routing = await _extract_text_from_pdf_with_page_routing(
        pdf_bytes=pdf_bytes,
        filename=filename,
        billing_plan=plan,
        content_type=content_type,
        source_kind="upload",
        feature="company_info",
    )

    return _build_pdf_estimate_response(
        company_id=company_id,
        source_url=source_url,
        source_total_pages=routing["source_total_pages"],
        processed_pages=int(routing["processed_pages"]),
        page_routing_summary=dict(routing["page_routing_summary"]),
        processing_notice_ja=routing["processing_notice_ja"],
        remaining_free_pdf_pages=max(0, int(remaining_free_pdf_pages)),
    )


async def upload_corporate_pdf_impl(
    company_id: str,
    company_name: str,
    source_url: str,
    content_type: Optional[str],
    content_channel: Optional[str],
    billing_plan: str,
    pdf_bytes: bytes,
    filename: str,
    tenant_key: str,
) -> UploadCorporatePdfResponse:
    # Late-bound imports: tests monkeypatch these on the company_info module
    from app.routers import company_info as _ci

    resolve_embedding_backend = _ci.resolve_embedding_backend
    store_full_text_content = _ci.store_full_text_content

    t0 = time.monotonic()

    plan = _normalize_rag_pdf_billing_plan(billing_plan)

    backend = resolve_embedding_backend()
    if backend is None:
        _pdf_ingest_telemetry_line(
            ocr_ran=False,
            source_total_pages=None,
            processed_pages=None,
            ingest_truncated=False,
            ocr_truncated=False,
            est_cost_usd=None,
            elapsed_sec=time.monotonic() - t0,
            success=False,
            ocr_provider=None,
            ocr_route=None,
            quality_score=None,
            fallback_count=0,
            source_kind="upload",
        )
        return UploadCorporatePdfResponse(
            success=False,
            company_id=company_id,
            source_url=source_url,
            chunks_stored=0,
            extracted_chars=0,
            page_count=None,
            extraction_method="unavailable",
            errors=[
                "No embedding backend available. Set OPENAI_API_KEY or install sentence-transformers."
            ],
        )

    routing = await _extract_text_from_pdf_with_page_routing(
        pdf_bytes=pdf_bytes,
        filename=filename,
        billing_plan=plan,
        content_type=content_type,
        source_kind="upload",
        feature="company_info",
    )

    extracted_text = str(routing["text"] or "")
    extraction_method = str(routing["extraction_method"])
    source_total_pages = routing["source_total_pages"]
    processed_pages = int(routing["processed_pages"])
    ingest_truncated = bool(routing["ingest_truncated"])
    ocr_truncated = bool(routing["ocr_truncated"])
    processing_notice_ja = routing["processing_notice_ja"]
    page_routing_summary = dict(routing["page_routing_summary"])
    ocr_ran = bool(routing["ocr_ran"])
    ocr_est_usd = routing["ocr_est_usd"]
    ocr_provider = routing["ocr_provider"]
    ocr_route = routing["ocr_route"]
    ocr_quality_score = routing["ocr_quality_score"]
    ocr_fallback_count = int(routing["ocr_fallback_count"])

    if len(extracted_text.strip()) < 100:
        _pdf_ingest_telemetry_line(
            ocr_ran=ocr_ran,
            source_total_pages=source_total_pages,
            processed_pages=processed_pages,
            ingest_truncated=ingest_truncated,
            ocr_truncated=ocr_truncated,
            est_cost_usd=ocr_est_usd,
            elapsed_sec=time.monotonic() - t0,
            success=False,
            ocr_provider=ocr_provider,
            ocr_route=ocr_route,
            quality_score=ocr_quality_score,
            fallback_count=ocr_fallback_count,
            source_kind="upload",
        )
        return UploadCorporatePdfResponse(
            success=False,
            company_id=company_id,
            source_url=source_url,
            chunks_stored=0,
            extracted_chars=len(extracted_text.strip()),
            page_count=processed_pages,
            content_type=content_type,
            secondary_content_types=[],
            extraction_method=extraction_method,
            errors=["PDFから十分な本文テキストを抽出できませんでした。"],
            source_total_pages=source_total_pages,
            ingest_truncated=ingest_truncated,
            ocr_truncated=ocr_truncated,
            processing_notice_ja=processing_notice_ja,
            page_routing_summary=page_routing_summary,
        )

    channel = content_channel or (
        "corporate_ir"
        if content_type in {"ir_materials", "midterm_plan"}
        else "corporate_general"
    )

    result = await store_full_text_content(
        company_id=company_id,
        company_name=company_name,
        raw_text=extracted_text,
        source_url=source_url,
        content_type=content_type,
        content_channel=channel,
        backend=backend,
        raw_format="text",
        tenant_key=tenant_key,
    )

    if not result["success"]:
        _pdf_ingest_telemetry_line(
            ocr_ran=ocr_ran,
            source_total_pages=source_total_pages,
            processed_pages=processed_pages,
            ingest_truncated=ingest_truncated,
            ocr_truncated=ocr_truncated,
            est_cost_usd=ocr_est_usd,
            elapsed_sec=time.monotonic() - t0,
            success=False,
            ocr_provider=ocr_provider,
            ocr_route=ocr_route,
            quality_score=ocr_quality_score,
            fallback_count=ocr_fallback_count,
            source_kind="upload",
        )
        return UploadCorporatePdfResponse(
            success=False,
            company_id=company_id,
            source_url=source_url,
            chunks_stored=0,
            extracted_chars=len(extracted_text),
            page_count=processed_pages,
            content_type=content_type,
            secondary_content_types=[],
            extraction_method=extraction_method,
            errors=["PDFのRAG保存に失敗しました。"],
            source_total_pages=source_total_pages,
            ingest_truncated=ingest_truncated,
            ocr_truncated=ocr_truncated,
            processing_notice_ja=processing_notice_ja,
            page_routing_summary=page_routing_summary,
        )

    from app.utils.text_chunker import JapaneseTextChunker, get_chunk_settings

    effective_type = result.get("dominant_content_type") or content_type or "corporate_site"
    chunk_size, chunk_overlap = get_chunk_settings(effective_type)
    chunker = JapaneseTextChunker(chunk_size=chunk_size, chunk_overlap=chunk_overlap)
    chunks = chunker.chunk(extracted_text)

    _pdf_ingest_telemetry_line(
        ocr_ran=ocr_ran,
        source_total_pages=source_total_pages,
        processed_pages=processed_pages,
        ingest_truncated=ingest_truncated,
        ocr_truncated=ocr_truncated,
        est_cost_usd=ocr_est_usd,
        elapsed_sec=time.monotonic() - t0,
        success=True,
        ocr_provider=ocr_provider,
        ocr_route=ocr_route,
        quality_score=ocr_quality_score,
        fallback_count=ocr_fallback_count,
        source_kind="upload",
    )

    return UploadCorporatePdfResponse(
        success=True,
        company_id=company_id,
        source_url=source_url,
        chunks_stored=len(chunks),
        extracted_chars=len(extracted_text),
        page_count=processed_pages,
        content_type=result.get("dominant_content_type") or content_type,
        secondary_content_types=result.get("secondary_content_types") or [],
        extraction_method=extraction_method,
        errors=[],
        source_total_pages=source_total_pages,
        ingest_truncated=ingest_truncated,
        ocr_truncated=ocr_truncated,
        processing_notice_ja=processing_notice_ja,
        page_routing_summary=page_routing_summary,
    )


async def _process_crawl_source(
    *,
    company_id: str,
    company_name: str,
    url: str,
    content_type: str | None,
    content_channel: str,
    backend,
    billing_plan: str,
    store_result: bool,
    tenant_key: str,
) -> dict[str, object]:
    # Late-bound: tests monkeypatch fetch_page_content / store_full_text_content on company_info
    from app.routers import company_info as _ci

    store_full_text_content = _ci.store_full_text_content

    payload = await _ci.fetch_page_content(url)

    if _looks_like_pdf_payload(url, payload):
        routing = await _extract_text_from_pdf_with_page_routing(
            pdf_bytes=payload,
            filename=urlparse(url).path.split("/")[-1] or "document.pdf",
            billing_plan=billing_plan,
            content_type=content_type,
            source_kind="crawl",
            feature="company_info",
        )
        page_routing_summary = dict(routing["page_routing_summary"])
        text = str(routing["text"] or "").strip()
        if len(text) < 100:
            return {
                "success": False,
                "kind": "pdf",
                "error": "PDFから十分な本文テキストを抽出できませんでした",
                "page_routing_summary": page_routing_summary,
                "pages_crawled": 0,
                "chunks_stored": 0,
            }

        if not store_result:
            return {
                "success": True,
                "kind": "pdf",
                "pages_crawled": 1,
                "chunks_stored": 0,
                "page_routing_summary": page_routing_summary,
            }

        result = await store_full_text_content(
            company_id=company_id,
            company_name=company_name,
            raw_text=text,
            source_url=url,
            content_type=content_type,
            content_channel=content_channel,
            backend=backend,
            raw_format="text",
            tenant_key=tenant_key,
        )
        if not result["success"]:
            return {
                "success": False,
                "kind": "pdf",
                "error": "PDFのRAG保存に失敗しました",
                "page_routing_summary": page_routing_summary,
                "pages_crawled": 0,
                "chunks_stored": 0,
            }

        from app.utils.text_chunker import JapaneseTextChunker, get_chunk_settings

        effective_type = result.get("dominant_content_type") or content_type or "corporate_site"
        chunk_size, chunk_overlap = get_chunk_settings(effective_type)
        chunker = JapaneseTextChunker(chunk_size=chunk_size, chunk_overlap=chunk_overlap)
        chunks = chunker.chunk(text)
        return {
            "success": True,
            "kind": "pdf",
            "pages_crawled": 1,
            "chunks_stored": len(chunks),
            "page_routing_summary": page_routing_summary,
            "dominant_content_type": result.get("dominant_content_type"),
        }

    if not _looks_like_html_payload(payload):
        return {
            "success": False,
            "kind": "unsupported",
            "error": "HTML/PDF 以外のバイナリを検出したためスキップしました",
            "pages_crawled": 0,
            "chunks_stored": 0,
        }

    text = extract_text_from_html(payload)
    if not text or len(text) < 100 or _is_garbled_text(text):
        return {
            "success": False,
            "kind": "html",
            "error": "ページ本文が不足しているか文字化けしているためスキップしました",
            "pages_crawled": 0,
            "chunks_stored": 0,
        }

    if not store_result:
        return {
            "success": True,
            "kind": "html",
            "pages_crawled": 1,
            "chunks_stored": 0,
        }

    result = await store_full_text_content(
        company_id=company_id,
        company_name=company_name,
        raw_text=payload,
        source_url=url,
        content_type=content_type,
        content_channel=content_channel,
        backend=backend,
        raw_format="html",
        tenant_key=tenant_key,
    )
    if not result["success"]:
        return {
            "success": False,
            "kind": "html",
            "error": "ベクトル保存に失敗しました",
            "pages_crawled": 0,
            "chunks_stored": 0,
        }

    from app.utils.text_chunker import JapaneseTextChunker

    chunker = JapaneseTextChunker(chunk_size=500, chunk_overlap=100)
    chunks = chunker.chunk(text)
    return {
        "success": True,
        "kind": "html",
        "pages_crawled": 1,
        "chunks_stored": len(chunks),
        "dominant_content_type": result.get("dominant_content_type"),
    }


async def estimate_crawl_corporate_pages_impl(
    payload: CrawlCorporateRequest,
    *,
    tenant_key: str,
) -> CrawlCorporateEstimateResponse:
    request = payload
    billing_plan = _normalize_rag_pdf_billing_plan(request.billing_plan)
    errors: list[str] = []
    estimated_html_pages = 0
    estimated_pdf_pages = 0
    estimated_google_ocr_pages = 0
    estimated_mistral_ocr_pages = 0
    will_truncate = False
    page_routing_summaries: dict[str, dict[str, object]] = {}

    for url in request.urls:
        try:
            source_result = await _process_crawl_source(
                company_id=request.company_id,
                company_name=request.company_name,
                url=url,
                content_type=request.content_type,
                content_channel=request.content_channel or "corporate_general",
                backend=None,
                billing_plan=billing_plan,
                store_result=False,
                tenant_key=tenant_key,
            )
            if not source_result["success"]:
                errors.append(f"{url}: {source_result['error']}")
                continue
            if source_result["kind"] == "html":
                estimated_html_pages += 1
            elif source_result["kind"] == "pdf":
                estimated_pdf_pages += 1
                summary = dict(source_result.get("page_routing_summary") or {})
                page_routing_summaries[url] = summary
                estimated_google_ocr_pages += int(summary.get("planned_route", []).count("google"))
                estimated_mistral_ocr_pages += int(summary.get("planned_route", []).count("mistral"))
                will_truncate = will_truncate or bool(summary.get("truncated_pages"))
        except Exception as exc:
            errors.append(f"{url}: {str(exc)[:100]}")

    return CrawlCorporateEstimateResponse(
        success=(estimated_html_pages + estimated_pdf_pages) > 0,
        company_id=request.company_id,
        estimated_pages_crawled=estimated_html_pages + estimated_pdf_pages,
        estimated_html_pages=estimated_html_pages,
        estimated_pdf_pages=estimated_pdf_pages,
        estimated_free_html_pages=0,
        estimated_free_pdf_pages=0,
        estimated_credits=0,
        estimated_google_ocr_pages=estimated_google_ocr_pages,
        estimated_mistral_ocr_pages=estimated_mistral_ocr_pages,
        will_truncate=will_truncate,
        requires_confirmation=estimated_mistral_ocr_pages > 0 or will_truncate,
        errors=errors,
        page_routing_summaries=page_routing_summaries,
    )


async def crawl_corporate_pages_impl(
    payload: CrawlCorporateRequest,
    *,
    tenant_key: str,
) -> CrawlCorporateResponse:
    from app.routers import company_info as _ci

    resolve_embedding_backend = _ci.resolve_embedding_backend

    request = payload
    billing_plan = _normalize_rag_pdf_billing_plan(request.billing_plan)
    valid_channels = ["corporate_ir", "corporate_business", "corporate_general"]
    channel = request.content_channel or "corporate_general"
    if channel not in valid_channels:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid content_channel: {channel}. Valid: {valid_channels}",
        )

    pages_crawled = 0
    chunks_stored = 0
    errors = []
    url_content_types: dict[str, str] = {}
    page_routing_summaries: dict[str, dict[str, object]] = {}

    backend = resolve_embedding_backend()
    if backend is None:
        return CrawlCorporateResponse(
            success=False,
            company_id=request.company_id,
            pages_crawled=0,
            chunks_stored=0,
            errors=[
                "No embedding backend available. Set OPENAI_API_KEY or install sentence-transformers."
            ],
        )

    for url in request.urls:
        try:
            source_result = await _process_crawl_source(
                company_id=request.company_id,
                company_name=request.company_name,
                url=url,
                content_type=request.content_type,
                content_channel=channel,
                backend=backend,
                billing_plan=billing_plan,
                store_result=True,
                tenant_key=tenant_key,
            )

            if not source_result["success"]:
                errors.append(f"{url}: {source_result['error']}")
                continue

            pages_crawled += int(source_result.get("pages_crawled") or 0)
            chunks_stored += int(source_result.get("chunks_stored") or 0)
            if source_result.get("dominant_content_type"):
                url_content_types[url] = str(source_result["dominant_content_type"])
            if source_result.get("page_routing_summary"):
                page_routing_summaries[url] = dict(source_result["page_routing_summary"])

            await asyncio.sleep(1)

        except HTTPException as e:
            errors.append(f"{url}: {e.detail}")
        except Exception as e:
            errors.append(f"{url}: {str(e)[:100]}")

    return CrawlCorporateResponse(
        success=pages_crawled > 0,
        company_id=request.company_id,
        pages_crawled=pages_crawled,
        chunks_stored=chunks_stored,
        errors=errors,
        url_content_types=url_content_types,
        page_routing_summaries=page_routing_summaries,
    )
