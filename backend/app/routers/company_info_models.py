"""Typed models for company info router."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, HttpUrl


class FetchRequest(BaseModel):
    url: HttpUrl
    company_name: Optional[str] = None
    graduation_year: Optional[int] = None
    selection_type: Optional[str] = None


class SearchPagesRequest(BaseModel):
    company_name: str
    industry: Optional[str] = None
    custom_query: Optional[str] = None
    max_results: int = 10
    graduation_year: Optional[int] = None
    selection_type: Optional[str] = None
    allow_snippet_match: bool = False


class SearchCandidate(BaseModel):
    url: str
    title: str
    confidence: str
    source_type: str = "other"
    relation_company_name: str | None = None


class ExtractedItem(BaseModel):
    value: str
    source_url: str
    confidence: str


class ExtractedDeadline(BaseModel):
    type: str
    title: str
    due_date: Optional[str]
    source_url: str
    confidence: str


class ExtractedRecruitmentType(BaseModel):
    name: str
    source_url: str
    confidence: str


class ExtractedDocument(BaseModel):
    name: str
    required: bool
    source_url: str
    confidence: str


class ExtractedInfo(BaseModel):
    deadlines: list[ExtractedDeadline]
    recruitment_types: list[ExtractedRecruitmentType]
    required_documents: list[ExtractedDocument]
    application_method: Optional[ExtractedItem]
    selection_process: Optional[ExtractedItem]


class ExtractedScheduleInfo(BaseModel):
    deadlines: list[ExtractedDeadline]
    required_documents: list[ExtractedDocument]
    application_method: Optional[ExtractedItem]
    selection_process: Optional[ExtractedItem]


class SelectionScheduleResponse(BaseModel):
    success: bool
    partial_success: bool = False
    data: Optional[ExtractedScheduleInfo]
    source_url: str
    source_type: str = "other"
    relation_company_name: str | None = None
    year_matched: bool | None = None
    used_graduation_year: int | None = None
    extracted_at: str
    error: Optional[str]
    deadlines_found: bool = False
    other_items_found: bool = False
    raw_text: Optional[str] = None
    raw_html: Optional[str] = None


class BuildRagRequest(BaseModel):
    company_id: str
    company_name: str
    source_url: str
    raw_content: Optional[str] = None
    raw_content_format: str = "text"
    extracted_data: Optional[dict] = None
    store_full_text: bool = True
    content_type: Optional[str] = None
    content_channel: Optional[str] = None


class BuildRagResponse(BaseModel):
    success: bool
    company_id: str
    chunks_stored: int
    full_text_chunks: int = 0
    error: Optional[str] = None
    embedding_provider: Optional[str] = None
    embedding_model: Optional[str] = None


class RagContextRequest(BaseModel):
    company_id: str
    query: str
    max_context_length: int = 2000


class RagContextResponse(BaseModel):
    success: bool
    company_id: str
    context: str
    has_rag: bool


class RagStatusResponse(BaseModel):
    company_id: str
    has_rag: bool


class DetailedRagStatusResponse(BaseModel):
    company_id: str
    has_rag: bool
    total_chunks: int = 0
    new_grad_recruitment_chunks: int = 0
    midcareer_recruitment_chunks: int = 0
    corporate_site_chunks: int = 0
    ir_materials_chunks: int = 0
    ceo_message_chunks: int = 0
    employee_interviews_chunks: int = 0
    press_release_chunks: int = 0
    csr_sustainability_chunks: int = 0
    midterm_plan_chunks: int = 0
    last_updated: Optional[str] = None


class GapAnalysisFacet(BaseModel):
    facet: str
    coverage: float
    chunk_count: int
    freshest_at: Optional[str] = None
    source_diversity: int = 0


class GapAnalysisFetchTarget(BaseModel):
    content_type: str
    query_hint: str
    priority: int


class GapAnalysisStaleSource(BaseModel):
    url: str
    fetched_at: str


class GapAnalysisRequest(BaseModel):
    company_id: str
    query: str
    template_type: str


class GapAnalysisResponse(BaseModel):
    company_id: str
    overall_score: float
    facets: list[GapAnalysisFacet]
    missing_facets: list[str]
    stale_sources: list[GapAnalysisStaleSource]
    duplicate_ratio: float
    next_fetch_targets: list[GapAnalysisFetchTarget]
    needs_enrichment: bool


class DeleteByUrlsRequest(BaseModel):
    urls: list[str]


class DeleteByUrlsResponse(BaseModel):
    success: bool
    company_id: str
    urls_deleted: list[str]
    chunks_deleted: int
    errors: list[str]


class CrawlCorporateRequest(BaseModel):
    company_id: str
    company_name: str
    urls: list[str]
    content_channel: Optional[str] = None
    content_type: Optional[str] = None
    billing_plan: Optional[str] = None


class CrawlCorporateResponse(BaseModel):
    success: bool
    company_id: str
    pages_crawled: int
    chunks_stored: int
    errors: list[str]
    url_content_types: dict[str, str] = {}
    page_routing_summaries: dict[str, dict[str, object]] = {}


class UploadCorporatePdfResponse(BaseModel):
    success: bool
    company_id: str
    source_url: str
    chunks_stored: int
    extracted_chars: int
    page_count: int | None = None
    content_type: str | None = None
    secondary_content_types: list[str] = []
    extraction_method: str
    errors: list[str] = []
    source_total_pages: int | None = None
    ingest_truncated: bool = False
    ocr_truncated: bool = False
    processing_notice_ja: str | None = None
    page_routing_summary: dict[str, object] | None = None


class EstimateCorporatePdfResponse(BaseModel):
    success: bool
    company_id: str
    source_url: str
    page_count: int | None = None
    source_total_pages: int | None = None
    estimated_free_pdf_pages: int = 0
    estimated_credits: int = 0
    estimated_google_ocr_pages: int = 0
    estimated_mistral_ocr_pages: int = 0
    will_truncate: bool = False
    requires_confirmation: bool = False
    processing_notice_ja: str | None = None
    page_routing_summary: dict[str, object] | None = None
    errors: list[str] = []


class CrawlCorporateEstimateResponse(BaseModel):
    success: bool
    company_id: str
    estimated_pages_crawled: int
    estimated_html_pages: int = 0
    estimated_pdf_pages: int = 0
    estimated_free_html_pages: int = 0
    estimated_free_pdf_pages: int = 0
    estimated_credits: int = 0
    estimated_google_ocr_pages: int = 0
    estimated_mistral_ocr_pages: int = 0
    will_truncate: bool = False
    requires_confirmation: bool = False
    errors: list[str] = []
    page_routing_summaries: dict[str, dict[str, object]] = {}


class SearchCorporatePagesRequest(BaseModel):
    company_name: str
    search_type: str = "about"
    content_type: Optional[str] = None
    graduation_year: Optional[int] = None
    custom_query: Optional[str] = None
    preferred_domain: Optional[str] = None
    strict_company_match: Optional[bool] = True
    allow_aggregators: Optional[bool] = False
    max_results: int = 5
    allow_snippet_match: bool = False
    cache_mode: str = "bypass"


class CorporatePageCandidate(BaseModel):
    url: str
    title: str
    snippet: str
    confidence: str
    source_type: str = "other"
    relation_company_name: str | None = None
    parent_allowed: bool = False
