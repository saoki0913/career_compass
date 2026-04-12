"""
URL utility functions for company_info router.

Extracted from company_info.py to reduce file size.
"""

from __future__ import annotations

import re
from urllib.parse import urlparse, urlunparse

from app.utils.company_names import (
    classify_company_domain_relation,
    normalize_company_result_source_type,
    is_blog_platform,
    has_personal_site_pattern,
    get_company_domain_patterns,
    is_registered_official_domain,
)
from app.utils.secure_logger import get_logger

logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# Company name normalisation (used by multiple modules)
# ---------------------------------------------------------------------------

def _normalize_company_name(name: str) -> tuple[str, str]:
    """Return (normalized, ascii_only) company name tokens."""
    cleaned = name or ""
    suffixes = [
        "株式会社",
        "（株）",
        "(株)",
        "㈱",
        "有限会社",
        "合同会社",
        "Inc.",
        "Inc",
        "Ltd",
        "Co.,Ltd",
        "Co., Ltd",
        "Corporation",
        "Holdings",
        "ホールディングス",
    ]
    for suffix in suffixes:
        cleaned = cleaned.replace(suffix, "")
    cleaned = cleaned.strip()
    normalized = re.sub(r"\s+", "", cleaned)
    ascii_only = re.sub(r"[^0-9a-zA-Z]", "", normalized).lower()
    return normalized, ascii_only


# ---------------------------------------------------------------------------
# Text / URL normalisation helpers
# ---------------------------------------------------------------------------

def _normalize_text_for_match(text: str) -> str:
    """Normalize text for company name matching (remove spaces and punctuation)."""
    if not text:
        return ""
    normalized = text.lower()
    normalized = re.sub(r"[\s　]+", "", normalized)
    normalized = re.sub(
        r"[・･\-‐‑–—―/()\\[\\]{}<>\"'`~!@#$%^&*_=+.,:;?｜|]", "", normalized
    )
    return normalized


def _is_valid_http_url(url: str) -> bool:
    try:
        parsed = urlparse(url)
        return parsed.scheme in ("http", "https") and bool(parsed.netloc)
    except Exception:
        return False


def _normalize_url(url: str) -> str:
    """Normalize URL for deduplication."""
    try:
        parsed = urlparse(url)
        path = parsed.path.rstrip("/")
        return urlunparse((parsed.scheme, parsed.netloc, path, "", "", ""))
    except Exception:
        return url


def _domain_from_url(url: str) -> str:
    try:
        return urlparse(url).netloc.lower()
    except Exception:
        return ""


def _normalize_domain_input(value: str | None) -> str | None:
    if not value:
        return None
    candidate = value.strip().lower()
    if not candidate:
        return None
    if "://" in candidate:
        return _domain_from_url(candidate) or None
    return candidate.split("/", 1)[0]


# ---------------------------------------------------------------------------
# Company-name / domain matching
# ---------------------------------------------------------------------------

def _company_name_matches(
    title: str, snippet: str, domain: str, company_name: str
) -> bool:
    normalized_name, ascii_name = _normalize_company_name(company_name)
    if not normalized_name and not ascii_name:
        return False
    normalized_name = normalized_name.lower()
    norm_title = _normalize_text_for_match(title)
    norm_snippet = _normalize_text_for_match(snippet)
    if normalized_name and (
        normalized_name in norm_title or normalized_name in norm_snippet
    ):
        return True
    if ascii_name and ascii_name in (domain or ""):
        return True
    return False


def _classify_company_relation(
    url: str, company_name: str, content_type: str | None = None
) -> dict[str, str | bool | None]:
    return classify_company_domain_relation(url, company_name, content_type)


def _sanitize_preferred_domain(
    company_name: str,
    preferred_domain: str | None,
    content_type: str | None = None,
) -> str | None:
    normalized = _normalize_domain_input(preferred_domain)
    if not normalized:
        return None
    relation = _classify_company_relation(normalized, company_name, content_type)
    if relation["is_official"]:
        return normalized
    return None


# ---------------------------------------------------------------------------
# Site / URL filtering
# ---------------------------------------------------------------------------

def _is_excluded_url(url: str) -> bool:
    from app.routers.company_info_config import EXCLUDE_SITES_STRONG
    url_lower = url.lower()
    return any(site in url_lower for site in EXCLUDE_SITES_STRONG)


def _is_irrelevant_url(url: str) -> bool:
    """Filter out completely irrelevant URLs like shopping sites, PDF viewers, etc."""
    from app.routers.company_info_config import IRRELEVANT_SITES
    url_lower = url.lower()
    return any(pattern in url_lower for pattern in IRRELEVANT_SITES)


def _get_source_type_legacy(url: str, company_name: str) -> str:
    """Legacy source-type classifier (used by scoring functions)."""
    from app.routers.company_info_config import JOB_SITES
    from app.utils.web_search import is_trusted_schedule_job_site

    domain = _domain_from_url(url).lower()
    raw_source_type: str | None = None

    for site in JOB_SITES:
        if site in domain:
            raw_source_type = "job_site"
            break

    if raw_source_type is None:
        blog_penalty = _get_blog_penalty(url, domain, company_name)
        if blog_penalty <= -3.0:
            raw_source_type = "blog"

    relation = _classify_company_relation(url, company_name)
    return normalize_company_result_source_type(raw_source_type, relation)


def _get_blog_penalty(url: str, domain: str, company_name: str) -> float:
    domain_lower = domain.lower()
    url_lower = url.lower()

    if is_blog_platform(domain_lower):
        _, ascii_name = _normalize_company_name(company_name)
        patterns = get_company_domain_patterns(company_name, ascii_name)
        url_path = urlparse(url).path.lower()
        for pattern in patterns:
            if len(pattern) >= 3 and pattern in url_path:
                return -1.0
        return -5.0

    if has_personal_site_pattern(url_lower, domain_lower):
        domain_base = domain_lower.split(".")[0]
        if len(domain_base) <= 10:
            return -3.0

    return 0.0


# ---------------------------------------------------------------------------
# Corporate candidate inclusion filter
# ---------------------------------------------------------------------------

def _should_include_corporate_candidate(
    source_type: str,
    content_type: str | None,
    relation: dict[str, str | bool | None],
    url: str = "",
    title: str = "",
    snippet: str = "",
) -> tuple[bool, str | None]:
    from app.routers.company_info_config import (
        EMPLOYEE_INTERVIEW_POSITIVE_SIGNALS,
        EMPLOYEE_INTERVIEW_NEGATIVE_SIGNALS,
    )

    if content_type == "employee_interviews":
        path = urlparse(url).path.rstrip("/").lower()
        if not path:
            return False, "社員記事シグナル不足"

        haystack = " ".join([url.lower(), (title or "").lower(), (snippet or "").lower()])
        if any(signal in haystack for signal in EMPLOYEE_INTERVIEW_NEGATIVE_SIGNALS):
            return False, "社員記事不適合"
        if not any(signal in haystack for signal in EMPLOYEE_INTERVIEW_POSITIVE_SIGNALS):
            return False, "社員記事シグナル不足"

    return True, None


# ---------------------------------------------------------------------------
# Confidence caps
# ---------------------------------------------------------------------------

def _cap_schedule_confidence(
    confidence: str | None,
    source_type: str,
    year_matched: bool | None,
) -> str:
    normalized_confidence = (confidence or "low").lower()
    if normalized_confidence not in {"high", "medium", "low"}:
        normalized_confidence = "low"

    if source_type == "official":
        if year_matched is False and normalized_confidence == "high":
            return "medium"
        return normalized_confidence

    if source_type == "job_site":
        if normalized_confidence == "high":
            return "medium"
        return normalized_confidence if normalized_confidence in {"medium", "low"} else "low"

    return "low"


def _apply_schedule_source_confidence_caps(
    extracted,
    source_type: str,
    year_matched: bool | None,
):
    """Apply confidence caps based on source type. Accepts ExtractedScheduleInfo."""
    from app.routers.company_info_models import (
        ExtractedDeadline,
        ExtractedDocument,
        ExtractedItem,
        ExtractedScheduleInfo,
    )

    deadlines = [
        ExtractedDeadline(
            type=deadline.type,
            title=deadline.title,
            due_date=deadline.due_date,
            source_url=deadline.source_url,
            confidence=_cap_schedule_confidence(
                deadline.confidence, source_type, year_matched
            ),
        )
        for deadline in extracted.deadlines
    ]
    required_documents = [
        ExtractedDocument(
            name=document.name,
            required=document.required,
            source_url=document.source_url,
            confidence=_cap_schedule_confidence(
                document.confidence, source_type, year_matched
            ),
        )
        for document in extracted.required_documents
    ]
    application_method = None
    if extracted.application_method:
        application_method = ExtractedItem(
            value=extracted.application_method.value,
            source_url=extracted.application_method.source_url,
            confidence=_cap_schedule_confidence(
                extracted.application_method.confidence, source_type, year_matched
            ),
        )
    selection_process = None
    if extracted.selection_process:
        selection_process = ExtractedItem(
            value=extracted.selection_process.value,
            source_url=extracted.selection_process.source_url,
            confidence=_cap_schedule_confidence(
                extracted.selection_process.confidence, source_type, year_matched
            ),
        )
    return ExtractedScheduleInfo(
        deadlines=deadlines,
        required_documents=required_documents,
        application_method=application_method,
        selection_process=selection_process,
    )
