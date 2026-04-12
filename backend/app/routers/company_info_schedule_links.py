"""
Schedule link processing and metadata helpers for company_info router.

Extracted from company_info.py to reduce file size.
"""

from __future__ import annotations

import re
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

from app.utils.http_fetch import extract_text_from_html
from app.utils.secure_logger import get_logger
from app.routers.company_info_config import (
    SCHEDULE_FOLLOW_LINK_KEYWORDS,
    SCHEDULE_FOLLOW_LINK_NEGATIVE_KEYWORDS,
    SCHEDULE_MAX_FOLLOW_LINKS,
    SCHEDULE_MAX_PDF_FOLLOW_LINKS,
    SCHEDULE_MAX_OCR_CALLS,
    SCHEDULE_HTML_EXTRACT_MAX_CHARS,
)
from app.routers.company_info_url_utils import (
    _normalize_url,
    _classify_company_relation,
)
from app.routers.company_info_candidate_scoring import (
    _get_graduation_year,
    _detect_other_graduation_years,
    _normalize_recruitment_source_type,
)

logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# Source metadata
# ---------------------------------------------------------------------------

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
    year_matched = not bool(other_years)
    return {
        "source_type": source_type,
        "relation_company_name": (
            relation.get("relation_company_name")
            if isinstance(relation.get("relation_company_name"), str)
            else None
        ),
        "year_matched": year_matched,
        "used_graduation_year": used_graduation_year,
    }


# ---------------------------------------------------------------------------
# Query builders
# ---------------------------------------------------------------------------

def _build_recruit_queries(
    company_name: str,
    industry: str | None,
    custom_query: str | None,
    graduation_year: int | None = None,
    selection_type: str | None = None,
) -> list[str]:
    from app.utils.web_search import COMPANY_QUERY_ALIASES

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
    result = []
    for q in queries:
        if q in seen:
            continue
        seen.add(q)
        result.append(q)

    return result[:6]


# ---------------------------------------------------------------------------
# Schedule confidence helpers
# ---------------------------------------------------------------------------

def _schedule_confidence_rank(confidence: str | None) -> int:
    return {"high": 3, "medium": 2, "low": 1}.get((confidence or "").lower(), 0)


def _has_dated_schedule_deadlines(extracted) -> bool:
    if not extracted:
        return False
    return any(deadline.due_date for deadline in extracted.deadlines)


# ---------------------------------------------------------------------------
# Schedule relation signature
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Follow-link scoring and extraction
# ---------------------------------------------------------------------------

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


def _extract_schedule_follow_links(
    html: bytes,
    base_url: str,
    company_name: str | None,
) -> list[str]:
    if not html or not company_name:
        return []

    base_source_type, base_relation_name = _build_schedule_relation_signature(
        base_url, company_name
    )
    if base_source_type not in {"official", "parent", "subsidiary", "job_site"}:
        return []

    soup = BeautifulSoup(html, "html.parser")
    seen_urls = {_normalize_url(base_url)}
    html_candidates: list[tuple[int, str]] = []
    pdf_candidates: list[tuple[int, str]] = []

    for anchor in soup.find_all("a", href=True):
        href = (anchor.get("href") or "").strip()
        if not href or href.startswith(("#", "javascript:", "mailto:", "tel:")):
            continue

        absolute_url = urljoin(base_url, href)
        parsed = urlparse(absolute_url)
        if parsed.scheme not in {"http", "https"}:
            continue

        normalized_url = _normalize_url(absolute_url)
        if normalized_url in seen_urls:
            continue

        candidate_source_type, candidate_relation_name = (
            _build_schedule_relation_signature(absolute_url, company_name)
        )
        if candidate_source_type != base_source_type:
            continue
        if candidate_source_type in {"parent", "subsidiary"} and (
            candidate_relation_name != base_relation_name
        ):
            continue

        anchor_text = anchor.get_text(" ", strip=True)
        score = _score_schedule_follow_link(absolute_url, anchor_text)
        if score <= 0:
            continue

        seen_urls.add(normalized_url)
        target_list = (
            pdf_candidates
            if parsed.path.lower().endswith(".pdf")
            else html_candidates
        )
        target_list.append((score, absolute_url))

    html_candidates.sort(key=lambda item: (-item[0], len(item[1])))
    pdf_candidates.sort(key=lambda item: (-item[0], len(item[1])))

    combined: list[str] = []
    for _, candidate_url in html_candidates:
        if len(combined) >= SCHEDULE_MAX_FOLLOW_LINKS:
            break
        combined.append(candidate_url)

    pdf_added = 0
    for _, candidate_url in pdf_candidates:
        if len(combined) >= SCHEDULE_MAX_FOLLOW_LINKS:
            break
        if pdf_added >= SCHEDULE_MAX_PDF_FOLLOW_LINKS:
            break
        combined.append(candidate_url)
        pdf_added += 1

    return combined


def _extract_schedule_pdf_follow_links(
    html: bytes,
    base_url: str,
    company_name: str | None,
) -> list[str]:
    if not html or not company_name:
        return []

    base_source_type, base_relation_name = _build_schedule_relation_signature(
        base_url, company_name
    )
    if base_source_type not in {"official", "parent", "subsidiary", "job_site"}:
        return []

    soup = BeautifulSoup(html, "html.parser")
    seen_urls = {_normalize_url(base_url)}
    pdf_candidates: list[tuple[int, str]] = []

    for anchor in soup.find_all("a", href=True):
        href = (anchor.get("href") or "").strip()
        if not href or href.startswith(("#", "javascript:", "mailto:", "tel:")):
            continue

        absolute_url = urljoin(base_url, href)
        parsed = urlparse(absolute_url)
        if parsed.scheme not in {"http", "https"} or not parsed.path.lower().endswith(".pdf"):
            continue

        normalized_url = _normalize_url(absolute_url)
        if normalized_url in seen_urls:
            continue

        candidate_source_type, candidate_relation_name = _build_schedule_relation_signature(
            absolute_url, company_name
        )
        if candidate_source_type != base_source_type:
            continue
        if candidate_source_type in {"parent", "subsidiary"} and candidate_relation_name != base_relation_name:
            continue

        anchor_text = anchor.get_text(" ", strip=True)
        score = _score_schedule_follow_link(absolute_url, anchor_text)
        if score <= 0:
            continue

        seen_urls.add(normalized_url)
        pdf_candidates.append((score, absolute_url))

    pdf_candidates.sort(key=lambda item: (-item[0], len(item[1])))
    return [candidate_url for _, candidate_url in pdf_candidates[:SCHEDULE_MAX_PDF_FOLLOW_LINKS]]


async def _extract_schedule_text_from_bytes(url: str, payload: bytes) -> tuple[str, bool]:
    if not payload:
        return "", False

    is_pdf = urlparse(url).path.lower().endswith(".pdf") or payload.startswith(b"%PDF")
    if not is_pdf:
        return extract_text_from_html(
            payload, max_text_chars=SCHEDULE_HTML_EXTRACT_MAX_CHARS
        ), False

    # Import PDF helpers lazily to avoid circular import
    from app.routers.company_info_pdf import (
        _extract_text_from_pdf_locally,
        _get_pdf_page_count,
        _should_run_pdf_ocr,
    )
    from app.utils.pdf_ocr import extract_text_from_pdf_with_ocr, normalize_pdf_ocr_result

    extracted_text = _extract_text_from_pdf_locally(payload)
    page_count = _get_pdf_page_count(payload) or 1
    if not _should_run_pdf_ocr(extracted_text, page_count):
        return extracted_text, True

    try:
        ocr_result = normalize_pdf_ocr_result(
            await extract_text_from_pdf_with_ocr(
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
    except Exception as exc:
        logger.warning(f"[選考スケジュール取得] PDF OCR fallback failed for {url}: {exc}")
        ocr_text = ""

    return ocr_text or extracted_text, True


# ---------------------------------------------------------------------------
# Schedule info merging
# ---------------------------------------------------------------------------

def _merge_schedule_info_parts(parts) -> object:
    """Merge a list of ExtractedScheduleInfo objects, deduplicating by key."""
    from app.routers.company_info_models import (
        ExtractedDeadline,
        ExtractedDocument,
        ExtractedItem,
        ExtractedScheduleInfo,
    )

    deduped_deadlines: dict[tuple[str, str, str | None], ExtractedDeadline] = {}
    deduped_documents: dict[str, ExtractedDocument] = {}
    application_method: ExtractedItem | None = None
    selection_process: ExtractedItem | None = None

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
