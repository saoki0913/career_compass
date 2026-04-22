"""LLM-based extraction for company info and selection schedules."""

from __future__ import annotations

from datetime import datetime

from fastapi import HTTPException

from app.prompts.company_info_prompts import (
    EXTRACTION_SYSTEM_PROMPT,
    EXTRACTION_USER_MESSAGE,
    PARSE_RETRY_INSTRUCTION,
)
from app.routers.company_info_config import (
    COMPANY_INFO_SCHEMA,
    SCHEDULE_LLM_MAX_OUTPUT_TOKENS,
    SELECTION_SCHEDULE_SCHEMA,
)
from app.routers.company_info_models import (
    ExtractedDeadline,
    ExtractedDocument,
    ExtractedInfo,
    ExtractedItem,
    ExtractedRecruitmentType,
    ExtractedScheduleInfo,
)
from app.routers.company_info_schedule import _compress_schedule_page_text_for_llm
from app.routers.company_info_schedule_extraction import (
    _build_schedule_extraction_prompts,
    _parse_extracted_schedule_info,
)
from app.utils.firecrawl import FirecrawlScrapeResult, scrape_url_with_schema
from app.utils.llm import call_llm_with_error, merge_llm_usage_tokens
from app.utils.secure_logger import get_logger

logger = get_logger(__name__)


async def extract_info_with_llm(text: str, url: str) -> ExtractedInfo:
    """
    Extract recruitment information using LLM.

    Per SPEC Section 9.5:
    - Extract minimal set: 締切/募集区分/提出物/応募方法
    - Each item needs: 根拠URL + 信頼度(高/中/低)

    Uses OpenAI via shared LLM utility (feature="company_info").
    """
    current_year = datetime.now().year

    system_prompt_template = EXTRACTION_SYSTEM_PROMPT
    system_prompt = system_prompt_template.format(current_year=current_year, url=url)

    user_message_template = EXTRACTION_USER_MESSAGE
    user_message = user_message_template.format(text=text)

    llm_result = await call_llm_with_error(
        system_prompt=system_prompt,
        user_message=user_message,
        max_tokens=1500,
        temperature=0.1,
        feature="company_info",
        response_format="json_schema",
        json_schema=COMPANY_INFO_SCHEMA,
        use_responses_api=True,
        retry_on_parse=True,
        parse_retry_instructions=PARSE_RETRY_INSTRUCTION,
    )

    if not llm_result.success:
        error = llm_result.error
        raise HTTPException(
            status_code=503,
            detail={
                "error": (
                    error.message
                    if error
                    else "企業情報の抽出中にエラーが発生しました。"
                ),
                "error_type": error.error_type if error else "unknown",
                "provider": error.provider if error else "unknown",
                "detail": error.detail if error else "",
            },
        )

    data = llm_result.data
    if data is None:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "AIからの応答を解析できませんでした。もう一度お試しください。",
                "error_type": "parse",
                "provider": "openai",
                "detail": "Empty response from LLM",
            },
        )

    try:
        deadlines = []
        for d in data.get("deadlines", []):
            deadlines.append(
                ExtractedDeadline(
                    type=d.get("type", "other"),
                    title=d.get("title", ""),
                    due_date=d.get("due_date"),
                    source_url=d.get("source_url", url),
                    confidence=d.get("confidence", "low"),
                )
            )

        recruitment_types = []
        for rt in data.get("recruitment_types", []):
            recruitment_types.append(
                ExtractedRecruitmentType(
                    name=rt.get("name", ""),
                    source_url=rt.get("source_url", url),
                    confidence=rt.get("confidence", "low"),
                )
            )

        required_documents = []
        for doc in data.get("required_documents", []):
            required_documents.append(
                ExtractedDocument(
                    name=doc.get("name", ""),
                    required=doc.get("required", False),
                    source_url=doc.get("source_url", url),
                    confidence=doc.get("confidence", "low"),
                )
            )

        application_method = None
        am_data = data.get("application_method")
        if am_data:
            application_method = ExtractedItem(
                value=am_data.get("value", ""),
                source_url=am_data.get("source_url", url),
                confidence=am_data.get("confidence", "low"),
            )

        selection_process = None
        sp_data = data.get("selection_process")
        if sp_data:
            selection_process = ExtractedItem(
                value=sp_data.get("value", ""),
                source_url=sp_data.get("source_url", url),
                confidence=sp_data.get("confidence", "low"),
            )

        return ExtractedInfo(
            deadlines=deadlines,
            recruitment_types=recruitment_types,
            required_documents=required_documents,
            application_method=application_method,
            selection_process=selection_process,
        )
    except Exception as e:
        logger.error(f"[企業情報抽出] ❌ LLM応答解析失敗: {e}")
        raise HTTPException(
            status_code=503,
            detail={
                "error": "AIからの応答を処理できませんでした。もう一度お試しください。",
                "error_type": "parse",
                "provider": "openai",
                "detail": str(e),
            },
        )


async def extract_schedule_with_llm(
    text: str,
    url: str,
    feature: str = "selection_schedule",
    graduation_year: int | None = None,
    selection_type: str | None = None,
) -> tuple[ExtractedScheduleInfo, dict[str, int] | None, str | None]:
    """
    Extract selection schedule information using LLM.

    Focused scope (no recruitment_types) for schedule-specific endpoint.
    Returns (parsed info, usage dict or None, resolved model id or None).

    Args:
        text: Page text content to extract from
        url: Source URL for reference
        feature: Feature name for LLM call tracking
        graduation_year: Target graduation year (e.g., 2027 for 27卒)
        selection_type: "main_selection" | "internship" | None
    """
    text_for_llm = _compress_schedule_page_text_for_llm(text)
    system_prompt, user_message = _build_schedule_extraction_prompts(
        url,
        graduation_year,
        selection_type,
        text_for_llm=text_for_llm,
    )

    llm_result = await call_llm_with_error(
        system_prompt=system_prompt,
        user_message=user_message,
        max_tokens=SCHEDULE_LLM_MAX_OUTPUT_TOKENS,
        temperature=0.1,
        feature=feature,
        response_format="json_schema",
        json_schema=SELECTION_SCHEDULE_SCHEMA,
        use_responses_api=True,
        retry_on_parse=True,
        parse_retry_instructions=PARSE_RETRY_INSTRUCTION,
    )

    if not llm_result.success:
        error = llm_result.error
        raise HTTPException(
            status_code=503,
            detail={
                "error": (
                    error.message
                    if error
                    else "選考スケジュール抽出中にエラーが発生しました。"
                ),
                "error_type": error.error_type if error else "unknown",
                "provider": error.provider if error else "unknown",
                "detail": error.detail if error else "",
            },
        )

    data = llm_result.data
    if data is None:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "AIからの応答を解析できませんでした。もう一度お試しください。",
                "error_type": "parse",
                "provider": "openai",
                "detail": "Empty response from LLM",
            },
        )

    try:
        return (
            _parse_extracted_schedule_info(data, url),
            llm_result.usage,
            llm_result.resolved_model,
        )
    except Exception as e:
        logger.error(f"[選考スケジュール抽出] ❌ LLM応答解析失敗: {e}")
        raise HTTPException(
            status_code=503,
            detail={
                "error": "AIからの応答を処理できませんでした。もう一度お試しください。",
                "error_type": "parse",
                "provider": "openai",
                "detail": str(e),
            },
        )


async def _extract_schedule_with_firecrawl(
    candidate_url: str,
    *,
    graduation_year: int | None,
    selection_type: str | None,
) -> tuple[ExtractedScheduleInfo | None, FirecrawlScrapeResult]:
    system_prompt, user_prompt = _build_schedule_extraction_prompts(
        candidate_url,
        graduation_year,
        selection_type,
        text_for_llm=None,
    )
    scrape_result = await scrape_url_with_schema(
        candidate_url,
        schema=SELECTION_SCHEDULE_SCHEMA["schema"],
        system_prompt=system_prompt,
        prompt=user_prompt,
    )
    if not scrape_result.success or not isinstance(scrape_result.structured_data, dict):
        return None, scrape_result

    try:
        return _parse_extracted_schedule_info(scrape_result.structured_data, candidate_url), scrape_result
    except Exception as exc:
        logger.warning(f"[選考スケジュール取得] Firecrawl parse failed for {candidate_url}: {exc}")
        return None, scrape_result
