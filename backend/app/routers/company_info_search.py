"""Search and source classification helpers for company info router."""

from __future__ import annotations

from urllib.parse import urlparse

from app.utils.company_names import (
    classify_company_domain_relation,
    get_company_domain_patterns,
    has_personal_site_pattern,
    is_blog_platform,
    normalize_company_result_source_type,
)
from app.utils.web_search import is_trusted_schedule_job_site

JOB_SITES = [
    "mynavi.jp",
    "rikunabi.com",
    "onecareer.jp",
    "unistyle.jp",
    "nikki.ne.jp",
    "goodfind.jp",
    "offerbox.jp",
    "labbase.jp",
    "gaishishukatsu.com",
    "type.jp",
    "en-japan.com",
    "doda.jp",
    "syukatsu-kaigi.jp",
    "career-tasu",
    "job.mynavi.jp",
    "job.rikunabi.com",
    "rikeinavi.com",
    "reashu.com",
    "ut-board.com",
    "talentsquare.co.jp",
    "renew-career.com",
    "abuild-c.com",
    "pasonacareer.jp",
    "r-agent.com",
    "careerup-media.com",
]


def _normalize_company_name(name: str) -> tuple[str, str]:
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
    normalized = "".join(cleaned.split())
    ascii_only = "".join(ch for ch in normalized if ch.isascii() and ch.isalnum()).lower()
    return normalized, ascii_only


def _domain_from_url(url: str) -> str:
    try:
        return urlparse(url).netloc.lower()
    except Exception:
        return ""


def _classify_company_relation(
    url: str, company_name: str, content_type: str | None = None
) -> dict[str, str | bool | None]:
    return classify_company_domain_relation(url, company_name, content_type)


def _normalize_recruitment_source_type(
    url: str,
    raw_source_type: str | None,
    relation: dict[str, str | bool | None],
) -> str:
    normalized = normalize_company_result_source_type(raw_source_type, relation)
    if normalized in {"official", "parent", "subsidiary", "job_site"}:
        return normalized
    if is_trusted_schedule_job_site(url):
        return "job_site"
    return "other"


def _recruitment_score_to_confidence(
    score: float,
    source_type: str = "other",
    year_matched: bool = True,
) -> str:
    if source_type == "official":
        if score >= 6:
            return "high" if year_matched else "medium"
        if score >= 3:
            return "medium"
        return "low"
    if source_type == "job_site":
        return "medium" if score >= 6 else "low"
    if source_type in {"parent", "subsidiary", "blog", "other"}:
        return "low"
    return "low"


def _recruitment_hybrid_score_to_confidence(
    score: float,
    source_type: str,
    year_matched: bool = True,
) -> str:
    if source_type == "official":
        if score >= 0.7:
            return "high" if year_matched else "medium"
        if score >= 0.5:
            return "medium"
        return "low"
    if source_type == "job_site":
        return "medium" if score >= 0.7 else "low"
    if source_type in {"parent", "subsidiary", "blog", "other"}:
        return "low"
    return "low"


def _score_to_confidence(
    score: float,
    source_type: str = "other",
    year_matched: bool = True,
    content_type: str | None = None,
    company_match: bool = False,
) -> str:
    if source_type == "official":
        if not year_matched:
            if score >= 6:
                return "medium"
            if score >= 3:
                return "medium"
            return "low"
        if score >= 6:
            return "high"
        if score >= 3:
            return "medium"
        return "low"
    if source_type == "blog":
        return "medium" if score >= 6 else "low"
    if source_type == "job_site":
        return "medium" if score >= 6 else "low"
    if source_type in {"parent", "subsidiary"}:
        return "low"
    return "medium" if score >= 4 else "low"


def _hybrid_score_to_confidence(
    score: float,
    source_type: str,
    year_matched: bool = True,
    content_type: str | None = None,
) -> str:
    if source_type == "official":
        if score >= 0.7:
            return "high" if year_matched else "medium"
        if score >= 0.5:
            return "medium"
        return "low"
    if source_type in {"parent", "subsidiary"}:
        return "low"
    if source_type in {"job_site", "aggregator", "blog"}:
        return "medium" if score >= 0.7 else "low"
    return "medium" if score >= 0.5 else "low"


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


def _get_source_type(url: str, company_name: str) -> str:
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
