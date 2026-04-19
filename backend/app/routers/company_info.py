"""
Company Info Fetch Router

Fetches company recruitment information from URLs using web scraping and LLM.
Also handles RAG (Retrieval Augmented Generation) for company information.

SPEC Section 9.5 Requirements:
- Extract minimal set: 締切/募集区分/提出物/応募方法
- Each item needs: 根拠URL + 信頼度(高/中/低)
- Partial success: if deadline not found but other items extracted = 0.5 credit
"""

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from typing import Optional

from app.utils.firecrawl import FirecrawlScrapeResult  # noqa: F401
from app.config import settings
from app.utils.secure_logger import get_logger
from app.utils.embeddings import resolve_embedding_backend  # noqa: F401
from app.utils.vector_store import store_full_text_content  # noqa: F401
from app.utils.web_search import (
    hybrid_web_search,  # noqa: F401
    CONTENT_TYPE_SEARCH_INTENT,  # noqa: F401
)
from app.utils.http_fetch import fetch_page_content, extract_text_from_html  # noqa: F401
from app.utils.pdf_ocr import extract_text_from_pdf_with_ocr  # noqa: F401
from app.limiter import limiter
from app.security.career_principal import (
    CareerPrincipal,
    require_career_principal,
)
from app.security.upload_limits import (
    MAX_PDF_UPLOAD_BYTES,
    enforce_pdf_upload_size,
)
from app.routers.company_info_models import (
    FetchRequest,
    SearchPagesRequest,
    ExtractedDeadline,  # noqa: F401 — used via company_info.ExtractedDeadline in tests
    ExtractedScheduleInfo,  # noqa: F401 — used via company_info.ExtractedScheduleInfo in tests
    SelectionScheduleResponse,
    BuildRagRequest,
    BuildRagResponse,
    RagContextRequest,
    RagContextResponse,
    RagStatusResponse,
    DetailedRagStatusResponse,
    DeleteByUrlsRequest,
    DeleteByUrlsResponse,
    GapAnalysisRequest,
    GapAnalysisResponse,
    CrawlCorporateRequest,
    CrawlCorporateResponse,
    UploadCorporatePdfResponse,
    EstimateCorporatePdfResponse,
    CrawlCorporateEstimateResponse,
    SearchCorporatePagesRequest,
)

# ===== Re-exports from extracted modules =====
# These symbols must remain importable from ``company_info`` because tests,
# evals, or sibling service modules access them via monkeypatch or direct
# attribute lookup on this module.
from app.routers.company_info_config import (
    SCHEDULE_LLM_FALLBACK_MAX_CHARS,  # noqa: F401
    SCHEDULE_EXTREME_PAGE_CHARS,  # noqa: F401
    SCHEDULE_LLM_TEXT_MAX_CHARS_EXTREME,  # noqa: F401
)
from app.routers.company_info_url_utils import (
    _should_include_corporate_candidate,  # noqa: F401
    _get_source_type_legacy as _get_source_type,  # noqa: F401
)
from app.routers.company_info_candidate_scoring import (
    _get_graduation_year,  # noqa: F401
    _contains_company_name,  # noqa: F401
    _score_to_confidence,  # noqa: F401
    _hybrid_score_to_confidence,  # noqa: F401
    _recruitment_score_to_confidence,  # noqa: F401
    _recruitment_hybrid_score_to_confidence,  # noqa: F401
    _normalize_recruitment_source_type,  # noqa: F401
    _score_corporate_candidate_with_breakdown,  # noqa: F401
    _search_with_ddgs,  # noqa: F401
    HAS_DDGS,  # noqa: F401
)
from app.routers.company_info_schedule import (
    _compress_schedule_page_text_for_llm,  # noqa: F401
)
from app.routers.company_info_schedule_links import (
    _build_recruit_queries,  # noqa: F401
    _build_schedule_source_metadata,  # noqa: F401
    _extract_schedule_follow_links,  # noqa: F401
    _extract_schedule_text_from_bytes,  # noqa: F401
)
from app.routers.company_info_pdf import (
    _extract_text_pages_from_pdf_locally,  # noqa: F401
    _get_pdf_page_count,  # noqa: F401
    _slice_pdf_bytes_to_first_n_pages,  # noqa: F401
    _slice_pdf_bytes_to_page_indexes,  # noqa: F401
    _extract_text_from_pdf_with_page_routing,  # noqa: F401
)
from app.routers.company_info_auth import (
    _assert_principal_owns_company,
)
from app.routers.company_info_llm_extraction import (
    extract_info_with_llm,  # noqa: F401
    extract_schedule_with_llm,  # noqa: F401
    _extract_schedule_with_firecrawl,  # noqa: F401
)
from app.routers.company_info_corporate_search import (
    _build_corporate_queries,  # noqa: F401
    _search_corporate_pages_impl,
)
from app.routers.company_info_recruit_search import (
    _search_company_pages_impl,
)
from app.routers.company_info_schedule_service import (
    fetch_schedule_response as _fetch_schedule_response,
)
from app.routers.company_info_rag_service import (
    _extracted_data_to_chunks,  # noqa: F401
    build_company_rag_impl as _build_company_rag_impl,
    get_rag_context_impl as _get_rag_context_impl,
    get_rag_status_impl as _get_rag_status_impl,
    get_detailed_rag_status_impl as _get_detailed_rag_status_impl,
    analyze_rag_gap_impl as _analyze_rag_gap_impl,
    delete_rag_impl as _delete_rag_impl,
    delete_rag_by_type_impl as _delete_rag_by_type_impl,
    delete_rag_by_urls_impl as _delete_rag_by_urls_impl,
)
from app.routers.company_info_ingest_service import (
    _looks_like_pdf_payload,  # noqa: F401
    _looks_like_html_payload,  # noqa: F401
    _process_crawl_source,  # noqa: F401
    estimate_corporate_pdf_upload_impl as _estimate_pdf_upload_impl,
    upload_corporate_pdf_impl as _upload_pdf_impl,
    estimate_crawl_corporate_pages_impl as _estimate_crawl_impl,
    crawl_corporate_pages_impl as _crawl_impl,
)

logger = get_logger(__name__)

# ===== Hybrid Search Configuration =====
USE_HYBRID_SEARCH = settings.company_search_hybrid

# Historical alias retained for in-repo consumers (e.g. company_info_ingest_service).
# Authoritative source lives in ``app.security.upload_limits``.
MAX_UPLOAD_PDF_BYTES = MAX_PDF_UPLOAD_BYTES


router = APIRouter(prefix="/company-info", tags=["company-info"])


@router.post("/search-pages")
@limiter.limit("60/minute")
async def search_company_pages(payload: SearchPagesRequest, request: Request):
    """Search for company recruitment page candidates."""
    return await _search_company_pages_impl(payload, USE_HYBRID_SEARCH)


@router.post("/fetch-schedule", response_model=SelectionScheduleResponse)
@limiter.limit("60/minute")
async def fetch_selection_schedule(payload: FetchRequest, request: Request):
    """Fetch and extract selection schedule information from a URL."""
    return await _fetch_schedule_response(payload, feature="selection_schedule")


# ============================================================================
# RAG (Retrieval Augmented Generation) Endpoints
# ============================================================================


@router.post("/rag/build", response_model=BuildRagResponse)
@limiter.limit("60/minute")
async def build_company_rag(
    payload: BuildRagRequest,
    request: Request,
    principal: CareerPrincipal = Depends(require_career_principal("company")),
):
    """Build RAG (vector embeddings) for a company."""
    _assert_principal_owns_company(principal, payload.company_id)
    return await _build_company_rag_impl(payload)


@router.post("/rag/context", response_model=RagContextResponse)
@limiter.limit("60/minute")
async def get_rag_context(
    payload: RagContextRequest,
    request: Request,
    principal: CareerPrincipal = Depends(require_career_principal("company")),
):
    """Get RAG context for ES review."""
    _assert_principal_owns_company(principal, payload.company_id)
    return await _get_rag_context_impl(payload)


@router.get("/rag/status/{company_id}", response_model=RagStatusResponse)
@limiter.limit("120/minute")
async def get_rag_status(
    company_id: str,
    request: Request,
    principal: CareerPrincipal = Depends(require_career_principal("company")),
):
    """Check if a company has RAG data."""
    _assert_principal_owns_company(principal, company_id)
    return _get_rag_status_impl(company_id)


@router.get(
    "/rag/status-detailed/{company_id}", response_model=DetailedRagStatusResponse
)
@limiter.limit("120/minute")
async def get_detailed_rag_status(
    company_id: str,
    request: Request,
    principal: CareerPrincipal = Depends(require_career_principal("company")),
):
    """Get detailed RAG status for a company."""
    _assert_principal_owns_company(principal, company_id)
    return _get_detailed_rag_status_impl(company_id)


@router.post("/rag/gap-analysis", response_model=GapAnalysisResponse)
@limiter.limit("30/minute")
async def analyze_rag_gap(
    payload: GapAnalysisRequest,
    request: Request,
    principal: CareerPrincipal = Depends(require_career_principal("company")),
):
    """Query-aware RAG gap analysis."""
    _assert_principal_owns_company(principal, payload.company_id)
    return await _analyze_rag_gap_impl(payload)


@router.delete("/rag/{company_id}")
@limiter.limit("60/minute")
async def delete_rag(
    company_id: str,
    request: Request,
    principal: CareerPrincipal = Depends(require_career_principal("company")),
):
    """Delete all RAG data for a company."""
    _assert_principal_owns_company(principal, company_id)
    return await _delete_rag_impl(company_id)


@router.delete("/rag/{company_id}/{content_type}")
@limiter.limit("60/minute")
async def delete_rag_by_type(
    company_id: str,
    content_type: str,
    request: Request,
    principal: CareerPrincipal = Depends(require_career_principal("company")),
):
    """Delete RAG data for a company by content type."""
    _assert_principal_owns_company(principal, company_id)
    return await _delete_rag_by_type_impl(company_id, content_type)


@router.post("/rag/{company_id}/delete-by-urls", response_model=DeleteByUrlsResponse)
@limiter.limit("60/minute")
async def delete_rag_by_urls(
    company_id: str,
    payload: DeleteByUrlsRequest,
    request: Request,
    principal: CareerPrincipal = Depends(require_career_principal("company")),
):
    """Delete RAG data for a company by source URLs."""
    _assert_principal_owns_company(principal, company_id)
    return await _delete_rag_by_urls_impl(company_id, payload)


# ============================================================================
# Corporate Site Crawling Endpoints
# ============================================================================


@router.post("/rag/estimate-upload-pdf", response_model=EstimateCorporatePdfResponse)
@limiter.limit("60/minute")
async def estimate_corporate_pdf_upload(
    request: Request,
    company_id: str = Form(...),
    source_url: str = Form(...),
    content_type: Optional[str] = Form(None),
    billing_plan: str = Form("free"),
    remaining_free_pdf_pages: int = Form(0),
    file: UploadFile = File(...),
    principal: CareerPrincipal = Depends(require_career_principal("company")),
):
    _assert_principal_owns_company(principal, company_id)
    filename = file.filename or "document.pdf"
    mime_type = (file.content_type or "").lower()
    if not filename.lower().endswith(".pdf") and mime_type != "application/pdf":
        raise HTTPException(status_code=400, detail="PDFファイルを指定してください。")

    pdf_bytes = await file.read()
    if not pdf_bytes:
        raise HTTPException(status_code=400, detail="PDFファイルが空です。")
    enforce_pdf_upload_size(pdf_bytes)

    return await _estimate_pdf_upload_impl(
        company_id=company_id,
        source_url=source_url,
        content_type=content_type,
        billing_plan=billing_plan,
        remaining_free_pdf_pages=remaining_free_pdf_pages,
        pdf_bytes=pdf_bytes,
        filename=filename,
    )


@router.post("/rag/upload-pdf", response_model=UploadCorporatePdfResponse)
@limiter.limit("60/minute")
async def upload_corporate_pdf(
    request: Request,
    company_id: str = Form(...),
    company_name: str = Form(...),
    source_url: str = Form(...),
    content_type: Optional[str] = Form(None),
    content_channel: Optional[str] = Form(None),
    billing_plan: str = Form("free"),
    file: UploadFile = File(...),
    principal: CareerPrincipal = Depends(require_career_principal("company")),
):
    """Extract text from an uploaded PDF and store it in company RAG."""
    _assert_principal_owns_company(principal, company_id)
    filename = file.filename or "document.pdf"
    mime_type = (file.content_type or "").lower()
    if not filename.lower().endswith(".pdf") and mime_type != "application/pdf":
        raise HTTPException(status_code=400, detail="PDFファイルを指定してください。")

    pdf_bytes = await file.read()
    if not pdf_bytes:
        raise HTTPException(status_code=400, detail="PDFファイルが空です。")
    enforce_pdf_upload_size(pdf_bytes)

    return await _upload_pdf_impl(
        company_id=company_id,
        company_name=company_name,
        source_url=source_url,
        content_type=content_type,
        content_channel=content_channel,
        billing_plan=billing_plan,
        pdf_bytes=pdf_bytes,
        filename=filename,
    )


@router.post("/rag/estimate-crawl-corporate", response_model=CrawlCorporateEstimateResponse)
@limiter.limit("60/minute")
async def estimate_crawl_corporate_pages(
    payload: CrawlCorporateRequest,
    request: Request,
    principal: CareerPrincipal = Depends(require_career_principal("company")),
):
    _assert_principal_owns_company(principal, payload.company_id)
    return await _estimate_crawl_impl(payload)


@router.post("/rag/crawl-corporate", response_model=CrawlCorporateResponse)
@limiter.limit("60/minute")
async def crawl_corporate_pages(
    payload: CrawlCorporateRequest,
    request: Request,
    principal: CareerPrincipal = Depends(require_career_principal("company")),
):
    """Crawl and index corporate site pages for RAG."""
    _assert_principal_owns_company(principal, payload.company_id)
    return await _crawl_impl(payload)


@router.post("/search-corporate-pages")
@limiter.limit("60/minute")
async def search_corporate_pages(payload: SearchCorporatePagesRequest, request: Request):
    """Search for corporate page candidates (IR, business info, etc.)."""
    return await _search_corporate_pages_impl(payload, USE_HYBRID_SEARCH)
