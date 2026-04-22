"""Candidate scoring / confidence helpers for company info search.

Pure helpers that map raw scores to confidence buckets and apply blog/personal-site
penalties. Extracted from `company_info.py` to reduce its size. Imports that would
cause a cycle with `company_info.py` are done inside the function body.
"""
from __future__ import annotations

from urllib.parse import urlparse

from app.routers.company_info_models import SearchCandidate
from app.utils.company_names import (
    get_company_domain_patterns,
    has_personal_site_pattern,
    is_blog_platform,
    normalize_company_result_source_type,
)
from app.utils.web_search import is_trusted_schedule_job_site


def _candidate_sort_key(
    candidate: SearchCandidate, score_hint: float = 0.0
) -> tuple[int, int, float]:
    source_priority = {
        "official": 0,
        "job_site": 1,
        "parent": 2,
        "subsidiary": 3,
        "other": 4,
        "blog": 5,
    }
    confidence_priority = {"high": 0, "medium": 1, "low": 2}
    return (
        source_priority.get(candidate.source_type, 99),
        confidence_priority.get(candidate.confidence, 99),
        -float(score_hint),
    )


def _normalize_recruitment_source_type_legacy(
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


def _recruitment_score_to_confidence_legacy(
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


def _recruitment_hybrid_score_to_confidence_legacy(
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


def _score_to_confidence_legacy(
    score: float,
    source_type: str = "other",
    year_matched: bool = True,
    content_type: str | None = None,
    company_match: bool = False,
) -> str:
    """
    Convert score to confidence level.

    公式サイトは閾値を緩和（ドメインが信頼できるため）。
    ブログは閾値を厳格化。
    年度不一致の場合は信頼度を下げる。

    Args:
        score: スコア値
        source_type: "official" | "job_site" | "blog" | "other"
        year_matched: Whether the content year matches user's target year

    Returns:
        "high" | "medium" | "low"
    """
    if source_type == "official":
        if not year_matched:
            # Official but outdated: cap at medium
            if score >= 6:
                return "medium"  # Downgrade from "high"
            if score >= 3:
                return "medium"
            return "low"
        else:
            # Year matches: normal thresholds
            if score >= 6:
                return "high"
            if score >= 3:
                return "medium"
            return "low"
    elif source_type == "blog":
        # Blogs should not be "high"
        if score >= 6:
            return "medium"
        return "low"
    elif source_type == "job_site":
        # 就活サイトは最大でも medium に制限（二次情報のため）
        if score >= 6:
            return "medium"
        return "low"
    elif source_type in {"parent", "subsidiary"}:
        # Related-company material is shown as a candidate, but never above low.
        return "low"
    else:
        # Default thresholds (other) - cap at medium
        if score >= 7:
            return "medium"
        if score >= 4:
            return "medium"
        return "low"


def _hybrid_score_to_confidence_legacy(
    score: float,
    source_type: str,
    year_matched: bool = True,
    content_type: str | None = None,
) -> str:
    """Confidence mapping for hybrid search's normalized score range."""
    if source_type == "official":
        if score >= 0.7:
            return "high" if year_matched else "medium"
        if score >= 0.5:
            return "medium"
        return "low"
    if source_type in {"parent", "subsidiary"}:
        # Keep related-company candidates visible without overstating trust.
        return "low"
    if source_type in {"job_site", "aggregator", "blog"}:
        return "medium" if score >= 0.7 else "low"
    return "medium" if score >= 0.5 else "low"


def _get_blog_penalty(url: str, domain: str, company_name: str) -> float:
    """
    Calculate penalty score for blog/personal sites.

    企業公式ブログ（note.com/company_nameなど）は軽減ペナルティ。
    個人ブログは強いペナルティ。

    Args:
        url: 完全なURL
        domain: ドメイン名
        company_name: 企業名

    Returns:
        ペナルティスコア（負の値）。0.0 = ブログではない
    """
    # Import lazily to avoid circular dependency with company_info.
    from app.routers.company_info_search import _normalize_company_name

    domain_lower = domain.lower()
    url_lower = url.lower()

    # Check if it's a blog platform
    if is_blog_platform(domain_lower):
        # Check if company name is in URL path (likely official blog)
        _, ascii_name = _normalize_company_name(company_name)
        patterns = get_company_domain_patterns(company_name, ascii_name)

        url_path = urlparse(url).path.lower()
        for pattern in patterns:
            if len(pattern) >= 3 and pattern in url_path:
                return -1.0  # 公式ブログの可能性 → 軽減ペナルティ

        return -5.0  # 個人ブログ → フルペナルティ

    # Check for personal site patterns (not blog platforms)
    if has_personal_site_pattern(url_lower, domain_lower):
        # Additional check: if domain is very short and personal-looking
        domain_base = domain_lower.split(".")[0]
        if len(domain_base) <= 10:
            return -3.0  # 個人サイトパターン → 中程度ペナルティ

    return 0.0  # ブログ/個人サイトではない


__all__ = [
    "_candidate_sort_key",
    "_get_blog_penalty",
    "_hybrid_score_to_confidence_legacy",
    "_normalize_recruitment_source_type_legacy",
    "_recruitment_hybrid_score_to_confidence_legacy",
    "_recruitment_score_to_confidence_legacy",
    "_score_to_confidence_legacy",
]
