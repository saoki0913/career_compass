"""Company info schedule orchestration service."""

from __future__ import annotations

from dataclasses import dataclass
import re
from types import ModuleType
from typing import Any
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup
from fastapi import HTTPException

from app.config import settings
from app.services.company_info.extract_deadlines import (
    _count_schedule_signal_items,
    _schedule_candidate_requires_ocr,
)
from app.utils.http_fetch import extract_text_from_html
from app.utils.jst import now_jst
from app.utils.llm import (
    consume_request_llm_cost_summary,
    log_selection_schedule_request_llm_cost,
)
from app.utils.llm_usage_cost import merge_llm_usage_tokens
from app.utils import pdf_ocr as pdf_ocr_module
from app.utils.web_search import COMPANY_QUERY_ALIASES

SCHEDULE_HTML_EXTRACT_MAX_CHARS = 8192
SCHEDULE_FOLLOW_LINK_KEYWORDS: tuple[tuple[str, int], ...] = ()
SCHEDULE_FOLLOW_LINK_NEGATIVE_KEYWORDS: set[str] = set()
SCHEDULE_MAX_FOLLOW_LINKS = 1
SCHEDULE_MAX_PDF_FOLLOW_LINKS = 1
SCHEDULE_MAX_OCR_CALLS = 1
SCHEDULE_MIN_TEXT_CHARS = 40
SCHEDULE_CONTENT_KEYWORDS: tuple[str, ...] = ()
SCHEDULE_LLM_TEXT_MAX_CHARS = 6000
SCHEDULE_LLM_FALLBACK_MAX_CHARS = 4500
SCHEDULE_LLM_TEXT_CONTEXT_LINES = 2
SCHEDULE_EXTREME_PAGE_CHARS = 80_000
SCHEDULE_LLM_TEXT_MAX_CHARS_EXTREME = 4000
SCHEDULE_LLM_FALLBACK_MAX_CHARS_EXTREME = 3200
SCHEDULE_LLM_TEXT_CONTEXT_LINES_EXTREME = 3
SCHEDULE_EXTREME_TAIL_LINES = 400
SCHEDULE_LLM_MAX_OUTPUT_TOKENS = 1500
ExtractedScheduleInfo: Any = None
FetchRequest: Any = None
SelectionScheduleResponse: Any = None
_pdf_module: ModuleType | None = None
_schedule_runtime: ScheduleRuntimeDependencies | None = None
_get_graduation_year: Any = None
_apply_schedule_source_confidence_caps: Any = None
_classify_company_relation: Any = None
_normalize_url: Any = None
_detect_other_graduation_years: Any = None
_normalize_recruitment_source_type: Any = None
_SCHEDULE_DATE_LINE_HINT_RE = re.compile(
    r"(?:\d{4}\s*年\s*\d{1,2}\s*月(?:\s*\d{1,2}\s*日)?|\d{1,2}\s*月\s*\d{1,2}\s*日|\d{4}\s*[-/／]\s*\d{1,2}\s*[-/／]\s*\d{1,2})"
)


@dataclass(frozen=True)
class ScheduleRuntimeDependencies:
    fetch_page_content: Any
    extract_schedule_with_firecrawl: Any
    extract_schedule_text_from_bytes: Any
    extract_schedule_with_llm: Any


def configure_dependencies(
    *,
    models: ModuleType,
    config: ModuleType,
    candidate_scoring: ModuleType,
    url_utils: ModuleType,
    runtime: ScheduleRuntimeDependencies | None = None,
    pdf_module: ModuleType | None = None,
) -> None:
    """Inject router-owned dependencies without importing router modules here."""

    global SCHEDULE_HTML_EXTRACT_MAX_CHARS, SCHEDULE_FOLLOW_LINK_KEYWORDS
    global SCHEDULE_FOLLOW_LINK_NEGATIVE_KEYWORDS, SCHEDULE_MAX_FOLLOW_LINKS
    global SCHEDULE_MAX_PDF_FOLLOW_LINKS, SCHEDULE_MAX_OCR_CALLS
    global SCHEDULE_MIN_TEXT_CHARS, SCHEDULE_CONTENT_KEYWORDS
    global SCHEDULE_LLM_TEXT_MAX_CHARS, SCHEDULE_LLM_FALLBACK_MAX_CHARS
    global SCHEDULE_LLM_TEXT_CONTEXT_LINES, SCHEDULE_EXTREME_PAGE_CHARS
    global SCHEDULE_LLM_TEXT_MAX_CHARS_EXTREME, SCHEDULE_LLM_FALLBACK_MAX_CHARS_EXTREME
    global SCHEDULE_LLM_TEXT_CONTEXT_LINES_EXTREME, SCHEDULE_EXTREME_TAIL_LINES
    global SCHEDULE_LLM_MAX_OUTPUT_TOKENS, ExtractedScheduleInfo, FetchRequest
    global SelectionScheduleResponse, _schedule_runtime, _pdf_module
    global _get_graduation_year, _apply_schedule_source_confidence_caps
    global _classify_company_relation, _normalize_url, _detect_other_graduation_years
    global _normalize_recruitment_source_type

    SCHEDULE_HTML_EXTRACT_MAX_CHARS = config.SCHEDULE_HTML_EXTRACT_MAX_CHARS
    SCHEDULE_FOLLOW_LINK_KEYWORDS = config.SCHEDULE_FOLLOW_LINK_KEYWORDS
    SCHEDULE_FOLLOW_LINK_NEGATIVE_KEYWORDS = config.SCHEDULE_FOLLOW_LINK_NEGATIVE_KEYWORDS
    SCHEDULE_MAX_FOLLOW_LINKS = config.SCHEDULE_MAX_FOLLOW_LINKS
    SCHEDULE_MAX_PDF_FOLLOW_LINKS = config.SCHEDULE_MAX_PDF_FOLLOW_LINKS
    SCHEDULE_MAX_OCR_CALLS = config.SCHEDULE_MAX_OCR_CALLS
    SCHEDULE_MIN_TEXT_CHARS = config.SCHEDULE_MIN_TEXT_CHARS
    SCHEDULE_CONTENT_KEYWORDS = config.SCHEDULE_CONTENT_KEYWORDS
    SCHEDULE_LLM_TEXT_MAX_CHARS = config.SCHEDULE_LLM_TEXT_MAX_CHARS
    SCHEDULE_LLM_FALLBACK_MAX_CHARS = config.SCHEDULE_LLM_FALLBACK_MAX_CHARS
    SCHEDULE_LLM_TEXT_CONTEXT_LINES = config.SCHEDULE_LLM_TEXT_CONTEXT_LINES
    SCHEDULE_EXTREME_PAGE_CHARS = config.SCHEDULE_EXTREME_PAGE_CHARS
    SCHEDULE_LLM_TEXT_MAX_CHARS_EXTREME = config.SCHEDULE_LLM_TEXT_MAX_CHARS_EXTREME
    SCHEDULE_LLM_FALLBACK_MAX_CHARS_EXTREME = config.SCHEDULE_LLM_FALLBACK_MAX_CHARS_EXTREME
    SCHEDULE_LLM_TEXT_CONTEXT_LINES_EXTREME = config.SCHEDULE_LLM_TEXT_CONTEXT_LINES_EXTREME
    SCHEDULE_EXTREME_TAIL_LINES = config.SCHEDULE_EXTREME_TAIL_LINES
    SCHEDULE_LLM_MAX_OUTPUT_TOKENS = config.SCHEDULE_LLM_MAX_OUTPUT_TOKENS
    ExtractedScheduleInfo = models.ExtractedScheduleInfo
    FetchRequest = models.FetchRequest
    SelectionScheduleResponse = models.SelectionScheduleResponse
    _schedule_runtime = runtime
    _pdf_module = pdf_module
    _get_graduation_year = candidate_scoring._get_graduation_year
    _detect_other_graduation_years = candidate_scoring._detect_other_graduation_years
    _normalize_recruitment_source_type = candidate_scoring._normalize_recruitment_source_type
    _apply_schedule_source_confidence_caps = url_utils._apply_schedule_source_confidence_caps
    _classify_company_relation = url_utils._classify_company_relation
    _normalize_url = url_utils._normalize_url


def _require_schedule_runtime() -> ScheduleRuntimeDependencies:
    if _schedule_runtime is None:
        raise RuntimeError("company_info service dependencies are not configured")
    return _schedule_runtime


def _schedule_text_chunk_matches_keyword(chunk: str) -> bool:
    stripped = chunk.strip()
    if not stripped:
        return False
    lower = stripped.lower()
    for keyword in SCHEDULE_CONTENT_KEYWORDS:
        if keyword.isascii():
            if keyword in lower:
                return True
        elif keyword in stripped:
            return True
    return False


def _schedule_line_signals_schedule_content(line: str, *, extreme_page: bool) -> bool:
    if _schedule_text_chunk_matches_keyword(line):
        return True
    if extreme_page and _SCHEDULE_DATE_LINE_HINT_RE.search(line):
        return True
    return False


def _compress_schedule_page_text_for_llm(text: str) -> str:
    if not text:
        return text
    text = text.strip()
    if not text:
        return text
    extreme = len(text) > SCHEDULE_EXTREME_PAGE_CHARS
    max_chars = SCHEDULE_LLM_TEXT_MAX_CHARS_EXTREME if extreme else SCHEDULE_LLM_TEXT_MAX_CHARS
    fallback_chars = SCHEDULE_LLM_FALLBACK_MAX_CHARS_EXTREME if extreme else SCHEDULE_LLM_FALLBACK_MAX_CHARS
    ctx = SCHEDULE_LLM_TEXT_CONTEXT_LINES_EXTREME if extreme else SCHEDULE_LLM_TEXT_CONTEXT_LINES

    lines = text.split("\n")
    line_count = len(lines)
    hit = [False] * line_count
    for i, line in enumerate(lines):
        if _schedule_line_signals_schedule_content(line, extreme_page=extreme):
            hit[i] = True

    if any(hit):
        take = [False] * line_count
        for i in range(line_count):
            if not hit[i]:
                continue
            lo = max(0, i - ctx)
            hi = min(line_count, i + ctx + 1)
            for j in range(lo, hi):
                take[j] = True
        merged = "\n".join(lines[i] for i in range(line_count) if take[i])
    else:
        paragraphs = [p.strip() for p in re.split(r"\n\s*\n+", text) if p.strip()]
        selected = [
            p for p in paragraphs if _schedule_line_signals_schedule_content(p, extreme_page=extreme)
        ]
        if not selected:
            if extreme:
                tail = "\n".join(lines[-min(SCHEDULE_EXTREME_TAIL_LINES, line_count):]).strip()
                return (tail[:fallback_chars] if tail else "")[:fallback_chars]
            return text[:fallback_chars]
        merged = "\n\n".join(selected)

    if not merged.strip():
        if extreme:
            tail = "\n".join(lines[-min(SCHEDULE_EXTREME_TAIL_LINES, line_count):]).strip()
            return (tail[:fallback_chars] if tail else "")[:fallback_chars]
        return text[:fallback_chars]
    return merged[:max_chars] if len(merged) > max_chars else merged


def _apply_source_caps(
    extracted: ExtractedScheduleInfo,
    source_metadata: dict,
) -> ExtractedScheduleInfo:
    return _apply_schedule_source_confidence_caps(
        extracted,
        str(source_metadata["source_type"]),
        (
            bool(source_metadata["year_matched"])
            if source_metadata["year_matched"] is not None
            else None
        ),
    )


def _build_schedule_source_metadata(
    url: str,
    company_name: str | None,
    page_text: str,
    graduation_year: int | None,
) -> dict[str, str | bool | int | None]:
    used_graduation_year = graduation_year or _get_graduation_year()
    relation = (
        _classify_company_relation(url, company_name)
        if company_name
        else {
            "source_type": "other",
            "relation_company_name": None,
            "is_official": False,
            "is_parent": False,
            "is_subsidiary": False,
        }
    )
    source_type = _normalize_recruitment_source_type(url, None, relation)
    other_years = _detect_other_graduation_years(
        url,
        "",
        (page_text or "")[:8000],
        used_graduation_year,
    )
    return {
        "source_type": source_type,
        "relation_company_name": (
            relation.get("relation_company_name")
            if isinstance(relation.get("relation_company_name"), str)
            else None
        ),
        "year_matched": not bool(other_years),
        "used_graduation_year": used_graduation_year,
    }


def _build_recruit_queries(
    company_name: str,
    industry: str | None,
    custom_query: str | None,
    graduation_year: int | None = None,
    selection_type: str | None = None,
) -> list[str]:
    if custom_query:
        return [custom_query]
    grad_year = graduation_year or _get_graduation_year()
    grad_year_short = grad_year % 100
    alias_names = COMPANY_QUERY_ALIASES.get(company_name, [])
    alias_name = alias_names[0] if alias_names else None
    if selection_type == "internship":
        queries = [
            f"{company_name} インターン {grad_year_short}卒",
            f"{company_name} インターン 選考スケジュール {grad_year_short}卒",
            f"{company_name} インターンシップ 募集",
            f"{company_name} インターン 募集要項 {grad_year}",
        ]
    elif selection_type == "main_selection":
        queries = [
            f"{company_name} 本選考 {grad_year_short}卒",
            f"{company_name} 選考スケジュール {grad_year_short}卒",
            f"{company_name} 新卒採用 {grad_year} 募集要項",
            f"{company_name} エントリー 締切",
        ]
    else:
        queries = [
            f"{company_name} 新卒採用 {grad_year_short}卒",
            f"{company_name} 選考スケジュール {grad_year_short}卒",
            f"{company_name} 採用サイト {grad_year}",
            f"{company_name} 募集要項 {grad_year}",
        ]
    if alias_name:
        if selection_type == "internship":
            alias_queries = [
                f"{alias_name} インターン {grad_year_short}卒",
                f"{alias_name} インターン 選考スケジュール {grad_year_short}卒",
            ]
        elif selection_type == "main_selection":
            alias_queries = [
                f"{alias_name} 本選考 {grad_year_short}卒",
                f"{alias_name} 選考スケジュール {grad_year_short}卒",
            ]
        else:
            alias_queries = [
                f"{alias_name} 新卒採用 {grad_year_short}卒",
                f"{alias_name} 選考スケジュール {grad_year_short}卒",
            ]
        queries = alias_queries + queries
    if industry:
        queries.append(f"{company_name} {industry} 採用")
    seen: set[str] = set()
    result: list[str] = []
    for query in queries:
        if query in seen:
            continue
        seen.add(query)
        result.append(query)
    return result[:6]


def _schedule_confidence_rank(confidence: str | None) -> int:
    return {"high": 3, "medium": 2, "low": 1}.get((confidence or "").lower(), 0)


def _has_dated_schedule_deadlines(extracted) -> bool:
    if not extracted:
        return False
    return any(deadline.due_date for deadline in extracted.deadlines)


def _build_schedule_relation_signature(
    url: str, company_name: str | None
) -> tuple[str, str | None]:
    if not company_name:
        return "other", None
    relation = _classify_company_relation(url, company_name)
    source_type = _normalize_recruitment_source_type(url, None, relation)
    relation_company_name = (
        relation.get("relation_company_name")
        if isinstance(relation.get("relation_company_name"), str)
        else None
    )
    return source_type, relation_company_name


def _score_schedule_follow_link(url: str, anchor_text: str) -> int:
    path = urlparse(url).path.lower()
    if not path or path == "/":
        return 0
    haystack = f"{anchor_text} {url}".lower()
    if any(keyword in haystack for keyword in SCHEDULE_FOLLOW_LINK_NEGATIVE_KEYWORDS):
        return 0
    if any(keyword in path for keyword in ("mypage", "login", "signin", "account")):
        return 0
    score = 0
    for keyword, weight in SCHEDULE_FOLLOW_LINK_KEYWORDS:
        if keyword in haystack:
            score += weight
    if path.endswith(".pdf"):
        score += 2
    if any(keyword in path for keyword in ("recruit", "saiyo", "entry", "mypage")):
        score += 1
    return score


def _iter_schedule_follow_candidates(
    html: bytes,
    base_url: str,
    company_name: str | None,
    *,
    pdf_only: bool,
) -> list[tuple[int, str]]:
    if not html or not company_name:
        return []
    base_source_type, base_relation_name = _build_schedule_relation_signature(
        base_url, company_name
    )
    if base_source_type not in {"official", "parent", "subsidiary", "job_site"}:
        return []
    soup = BeautifulSoup(html, "html.parser")
    seen_urls = {_normalize_url(base_url)}
    candidates: list[tuple[int, str]] = []
    for anchor in soup.find_all("a", href=True):
        href = (anchor.get("href") or "").strip()
        if not href or href.startswith(("#", "javascript:", "mailto:", "tel:")):
            continue
        absolute_url = urljoin(base_url, href)
        parsed = urlparse(absolute_url)
        is_pdf = parsed.path.lower().endswith(".pdf")
        if parsed.scheme not in {"http", "https"} or (pdf_only and not is_pdf):
            continue
        normalized_url = _normalize_url(absolute_url)
        if normalized_url in seen_urls:
            continue
        candidate_source_type, candidate_relation_name = _build_schedule_relation_signature(
            absolute_url, company_name
        )
        if candidate_source_type != base_source_type:
            continue
        if candidate_source_type in {"parent", "subsidiary"} and (
            candidate_relation_name != base_relation_name
        ):
            continue
        score = _score_schedule_follow_link(absolute_url, anchor.get_text(" ", strip=True))
        if score <= 0:
            continue
        seen_urls.add(normalized_url)
        candidates.append((score, absolute_url))
    candidates.sort(key=lambda item: (-item[0], len(item[1])))
    return candidates


def _extract_schedule_follow_links(
    html: bytes,
    base_url: str,
    company_name: str | None,
) -> list[str]:
    html_candidates: list[tuple[int, str]] = []
    pdf_candidates: list[tuple[int, str]] = []
    for score, candidate_url in _iter_schedule_follow_candidates(
        html, base_url, company_name, pdf_only=False
    ):
        target = pdf_candidates if urlparse(candidate_url).path.lower().endswith(".pdf") else html_candidates
        target.append((score, candidate_url))
    combined: list[str] = []
    for _, candidate_url in html_candidates:
        if len(combined) >= SCHEDULE_MAX_FOLLOW_LINKS:
            break
        combined.append(candidate_url)
    pdf_added = 0
    for _, candidate_url in pdf_candidates:
        if len(combined) >= SCHEDULE_MAX_FOLLOW_LINKS or pdf_added >= SCHEDULE_MAX_PDF_FOLLOW_LINKS:
            break
        combined.append(candidate_url)
        pdf_added += 1
    return combined


def _extract_schedule_pdf_follow_links(
    html: bytes,
    base_url: str,
    company_name: str | None,
) -> list[str]:
    return [
        candidate_url
        for _, candidate_url in _iter_schedule_follow_candidates(
            html, base_url, company_name, pdf_only=True
        )[:SCHEDULE_MAX_PDF_FOLLOW_LINKS]
    ]


async def _extract_schedule_text_from_bytes(url: str, payload: bytes) -> tuple[str, bool]:
    if not payload:
        return "", False
    is_pdf = urlparse(url).path.lower().endswith(".pdf") or payload.startswith(b"%PDF")
    if not is_pdf:
        return extract_text_from_html(
            payload, max_text_chars=SCHEDULE_HTML_EXTRACT_MAX_CHARS
        ), False
    if _pdf_module is None:
        raise RuntimeError("company_info PDF dependencies are not configured")
    pdf = _pdf_module
    extracted_text = pdf._extract_text_from_pdf_locally(payload)
    page_count = pdf._get_pdf_page_count(payload) or 1
    if not pdf._should_run_pdf_ocr(extracted_text, page_count):
        return extracted_text, True
    try:
        ocr_result = pdf_ocr_module.normalize_pdf_ocr_result(
            await pdf_ocr_module.extract_text_from_pdf_with_ocr(
                payload,
                filename=urlparse(url).path.split("/")[-1] or "document.pdf",
                source_kind="schedule",
                billing_plan="free",
                content_type=None,
                page_count=page_count,
                local_text=extracted_text,
                feature="selection_schedule",
            )
        )
        ocr_text = ocr_result.text
    except Exception:
        ocr_text = ""
    return ocr_text or extracted_text, True


def _merge_schedule_info_parts(parts) -> object:
    deduped_deadlines: dict[tuple[str, str, str | None], object] = {}
    deduped_documents: dict[str, object] = {}
    application_method = None
    selection_process = None
    for part in parts:
        for deadline in part.deadlines:
            normalized_title = re.sub(r"\s+", "", deadline.title or "").lower()
            key = (deadline.type, normalized_title, deadline.due_date)
            current = deduped_deadlines.get(key)
            if current is None or _schedule_confidence_rank(deadline.confidence) > _schedule_confidence_rank(current.confidence):
                deduped_deadlines[key] = deadline
        for document in part.required_documents:
            normalized_name = re.sub(r"\s+", "", document.name or "").lower()
            current = deduped_documents.get(normalized_name)
            if current is None or _schedule_confidence_rank(document.confidence) > _schedule_confidence_rank(current.confidence):
                deduped_documents[normalized_name] = document
        if part.application_method and (
            application_method is None
            or _schedule_confidence_rank(part.application_method.confidence)
            > _schedule_confidence_rank(application_method.confidence)
        ):
            application_method = part.application_method
        if part.selection_process and (
            selection_process is None
            or _schedule_confidence_rank(part.selection_process.confidence)
            > _schedule_confidence_rank(selection_process.confidence)
        ):
            selection_process = part.selection_process
    return ExtractedScheduleInfo(
        deadlines=list(deduped_deadlines.values()),
        required_documents=list(deduped_documents.values()),
        application_method=application_method,
        selection_process=selection_process,
    )


async def fetch_schedule_response(request: FetchRequest, feature: str) -> SelectionScheduleResponse:
    """Fetch and extract schedule information from a URL."""
    runtime = _require_schedule_runtime()
    fetch_page_content = runtime.fetch_page_content
    _extract_schedule_with_firecrawl = runtime.extract_schedule_with_firecrawl
    _extract_schedule_text_from_bytes = runtime.extract_schedule_text_from_bytes
    extract_schedule_with_llm = runtime.extract_schedule_with_llm

    source_metadata: dict = {
        "source_type": "other",
        "relation_company_name": None,
        "year_matched": None,
        "used_graduation_year": request.graduation_year or _get_graduation_year(),
    }

    try:
        request_url = str(request.url)
        aggregated_usage: dict[str, int] = {}
        resolved_models: list[str] = []
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
                extracted = _apply_source_caps(extracted, source_metadata)
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

            should_try_follow_link = not _has_dated_schedule_deadlines(extracted) and follow_links
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
                        extracted = _apply_source_caps(extracted, follow_metadata)
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
                        follow_extracted = _apply_source_caps(follow_extracted, follow_metadata)
                        extracted_parts.append(follow_extracted)
                        if follow_preview_text:
                            raw_text_parts.append(follow_preview_text[:30000])

            should_try_pdf_follow_ocr = (
                ocr_calls_used < SCHEDULE_MAX_OCR_CALLS
                and not _has_dated_schedule_deadlines(
                    _merge_schedule_info_parts(extracted_parts) if extracted_parts else None
                )
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
                    extracted = _apply_source_caps(extracted, follow_metadata)
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
                    extracted = _apply_source_caps(extracted, source_metadata)
                    if _count_schedule_signal_items(extracted) > 0:
                        extracted_parts.append(extracted)
                        raw_text_parts.append(text[:30000])

        if not extracted_parts:
            text, primary_is_pdf = await _extract_schedule_text_from_bytes(request_url, primary_payload)
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
                extracted = _apply_source_caps(extracted, source_metadata)
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
                extracted_at=now_jst().isoformat(),
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
            extracted_at=now_jst().isoformat(),
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
            extracted_at=now_jst().isoformat(),
            error=f"情報の抽出に失敗しました: {str(e)}",
            deadlines_found=False,
            other_items_found=False,
            raw_text=None,
            raw_html=None,
        )
