"""Company info RAG orchestration service."""

from __future__ import annotations

from fastapi import Request

from app.routers.company_info_models import (
    BuildRagRequest,
    BuildRagResponse,
    DeleteByUrlsRequest,
    DeleteByUrlsResponse,
    DetailedRagStatusResponse,
    RagContextRequest,
    RagContextResponse,
    RagStatusResponse,
)


async def build_company_rag(payload: BuildRagRequest, request: Request):
    from app.routers import company_info as ci

    request = payload
    try:
        structured_chunks = []
        full_text_stored = 0

        backend = ci.resolve_embedding_backend()
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
        if content_type and content_type not in ci.CONTENT_TYPES:
            return BuildRagResponse(
                success=False,
                company_id=request.company_id,
                chunks_stored=0,
                error=f"Invalid content_type: {content_type}",
            )

        if request.raw_content and request.store_full_text:
            full_text_result = await ci.store_full_text_content(
                company_id=request.company_id,
                company_name=request.company_name,
                raw_text=request.raw_content,
                source_url=request.source_url,
                content_type=content_type,
                content_channel=content_channel,
                backend=backend,
                raw_format=request.raw_content_format,
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
                        chunks = chunk_sections_with_metadata(sections, chunk_size=500, chunk_overlap=100)
                    else:
                        chunks = chunk_html_content(request.raw_content, chunk_size=500, chunk_overlap=100)
                else:
                    chunker = JapaneseTextChunker(chunk_size=500, chunk_overlap=100)
                    chunks = chunker.chunk(request.raw_content)
                full_text_stored = len(chunks)
                ci.logger.info(
                    f"[RAG保存] ✅ フルテキスト {full_text_stored}チャンク保存完了 (会社ID: {request.company_id[:8]}...)"
                )

        if request.extracted_data:
            structured_chunks = ci._extracted_data_to_chunks(request.extracted_data, request.source_url)
            if structured_chunks:
                for chunk in structured_chunks:
                    if "metadata" not in chunk:
                        chunk["metadata"] = {}
                    chunk["metadata"]["content_type"] = "corporate_site"
                    if content_channel:
                        chunk["metadata"]["content_channel"] = content_channel

                success = await ci.store_company_info(
                    company_id=request.company_id,
                    company_name=request.company_name,
                    content_chunks=structured_chunks,
                    source_url=request.source_url,
                    backend=backend,
                )
                if not success:
                    ci.logger.error(
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
        ci.logger.error(f"[RAG保存] ❌ RAG構築失敗: {e}")
        return BuildRagResponse(
            success=False,
            company_id=request.company_id,
            chunks_stored=0,
            full_text_chunks=0,
            error=str(e),
            embedding_provider=(backend.provider if "backend" in locals() and backend else None),
            embedding_model=(backend.model if "backend" in locals() and backend else None),
        )


async def get_rag_context(payload: RagContextRequest, request: Request):
    from app.routers import company_info as ci

    request = payload
    try:
        rag_exists = ci.has_company_rag(request.company_id)
        if not rag_exists:
            return RagContextResponse(success=True, company_id=request.company_id, context="", has_rag=False)

        context = await ci.get_enhanced_context_for_review(
            company_id=request.company_id,
            es_content=request.query,
            max_context_length=request.max_context_length,
        )
        return RagContextResponse(success=True, company_id=request.company_id, context=context, has_rag=True)
    except Exception as e:
        ci.logger.error(f"[RAG検索] ❌ コンテキスト取得失敗: {e}")
        return RagContextResponse(success=False, company_id=request.company_id, context="", has_rag=False)


async def get_rag_status(company_id: str, request: Request):
    from app.routers import company_info as ci

    return RagStatusResponse(company_id=company_id, has_rag=ci.has_company_rag(company_id))


async def get_detailed_rag_status(company_id: str, request: Request):
    from app.routers import company_info as ci

    status = ci.get_company_rag_status(company_id)
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


async def delete_rag(company_id: str, request: Request):
    from app.routers import company_info as ci

    success = ci.delete_company_rag(company_id)
    cache = ci.get_rag_cache()
    if cache:
        await cache.invalidate_company(company_id)
    return {"success": success, "company_id": company_id}


async def delete_rag_by_type(company_id: str, content_type: str, request: Request):
    from app.routers import company_info as ci

    if content_type not in ci.CONTENT_TYPES:
        raise ci.HTTPException(
            status_code=400,
            detail=f"Invalid content_type: {content_type}. Valid types: {ci.CONTENT_TYPES}",
        )

    success = ci.delete_company_rag_by_type(company_id, content_type)
    cache = ci.get_rag_cache()
    if cache:
        await cache.invalidate_company(company_id)
    return {"success": success, "company_id": company_id, "content_type": content_type}


async def delete_rag_by_urls(company_id: str, payload: DeleteByUrlsRequest, request: Request):
    from app.routers import company_info as ci

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
        result = ci.delete_company_rag_by_urls(company_id, request.urls)
        urls_deleted = [url for url, count in result["per_url"].items() if count > 0]
        cache = ci.get_rag_cache()
        if cache:
            await cache.invalidate_company(company_id)
        return DeleteByUrlsResponse(
            success=True,
            company_id=company_id,
            urls_deleted=urls_deleted,
            chunks_deleted=result["total_deleted"],
            errors=[],
        )
    except Exception as e:
        ci.logger.error(f"[RAG削除] ❌ URL別削除エラー: {e}")
        return DeleteByUrlsResponse(
            success=False,
            company_id=company_id,
            urls_deleted=[],
            chunks_deleted=0,
            errors=[str(e)],
        )
