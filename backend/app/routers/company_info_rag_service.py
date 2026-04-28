"""Company info RAG orchestration service."""

from __future__ import annotations

from fastapi import HTTPException

from app.routers.company_info_models import (
    BuildRagRequest,
    BuildRagResponse,
    DeleteByUrlsRequest,
    DeleteByUrlsResponse,
    DetailedRagStatusResponse,
    GapAnalysisRequest,
    GapAnalysisResponse,
    RagContextRequest,
    RagContextResponse,
    RagStatusResponse,
)
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
