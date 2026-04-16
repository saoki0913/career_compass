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
from pydantic import BaseModel, HttpUrl
from typing import Optional
from datetime import datetime
from urllib.parse import urlparse
import io
import json
import time
import asyncio

from app.utils.llm import (
    call_llm_with_error,
    consume_request_llm_cost_summary,
    log_selection_schedule_request_llm_cost,
    merge_llm_usage_tokens,
)
from app.utils.firecrawl import FirecrawlScrapeResult, scrape_url_with_schema
from app.config import settings
from app.prompts.notion_registry import get_managed_prompt_content
from app.utils.secure_logger import get_logger
from app.utils.company_names import (
    get_company_domain_patterns,
    normalize_company_result_source_type,
)
from app.utils.content_type_keywords import (
    CONTENT_TYPE_KEYWORDS,
    url_matches_content_type,
)
from app.utils.vector_store import (
    store_company_info,
    get_enhanced_context_for_review,
    has_company_rag,
    delete_company_rag,
    store_full_text_content,
    get_company_rag_status,
    delete_company_rag_by_type,
    delete_company_rag_by_urls,
)
from app.utils.embeddings import resolve_embedding_backend
from app.utils.content_types import CONTENT_TYPES
from app.utils.cache import get_rag_cache
from app.utils.web_search import (
    hybrid_web_search,
    CONTENT_TYPE_SEARCH_INTENT,
)
from app.utils.http_fetch import fetch_page_content, extract_text_from_html
from app.utils.pdf_ocr import extract_text_from_pdf_with_ocr
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
    SearchCandidate,
    ExtractedItem,
    ExtractedDeadline,
    ExtractedRecruitmentType,
    ExtractedDocument,
    ExtractedInfo,
    ExtractedScheduleInfo,
    SelectionScheduleResponse,
    BuildRagRequest,
    BuildRagResponse,
    RagContextRequest,
    RagContextResponse,
    RagStatusResponse,
    DetailedRagStatusResponse,
    DeleteByUrlsRequest,
    DeleteByUrlsResponse,
    CrawlCorporateRequest,
    CrawlCorporateResponse,
    UploadCorporatePdfResponse,
    EstimateCorporatePdfResponse,
    CrawlCorporateEstimateResponse,
    SearchCorporatePagesRequest,
    CorporatePageCandidate,
)

# ===== Imports from extracted modules =====
from app.routers.company_info_config import (
    PARENT_ALLOWED_CONTENT_TYPES,
    DDGS_CACHE_TTL,
    DDGS_CACHE_MAX_SIZE,
    CACHE_MODES,
    EMPLOYEE_INTERVIEW_POSITIVE_SIGNALS,
    EMPLOYEE_INTERVIEW_NEGATIVE_SIGNALS,
    SCHEDULE_FOLLOW_LINK_KEYWORDS,
    SCHEDULE_FOLLOW_LINK_NEGATIVE_KEYWORDS,
    SCHEDULE_MAX_FOLLOW_LINKS,
    SCHEDULE_MAX_PDF_FOLLOW_LINKS,
    SCHEDULE_MAX_OCR_CALLS,
    SCHEDULE_MIN_TEXT_CHARS,
    SCHEDULE_HTML_EXTRACT_MAX_CHARS,
    SCHEDULE_LLM_TEXT_MAX_CHARS,
    SCHEDULE_LLM_FALLBACK_MAX_CHARS,
    SCHEDULE_LLM_TEXT_CONTEXT_LINES,
    SCHEDULE_EXTREME_PAGE_CHARS,
    SCHEDULE_LLM_TEXT_MAX_CHARS_EXTREME,
    SCHEDULE_LLM_FALLBACK_MAX_CHARS_EXTREME,
    SCHEDULE_LLM_TEXT_CONTEXT_LINES_EXTREME,
    SCHEDULE_EXTREME_TAIL_LINES,
    SCHEDULE_LLM_MAX_OUTPUT_TOKENS,
    SCHEDULE_CONTENT_KEYWORDS,
    EXCLUDE_SITES_STRONG,
    JOB_SITES,
    IRRELEVANT_SITES,
    AGGREGATOR_SITES,
    RECRUIT_URL_KEYWORDS,
    RECRUIT_TITLE_KEYWORDS,
    CORP_KEYWORDS,
    IR_DOC_KEYWORDS,
    CORP_SEARCH_MIN_SCORE,
    CORP_STRICT_MIN_RESULTS,
    COMPANY_INFO_SCHEMA,
    SELECTION_SCHEDULE_SCHEMA,
)
from app.routers.company_info_url_utils import (
    _normalize_company_name,
    _normalize_text_for_match,
    _is_valid_http_url,
    _normalize_url,
    _domain_from_url,
    _classify_company_relation,
    _normalize_domain_input,
    _sanitize_preferred_domain,
    _should_include_corporate_candidate,
    _is_excluded_url,
    _is_irrelevant_url,
    _get_source_type_legacy as _get_source_type,
    _get_blog_penalty,
    _cap_schedule_confidence,
    _apply_schedule_source_confidence_caps,
    _company_name_matches,
)
from app.routers.company_info_candidate_scoring import (
    _get_graduation_year,
    _detect_other_graduation_years,
    _validate_and_correct_due_date,
    _infer_year_for_month,
    _contains_company_name,
    _has_strict_company_name_match,
    _get_conflicting_companies,
    _score_recruit_candidate,
    _score_recruit_candidate_with_breakdown,
    _score_corporate_candidate,
    _score_corporate_candidate_with_breakdown,
    _score_to_confidence,
    _hybrid_score_to_confidence,
    _recruitment_score_to_confidence,
    _recruitment_hybrid_score_to_confidence,
    _normalize_recruitment_source_type,
    _candidate_sort_key,
    _search_with_ddgs,
    HAS_DDGS,
)
from app.routers.company_info_schedule import (
    _compress_schedule_page_text_for_llm,
)
from app.routers.company_info_schedule_links import (
    _build_schedule_source_metadata,
    _build_recruit_queries,
    _schedule_confidence_rank,
    _has_dated_schedule_deadlines,
    _build_schedule_relation_signature,
    _score_schedule_follow_link,
    _extract_schedule_follow_links,
    _extract_schedule_pdf_follow_links,
    _extract_schedule_text_from_bytes,
    _merge_schedule_info_parts,
)
from app.routers.company_info_pdf import (
    _extract_text_pages_from_pdf_locally,
    _extract_text_from_pdf_locally,
    _get_pdf_page_count,
    _normalize_rag_pdf_billing_plan,
    _rag_pdf_max_ingest_pages,
    _rag_pdf_max_google_ocr_pages,
    _rag_pdf_max_mistral_ocr_pages,
    _slice_pdf_bytes_to_first_n_pages,
    _slice_pdf_bytes_to_page_indexes,
    _chars_per_page,
    _is_garbled_text,
    _is_local_pdf_page_readable,
    _should_run_pdf_ocr,
    _should_route_page_to_mistral,
    _build_page_routing_summary,
    _build_pdf_processing_notice_ja,
    _plan_pdf_page_routes,
    _ocr_selected_pdf_pages,
    _extract_text_from_pdf_with_page_routing,
    _pdf_ingest_telemetry_line,
    _build_pdf_estimate_response,
)

logger = get_logger(__name__)

# ===== Hybrid Search Configuration =====
USE_HYBRID_SEARCH = settings.company_search_hybrid

# Historical alias retained for in-repo consumers (e.g. company_info_ingest_service).
# Authoritative source lives in ``app.security.upload_limits``.
MAX_UPLOAD_PDF_BYTES = MAX_PDF_UPLOAD_BYTES


def _normalize_cache_mode(cache_mode: str | None, fallback: str) -> str:
    if cache_mode in CACHE_MODES:
        return cache_mode
    return fallback


router = APIRouter(prefix="/company-info", tags=["company-info"])


def _assert_principal_owns_company(
    principal: CareerPrincipal, expected_company_id: str
) -> None:
    """Enforce that the decoded principal was minted for this company_id.

    Defense-in-depth against a misbehaving BFF: the service JWT already says
    "this request came from next-bff", and this check adds "…acting on behalf
    of someone authorized for ``expected_company_id``". See V-1 in
    ``docs/review/security/security_audit_2026-04-14.md``.
    """
    if principal.company_id != expected_company_id:
        raise HTTPException(
            status_code=403,
            detail="career principal company_id mismatch",
        )


async def extract_info_with_llm(text: str, url: str) -> ExtractedInfo:
    """
    Extract recruitment information using LLM.

    Per SPEC Section 9.5:
    - Extract minimal set: 締切/募集区分/提出物/応募方法
    - Each item needs: 根拠URL + 信頼度(高/中/低)

    Uses OpenAI via shared LLM utility (feature="company_info").
    """
    # Get current year for date inference
    current_year = datetime.now().year

    system_prompt_template = get_managed_prompt_content(
        "company_info.extract_info.system",
        fallback="""あなたは日本の就活情報を抽出する専門アシスタントです。
以下のWebページテキストから、採用に関する情報を抽出してJSONで返してください。

## 重要な指示

1. **日付の推測**: 日付が曖昧でも推測して抽出してください
   - 「6月上旬」→ "{current_year}-06-01"
   - 「7月中旬」→ "{current_year}-07-15"
   - 「8月下旬」→ "{current_year}-08-25"
   - 「随時」「未定」→ null
   - 年が明記されていない場合は{current_year}年または{current_year + 1}年と推測

2. **部分的な情報も抽出**: 締切情報がなくても、他の情報（募集区分、応募方法など）があれば抽出してください

3. **信頼度の判定**:
   - high: 明確に記載されている（日付、具体的な手順など）
   - medium: 推測を含む（曖昧な日付、一般的な記述など）
   - low: 不確実（断片的な情報、古い可能性がある情報など）

## 抽出項目

1. **deadlines**: 締切情報のリスト
   - type: es_submission, web_test, aptitude_test, interview_1, interview_2, interview_3, interview_final, briefing, internship, offer_response, other
   - title: 締切のタイトル（例: "ES提出 (一次締切)"）
   - due_date: ISO形式の日付（YYYY-MM-DD）または null
   - source_url: "{url}"
   - confidence: high, medium, low

2. **recruitment_types**: 募集区分のリスト
   - name: 募集区分の名前（例: "夏インターン", "本選考", "早期選考"）
   - source_url: "{url}"
   - confidence: high, medium, low

3. **required_documents**: 必要書類のリスト
   - name: 書類名（例: "履歴書", "ES", "成績証明書"）
   - required: 必須かどうか（true/false）
   - source_url: "{url}"
   - confidence: high, medium, low

4. **application_method**: 応募方法（見つからない場合はnull）
   - value: 応募方法の説明（例: "マイページから応募"、"WEBエントリー"）
   - source_url: "{url}"
   - confidence: high, medium, low

5. **selection_process**: 選考プロセス（見つからない場合はnull）
   - value: 選考プロセスの説明（例: "ES→Webテスト→面接3回→最終面接"）
   - source_url: "{url}"
   - confidence: high, medium, low

## 出力形式

必ず以下の形式の有効なJSONを返してください:
{{
  "deadlines": [...],
  "recruitment_types": [...],
  "required_documents": [...],
  "application_method": {{...}} または null,
  "selection_process": {{...}} または null
}}""",
    )
    system_prompt = system_prompt_template.format(current_year=current_year, url=url)

    user_message_template = get_managed_prompt_content(
        "company_info.extract_info.user",
        fallback="以下のWebページテキストから採用情報を抽出してください:\n\n{text}",
    )
    user_message = user_message_template.format(text=text)

    # feature="company_info" → OpenAI (Responses API + Structured Outputs)
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
        parse_retry_instructions="必ず有効なJSONのみを出力してください。説明文やコードブロックは禁止です。",
    )

    if not llm_result.success:
        # Raise HTTPException with detailed error
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

    # Parse LLM response
    try:
        # Parse deadlines
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

        # Parse recruitment types
        recruitment_types = []
        for rt in data.get("recruitment_types", []):
            recruitment_types.append(
                ExtractedRecruitmentType(
                    name=rt.get("name", ""),
                    source_url=rt.get("source_url", url),
                    confidence=rt.get("confidence", "low"),
                )
            )

        # Parse required documents
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

        # Parse application method
        application_method = None
        am_data = data.get("application_method")
        if am_data:
            application_method = ExtractedItem(
                value=am_data.get("value", ""),
                source_url=am_data.get("source_url", url),
                confidence=am_data.get("confidence", "low"),
            )

        # Parse selection process
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
        parse_retry_instructions="必ず有効なJSONのみを出力してください。説明文やコードブロックは禁止です。",
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


def _parse_extracted_schedule_info(
    data: dict | None,
    default_source_url: str,
) -> ExtractedScheduleInfo:
    deadlines = []
    raw_deadlines = data.get("deadlines") if isinstance(data, dict) else []
    if not isinstance(raw_deadlines, list):
        raw_deadlines = []
    for d in raw_deadlines:
        if not isinstance(d, dict):
            continue
        deadlines.append(
            ExtractedDeadline(
                type=d.get("type", "other"),
                title=d.get("title", ""),
                due_date=d.get("due_date"),
                source_url=d.get("source_url", default_source_url),
                confidence=d.get("confidence", "low"),
            )
        )

    required_documents = []
    raw_docs = data.get("required_documents") if isinstance(data, dict) else []
    if not isinstance(raw_docs, list):
        raw_docs = []
    for doc in raw_docs:
        if not isinstance(doc, dict):
            continue
        required_documents.append(
            ExtractedDocument(
                name=doc.get("name", ""),
                required=doc.get("required", True),
                source_url=doc.get("source_url", default_source_url),
                confidence=doc.get("confidence", "low"),
            )
        )

    am_data = data.get("application_method") if isinstance(data, dict) else None
    application_method = None
    if isinstance(am_data, dict):
        application_method = ExtractedItem(
            value=am_data.get("value", ""),
            source_url=am_data.get("source_url", default_source_url),
            confidence=am_data.get("confidence", "low"),
        )

    sp_data = data.get("selection_process") if isinstance(data, dict) else None
    selection_process = None
    if isinstance(sp_data, dict):
        selection_process = ExtractedItem(
            value=sp_data.get("value", ""),
            source_url=sp_data.get("source_url", default_source_url),
            confidence=sp_data.get("confidence", "low"),
        )

    return ExtractedScheduleInfo(
        deadlines=deadlines,
        required_documents=required_documents,
        application_method=application_method,
        selection_process=selection_process,
    )


def _count_schedule_signal_items(extracted: ExtractedScheduleInfo | None) -> int:
    if not extracted:
        return 0
    return (
        len(extracted.deadlines)
        + len(extracted.required_documents)
        + int(extracted.application_method is not None)
        + int(extracted.selection_process is not None)
    )


def _schedule_candidate_requires_ocr(
    candidate_url: str,
    extracted: ExtractedScheduleInfo | None,
    preview_text: str | None,
) -> bool:
    lower_url = urlparse(candidate_url).path.lower()
    if lower_url.endswith(".pdf"):
        return True
    if _count_schedule_signal_items(extracted) > 0:
        return False
    return len((preview_text or "").strip()) < SCHEDULE_MIN_TEXT_CHARS


def _build_schedule_extraction_prompts(
    url: str,
    graduation_year: int | None,
    selection_type: str | None,
    *,
    text_for_llm: str | None,
) -> tuple[str, str]:
    grad_year = graduation_year or _get_graduation_year()
    grad_year_short = grad_year % 100
    start_year = grad_year - 2
    end_year = grad_year - 1

    if selection_type == "main_selection":
        year_rules = f"""
### 本選考の年推定ルール（{grad_year_short}卒向け）
日付に年が明記されていない場合、以下のルールで年を推測してください:
- **1月〜6月の締切** → {end_year}年
- **7月〜12月の締切** → {start_year}年
"""
    elif selection_type == "internship":
        year_rules = f"""
### インターンの年推定ルール（{grad_year_short}卒向け）
日付に年が明記されていない場合、以下のルールで年を推測してください:
- **1月〜3月の締切** → {end_year}年
- **4月〜12月の締切** → {start_year}年
"""
    else:
        year_rules = f"""
### 年推定ルール（{grad_year_short}卒向け）
日付に年が明記されていない場合、以下のルールで年を推測してください:
- **1月〜6月の締切** → {end_year}年（本選考の可能性が高い）
- **7月〜12月の締切** → {start_year}年（インターン/早期選考の可能性が高い）
"""

    selection_type_label = (
        "本選考"
        if selection_type == "main_selection"
        else "インターン" if selection_type == "internship" else "選考"
    )
    system_prompt_template = get_managed_prompt_content(
        "company_info.extract_schedule.system",
        fallback="""Webページテキストから{selection_type_label}向け就活情報をJSONのみで抽出する。
対象: {grad_year_short}卒。締切の日付は原則 {start_year}-04〜{end_year}-06 の範囲のみ（範囲外は締切にしない）。

## 日付
曖昧表現は推定して YYYY-MM-DD。6月上旬→-06-01、7月中旬→-07-15、8月下旬→-08-25、随時/未定→null。
{year_rules}
## 締切に含めないもの
{grad_year_short}卒以外の年が明示のもの、体験談・口コミ・選考レポート・過去実績・OB/OG記事。募集要項・選考スケジュール・エントリー締切など一次案内のみ。

## 信頼度 high/medium/low
明記/推測含む/不確実。

## フィールド
- deadlines[]: type(es_submission|web_test|aptitude_test|interview_1|interview_2|interview_3|interview_final|briefing|internship|offer_response|other), title, due_date, source_url="{url}", confidence
- required_documents[]: name, required, source_url, confidence
- application_method: null または {{value, source_url, confidence}}
- selection_process: null または {{value, source_url, confidence}}

## 出力を短く
同一工程の細かい中間日は1件にまとめる。締切はページに明示された主要なものに限定。application_method / selection_process の value は各1〜2文。required_documents は主要なもののみ（最大10件想定）。

締切がなくても応募方法・書類・選考フローがあれば埋める。""",
    )
    system_prompt = system_prompt_template.format(
        selection_type_label=selection_type_label,
        grad_year_short=grad_year_short,
        start_year=start_year,
        end_year=end_year,
        year_rules=year_rules,
        url=url,
    )
    if text_for_llm is not None:
        user_message_template = get_managed_prompt_content(
            "company_info.extract_schedule.user",
            fallback="以下のWebページテキストから{selection_type_label}情報を抽出してください:\n\n{text_for_llm}",
        )
        user_message = user_message_template.format(
            selection_type_label=selection_type_label,
            text_for_llm=text_for_llm,
        )
    else:
        user_message = (
            f"URL {url} のページ内容から {selection_type_label} 情報を抽出してください。"
            "募集要項・選考スケジュール・エントリー締切など一次案内のみを根拠にし、"
            "体験談・口コミ・過去実績・OB/OG記事は除外してください。"
        )
    return system_prompt, user_message


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




def _build_corporate_queries(
    company_name: str,
    search_type: str,
    custom_query: str | None = None,
    preferred_domain: str | None = None,
    content_type: str | None = None,
) -> list[str]:
    """Build search queries for corporate page search.

    Args:
        company_name: Company name to search for
        search_type: Legacy search type (ir/business/about)
        custom_query: Custom search query override
        preferred_domain: Optional domain to prioritize
        content_type: Specific content type for optimized queries

    Returns:
        List of search queries
    """
    queries = []

    # Custom query takes priority over content_type and search_type
    if custom_query:
        queries = [custom_query]
    # If content_type is specified, use content-type-specific queries (up to 4)
    elif content_type:
        type_queries = {
            "new_grad_recruitment": [
                f"{company_name} 新卒採用",
                f"{company_name} 採用情報",
                f"{company_name} エントリー",
                f"{company_name} 新卒 採用サイト",
            ],
            "midcareer_recruitment": [
                f"{company_name} 中途採用",
                f"{company_name} キャリア採用",
                f"{company_name} 転職",
                f"{company_name} 採用情報",
            ],
            "ceo_message": [
                f"{company_name} 社長メッセージ",
                f"{company_name} 代表メッセージ",
                f"{company_name} トップメッセージ",
                f"{company_name} ごあいさつ",
            ],
            "employee_interviews": [
                f"{company_name} 社員インタビュー",
                f"{company_name} 社員紹介",
                f"{company_name} 先輩社員",
                f"{company_name} 社員の声",
            ],
            "press_release": [
                f"{company_name} プレスリリース",
                f"{company_name} ニュースリリース",
                f"{company_name} お知らせ",
                f"{company_name} ニュース",
            ],
            "ir_materials": [
                f"{company_name} IR",
                f"{company_name} 投資家情報",
                f"{company_name} 決算説明資料",
                f"{company_name} 有価証券報告書",
            ],
            "csr_sustainability": [
                f"{company_name} サステナビリティ",
                f"{company_name} CSR",
                f"{company_name} ESG",
                f"{company_name} 環境",
            ],
            "midterm_plan": [
                f"{company_name} 中期経営計画",
                f"{company_name} 中期計画",
                f"{company_name} 経営戦略",
                f"{company_name} 事業計画",
            ],
            "corporate_site": [
                f"{company_name} 会社概要",
                f"{company_name} 企業情報",
                f"{company_name} 会社案内",
                f"{company_name} 企業概要",
            ],
        }
        queries = type_queries.get(content_type, [f"{company_name} {content_type}"])
    else:
        # Fallback to legacy search_type-based queries
        type_queries = {
            "ir": [
                f"{company_name} IR",
                f"{company_name} 投資家情報",
                f"{company_name} 決算説明資料",
            ],
            "business": [
                f"{company_name} 事業内容",
                f"{company_name} 事業紹介",
                f"{company_name} 製品 サービス",
            ],
            "about": [
                f"{company_name} 会社概要",
                f"{company_name} 企業情報",
                f"{company_name} 会社案内",
            ],
        }
        queries = type_queries.get(search_type, [f"{company_name} {search_type}"])

    # Deduplicate and add site: prefix if preferred_domain
    seen = set()
    result = []
    for q in queries:
        query = q
        if preferred_domain and "site:" not in q:
            query = f"{q} site:{preferred_domain}"
        if query in seen:
            continue
        seen.add(query)
        result.append(query)
    return result[:4]


@router.post("/search-pages")
@limiter.limit("60/minute")
async def search_company_pages(payload: SearchPagesRequest, request: Request):
    """
    Search for company recruitment page candidates.

    This endpoint searches for company recruitment pages using DuckDuckGo
    based on the company name, industry, or custom query.

    Supports filtering by graduation year and selection type (main_selection/internship).

    Returns a list of up to max_results candidate URLs with confidence scores.
    """
    request = payload
    company_name = request.company_name
    industry = request.industry
    custom_query = request.custom_query
    max_results = min(request.max_results, 15)  # Cap at 15
    graduation_year = request.graduation_year
    selection_type = request.selection_type
    allow_snippet_match = request.allow_snippet_match

    candidates = []

    # ログ: 検索開始
    logger.debug(f"\n[サイト検索] {'='*50}")
    logger.debug(f"[サイト検索] 🔍 企業名: {company_name}")
    if industry:
        logger.debug(f"[サイト検索] 🏢 業界: {industry}")

    # ===== Hybrid Search Path (RRF + Cross-Encoder Reranking) =====
    if USE_HYBRID_SEARCH and not custom_query:
        logger.debug(f"[サイト検索] 🚀 Hybrid Search モード (RRF + Reranking)")

        # Get domain patterns for scoring
        domain_patterns = get_company_domain_patterns(company_name)

        # Execute hybrid search
        hybrid_results = await hybrid_web_search(
            company_name=company_name,
            search_intent="recruitment",
            graduation_year=graduation_year,
            selection_type=selection_type,
            max_results=max_results + 10,  # Fetch extra for filtering
            domain_patterns=domain_patterns,
            use_cache=True,
            content_type="new_grad_recruitment",
            strict_company_match=True,
            allow_aggregators=False,
            allow_snippet_match=allow_snippet_match,
        )

        # Log queries used in hybrid search
        try:
            from app.utils.web_search import generate_query_variations

            hybrid_queries = generate_query_variations(
                company_name=company_name,
                search_intent="recruitment",
                graduation_year=graduation_year,
                selection_type=selection_type,
            )
            logger.debug(f"[サイト検索] 🔍 Hybridクエリ一覧: {hybrid_queries}")
        except Exception:
            pass

        logger.debug(f"[サイト検索] 📊 Hybrid検索結果: {len(hybrid_results)}件")

        # Apply filtering (subsidiary, parent company, etc.)
        ranked_candidates: list[tuple[tuple[int, int, float], SearchCandidate]] = []
        excluded_reasons = {
            "不適切なサイト": 0,
            "非許可信頼サイト": 0,
        }

        for result in hybrid_results:
            url = result.url
            title = result.title
            snippet = result.snippet

            # Log score breakdown
            logger.debug(f"[サイト検索] 📋 {url[:60]}...")
            logger.debug(
                f"  │  RRF: {result.rrf_score:.3f}, Rerank: {result.rerank_score:.3f}, Combined: {result.combined_score:.3f}"
            )

            # Skip irrelevant sites
            if _is_irrelevant_url(url):
                excluded_reasons["不適切なサイト"] = (
                    excluded_reasons.get("不適切なサイト", 0) + 1
                )
                logger.debug(f"[サイト検索] ❌ 除外: 不適切なサイト")
                continue

            relation = _classify_company_relation(url, company_name)
            relation_company_name = relation["relation_company_name"]
            source_type = _normalize_recruitment_source_type(
                url,
                result.source_type,
                relation,
            )

            if source_type == "other":
                excluded_reasons["非許可信頼サイト"] = (
                    excluded_reasons.get("非許可信頼サイト", 0) + 1
                )
                logger.debug(f"[サイト検索] ❌ 除外: 非許可の外部サイト")
                continue

            adjusted_score = result.combined_score
            confidence = _recruitment_hybrid_score_to_confidence(
                adjusted_score,
                source_type,
                year_matched=result.year_matched,
            )

            # Log adoption
            source_label = {
                "official": "公式",
                "aggregator": "就活サイト",
                "job_site": "就活サイト",
                "parent": "親会社",
                "subsidiary": "子会社",
                "other": "その他",
            }.get(source_type, source_type)
            logger.debug(f"[サイト検索] ✅ 採用: {source_label}, {confidence}")

            candidate = SearchCandidate(
                url=url,
                title=title[:100] if title else url[:50],
                confidence=confidence,
                source_type=source_type,
                relation_company_name=(
                    relation_company_name
                    if isinstance(relation_company_name, str)
                    else None
                ),
            )
            score_for_rank = float(result.combined_score)
            if source_type == "official":
                score_for_rank += 0.015
            if result.year_matched:
                score_for_rank += 0.01
            ranked_candidates.append(
                (_candidate_sort_key(candidate, score_for_rank), candidate)
            )

        filtered_candidates = [
            candidate
            for _, candidate in sorted(
                ranked_candidates,
                key=lambda item: item[0],
            )[:max_results]
        ]

        # Log summary
        logger.debug(f"\n[サイト検索] 📊 Hybrid検索結果サマリー:")
        logger.debug(
            f"  └─ 検索結果: {len(hybrid_results)}件 → 採用: {len(filtered_candidates)}件"
        )
        if any(excluded_reasons.values()):
            excluded_str = ", ".join(
                f"{k}: {v}件" for k, v in excluded_reasons.items() if v > 0
            )
            logger.debug(f"     除外内訳: {excluded_str}")
        logger.debug(f"[サイト検索] {'='*50}\n")

        return {"candidates": filtered_candidates}

    # ===== Legacy Search Path (Original DuckDuckGo Search) =====
    queries = _build_recruit_queries(
        company_name,
        industry,
        custom_query,
        graduation_year=graduation_year,
        selection_type=selection_type,
    )

    # Try real web search with DuckDuckGo
    if HAS_DDGS:
        results_map = {}
        score_details = {}  # スコア詳細を保存
        per_query = min(8, max_results + 3)

        for query in queries:
            logger.debug(f"[サイト検索] 🔍 検索クエリ: {query}")
            search_results = await _search_with_ddgs(query, per_query)
            logger.debug(f"[サイト検索] 📊 DuckDuckGo結果: {len(search_results)}件")

            for result in search_results:
                url = result.get("href", result.get("url", ""))
                title = result.get("title", "")
                snippet = result.get("body", "")

                if not url:
                    continue

                normalized = _normalize_url(url)
                # スコアと内訳を取得
                score, breakdown, patterns = _score_recruit_candidate_with_breakdown(
                    url,
                    title,
                    snippet,
                    company_name,
                    industry or "",
                    graduation_year=graduation_year,
                )
                if score is None:
                    logger.debug(f"[サイト検索] ❌ 除外: {url[:60]}... (除外ドメイン)")
                    continue

                existing = results_map.get(normalized)
                if existing is None or score > existing["score"]:
                    results_map[normalized] = {
                        "url": url,
                        "title": title,
                        "snippet": snippet,
                        "score": score,
                    }
                    score_details[normalized] = {
                        "breakdown": breakdown,
                        "patterns": patterns,
                    }

        scored = sorted(
            results_map.values(), key=lambda x: (-x["score"], len(x["title"] or ""))
        )

        # ログ: スコア詳細
        logger.debug(f"\n[サイト検索] 📋 スコア詳細 ({len(scored)}件):")
        for i, item in enumerate(scored[:10]):  # 上位10件のみ表示
            url = item["url"]
            normalized = _normalize_url(url)
            details = score_details.get(normalized, {})
            breakdown = details.get("breakdown", {})
            patterns = details.get("patterns", [])

            prefix = "├─" if i < min(9, len(scored) - 1) else "└─"
            logger.debug(f"  {prefix} URL: {url[:70]}{'...' if len(url) > 70 else ''}")
            logger.debug(
                f"  │  タイトル: {(item['title'] or '')[:50]}{'...' if len(item['title'] or '') > 50 else ''}"
            )
            logger.debug(f"  │  スコア: {item['score']:.1f}pt")
            if patterns:
                logger.debug(f"  │  ドメインパターン: {patterns}")
            if breakdown:
                breakdown_str = ", ".join(f"{k}{v}" for k, v in breakdown.items())
                logger.debug(f"  │  内訳: {breakdown_str}")
            logger.debug(f"  │")

        # Filter out irrelevant sites, subsidiaries, and unrelated companies
        ranked_candidates: list[tuple[tuple[int, int, float], SearchCandidate]] = []
        excluded_reasons = {
            "不適切なサイト": 0,
            "非許可信頼サイト": 0,
        }

        for item in scored:
            title = item["title"]
            url = item["url"]
            snippet = item.get("snippet", "")
            domain_patterns = get_company_domain_patterns(company_name)

            # Skip irrelevant sites (shopping, PDF viewers, etc.)
            if _is_irrelevant_url(url):
                excluded_reasons["不適切なサイト"] = (
                    excluded_reasons.get("不適切なサイト", 0) + 1
                )
                logger.debug(f"[サイト検索] ❌ 除外: {url[:50]}... (不適切なサイト)")
                continue

            relation = _classify_company_relation(url, company_name)
            is_official_domain = bool(relation["is_official"])
            relation_company_name = relation["relation_company_name"]

            # Exclude conflicting company domains (unless strict name match)
            url_domain = _domain_from_url(url)
            conflicts = _get_conflicting_companies(url_domain, company_name)
            if conflicts and not is_official_domain and not _has_strict_company_name_match(
                company_name, title, snippet
            ):
                excluded_reasons["競合ドメイン"] = (
                    excluded_reasons.get("競合ドメイン", 0) + 1
                )
                conflict_label = ", ".join(sorted(conflicts))[:50]
                logger.debug(
                    f"[サイト検索] ❌ 除外: {url[:50]}... (競合ドメイン: {conflict_label})"
                )
                continue

            # Apply penalty for parent company sites (when searching for subsidiary)
            # 注: 完全除外ではなくペナルティを適用（グループ採用サイトの可能性を考慮）
            is_parent_site = bool(relation["is_parent"])
            if is_parent_site and not is_official_domain:
                item["score"] *= 0.5  # 親会社サイトペナルティ
                item["is_parent_company"] = True
                logger.debug(f"[サイト検索] ⚠️ ペナルティ: {url[:50]}... (親会社サイト, 0.5x)")

            # Apply penalty for subsidiary sites (when searching for parent)
            # 注: 完全除外ではなくペナルティを適用
            is_sub = bool(relation["is_subsidiary"])
            sub_name = (
                relation_company_name
                if isinstance(relation_company_name, str)
                else None
            )
            if is_sub and not is_official_domain:
                item["score"] *= 0.3  # 子会社サイトペナルティ
                item["is_subsidiary"] = True
                item["subsidiary_name"] = sub_name
                logger.debug(
                    f"[サイト検索] ⚠️ ペナルティ: {url[:50]}... (子会社: {sub_name}, 0.3x)"
                )

            source_type = _normalize_recruitment_source_type(
                url,
                _get_source_type(url, company_name),
                relation,
            )
            if source_type == "other":
                excluded_reasons["非許可信頼サイト"] = (
                    excluded_reasons.get("非許可信頼サイト", 0) + 1
                )
                logger.debug(f"[サイト検索] ❌ 除外: {url[:50]}... (非許可の外部サイト)")
                continue

            # Check if URL matches official domain patterns
            # If it's an official domain, skip company name check (e.g., nttdata-recruit.com for NTTデータ)
            from urllib.parse import urlparse

            try:
                parsed_url = urlparse(url)
                url_domain = parsed_url.netloc.lower()
            except Exception:
                url_domain = ""

            # Skip results that don't contain the company name
            # This filters out different companies that share industry keywords
            # By default, only check title/URL (not snippet) to avoid false positives
            # Exception: Skip this check for official domain matches
            if not is_official_domain and not _contains_company_name(
                company_name, title, url, snippet, allow_snippet_match
            ):
                excluded_reasons["企業名不一致"] = (
                    excluded_reasons.get("企業名不一致", 0) + 1
                )
                logger.debug(f"[サイト検索] ❌ 除外: {url[:50]}... (企業名不一致)")
                continue

            # Check year match for confidence calculation
            grad_year_for_check = graduation_year or _get_graduation_year()
            other_years = _detect_other_graduation_years(
                url, title, snippet, grad_year_for_check
            )
            year_matched = not bool(other_years)
            confidence = _recruitment_score_to_confidence(
                item["score"],
                source_type,
                year_matched,
            )

            # ログ: 採用
            source_label = {
                "official": "公式",
                "job_site": "就活サイト",
                "blog": "ブログ",
                "other": "その他",
                "subsidiary": "子会社",
                "parent": "親会社",
            }.get(source_type, source_type)
            logger.debug(f"[サイト検索] ✅ 採用: {url[:50]}... ({source_label}, {confidence})")

            candidate = SearchCandidate(
                url=url,
                title=title[:100] if title else url[:50],
                confidence=confidence,
                source_type=source_type,
                relation_company_name=(
                    relation_company_name
                    if isinstance(relation_company_name, str)
                    else None
                ),
            )
            ranked_candidates.append(
                (_candidate_sort_key(candidate, float(item["score"])), candidate)
            )

        # ログ: 結果サマリー
        logger.debug(f"\n[サイト検索] 📊 結果サマリー:")
        logger.debug(
            f"  └─ 検索結果: {len(scored)}件 → 採用: {len(ranked_candidates)}件"
        )
        if any(excluded_reasons.values()):
            excluded_str = ", ".join(
                f"{k}: {v}件" for k, v in excluded_reasons.items() if v > 0
            )
            logger.debug(f"     除外内訳: {excluded_str}")
        logger.debug(f"[サイト検索] {'='*50}\n")

        if ranked_candidates:
            candidates = [
                candidate
                for _, candidate in sorted(ranked_candidates, key=lambda item: item[0])[
                    :max_results
                ]
            ]
            return {"candidates": candidates}

    # Fallback: DDGS unavailable
    logger.warning("[サイト検索] ⚠️ DuckDuckGo 検索が利用できません。手動URL入力が必要です。")
    return {
        "candidates": [],
        "error": "検索機能が無効です。公式URLを手動入力してください。",
    }


async def _fetch_schedule_response(
    request: FetchRequest, feature: str
) -> SelectionScheduleResponse:
    """
    Fetch and extract schedule from a URL.

    Uses graduation_year and selection_type from request if available.
    """
    try:
        request_url = str(request.url)
        aggregated_usage: dict[str, int] = {}
        resolved_models: list[str] = []
        source_metadata = {
            "source_type": "other",
            "relation_company_name": None,
            "year_matched": None,
            "used_graduation_year": request.graduation_year or _get_graduation_year(),
        }
        primary_payload = await fetch_page_content(request_url)
        primary_is_pdf = urlparse(request_url).path.lower().endswith(".pdf") or (
            primary_payload.startswith(b"%PDF") if primary_payload else False
        )
        text = ""
        raw_html = primary_payload[:200000] if primary_payload and not primary_is_pdf else None
        source_metadata = _build_schedule_source_metadata(
            request_url,
            request.company_name,
            extract_text_from_html(primary_payload, max_text_chars=SCHEDULE_HTML_EXTRACT_MAX_CHARS)
            if raw_html
            else "",
            request.graduation_year,
        )

        extracted_parts: list[ExtractedScheduleInfo] = []
        raw_text_parts: list[str] = []
        ocr_calls_used = 0
        follow_links: list[str] = []
        pdf_follow_links: list[str] = []

        firecrawl_enabled = bool((settings.firecrawl_api_key or "").strip())
        if firecrawl_enabled:
            extracted, scrape_result = await _extract_schedule_with_firecrawl(
                request_url,
                graduation_year=request.graduation_year,
                selection_type=request.selection_type,
            )
            preview_text = (scrape_result.markdown or scrape_result.html).strip()
            if extracted is not None and _count_schedule_signal_items(extracted) > 0:
                extracted = _apply_schedule_source_confidence_caps(
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
                follow_links = _extract_schedule_follow_links(
                    raw_html,
                    request_url,
                    request.company_name,
                )
                pdf_follow_links = _extract_schedule_pdf_follow_links(
                    raw_html,
                    request_url,
                    request.company_name,
                )

            should_try_follow_link = (
                not _has_dated_schedule_deadlines(extracted)
                and follow_links
            )
            if should_try_follow_link:
                follow_url = follow_links[0]
                if follow_url.lower().endswith(".pdf") and ocr_calls_used < SCHEDULE_MAX_OCR_CALLS:
                    follow_payload = await fetch_page_content(follow_url)
                    follow_text, _ = await _extract_schedule_text_from_bytes(
                        follow_url,
                        follow_payload,
                    )
                    ocr_calls_used += 1
                    if follow_text and len(follow_text) >= SCHEDULE_MIN_TEXT_CHARS:
                        extracted, usage, model = await extract_schedule_with_llm(
                            follow_text,
                            follow_url,
                            feature=feature,
                            graduation_year=request.graduation_year,
                            selection_type=request.selection_type,
                        )
                        merge_llm_usage_tokens(aggregated_usage, usage)
                        if model:
                            resolved_models.append(model)
                        follow_metadata = _build_schedule_source_metadata(
                            follow_url,
                            request.company_name,
                            follow_text,
                            request.graduation_year,
                        )
                        extracted = _apply_schedule_source_confidence_caps(
                            extracted,
                            str(follow_metadata["source_type"]),
                            (
                                bool(follow_metadata["year_matched"])
                                if follow_metadata["year_matched"] is not None
                                else None
                            ),
                        )
                        if _count_schedule_signal_items(extracted) > 0:
                            extracted_parts.append(extracted)
                            raw_text_parts.append(follow_text[:30000])
                else:
                    follow_extracted, follow_scrape_result = await _extract_schedule_with_firecrawl(
                        follow_url,
                        graduation_year=request.graduation_year,
                        selection_type=request.selection_type,
                    )
                    follow_preview_text = (follow_scrape_result.markdown or follow_scrape_result.html).strip()
                    if follow_extracted is not None and _count_schedule_signal_items(follow_extracted) > 0:
                        follow_metadata = _build_schedule_source_metadata(
                            follow_url,
                            request.company_name,
                            follow_preview_text,
                            request.graduation_year,
                        )
                        follow_extracted = _apply_schedule_source_confidence_caps(
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
                ocr_calls_used < SCHEDULE_MAX_OCR_CALLS
                and not _has_dated_schedule_deadlines(_merge_schedule_info_parts(extracted_parts) if extracted_parts else None)
                and pdf_follow_links
            )
            if should_try_pdf_follow_ocr:
                ocr_url = pdf_follow_links[0]
                follow_payload = await fetch_page_content(ocr_url)
                follow_text, _ = await _extract_schedule_text_from_bytes(
                    ocr_url,
                    follow_payload,
                )
                ocr_calls_used += 1
                if follow_text and len(follow_text) >= SCHEDULE_MIN_TEXT_CHARS:
                    extracted, usage, model = await extract_schedule_with_llm(
                        follow_text,
                        ocr_url,
                        feature=feature,
                        graduation_year=request.graduation_year,
                        selection_type=request.selection_type,
                    )
                    merge_llm_usage_tokens(aggregated_usage, usage)
                    if model:
                        resolved_models.append(model)
                    follow_metadata = _build_schedule_source_metadata(
                        ocr_url,
                        request.company_name,
                        follow_text,
                        request.graduation_year,
                    )
                    extracted = _apply_schedule_source_confidence_caps(
                        extracted,
                        str(follow_metadata["source_type"]),
                        (
                            bool(follow_metadata["year_matched"])
                            if follow_metadata["year_matched"] is not None
                            else None
                        ),
                    )
                    if _count_schedule_signal_items(extracted) > 0:
                        extracted_parts.append(extracted)
                        raw_text_parts.append(follow_text[:30000])

            should_try_primary_ocr = (
                ocr_calls_used < SCHEDULE_MAX_OCR_CALLS
                and _schedule_candidate_requires_ocr(
                    request_url,
                    extracted_parts[0] if extracted_parts else None,
                    (raw_text_parts[0] if raw_text_parts else ""),
                )
                and primary_is_pdf
            )
            if should_try_primary_ocr:
                text, _ = await _extract_schedule_text_from_bytes(request_url, primary_payload)
                ocr_calls_used += 1
                if text and len(text) >= SCHEDULE_MIN_TEXT_CHARS:
                    extracted, usage, model = await extract_schedule_with_llm(
                        text,
                        request_url,
                        feature=feature,
                        graduation_year=request.graduation_year,
                        selection_type=request.selection_type,
                    )
                    merge_llm_usage_tokens(aggregated_usage, usage)
                    if model:
                        resolved_models.append(model)
                    extracted = _apply_schedule_source_confidence_caps(
                        extracted,
                        str(source_metadata["source_type"]),
                        (
                            bool(source_metadata["year_matched"])
                            if source_metadata["year_matched"] is not None
                            else None
                        ),
                    )
                    if _count_schedule_signal_items(extracted) > 0:
                        extracted_parts.append(extracted)
                        raw_text_parts.append(text[:30000])

        if not extracted_parts:
            text, primary_is_pdf = await _extract_schedule_text_from_bytes(
                request_url, primary_payload
            )
            if text and len(text) >= SCHEDULE_MIN_TEXT_CHARS:
                extracted, usage, model = await extract_schedule_with_llm(
                    text,
                    request_url,
                    feature=feature,
                    graduation_year=request.graduation_year,
                    selection_type=request.selection_type,
                )
                merge_llm_usage_tokens(aggregated_usage, usage)
                if model:
                    resolved_models.append(model)
                extracted = _apply_schedule_source_confidence_caps(
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
                extracted_at=datetime.utcnow().isoformat(),
                error="ページの内容を取得できませんでした。JavaScriptで描画されるページの可能性があります。別のURLをお試しください。",
                deadlines_found=False,
                other_items_found=False,
                raw_text=None,
                raw_html=None,
            )

        extracted = _merge_schedule_info_parts(extracted_parts)
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

        log_selection_schedule_request_llm_cost(
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
            extracted_at=datetime.utcnow().isoformat(),
            error=error_message,
            deadlines_found=deadlines_found,
            other_items_found=other_items_found,
            raw_text=combined_raw_text if success else None,
            raw_html=raw_html if success and len(raw_text_parts) == 1 and not primary_is_pdf else None,
            internal_telemetry=consume_request_llm_cost_summary("company_info"),
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
            extracted_at=datetime.utcnow().isoformat(),
            error=f"情報の抽出に失敗しました: {str(e)}",
            deadlines_found=False,
            other_items_found=False,
            raw_text=None,
            raw_html=None,
        )


@router.post("/fetch-schedule", response_model=SelectionScheduleResponse)
@limiter.limit("60/minute")
async def fetch_selection_schedule(payload: FetchRequest, request: Request):
    """
    Fetch and extract selection schedule information from a URL.
    """
    request = payload
    return await _fetch_schedule_response(request, feature="selection_schedule")


# ============================================================================
# RAG (Retrieval Augmented Generation) Endpoints
# ============================================================================


def _extracted_data_to_chunks(extracted_data: dict, source_url: str) -> list[dict]:
    """
    Convert extracted company data to text chunks for embedding.

    Args:
        extracted_data: Extracted information dict
        source_url: Source URL

    Returns:
        List of content chunks
    """
    chunks = []

    # Deadlines
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

    # Recruitment types
    for rt in extracted_data.get("recruitment_types", []):
        chunks.append(
            {
                "text": f"募集区分: {rt.get('name', '')}",
                "type": "recruitment_type",
                "metadata": {"confidence": rt.get("confidence", "low")},
            }
        )

    # Required documents
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

    # Application method
    am = extracted_data.get("application_method")
    if am and am.get("value"):
        chunks.append(
            {
                "text": f"応募方法: {am['value']}",
                "type": "application_method",
                "metadata": {"confidence": am.get("confidence", "low")},
            }
        )

    # Selection process
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


@router.post("/rag/build", response_model=BuildRagResponse)
@limiter.limit("60/minute")
async def build_company_rag(
    payload: BuildRagRequest,
    request: Request,
    principal: CareerPrincipal = Depends(require_career_principal("company")),
):
    """
    Build RAG (vector embeddings) for a company.

    This endpoint:
    1. Takes company info (either raw content or pre-extracted data)
    2. Converts to text chunks
    3. Generates embeddings and stores in vector database
    4. Optionally stores full text content (chunked)

    The caller (Next.js API) is responsible for:
    - Authentication
    - Passing the company info

    New features:
    - store_full_text: When True, also stores full text content (chunked)
    - content_type: New classification (optional). Use content_channel for legacy.
    """
    _assert_principal_owns_company(principal, payload.company_id)
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

        # Resolve content_type/content_channel
        content_type = request.content_type
        content_channel = request.content_channel

        if content_type and content_type not in CONTENT_TYPES:
            return BuildRagResponse(
                success=False,
                company_id=request.company_id,
                chunks_stored=0,
                error=f"Invalid content_type: {content_type}",
            )

        # If raw content provided and store_full_text is True, store full text
        if request.raw_content and request.store_full_text:
            # Use the new full text storage function
            full_text_result = await store_full_text_content(
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
                # Count the chunks that were stored (approximate)
                from app.utils.text_chunker import (
                    JapaneseTextChunker,
                    extract_sections_from_html,
                    chunk_sections_with_metadata,
                    chunk_html_content,
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

        # If extracted data provided, convert to structured chunks
        if request.extracted_data:
            structured_chunks = _extracted_data_to_chunks(
                request.extracted_data, request.source_url
            )

            # Store structured data with content_type="corporate_site" (fallback)
            if structured_chunks:
                # Add content_type/content_channel to each chunk
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


@router.post("/rag/context", response_model=RagContextResponse)
@limiter.limit("60/minute")
async def get_rag_context(
    payload: RagContextRequest,
    request: Request,
    principal: CareerPrincipal = Depends(require_career_principal("company")),
):
    """
    Get RAG context for ES review.

    This endpoint:
    1. Takes company ID and ES content as query
    2. Searches vector database for relevant company information
    3. Returns formatted context for LLM prompt

    The caller (Next.js API or ES review endpoint) uses this to:
    - Enrich ES review with company-specific context
    - Enable company_connection scoring axis
    """
    _assert_principal_owns_company(principal, payload.company_id)
    request = payload
    try:
        # Check if RAG exists
        rag_exists = has_company_rag(request.company_id)

        if not rag_exists:
            return RagContextResponse(
                success=True, company_id=request.company_id, context="", has_rag=False
            )

        # Get context
        context = await get_enhanced_context_for_review(
            company_id=request.company_id,
            es_content=request.query,
            max_context_length=request.max_context_length,
        )

        return RagContextResponse(
            success=True, company_id=request.company_id, context=context, has_rag=True
        )

    except Exception as e:
        logger.error(f"[RAG検索] ❌ コンテキスト取得失敗: {e}")
        return RagContextResponse(
            success=False, company_id=request.company_id, context="", has_rag=False
        )


@router.get("/rag/status/{company_id}", response_model=RagStatusResponse)
@limiter.limit("120/minute")
async def get_rag_status(
    company_id: str,
    request: Request,
    principal: CareerPrincipal = Depends(require_career_principal("company")),
):
    """
    Check if a company has RAG data (simple check).

    Returns whether the company has vector embeddings stored.
    """
    _assert_principal_owns_company(principal, company_id)
    return RagStatusResponse(company_id=company_id, has_rag=has_company_rag(company_id))


@router.get(
    "/rag/status-detailed/{company_id}", response_model=DetailedRagStatusResponse
)
@limiter.limit("120/minute")
async def get_detailed_rag_status(
    company_id: str,
    request: Request,
    principal: CareerPrincipal = Depends(require_career_principal("company")),
):
    """
    Get detailed RAG status for a company.

    Returns chunk counts by content type and last update time.
    """
    _assert_principal_owns_company(principal, company_id)
    status = get_company_rag_status(company_id)

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


@router.delete("/rag/{company_id}")
@limiter.limit("60/minute")
async def delete_rag(
    company_id: str,
    request: Request,
    principal: CareerPrincipal = Depends(require_career_principal("company")),
):
    """
    Delete all RAG data for a company.

    Used when company info is updated or company is deleted.
    """
    _assert_principal_owns_company(principal, company_id)
    success = delete_company_rag(company_id)
    cache = get_rag_cache()
    if cache:
        await cache.invalidate_company(company_id)
    return {"success": success, "company_id": company_id}


@router.delete("/rag/{company_id}/{content_type}")
@limiter.limit("60/minute")
async def delete_rag_by_type(
    company_id: str,
    content_type: str,
    request: Request,
    principal: CareerPrincipal = Depends(require_career_principal("company")),
):
    """
    Delete RAG data for a company by content type.

    Used when only specific content type needs to be updated.
    """
    _assert_principal_owns_company(principal, company_id)
    if content_type not in CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid content_type: {content_type}. Valid types: {CONTENT_TYPES}",
        )

    success = delete_company_rag_by_type(company_id, content_type)
    cache = get_rag_cache()
    if cache:
        await cache.invalidate_company(company_id)
    return {"success": success, "company_id": company_id, "content_type": content_type}


@router.post("/rag/{company_id}/delete-by-urls", response_model=DeleteByUrlsResponse)
@limiter.limit("60/minute")
async def delete_rag_by_urls(
    company_id: str,
    payload: DeleteByUrlsRequest,
    request: Request,
    principal: CareerPrincipal = Depends(require_career_principal("company")),
):
    """
    Delete RAG data for a company by source URLs.

    Used when specific URLs are removed from the company's registered URLs.
    This also deletes the associated vector chunks from ChromaDB.

    Note: Using POST instead of DELETE because DELETE with request body
    is not well supported across all HTTP clients.
    """
    _assert_principal_owns_company(principal, company_id)
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
        result = delete_company_rag_by_urls(company_id, request.urls)

        urls_deleted = [url for url, count in result["per_url"].items() if count > 0]

        cache = get_rag_cache()
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
        logger.error(f"[RAG削除] ❌ URL別削除エラー: {e}")
        return DeleteByUrlsResponse(
            success=False,
            company_id=company_id,
            urls_deleted=[],
            chunks_deleted=0,
            errors=[str(e)],
        )


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
    t0 = time.monotonic()

    filename = file.filename or "document.pdf"
    mime_type = (file.content_type or "").lower()
    if not filename.lower().endswith(".pdf") and mime_type != "application/pdf":
        raise HTTPException(status_code=400, detail="PDFファイルを指定してください。")

    pdf_bytes = await file.read()
    if not pdf_bytes:
        raise HTTPException(status_code=400, detail="PDFファイルが空です。")
    enforce_pdf_upload_size(pdf_bytes)

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


def _looks_like_pdf_payload(url: str, payload: bytes) -> bool:
    return url.lower().endswith(".pdf") or payload[:5] == b"%PDF-"


def _looks_like_html_payload(payload: bytes) -> bool:
    sample = payload[:512].lower()
    return b"<html" in sample or b"<!doctype html" in sample or b"<body" in sample


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
) -> dict[str, object]:
    payload = await fetch_page_content(url)

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


@router.post("/rag/estimate-crawl-corporate", response_model=CrawlCorporateEstimateResponse)
@limiter.limit("60/minute")
async def estimate_crawl_corporate_pages(
    payload: CrawlCorporateRequest,
    request: Request,
    principal: CareerPrincipal = Depends(require_career_principal("company")),
):
    _assert_principal_owns_company(principal, payload.company_id)
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


@router.post("/rag/crawl-corporate", response_model=CrawlCorporateResponse)
@limiter.limit("60/minute")
async def crawl_corporate_pages(
    payload: CrawlCorporateRequest,
    request: Request,
    principal: CareerPrincipal = Depends(require_career_principal("company")),
):
    """
    Crawl and index corporate site pages for RAG.

    This endpoint:
    1. Fetches each URL
    2. Extracts and chunks text
    3. Stores in vector DB with content_channel="corporate_ir"/"corporate_business"/"corporate_general"
    4. Updates BM25 index

    The caller (Next.js API) is responsible for:
    - Authentication
    - Plan limit checking (page count limits)
    - Storing URLs in company record
    """
    _assert_principal_owns_company(principal, payload.company_id)
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

    import asyncio

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

            # Rate limiting: wait 1 second between requests
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


@router.post("/search-corporate-pages")
@limiter.limit("60/minute")
async def search_corporate_pages(payload: SearchCorporatePagesRequest, request: Request):
    """
    Search for corporate page candidates (IR, business info, etc.).

    Returns URL candidates for user to select.

    Args (via request):
        company_name: Target company name
        search_type: Legacy search type (ir/business/about)
        content_type: Specific ContentType for optimized search
        custom_query: Custom search query override
        preferred_domain: Optional preferred domain
        strict_company_match: If True, require company match
        allow_aggregators: If True, allow aggregator sites
        max_results: Maximum number of results to return
        allow_snippet_match: If True, also match company name in snippet
    """
    request = payload
    company_name = request.company_name
    search_type = request.search_type
    content_type = request.content_type
    custom_query = request.custom_query
    preferred_domain = request.preferred_domain
    strict_company_match = (
        True if request.strict_company_match is None else request.strict_company_match
    )
    allow_aggregators = True if request.allow_aggregators else False
    max_results = min(request.max_results, 10)
    allow_snippet_match = request.allow_snippet_match
    cache_mode = _normalize_cache_mode(request.cache_mode, "bypass")
    graduation_year = request.graduation_year
    preferred_domain = _sanitize_preferred_domain(
        company_name, preferred_domain, content_type
    )

    # Determine label for logging
    ct_labels = {
        "new_grad_recruitment": "新卒採用",
        "midcareer_recruitment": "中途採用",
        "ceo_message": "社長メッセージ",
        "employee_interviews": "社員インタビュー",
        "press_release": "プレスリリース",
        "ir_materials": "IR資料",
        "csr_sustainability": "CSR/サステナ",
        "midterm_plan": "中期経営計画",
        "corporate_site": "企業情報",
    }
    if content_type and content_type in ct_labels:
        type_label = ct_labels[content_type]
    else:
        type_label = {"about": "企業情報", "ir": "IR", "business": "事業"}.get(
            search_type, search_type
        )

    # ===== Hybrid Search Path (RRF + Cross-Encoder Reranking) =====
    if USE_HYBRID_SEARCH and not custom_query:
        logger.debug(
            f"\n[{type_label}検索] =================================================="
        )
        logger.debug(f"[{type_label}検索] 🔍 企業名: {company_name}")
        logger.debug(f"[{type_label}検索] 🚀 Hybrid Search モード (RRF + Reranking)")
        if content_type:
            logger.debug(f"[{type_label}検索] 📂 コンテンツタイプ: {content_type}")

        try:
            from app.utils.web_search import generate_query_variations

            hybrid_queries = generate_query_variations(
                company_name=company_name,
                search_intent=CONTENT_TYPE_SEARCH_INTENT.get(content_type, "corporate_about"),
                graduation_year=graduation_year,
                selection_type=None,
            )
            logger.debug(f"[{type_label}検索] 🔍 Hybridクエリ一覧: {hybrid_queries}")
        except Exception:
            pass

        # Get domain patterns for scoring
        domain_patterns = get_company_domain_patterns(company_name)

        # Map content_type to search_intent
        search_intent = CONTENT_TYPE_SEARCH_INTENT.get(content_type, "corporate_about")

        if content_type == "new_grad_recruitment":
            allow_aggregators = False

        # Execute hybrid search
        hybrid_results = await hybrid_web_search(
            company_name=company_name,
            search_intent=search_intent,
            graduation_year=graduation_year,
            max_results=max_results + 10,  # Fetch extra for filtering
            domain_patterns=domain_patterns,
            use_cache=True,
            cache_mode=cache_mode,
            content_type=content_type,
            preferred_domain=preferred_domain,
            strict_company_match=strict_company_match,
            allow_aggregators=allow_aggregators,
            allow_snippet_match=allow_snippet_match,
        )

        logger.debug(f"[{type_label}検索] 📊 Hybrid検索結果: {len(hybrid_results)}件")

        # Apply filtering (subsidiary, parent company, company name check)
        ranked_candidates = []
        excluded_reasons = {
            "不適切なサイト": 0,
            "競合ドメイン": 0,
            "企業名不一致": 0,
        }

        for result in hybrid_results:
            url = result.url
            title = result.title
            snippet = result.snippet

            # Log score breakdown
            logger.debug(f"[{type_label}検索] 📋 {url[:60]}...")
            logger.debug(
                f"  │  RRF: {result.rrf_score:.3f}, Rerank: {result.rerank_score:.3f}, Combined: {result.combined_score:.3f}"
            )

            # Skip irrelevant sites
            if _is_irrelevant_url(url):
                excluded_reasons["不適切なサイト"] += 1
                logger.debug(f"[{type_label}検索] ❌ 除外: 不適切なサイト")
                continue

            relation = _classify_company_relation(url, company_name, content_type)
            is_official_domain = bool(relation["is_official"])
            relation_company_name = relation["relation_company_name"]
            is_related_company = bool(relation["is_parent"]) or bool(
                relation["is_subsidiary"]
            )

            # Determine source type
            source_type = normalize_company_result_source_type(
                result.source_type,
                relation,
            )

            keep_candidate, exclude_reason = _should_include_corporate_candidate(
                source_type,
                content_type,
                relation,
                url=url,
                title=title,
                snippet=snippet,
            )
            if not keep_candidate:
                excluded_reasons[exclude_reason or "関連会社サイト"] = (
                    excluded_reasons.get(exclude_reason or "関連会社サイト", 0) + 1
                )
                logger.debug(
                    f"[{type_label}検索] ❌ 除外: {exclude_reason or '関連会社サイト'}"
                )
                continue

            adjusted_score = result.combined_score
            confidence = _hybrid_score_to_confidence(
                adjusted_score,
                source_type,
                year_matched=result.year_matched,
                content_type=content_type,
            )

            # Log adoption
            source_label = {
                "official": "公式",
                "aggregator": "就活サイト",
                "job_site": "就活サイト",
                "parent": "親会社",
                "subsidiary": "子会社",
                "other": "その他",
            }.get(source_type, source_type)
            logger.debug(f"[{type_label}検索] ✅ 採用: {source_label}, {confidence}")

            normalized_source_type = (
                source_type
                if source_type
                in [
                    "official",
                    "job_site",
                    "parent",
                    "subsidiary",
                    "blog",
                    "other",
                ]
                else "other"
            )

            url_pattern_match = True
            if content_type and content_type != "corporate_site":
                url_pattern_match = url_matches_content_type(url, content_type)

            candidate = SearchCandidate(
                url=url,
                title=title[:100] if title else url[:50],
                confidence=confidence,
                source_type=normalized_source_type,
                relation_company_name=(
                    relation_company_name
                    if isinstance(relation_company_name, str)
                    else None
                ),
                parent_allowed=bool(relation.get("parent_allowed")),
            )
            score_for_rank = float(result.combined_score)
            if url_pattern_match:
                score_for_rank += 0.015
            ranked_candidates.append((_candidate_sort_key(candidate, score_for_rank), candidate))

        filtered_candidates = [
            candidate
            for _, candidate in sorted(
                ranked_candidates,
                key=lambda item: item[0],
            )[:max_results]
        ]

        # Log summary
        logger.debug(f"\n[{type_label}検索] 📊 Hybrid検索結果サマリー:")
        logger.debug(
            f"  └─ 検索結果: {len(hybrid_results)}件 → 採用: {len(filtered_candidates)}件"
        )
        if any(excluded_reasons.values()):
            excluded_str = ", ".join(
                f"{k}: {v}件" for k, v in excluded_reasons.items() if v > 0
            )
            logger.debug(f"     除外内訳: {excluded_str}")
        logger.debug(
            f"[{type_label}検索] ==================================================\n"
        )

        return {"candidates": filtered_candidates}

    # ===== Legacy Search Path (Original DuckDuckGo Search) =====
    # Use content_type for optimized queries, or fall back to search_type
    queries = _build_corporate_queries(
        company_name,
        search_type,
        custom_query,
        preferred_domain,
        content_type=content_type,
    )

    candidates = []

    # Try web search
    if HAS_DDGS:
        results_map = {}
        score_details = {}  # スコア内訳を保存
        per_query = min(8, max_results + 3)

        # type_label is already defined above

        logger.debug(
            f"\n[{type_label}検索] =================================================="
        )
        logger.debug(f"[{type_label}検索] 🔍 企業名: {company_name}")
        if content_type:
            logger.debug(f"[{type_label}検索] 📂 コンテンツタイプ: {content_type}")
        else:
            logger.debug(f"[{type_label}検索] 📂 検索タイプ: {search_type}")
        if preferred_domain:
            logger.debug(f"[{type_label}検索] 🌐 優先ドメイン: {preferred_domain}")

        async def _collect_results(strict_match: bool, allow_aggs: bool) -> None:
            for query in queries:
                logger.debug(f"[{type_label}検索] 🔍 検索クエリ: {query}")
                search_results = await _search_with_ddgs(
                    query, per_query, cache_mode=cache_mode
                )
                logger.debug(f"[{type_label}検索] 📊 DuckDuckGo結果: {len(search_results)}件")

                for result in search_results:
                    url = result.get("href", result.get("url", ""))
                    title = result.get("title", "")
                    snippet = result.get("body", "")

                    if not url:
                        continue

                    normalized = _normalize_url(url)
                    score, breakdown, patterns = (
                        _score_corporate_candidate_with_breakdown(
                            url,
                            title,
                            snippet,
                            company_name,
                            search_type,
                            preferred_domain=preferred_domain,
                            strict_company_match=strict_match,
                            allow_aggregators=allow_aggs,
                            content_type=content_type,
                        )
                    )
                    if score is None:
                        reason = breakdown.get("除外", "除外")
                        logger.debug(f"[{type_label}検索] ❌ 除外: {url[:60]}... ({reason})")
                        continue
                    if score < CORP_SEARCH_MIN_SCORE:
                        continue

                    existing = results_map.get(normalized)
                    if existing is None or score > existing["score"]:
                        results_map[normalized] = {
                            "url": url,
                            "title": title,
                            "snippet": snippet,
                            "score": score,
                        }
                        score_details[normalized] = {
                            "breakdown": breakdown,
                            "patterns": patterns,
                        }

        await _collect_results(strict_company_match, allow_aggregators)
        _log_corporate_search_debug(f"strict results={len(results_map)}")

        if strict_company_match and len(results_map) < CORP_STRICT_MIN_RESULTS:
            _log_corporate_search_debug("relaxed pass enabled")
            await _collect_results(False, allow_aggregators)

        if not allow_aggregators and len(results_map) == 0:
            _log_corporate_search_debug("aggregator fallback enabled")
            await _collect_results(False, True)

        scored = sorted(
            results_map.values(), key=lambda x: (-x["score"], len(x["title"] or ""))
        )

        # ログ: スコア詳細
        logger.debug(f"\n[{type_label}検索] 📋 スコア詳細 ({len(scored)}件):")
        for i, item in enumerate(scored[:10]):  # 上位10件のみ表示
            url = item["url"]
            normalized = _normalize_url(url)
            details = score_details.get(normalized, {})
            breakdown = details.get("breakdown", {})
            patterns = details.get("patterns", [])

            prefix = "├─" if i < min(9, len(scored) - 1) else "└─"
            logger.debug(f"  {prefix} URL: {url[:70]}{'...' if len(url) > 70 else ''}")
            logger.debug(
                f"  │  タイトル: {(item['title'] or '')[:50]}{'...' if len(item['title'] or '') > 50 else ''}"
            )
            logger.debug(f"  │  スコア: {item['score']:.1f}pt")
            if patterns:
                logger.debug(f"  │  ドメインパターン: {patterns}")
            if breakdown:
                breakdown_str = ", ".join(f"{k}{v}" for k, v in breakdown.items())
                logger.debug(f"  │  内訳: {breakdown_str}")
            logger.debug(f"  │")

        # Filter and add source_type
        excluded_reasons = {
            "不適切なサイト": 0,
            "競合ドメイン": 0,
            "企業名不一致": 0,
        }

        for item in scored:
            url = item["url"]
            title = item["title"]
            snippet = item.get("snippet", "")

            # Skip irrelevant sites (shopping, PDF viewers, etc.)
            if _is_irrelevant_url(url):
                excluded_reasons["不適切なサイト"] = (
                    excluded_reasons.get("不適切なサイト", 0) + 1
                )
                logger.debug(f"[{type_label}検索] ❌ 除外: {url[:50]}... (不適切なサイト)")
                continue

            relation = _classify_company_relation(url, company_name, content_type)
            is_official_domain = bool(relation["is_official"])
            relation_company_name = relation["relation_company_name"]
            is_related_company = bool(relation["is_parent"]) or bool(
                relation["is_subsidiary"]
            )

            # Exclude conflicting company domains (unless strict name match)
            url_domain = _domain_from_url(url)
            conflicts = _get_conflicting_companies(url_domain, company_name)
            if (
                conflicts
                and not is_official_domain
                and not is_related_company
                and not _has_strict_company_name_match(company_name, title, snippet)
            ):
                excluded_reasons["競合ドメイン"] = (
                    excluded_reasons.get("競合ドメイン", 0) + 1
                )
                conflict_label = ", ".join(sorted(conflicts))[:50]
                logger.debug(
                    f"[{type_label}検索] ❌ 除外: {url[:50]}... (競合ドメイン: {conflict_label})"
                )
                continue

            is_parent_site = bool(relation["is_parent"])
            if is_parent_site and not is_official_domain:
                item["score"] *= 0.5
                item["is_parent_company"] = True
                logger.debug(
                    f"[{type_label}検索] ⚠️ ペナルティ: {url[:50]}... (親会社サイト, 0.5x)"
                )

            # Apply penalty for subsidiary sites (when searching for parent)
            is_sub = bool(relation["is_subsidiary"])
            sub_name = (
                relation_company_name
                if isinstance(relation_company_name, str)
                else None
            )
            if is_sub and not is_official_domain:
                item["score"] *= 0.3  # 子会社サイトペナルティ
                item["is_subsidiary"] = True
                item["subsidiary_name"] = sub_name
                logger.debug(
                    f"[{type_label}検索] ⚠️ ペナルティ: {url[:50]}... (子会社: {sub_name}, 0.3x)"
                )

            # Check if URL matches official domain patterns
            # If it's an official domain, skip company name check
            # Skip results that don't contain the company name
            # By default, only check title/URL (not snippet) to avoid false positives
            # Exception: Skip this check for official domain matches
            if (
                not is_official_domain
                and not is_related_company
                and not _contains_company_name(
                    company_name, title, url, snippet, allow_snippet_match
                )
            ):
                excluded_reasons["企業名不一致"] = (
                    excluded_reasons.get("企業名不一致", 0) + 1
                )
                logger.debug(f"[{type_label}検索] ❌ 除外: {url[:50]}... (企業名不一致)")
                continue

            source_type = normalize_company_result_source_type(
                _get_source_type(url, company_name),
                relation,
            )

            confidence = _score_to_confidence(
                item["score"],
                source_type,
                content_type=content_type,
                company_match=_contains_company_name(
                    company_name, title, url, snippet, allow_snippet_match
                ),
            )

            keep_candidate, exclude_reason = _should_include_corporate_candidate(
                source_type,
                content_type,
                relation,
                url=url,
                title=title,
                snippet=snippet,
            )
            if not keep_candidate:
                excluded_reasons[exclude_reason or "関連会社サイト"] = (
                    excluded_reasons.get(exclude_reason or "関連会社サイト", 0) + 1
                )
                logger.debug(
                    f"[{type_label}検索] ❌ 除外: {url[:50]}... ({exclude_reason or '関連会社サイト'})"
                )
                continue

            # ログ: 採用
            source_label = {
                "official": "公式",
                "job_site": "就活サイト",
                "blog": "ブログ",
                "other": "その他",
                "subsidiary": "子会社",
                "parent": "親会社",
            }.get(source_type, source_type)
            logger.debug(
                f"[{type_label}検索] ✅ 採用: {url[:50]}... ({source_label}, {confidence})"
            )

            candidates.append(
                CorporatePageCandidate(
                    url=url,
                    title=title[:100] if title else url[:50],
                    snippet=snippet[:200] if snippet else "",
                    confidence=confidence,
                    source_type=source_type,
                    relation_company_name=(
                        relation_company_name
                        if isinstance(relation_company_name, str)
                        else None
                    ),
                    parent_allowed=bool(relation.get("parent_allowed")),
                )
            )

            # Stop if we have enough candidates
            if len(candidates) >= max_results:
                break

        # ログ: 結果サマリー
        logger.debug(f"\n[{type_label}検索] 📊 結果サマリー:")
        logger.debug(f"  └─ 検索結果: {len(scored)}件 → 採用: {len(candidates)}件")
        if any(excluded_reasons.values()):
            excluded_str = ", ".join(
                f"{k}: {v}件" for k, v in excluded_reasons.items() if v > 0
            )
            logger.debug(f"     除外内訳: {excluded_str}")
        logger.debug(f"[{type_label}検索] ==================================================")

    # Sort candidates by source_type → confidence → original order
    # This ensures official/high results appear at the top
    if candidates:
        SOURCE_TYPE_PRIORITY = {
            "official": 0,
            "job_site": 1,
            "parent": 2,
            "subsidiary": 2,
            "other": 3,
            "blog": 4,
        }
        CONFIDENCE_PRIORITY = {"high": 0, "medium": 1, "low": 2}
        candidates.sort(
            key=lambda x: (
                SOURCE_TYPE_PRIORITY.get(x.source_type, 99),
                CONFIDENCE_PRIORITY.get(x.confidence, 99),
            )
        )

    return {"candidates": candidates}


def _classify_corporate_url_confidence(
    url: str, title: str, search_type: str, company_name: str = ""
) -> str:
    """Backward-compatible wrapper for corporate URL confidence."""
    score = _score_corporate_candidate(
        url,
        title,
        "",
        company_name,
        search_type,
        preferred_domain=None,
        strict_company_match=False,
    )
    if score is None:
        return "low"
    source_type = _get_source_type(url, company_name) if company_name else "other"
    return _score_to_confidence(score, source_type)


def _log_corporate_search_debug(message: str) -> None:
    if settings.company_search_debug:
        logger.debug(f"[企業サイト検索] {message}")
