"""Company info schedule orchestration service."""

from __future__ import annotations

from fastapi import HTTPException

from app.routers.company_info_models import FetchRequest, SelectionScheduleResponse


async def fetch_schedule_response(request: FetchRequest, feature: str) -> SelectionScheduleResponse:
    """Fetch and extract schedule information from a URL."""
    from app.routers import company_info as ci

    try:
        request_url = str(request.url)
        aggregated_usage: dict[str, int] = {}
        resolved_models: list[str] = []
        source_metadata = {
            "source_type": "other",
            "relation_company_name": None,
            "year_matched": None,
            "used_graduation_year": request.graduation_year or ci._get_graduation_year(),
        }
        primary_payload = await ci.fetch_page_content(request_url)
        primary_is_pdf = ci.urlparse(request_url).path.lower().endswith(".pdf") or (
            primary_payload.startswith(b"%PDF") if primary_payload else False
        )
        text = ""
        raw_html = primary_payload[:200000] if primary_payload and not primary_is_pdf else None
        source_metadata = ci._build_schedule_source_metadata(
            request_url,
            request.company_name,
            ci.extract_text_from_html(primary_payload, max_text_chars=ci.SCHEDULE_HTML_EXTRACT_MAX_CHARS)
            if raw_html
            else "",
            request.graduation_year,
            get_graduation_year=ci._get_graduation_year,
            detect_other_graduation_years=ci._detect_other_graduation_years,
        )

        extracted_parts: list[ci.ExtractedScheduleInfo] = []
        raw_text_parts: list[str] = []
        ocr_calls_used = 0
        follow_links: list[str] = []
        pdf_follow_links: list[str] = []

        firecrawl_enabled = bool((ci.settings.firecrawl_api_key or "").strip())
        if firecrawl_enabled:
            extracted, scrape_result = await ci._extract_schedule_with_firecrawl(
                request_url,
                graduation_year=request.graduation_year,
                selection_type=request.selection_type,
            )
            preview_text = (scrape_result.markdown or scrape_result.html).strip()
            if extracted is not None and ci._count_schedule_signal_items(extracted) > 0:
                extracted = ci._apply_schedule_source_confidence_caps(
                    extracted,
                    str(source_metadata["source_type"]),
                    (
                        bool(source_metadata["year_matched"])
                        if source_metadata["year_matched"] is not None
                        else None
                    ),
                )
                extracted_parts.append(extracted)
                if preview_text:
                    raw_text_parts.append(preview_text[:30000])

            if raw_html and request.company_name:
                follow_links = ci._extract_schedule_follow_links(
                    raw_html,
                    request_url,
                    request.company_name,
                )
                pdf_follow_links = ci._extract_schedule_pdf_follow_links(
                    raw_html,
                    request_url,
                    request.company_name,
                )

            should_try_follow_link = not ci._has_dated_schedule_deadlines(extracted) and follow_links
            if should_try_follow_link:
                follow_url = follow_links[0]
                if follow_url.lower().endswith(".pdf") and ocr_calls_used < ci.SCHEDULE_MAX_OCR_CALLS:
                    follow_payload = await ci.fetch_page_content(follow_url)
                    follow_text, _ = await ci._extract_schedule_text_from_bytes(
                        follow_url,
                        follow_payload,
                    )
                    ocr_calls_used += 1
                    if follow_text and len(follow_text) >= ci.SCHEDULE_MIN_TEXT_CHARS:
                        extracted, usage, model = await ci.extract_schedule_with_llm(
                            follow_text,
                            follow_url,
                            feature=feature,
                            graduation_year=request.graduation_year,
                            selection_type=request.selection_type,
                        )
                        ci.merge_llm_usage_tokens(aggregated_usage, usage)
                        if model:
                            resolved_models.append(model)
                        follow_metadata = ci._build_schedule_source_metadata(
                            follow_url,
                            request.company_name,
                            follow_text,
                            request.graduation_year,
                            get_graduation_year=ci._get_graduation_year,
                            detect_other_graduation_years=ci._detect_other_graduation_years,
                        )
                        extracted = ci._apply_schedule_source_confidence_caps(
                            extracted,
                            str(follow_metadata["source_type"]),
                            (
                                bool(follow_metadata["year_matched"])
                                if follow_metadata["year_matched"] is not None
                                else None
                            ),
                        )
                        if ci._count_schedule_signal_items(extracted) > 0:
                            extracted_parts.append(extracted)
                            raw_text_parts.append(follow_text[:30000])
                else:
                    follow_extracted, follow_scrape_result = await ci._extract_schedule_with_firecrawl(
                        follow_url,
                        graduation_year=request.graduation_year,
                        selection_type=request.selection_type,
                    )
                    follow_preview_text = (follow_scrape_result.markdown or follow_scrape_result.html).strip()
                    if follow_extracted is not None and ci._count_schedule_signal_items(follow_extracted) > 0:
                        follow_metadata = ci._build_schedule_source_metadata(
                            follow_url,
                            request.company_name,
                            follow_preview_text,
                            request.graduation_year,
                            get_graduation_year=ci._get_graduation_year,
                            detect_other_graduation_years=ci._detect_other_graduation_years,
                        )
                        follow_extracted = ci._apply_schedule_source_confidence_caps(
                            follow_extracted,
                            str(follow_metadata["source_type"]),
                            (
                                bool(follow_metadata["year_matched"])
                                if follow_metadata["year_matched"] is not None
                                else None
                            ),
                        )
                        extracted_parts.append(follow_extracted)
                        if follow_preview_text:
                            raw_text_parts.append(follow_preview_text[:30000])

            should_try_pdf_follow_ocr = (
                ocr_calls_used < ci.SCHEDULE_MAX_OCR_CALLS
                and not ci._has_dated_schedule_deadlines(
                    ci._merge_schedule_info_parts(extracted_parts) if extracted_parts else None
                )
                and pdf_follow_links
            )
            if should_try_pdf_follow_ocr:
                ocr_url = pdf_follow_links[0]
                follow_payload = await ci.fetch_page_content(ocr_url)
                follow_text, _ = await ci._extract_schedule_text_from_bytes(
                    ocr_url,
                    follow_payload,
                )
                ocr_calls_used += 1
                if follow_text and len(follow_text) >= ci.SCHEDULE_MIN_TEXT_CHARS:
                    extracted, usage, model = await ci.extract_schedule_with_llm(
                        follow_text,
                        ocr_url,
                        feature=feature,
                        graduation_year=request.graduation_year,
                        selection_type=request.selection_type,
                    )
                    ci.merge_llm_usage_tokens(aggregated_usage, usage)
                    if model:
                        resolved_models.append(model)
                    follow_metadata = ci._build_schedule_source_metadata(
                        ocr_url,
                        request.company_name,
                        follow_text,
                        request.graduation_year,
                        get_graduation_year=ci._get_graduation_year,
                        detect_other_graduation_years=ci._detect_other_graduation_years,
                    )
                    extracted = ci._apply_schedule_source_confidence_caps(
                        extracted,
                        str(follow_metadata["source_type"]),
                        (
                            bool(follow_metadata["year_matched"])
                            if follow_metadata["year_matched"] is not None
                            else None
                        ),
                    )
                    if ci._count_schedule_signal_items(extracted) > 0:
                        extracted_parts.append(extracted)
                        raw_text_parts.append(follow_text[:30000])

            should_try_primary_ocr = (
                ocr_calls_used < ci.SCHEDULE_MAX_OCR_CALLS
                and ci._schedule_candidate_requires_ocr(
                    request_url,
                    extracted_parts[0] if extracted_parts else None,
                    (raw_text_parts[0] if raw_text_parts else ""),
                )
                and primary_is_pdf
            )
            if should_try_primary_ocr:
                text, _ = await ci._extract_schedule_text_from_bytes(request_url, primary_payload)
                ocr_calls_used += 1
                if text and len(text) >= ci.SCHEDULE_MIN_TEXT_CHARS:
                    extracted, usage, model = await ci.extract_schedule_with_llm(
                        text,
                        request_url,
                        feature=feature,
                        graduation_year=request.graduation_year,
                        selection_type=request.selection_type,
                    )
                    ci.merge_llm_usage_tokens(aggregated_usage, usage)
                    if model:
                        resolved_models.append(model)
                    extracted = ci._apply_schedule_source_confidence_caps(
                        extracted,
                        str(source_metadata["source_type"]),
                        (
                            bool(source_metadata["year_matched"])
                            if source_metadata["year_matched"] is not None
                            else None
                        ),
                    )
                    if ci._count_schedule_signal_items(extracted) > 0:
                        extracted_parts.append(extracted)
                        raw_text_parts.append(text[:30000])

        if not extracted_parts:
            text, primary_is_pdf = await ci._extract_schedule_text_from_bytes(request_url, primary_payload)
            if text and len(text) >= ci.SCHEDULE_MIN_TEXT_CHARS:
                extracted, usage, model = await ci.extract_schedule_with_llm(
                    text,
                    request_url,
                    feature=feature,
                    graduation_year=request.graduation_year,
                    selection_type=request.selection_type,
                )
                ci.merge_llm_usage_tokens(aggregated_usage, usage)
                if model:
                    resolved_models.append(model)
                extracted = ci._apply_schedule_source_confidence_caps(
                    extracted,
                    str(source_metadata["source_type"]),
                    (
                        bool(source_metadata["year_matched"])
                        if source_metadata["year_matched"] is not None
                        else None
                    ),
                )
                extracted_parts.append(extracted)
                raw_text_parts.append(text[:30000])

        if not extracted_parts:
            return SelectionScheduleResponse(
                success=False,
                partial_success=False,
                data=None,
                source_url=request_url,
                source_type=str(source_metadata["source_type"]),
                relation_company_name=(
                    source_metadata["relation_company_name"]
                    if isinstance(source_metadata["relation_company_name"], str)
                    else None
                ),
                year_matched=(
                    bool(source_metadata["year_matched"])
                    if source_metadata["year_matched"] is not None
                    else None
                ),
                used_graduation_year=(
                    int(source_metadata["used_graduation_year"])
                    if isinstance(source_metadata["used_graduation_year"], int)
                    else None
                ),
                extracted_at=ci.datetime.utcnow().isoformat(),
                error="ページの内容を取得できませんでした。JavaScriptで描画されるページの可能性があります。別のURLをお試しください。",
                deadlines_found=False,
                other_items_found=False,
                raw_text=None,
                raw_html=None,
            )

        extracted = ci._merge_schedule_info_parts(extracted_parts)
        combined_raw_text = "\n\n".join(dict.fromkeys(raw_text_parts))[:30000]

        deadlines_found = len(extracted.deadlines) > 0
        other_items_found = (
            len(extracted.required_documents) > 0
            or extracted.application_method is not None
            or extracted.selection_process is not None
        )

        success = deadlines_found or other_items_found
        partial_success = not deadlines_found and other_items_found

        error_message = None
        if not success:
            error_message = "採用情報が見つかりませんでした。別のURLをお試しください。"
        elif partial_success:
            error_message = "締切情報は取得できませんでしたが、他の情報を抽出しました"

        ci.log_selection_schedule_request_llm_cost(
            feature=feature,
            source_url=request_url,
            aggregated_usage=aggregated_usage,
            resolved_models=resolved_models,
        )

        return SelectionScheduleResponse(
            success=success,
            partial_success=partial_success,
            data=extracted if success else None,
            source_url=request_url,
            source_type=str(source_metadata["source_type"]),
            relation_company_name=(
                source_metadata["relation_company_name"]
                if isinstance(source_metadata["relation_company_name"], str)
                else None
            ),
            year_matched=(
                bool(source_metadata["year_matched"])
                if source_metadata["year_matched"] is not None
                else None
            ),
            used_graduation_year=(
                int(source_metadata["used_graduation_year"])
                if isinstance(source_metadata["used_graduation_year"], int)
                else None
            ),
            extracted_at=ci.datetime.utcnow().isoformat(),
            error=error_message,
            deadlines_found=deadlines_found,
            other_items_found=other_items_found,
            raw_text=combined_raw_text if success else None,
            raw_html=raw_html if success and len(raw_text_parts) == 1 and not primary_is_pdf else None,
            internal_telemetry=ci.consume_request_llm_cost_summary("company_info"),
        )

    except HTTPException:
        raise
    except Exception as e:
        return SelectionScheduleResponse(
            success=False,
            partial_success=False,
            data=None,
            source_url=str(request.url),
            source_type=str(source_metadata["source_type"]),
            relation_company_name=(
                source_metadata["relation_company_name"]
                if isinstance(source_metadata["relation_company_name"], str)
                else None
            ),
            year_matched=(
                bool(source_metadata["year_matched"])
                if source_metadata["year_matched"] is not None
                else None
            ),
            used_graduation_year=(
                int(source_metadata["used_graduation_year"])
                if isinstance(source_metadata["used_graduation_year"], int)
                else None
            ),
            extracted_at=ci.datetime.utcnow().isoformat(),
            error=f"情報の抽出に失敗しました: {str(e)}",
            deadlines_found=False,
            other_items_found=False,
            raw_text=None,
            raw_html=None,
        )
