"""Company info RAG orchestration service."""

from __future__ import annotations

import asyncio
import time
from types import ModuleType
from typing import Any, Optional
from urllib.parse import urlparse

from fastapi import HTTPException

from app.utils.cache import get_rag_cache
from app.utils.content_types import CONTENT_TYPES
from app.utils.secure_logger import get_logger
from app.rag.vector_store import (
    delete_company_rag,
    delete_company_rag_by_type,
    delete_company_rag_by_urls,
    get_company_rag_status,
    get_enhanced_context_for_review,
    has_company_rag,
    store_company_info,
    store_full_text_content,
)

logger = get_logger(__name__)
BuildRagRequest: Any = None
BuildRagResponse: Any = None
DeleteByUrlsRequest: Any = None
DeleteByUrlsResponse: Any = None
DetailedRagStatusResponse: Any = None
GapAnalysisRequest: Any = None
GapAnalysisResponse: Any = None
RagContextRequest: Any = None
RagContextResponse: Any = None
RagStatusResponse: Any = None
CrawlCorporateEstimateResponse: Any = None
CrawlCorporateRequest: Any = None
CrawlCorporateResponse: Any = None
EstimateCorporatePdfResponse: Any = None
UploadCorporatePdfResponse: Any = None
_company_info_module: ModuleType | None = None
_build_pdf_estimate_response: Any = None
_extract_text_from_pdf_with_page_routing: Any = None
_is_garbled_text: Any = None
_normalize_rag_pdf_billing_plan: Any = None
_pdf_ingest_telemetry_line: Any = None


def configure_dependencies(
    *,
    models: ModuleType,
    pdf: ModuleType,
    company_info_module: ModuleType | None = None,
) -> None:
    """Inject router-owned dependencies without importing router modules here."""

    global BuildRagRequest, BuildRagResponse, DeleteByUrlsRequest, DeleteByUrlsResponse
    global DetailedRagStatusResponse, GapAnalysisRequest, GapAnalysisResponse
    global RagContextRequest, RagContextResponse, RagStatusResponse
    global CrawlCorporateEstimateResponse, CrawlCorporateRequest, CrawlCorporateResponse
    global EstimateCorporatePdfResponse, UploadCorporatePdfResponse, _company_info_module
    global _build_pdf_estimate_response, _extract_text_from_pdf_with_page_routing
    global _is_garbled_text, _normalize_rag_pdf_billing_plan, _pdf_ingest_telemetry_line

    BuildRagRequest = models.BuildRagRequest
    BuildRagResponse = models.BuildRagResponse
    DeleteByUrlsRequest = models.DeleteByUrlsRequest
    DeleteByUrlsResponse = models.DeleteByUrlsResponse
    DetailedRagStatusResponse = models.DetailedRagStatusResponse
    GapAnalysisRequest = models.GapAnalysisRequest
    GapAnalysisResponse = models.GapAnalysisResponse
    RagContextRequest = models.RagContextRequest
    RagContextResponse = models.RagContextResponse
    RagStatusResponse = models.RagStatusResponse
    CrawlCorporateEstimateResponse = models.CrawlCorporateEstimateResponse
    CrawlCorporateRequest = models.CrawlCorporateRequest
    CrawlCorporateResponse = models.CrawlCorporateResponse
    EstimateCorporatePdfResponse = models.EstimateCorporatePdfResponse
    UploadCorporatePdfResponse = models.UploadCorporatePdfResponse
    _company_info_module = company_info_module
    _build_pdf_estimate_response = pdf._build_pdf_estimate_response
    _extract_text_from_pdf_with_page_routing = pdf._extract_text_from_pdf_with_page_routing
    _is_garbled_text = pdf._is_garbled_text
    _normalize_rag_pdf_billing_plan = pdf._normalize_rag_pdf_billing_plan
    _pdf_ingest_telemetry_line = pdf._pdf_ingest_telemetry_line


def _require_company_info_module() -> ModuleType:
    if _company_info_module is None:
        raise RuntimeError("company_info service dependencies are not configured")
    return _company_info_module


def _extracted_data_to_chunks(extracted_data: dict, source_url: str) -> list[dict]:
    chunks = []

    for deadline in extracted_data.get("deadlines", []):
        text = f"締切: {deadline.get('title', '')}"
        if deadline.get("due_date"):
            text += f" ({deadline['due_date']})"
        chunks.append(
            {
                "text": text,
                "type": "deadline",
                "metadata": {
                    "deadline_type": deadline.get("type", "other"),
                    "confidence": deadline.get("confidence", "low"),
                },
            }
        )

    for rt in extracted_data.get("recruitment_types", []):
        chunks.append(
            {
                "text": f"募集区分: {rt.get('name', '')}",
                "type": "recruitment_type",
                "metadata": {"confidence": rt.get("confidence", "low")},
            }
        )

    docs = extracted_data.get("required_documents", [])
    if docs:
        doc_texts = [
            f"{'必須: ' if d.get('required') else ''}{d.get('name', '')}" for d in docs
        ]
        chunks.append(
            {
                "text": f"提出物: {', '.join(doc_texts)}",
                "type": "required_documents",
                "metadata": {},
            }
        )

    am = extracted_data.get("application_method")
    if am and am.get("value"):
        chunks.append(
            {
                "text": f"応募方法: {am['value']}",
                "type": "application_method",
                "metadata": {"confidence": am.get("confidence", "low")},
            }
        )

    sp = extracted_data.get("selection_process")
    if sp and sp.get("value"):
        chunks.append(
            {
                "text": f"選考プロセス: {sp['value']}",
                "type": "selection_process",
                "metadata": {"confidence": sp.get("confidence", "low")},
            }
        )

    return chunks


async def build_company_rag_impl(
    payload: BuildRagRequest,
    *,
    tenant_key: str,
) -> BuildRagResponse:
    from app.utils.embeddings import resolve_embedding_backend

    request = payload
    try:
        structured_chunks = []
        full_text_stored = 0

        backend = resolve_embedding_backend()
        if backend is None:
            return BuildRagResponse(
                success=False,
                company_id=request.company_id,
                chunks_stored=0,
                full_text_chunks=0,
                error="No embedding backend available. Set OPENAI_API_KEY or install sentence-transformers.",
                embedding_provider=None,
                embedding_model=None,
            )

        content_type = request.content_type
        content_channel = request.content_channel

        if content_type and content_type not in CONTENT_TYPES:
            return BuildRagResponse(
                success=False,
                company_id=request.company_id,
                chunks_stored=0,
                error=f"Invalid content_type: {content_type}",
            )

        if request.raw_content and request.store_full_text:
            full_text_result = await store_full_text_content(
                company_id=request.company_id,
                company_name=request.company_name,
                raw_text=request.raw_content,
                source_url=request.source_url,
                content_type=content_type,
                content_channel=content_channel,
                backend=backend,
                raw_format=request.raw_content_format,
                tenant_key=tenant_key,
            )
            if full_text_result["success"]:
                from app.utils.text_chunker import (
                    JapaneseTextChunker,
                    chunk_html_content,
                    chunk_sections_with_metadata,
                    extract_sections_from_html,
                )

                if request.raw_content_format == "html":
                    sections = extract_sections_from_html(request.raw_content)
                    if sections:
                        chunks = chunk_sections_with_metadata(
                            sections, chunk_size=500, chunk_overlap=100
                        )
                    else:
                        chunks = chunk_html_content(
                            request.raw_content, chunk_size=500, chunk_overlap=100
                        )
                else:
                    chunker = JapaneseTextChunker(chunk_size=500, chunk_overlap=100)
                    chunks = chunker.chunk(request.raw_content)
                full_text_stored = len(chunks)
                logger.info(
                    f"[RAG保存] ✅ フルテキスト {full_text_stored}チャンク保存完了 (会社ID: {request.company_id[:8]}...)"
                )

        if request.extracted_data:
            structured_chunks = _extracted_data_to_chunks(
                request.extracted_data, request.source_url
            )

            if structured_chunks:
                for chunk in structured_chunks:
                    if "metadata" not in chunk:
                        chunk["metadata"] = {}
                    chunk["metadata"]["content_type"] = "corporate_site"
                    if content_channel:
                        chunk["metadata"]["content_channel"] = content_channel

                success = await store_company_info(
                    company_id=request.company_id,
                    company_name=request.company_name,
                    content_chunks=structured_chunks,
                    source_url=request.source_url,
                    backend=backend,
                    tenant_key=tenant_key,
                )
                if not success:
                    logger.error(
                        f"[RAG保存] ❌ 構造化データ保存失敗 (会社ID: {request.company_id[:8]}...)"
                    )

        total_chunks = len(structured_chunks) + full_text_stored

        if total_chunks == 0:
            return BuildRagResponse(
                success=False,
                company_id=request.company_id,
                chunks_stored=0,
                full_text_chunks=0,
                error="No content to store",
                embedding_provider=backend.provider,
                embedding_model=backend.model,
            )

        return BuildRagResponse(
            success=True,
            company_id=request.company_id,
            chunks_stored=total_chunks,
            full_text_chunks=full_text_stored,
            error=None,
            embedding_provider=backend.provider,
            embedding_model=backend.model,
        )

    except Exception as e:
        logger.error(f"[RAG保存] ❌ RAG構築失敗: {e}")
        return BuildRagResponse(
            success=False,
            company_id=request.company_id,
            chunks_stored=0,
            full_text_chunks=0,
            error=str(e),
            embedding_provider=(
                backend.provider if "backend" in locals() and backend else None
            ),
            embedding_model=(
                backend.model if "backend" in locals() and backend else None
            ),
        )


async def get_rag_context_impl(
    payload: RagContextRequest,
    *,
    tenant_key: str,
) -> RagContextResponse:
    request = payload
    try:
        rag_exists = has_company_rag(request.company_id, tenant_key=tenant_key)

        if not rag_exists:
            return RagContextResponse(
                success=True, company_id=request.company_id, context="", has_rag=False
            )

        context = await get_enhanced_context_for_review(
            company_id=request.company_id,
            es_content=request.query,
            max_context_length=request.max_context_length,
            tenant_key=tenant_key,
        )

        return RagContextResponse(
            success=True, company_id=request.company_id, context=context, has_rag=True
        )

    except Exception as e:
        logger.error(f"[RAG検索] ❌ コンテキスト取得失敗: {e}")
        return RagContextResponse(
            success=False, company_id=request.company_id, context="", has_rag=False
        )


def get_rag_status_impl(company_id: str, *, tenant_key: str) -> RagStatusResponse:
    return RagStatusResponse(
        company_id=company_id,
        has_rag=has_company_rag(company_id, tenant_key=tenant_key),
    )


def get_detailed_rag_status_impl(
    company_id: str,
    *,
    tenant_key: str,
) -> DetailedRagStatusResponse:
    status = get_company_rag_status(company_id, tenant_key=tenant_key)

    return DetailedRagStatusResponse(
        company_id=company_id,
        has_rag=status.get("has_rag", False),
        total_chunks=status.get("total_chunks", 0),
        new_grad_recruitment_chunks=status.get("new_grad_recruitment_chunks", 0),
        midcareer_recruitment_chunks=status.get("midcareer_recruitment_chunks", 0),
        corporate_site_chunks=status.get("corporate_site_chunks", 0),
        ir_materials_chunks=status.get("ir_materials_chunks", 0),
        ceo_message_chunks=status.get("ceo_message_chunks", 0),
        employee_interviews_chunks=status.get("employee_interviews_chunks", 0),
        press_release_chunks=status.get("press_release_chunks", 0),
        csr_sustainability_chunks=status.get("csr_sustainability_chunks", 0),
        midterm_plan_chunks=status.get("midterm_plan_chunks", 0),
        last_updated=status.get("last_updated"),
    )


async def analyze_rag_gap_impl(
    payload: GapAnalysisRequest,
    *,
    tenant_key: str,
) -> GapAnalysisResponse:
    from app.utils.rag_gap_analyzer import analyze_company_rag_gap

    result = await analyze_company_rag_gap(
        company_id=payload.company_id,
        query=payload.query,
        template_type=payload.template_type,
        tenant_key=tenant_key,
    )
    return GapAnalysisResponse(
        company_id=result.company_id,
        overall_score=result.overall_score,
        facets=[
            {
                "facet": fc.facet,
                "coverage": fc.coverage,
                "chunk_count": fc.chunk_count,
                "freshest_at": fc.freshest_at,
                "source_diversity": fc.source_diversity,
            }
            for fc in result.facets
        ],
        missing_facets=result.missing_facets,
        stale_sources=[
            {"url": s["url"], "fetched_at": s["fetched_at"]}
            for s in result.stale_sources
        ],
        duplicate_ratio=result.duplicate_ratio,
        next_fetch_targets=[
            {
                "content_type": t["content_type"],
                "query_hint": t["query_hint"],
                "priority": t["priority"],
            }
            for t in result.next_fetch_targets
        ],
        needs_enrichment=result.needs_enrichment,
    )


async def delete_rag_impl(company_id: str, *, tenant_key: str) -> dict:
    success = delete_company_rag(company_id, tenant_key=tenant_key)
    cache = get_rag_cache()
    if cache:
        await cache.invalidate_company(company_id, tenant_key=tenant_key)
    return {"success": success, "company_id": company_id}


async def delete_rag_by_type_impl(
    company_id: str,
    content_type: str,
    *,
    tenant_key: str,
) -> dict:
    if content_type not in CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid content_type: {content_type}. Valid types: {CONTENT_TYPES}",
        )

    success = delete_company_rag_by_type(company_id, content_type, tenant_key=tenant_key)
    cache = get_rag_cache()
    if cache:
        await cache.invalidate_company(company_id, tenant_key=tenant_key)
    return {"success": success, "company_id": company_id, "content_type": content_type}


async def delete_rag_by_urls_impl(
    company_id: str,
    payload: DeleteByUrlsRequest,
    *,
    tenant_key: str,
) -> DeleteByUrlsResponse:
    request = payload
    if not request.urls:
        return DeleteByUrlsResponse(
            success=True,
            company_id=company_id,
            urls_deleted=[],
            chunks_deleted=0,
            errors=[],
        )

    try:
        result = delete_company_rag_by_urls(
            company_id,
            request.urls,
            tenant_key=tenant_key,
        )

        urls_deleted = [url for url, count in result["per_url"].items() if count > 0]

        cache = get_rag_cache()
        if cache:
            await cache.invalidate_company(company_id, tenant_key=tenant_key)

        return DeleteByUrlsResponse(
            success=True,
            company_id=company_id,
            urls_deleted=urls_deleted,
            chunks_deleted=result["total_deleted"],
            errors=[],
        )
    except Exception as e:
        logger.error(f"[RAG削除] ❌ URL別削除エラー: {e}")
        return DeleteByUrlsResponse(
            success=False,
            company_id=company_id,
            urls_deleted=[],
            chunks_deleted=0,
            errors=[str(e)],
        )
from app.utils.http_fetch import extract_text_from_html


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
    _ci = _require_company_info_module()

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
    _ci = _require_company_info_module()

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
    _ci = _require_company_info_module()

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
