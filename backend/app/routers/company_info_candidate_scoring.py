"""
Candidate scoring and ranking functions for company_info router.

Extracted from company_info.py to reduce file size.
"""

from __future__ import annotations

import asyncio
import hashlib
import re
from datetime import datetime
from urllib.parse import urlparse

from app.utils.company_names import (
    is_registered_official_domain,
    get_company_domain_patterns,
    normalize_company_result_source_type,
)
from app.utils.secure_logger import get_logger
from app.routers.company_info_url_utils import (
    _normalize_company_name,
    _normalize_text_for_match,
    _domain_from_url,
    _is_excluded_url,
    _is_valid_http_url,
    _company_name_matches,
    _classify_company_relation,
    _get_blog_penalty,
)
from app.routers.company_info_config import (
    AGGREGATOR_SITES,
    RECRUIT_URL_KEYWORDS,
    RECRUIT_TITLE_KEYWORDS,
    CORP_KEYWORDS,
    IR_DOC_KEYWORDS,
    DDGS_CACHE_TTL,
    DDGS_CACHE_MAX_SIZE,
)

try:
    from ddgs import DDGS
    HAS_DDGS = True
except ImportError:
    HAS_DDGS = False

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# DDGS cache state (module-level, mirrors company_info.py)
# ---------------------------------------------------------------------------
_ddgs_search_cache: dict[str, tuple[list[dict], datetime]] = {}


def _get_ddgs_cache_key(query: str, max_results: int) -> str:
    key_str = f"{query}:{max_results}"
    return hashlib.md5(key_str.encode()).hexdigest()


def _get_cached_ddgs_results(query: str, max_results: int) -> list[dict] | None:
    cache_key = _get_ddgs_cache_key(query, max_results)
    if cache_key in _ddgs_search_cache:
        results, cached_at = _ddgs_search_cache[cache_key]
        if datetime.now() - cached_at < DDGS_CACHE_TTL:
            return results
        del _ddgs_search_cache[cache_key]
    return None


def _set_ddgs_cache(query: str, max_results: int, results: list[dict]):
    if len(_ddgs_search_cache) >= DDGS_CACHE_MAX_SIZE:
        oldest_key = min(
            _ddgs_search_cache.keys(), key=lambda k: _ddgs_search_cache[k][1]
        )
        del _ddgs_search_cache[oldest_key]
    cache_key = _get_ddgs_cache_key(query, max_results)
    _ddgs_search_cache[cache_key] = (results, datetime.now())


# ---------------------------------------------------------------------------
# Graduation year helpers
# ---------------------------------------------------------------------------

def _get_graduation_year() -> int:
    now = datetime.now()
    if now.month >= 4:
        return now.year + 2
    else:
        return now.year + 1


def _detect_other_graduation_years(
    url: str, title: str, snippet: str, target_year: int
) -> list[int]:
    combined = f"{url} {title} {snippet}"
    text = (combined or "").lower()

    recruit_context_terms = (
        "採用",
        "新卒",
        "インターン",
        "entry",
        "recruit",
        "career",
        "graduate",
        "freshers",
        "intern",
    )
    has_recruit_context = any(term in text for term in recruit_context_terms)
    if not has_recruit_context:
        return []

    patterns = [
        r"(20\d{2})\s*卒",
        r"(?<!\d)(\d{2})\s*卒",
        r"(20\d{2})\s*年度",
        r"(?:fy|fiscal)\s*[-/]?\s*(20\d{2})",
        r"(?:fy|fiscal)\s*[-/]?\s*(\d{2})",
        r"(20\d{2})\s*年(?:度)?\s*(?:新卒|採用|entry|recruit)",
    ]

    detected_years: set[int] = set()
    min_year = max(2020, target_year - 5)
    max_year = target_year + 3

    for pattern in patterns:
        for match in re.finditer(pattern, text, flags=re.IGNORECASE):
            year_str = match.group(1)
            if not year_str:
                continue
            year = int(year_str)
            if year < 100:
                year = 2000 + year
            if year == target_year:
                continue
            if min_year <= year <= max_year:
                detected_years.add(year)

    return sorted(detected_years)


# ---------------------------------------------------------------------------
# Year inference helpers
# ---------------------------------------------------------------------------

def _infer_year_for_month(
    month: int, graduation_year: int, selection_type: str | None
) -> int:
    start_year = graduation_year - 2
    end_year = graduation_year - 1

    if selection_type == "main_selection":
        return end_year if 1 <= month <= 6 else start_year
    elif selection_type == "internship":
        return end_year if 1 <= month <= 3 else start_year
    else:
        return end_year if 1 <= month <= 6 else start_year


def _validate_and_correct_due_date(
    due_date_str: str,
    graduation_year: int,
    selection_type: str | None,
    month: int | None = None,
) -> dict:
    result = {
        "is_valid": False,
        "corrected_date": None,
        "original_date": due_date_str,
        "confidence_adjustment": "unchanged",
        "reason": "",
    }

    if not due_date_str:
        result["reason"] = "日付が指定されていません"
        return result

    try:
        due_date = datetime.strptime(due_date_str, "%Y-%m-%d")
        parsed_year = due_date.year
        parsed_month = due_date.month
        parsed_day = due_date.day
    except ValueError:
        result["reason"] = f"無効な日付形式: {due_date_str}"
        return result

    start_year = graduation_year - 2
    end_year = graduation_year - 1

    valid_start = datetime(start_year, 4, 1)
    valid_end = datetime(end_year, 6, 30)

    if valid_start <= due_date <= valid_end:
        result["is_valid"] = True
        result["reason"] = "日付は有効範囲内です"
        return result

    inferred_year = None

    if selection_type == "main_selection":
        if 1 <= parsed_month <= 6:
            inferred_year = end_year
        else:
            inferred_year = start_year
    elif selection_type == "internship":
        if 1 <= parsed_month <= 3:
            inferred_year = end_year
        else:
            inferred_year = start_year
    else:
        if 1 <= parsed_month <= 6:
            inferred_year = end_year
        else:
            inferred_year = start_year

    try:
        corrected_date = datetime(inferred_year, parsed_month, parsed_day)

        if valid_start <= corrected_date <= valid_end:
            result["is_valid"] = True
            result["corrected_date"] = corrected_date.strftime("%Y-%m-%d")
            result["confidence_adjustment"] = "lowered"
            result["reason"] = (
                f"年を{parsed_year}年から{inferred_year}年に修正しました（{graduation_year}卒、"
                f"{'本選考' if selection_type == 'main_selection' else 'インターン' if selection_type == 'internship' else '選考タイプ不明'}）"
            )
            return result
        else:
            result["reason"] = (
                f"日付 {due_date_str} は{graduation_year}卒の有効範囲（{start_year}年4月〜{end_year}年6月）外です"
            )
            return result
    except ValueError:
        result["reason"] = (
            f"日付修正に失敗しました: {inferred_year}-{parsed_month:02d}-{parsed_day:02d}"
        )
        return result


# ---------------------------------------------------------------------------
# Company-name strict matching helpers
# ---------------------------------------------------------------------------

def _contains_company_name(
    company_name: str,
    title: str,
    url: str,
    snippet: str = "",
    allow_snippet_match: bool = False,
) -> bool:
    normalized_name, ascii_name = _normalize_company_name(company_name)

    if not normalized_name and not ascii_name:
        return True

    title_lower = (title or "").lower()
    url_lower = (url or "").lower()

    prefixes = []
    if normalized_name and len(normalized_name) >= 4:
        prefixes = [
            normalized_name[: min(8, len(normalized_name))].lower(),
            normalized_name[: min(6, len(normalized_name))].lower(),
            normalized_name[:4].lower(),
        ]

    if normalized_name:
        name_lower = normalized_name.lower()
        if name_lower in title_lower:
            return True

    for prefix in prefixes:
        if prefix in title_lower:
            return True

    for prefix in prefixes:
        if prefix in url_lower:
            return True

    if ascii_name and len(ascii_name) >= 4:
        if ascii_name in url_lower:
            return True
        prefix_len = max(4, len(ascii_name) // 2)
        prefix = ascii_name[:prefix_len]
        if prefix in url_lower:
            return True

    if allow_snippet_match and snippet:
        snippet_lower = snippet.lower()
        if normalized_name and normalized_name.lower() in snippet_lower:
            return True
        for prefix in prefixes:
            if prefix in snippet_lower:
                return True

    return False


def _has_strict_company_name_match(
    company_name: str, title: str, snippet: str = ""
) -> bool:
    normalized_name, _ = _normalize_company_name(company_name)
    if not normalized_name:
        return False
    name_lower = normalized_name.lower()
    norm_title = _normalize_text_for_match(title)
    norm_snippet = _normalize_text_for_match(snippet)
    return name_lower in norm_title or name_lower in norm_snippet


def _get_conflicting_companies(domain: str, company_name: str) -> set[str]:
    from app.utils.company_names import get_company_candidates_for_domain, get_parent_company

    candidates = get_company_candidates_for_domain(domain)
    if not candidates:
        return set()

    allowed = {company_name}
    parent = get_parent_company(company_name)
    if parent:
        allowed.add(parent)

    return {c for c in candidates if c not in allowed}


# ---------------------------------------------------------------------------
# Recruitment candidate scoring
# ---------------------------------------------------------------------------

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
            return "medium"
        else:
            if score >= 6:
                return "high"
            return "medium"
    elif source_type == "blog":
        if score >= 6:
            return "medium"
        return "low"
    elif source_type == "job_site":
        if score >= 6:
            return "medium"
        return "low"
    elif source_type in {"parent", "subsidiary"}:
        return "low"
    else:
        if score >= 7:
            return "medium"
        if score >= 4:
            return "medium"
        return "low"


def _hybrid_score_to_confidence(
    score: float,
    source_type: str,
    year_matched: bool = True,
    content_type: str | None = None,
) -> str:
    if source_type == "official":
        if score >= 0.7:
            return "high" if year_matched else "medium"
        return "medium"
    if source_type in {"parent", "subsidiary"}:
        return "low"
    if source_type in {"job_site", "aggregator", "blog"}:
        return "medium" if score >= 0.7 else "low"
    return "medium" if score >= 0.5 else "low"


def _recruitment_score_to_confidence(
    score: float,
    source_type: str = "other",
    year_matched: bool = True,
) -> str:
    if source_type == "official":
        if score >= 6:
            return "high" if year_matched else "medium"
        return "medium"
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
        return "medium"
    if source_type == "job_site":
        return "medium" if score >= 0.7 else "low"
    if source_type in {"parent", "subsidiary", "blog", "other"}:
        return "low"
    return "low"


def _normalize_recruitment_source_type(
    url: str,
    raw_source_type: str | None,
    relation: dict[str, str | bool | None],
) -> str:
    from app.utils.web_search import is_trusted_schedule_job_site

    normalized = normalize_company_result_source_type(raw_source_type, relation)
    if normalized in {"official", "parent", "subsidiary", "job_site"}:
        return normalized
    if is_trusted_schedule_job_site(url):
        return "job_site"
    return "other"


def _candidate_sort_key(
    candidate, score_hint: float = 0.0
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


def _score_recruit_candidate(
    url: str,
    title: str,
    snippet: str,
    company_name: str,
    industry: str,
    graduation_year: int | None = None,
) -> float | None:
    if _is_excluded_url(url):
        return None

    url_lower = url.lower()
    title_lower = (title or "").lower()
    snippet_lower = (snippet or "").lower()
    domain = _domain_from_url(url)
    path = urlparse(url).path.lower()

    normalized_name, ascii_name = _normalize_company_name(company_name)

    score = 0.0

    if normalized_name and normalized_name in title:
        score += 3.0
    if normalized_name and normalized_name in snippet:
        score += 2.0

    domain_matched = is_registered_official_domain(url, company_name)
    if domain_matched:
        score += 4.0

    if not domain_matched and ascii_name and ascii_name in domain:
        score += 3.0

    if any(sub in domain for sub in ["recruit.", "saiyo.", "entry.", "career."]):
        score += 3.0

    if any(kw in path for kw in RECRUIT_URL_KEYWORDS):
        score += 3.0

    if any(kw in title_lower for kw in RECRUIT_TITLE_KEYWORDS):
        score += 2.0

    if any(kw in snippet_lower for kw in RECRUIT_TITLE_KEYWORDS):
        score += 1.0

    grad_year = graduation_year or _get_graduation_year()
    grad_year_str = str(grad_year)
    grad_year_short = str(grad_year % 100) + "卒"
    if grad_year_str in url or grad_year_str in title or grad_year_str in snippet:
        score += 1.0
    elif grad_year_short in title or grad_year_short in snippet:
        score += 1.0

    other_years = _detect_other_graduation_years(url, title, snippet, grad_year)
    if other_years:
        score -= 2.0

    if domain.endswith(".co.jp"):
        score += 2.0
    elif domain.endswith(".jp"):
        score += 1.5
    elif domain.endswith(".com"):
        score += 1.0
    elif domain.endswith(".net"):
        score += 0.5
    elif any(
        domain.endswith(bad) for bad in [".xyz", ".info", ".biz", ".site", ".dev", ".test"]
    ):
        score -= 1.0

    if industry and industry.lower() in snippet_lower:
        score += 0.5

    if any(site in domain for site in AGGREGATOR_SITES):
        score -= 3.0

    blog_penalty = _get_blog_penalty(url, domain, company_name)
    score += blog_penalty

    if "mypage" in url_lower:
        score += 1.0

    return score


def _score_recruit_candidate_with_breakdown(
    url: str,
    title: str,
    snippet: str,
    company_name: str,
    industry: str,
    graduation_year: int | None = None,
) -> tuple[float | None, dict, list[str]]:
    breakdown = {}

    if _is_excluded_url(url):
        return None, {"除外": "除外ドメイン"}, []

    url_lower = url.lower()
    title_lower = (title or "").lower()
    snippet_lower = (snippet or "").lower()
    domain = _domain_from_url(url)
    path = urlparse(url).path.lower()

    normalized_name, ascii_name = _normalize_company_name(company_name)
    domain_patterns = get_company_domain_patterns(company_name, ascii_name)

    score = 0.0

    if normalized_name and normalized_name in title:
        score += 3.0
        breakdown["企業名タイトル一致"] = "+3.0"
    if normalized_name and normalized_name in snippet:
        score += 2.0
        breakdown["企業名スニペット一致"] = "+2.0"

    domain_matched = is_registered_official_domain(url, company_name)
    if domain_matched:
        score += 4.0
        breakdown["ドメインパターン一致"] = "+4.0 (registered)"

    if not domain_matched and ascii_name and ascii_name in domain:
        score += 3.0
        breakdown["ASCII名一致"] = "+3.0"

    matched_sub = [
        sub for sub in ["recruit.", "saiyo.", "entry.", "career."] if sub in domain
    ]
    if matched_sub:
        score += 3.0
        breakdown["採用サブドメイン"] = f"+3.0 ({matched_sub[0]})"

    matched_kw = [kw for kw in RECRUIT_URL_KEYWORDS if kw in path]
    if matched_kw:
        score += 3.0
        breakdown["採用URLキーワード"] = f"+3.0 ({matched_kw[0]})"

    if any(kw in title_lower for kw in RECRUIT_TITLE_KEYWORDS):
        score += 2.0
        breakdown["採用タイトルキーワード"] = "+2.0"

    if any(kw in snippet_lower for kw in RECRUIT_TITLE_KEYWORDS):
        score += 1.0
        breakdown["採用スニペットキーワード"] = "+1.0"

    grad_year = graduation_year or _get_graduation_year()
    grad_year_str = str(grad_year)
    grad_year_short = str(grad_year % 100) + "卒"
    if grad_year_str in url or grad_year_str in title or grad_year_str in snippet:
        score += 1.0
        breakdown["卒業年度一致"] = f"+1.0 ({grad_year_str})"
    elif grad_year_short in title or grad_year_short in snippet:
        score += 1.0
        breakdown["卒業年度一致"] = f"+1.0 ({grad_year_short})"

    other_years = _detect_other_graduation_years(url, title, snippet, grad_year)
    if other_years:
        score -= 2.0
        breakdown["年度不一致ペナルティ"] = (
            f"-2.0 ({', '.join(str(y) for y in other_years)}卒向け)"
        )

    if domain.endswith(".co.jp"):
        score += 2.0
        breakdown["TLD品質"] = "+2.0 (.co.jp)"
    elif domain.endswith(".jp"):
        score += 1.5
        breakdown["TLD品質"] = "+1.5 (.jp)"
    elif domain.endswith(".com"):
        score += 1.0
        breakdown["TLD品質"] = "+1.0 (.com)"
    elif domain.endswith(".net"):
        score += 0.5
        breakdown["TLD品質"] = "+0.5 (.net)"
    elif any(
        domain.endswith(bad) for bad in [".xyz", ".info", ".biz", ".site", ".dev", ".test"]
    ):
        score -= 1.0
        breakdown["TLD品質"] = "-1.0 (低品質)"

    if industry and industry.lower() in snippet_lower:
        score += 0.5
        breakdown["業界名一致"] = "+0.5"

    if any(site in domain for site in AGGREGATOR_SITES):
        score -= 3.0
        breakdown["アグリゲーターペナルティ"] = "-3.0"

    blog_penalty = _get_blog_penalty(url, domain, company_name)
    if blog_penalty != 0:
        score += blog_penalty
        if blog_penalty == -5.0:
            breakdown["ブログペナルティ"] = "-5.0 (個人ブログ)"
        elif blog_penalty == -1.0:
            breakdown["ブログペナルティ"] = "-1.0 (公式ブログ)"
        elif blog_penalty == -3.0:
            breakdown["個人サイトペナルティ"] = "-3.0"

    if "mypage" in url_lower:
        score += 1.0
        breakdown["マイページボーナス"] = "+1.0"

    return score, breakdown, domain_patterns[:5]


def _score_corporate_candidate(
    url: str,
    title: str,
    snippet: str,
    company_name: str,
    search_type: str,
    preferred_domain: str | None = None,
    strict_company_match: bool = False,
    allow_aggregators: bool = True,
) -> float | None:
    if _is_excluded_url(url):
        return None
    if not _is_valid_http_url(url):
        return None

    url_lower = url.lower()
    title_lower = (title or "").lower()
    snippet_lower = (snippet or "").lower()
    domain = _domain_from_url(url)
    path = urlparse(url).path.lower()
    is_aggregator = any(site in domain for site in AGGREGATOR_SITES)
    if is_aggregator and not allow_aggregators:
        return None

    normalized_name, ascii_name = _normalize_company_name(company_name)
    normalized_title = _normalize_text_for_match(title)
    normalized_snippet = _normalize_text_for_match(snippet)
    company_match = _company_name_matches(title, snippet, domain, company_name)
    relation = _classify_company_relation(url, company_name)
    is_official_domain = bool(relation["is_official"])
    is_related_company = bool(relation["is_parent"]) or bool(relation["is_subsidiary"])
    preferred_domain_match = False
    if preferred_domain:
        preferred_domain_match = domain == preferred_domain or domain.endswith(
            f".{preferred_domain}"
        )
    if strict_company_match and not (
        company_match or preferred_domain_match or is_official_domain or is_related_company
    ):
        return None
    score = 0.0

    normalized_name = normalized_name.lower()
    if normalized_name and normalized_name in normalized_title:
        score += 3.0
    if normalized_name and normalized_name in normalized_snippet:
        score += 2.0
    domain_matched = is_official_domain
    if domain_matched:
        score += 4.0
    if not domain_matched and ascii_name and ascii_name in domain:
        score += 3.0
    if (
        not company_match
        and not preferred_domain_match
        and not is_related_company
        and not is_official_domain
    ):
        score -= 4.0

    if domain.endswith((".co.jp", ".jp", ".com", ".net")):
        score += 1.0
    elif any(
        domain.endswith(bad) for bad in [".xyz", ".info", ".biz", ".site", ".dev", ".test"]
    ):
        score -= 1.0

    keywords = CORP_KEYWORDS.get(search_type, {})
    for kw in keywords.get("url", []):
        if kw in path or kw in url_lower:
            score += 2.0
            break
    for kw in keywords.get("title", []):
        if kw.lower() in title_lower or kw in title:
            score += 2.0
            break
    for kw in keywords.get("snippet", []):
        if kw.lower() in snippet_lower or kw in snippet:
            score += 1.0
            break

    if preferred_domain:
        if domain == preferred_domain or domain.endswith(f".{preferred_domain}"):
            score += 3.0
        else:
            score -= 1.0

    if search_type == "ir" and url_lower.endswith(".pdf"):
        score += 1.5

    if search_type == "ir":
        for kw in IR_DOC_KEYWORDS:
            kw_lower = kw.lower()
            if (
                kw_lower in title_lower
                or kw_lower in snippet_lower
                or kw_lower in url_lower
            ):
                score += 2.5
                break

    if is_aggregator:
        score -= 2.0

    return score


def _score_corporate_candidate_with_breakdown(
    url: str,
    title: str,
    snippet: str,
    company_name: str,
    search_type: str,
    preferred_domain: str | None = None,
    strict_company_match: bool = False,
    allow_aggregators: bool = True,
    content_type: str | None = None,
) -> tuple[float | None, dict, list[str]]:
    from app.utils.content_type_keywords import (
        CONTENT_TYPE_KEYWORDS,
        url_matches_content_type,
        detect_content_type_from_url,
        get_conflicting_content_types,
    )

    breakdown = {}

    if _is_excluded_url(url):
        return None, {"除外": "除外ドメイン"}, []
    if not _is_valid_http_url(url):
        return None, {"除外": "無効URL"}, []

    url_lower = url.lower()
    title_lower = (title or "").lower()
    snippet_lower = (snippet or "").lower()
    domain = _domain_from_url(url)
    path = urlparse(url).path.lower()
    is_aggregator = any(site in domain for site in AGGREGATOR_SITES)
    if is_aggregator and not allow_aggregators:
        return None, {"除外": "アグリゲーター除外"}, []

    normalized_name, ascii_name = _normalize_company_name(company_name)
    domain_patterns = get_company_domain_patterns(company_name, ascii_name)
    normalized_title = _normalize_text_for_match(title)
    normalized_snippet = _normalize_text_for_match(snippet)
    company_match = _company_name_matches(title, snippet, domain, company_name)
    preferred_domain_match = False
    if preferred_domain:
        preferred_domain_match = domain == preferred_domain or domain.endswith(
            f".{preferred_domain}"
        )

    relation = _classify_company_relation(url, company_name, content_type)
    is_official_domain = bool(relation["is_official"])
    is_related_company = bool(relation["is_parent"]) or bool(relation["is_subsidiary"])

    if strict_company_match and not (
        company_match or preferred_domain_match or is_official_domain or is_related_company
    ):
        return None, {"除外": "企業名不一致(strict)"}, domain_patterns

    score = 0.0

    normalized_name = normalized_name.lower()
    if normalized_name and normalized_name in normalized_title:
        score += 3.0
        breakdown["企業名タイトル一致"] = "+3.0"
    if normalized_name and normalized_name in normalized_snippet:
        score += 2.0
        breakdown["企業名スニペット一致"] = "+2.0"

    domain_matched = is_official_domain
    if domain_matched:
        score += 4.0
        breakdown["ドメインパターン一致"] = "+4.0 (registered)"
    if not domain_matched and ascii_name and ascii_name in domain:
        score += 3.0
        breakdown["ASCII名一致"] = "+3.0"

    if (
        not company_match
        and not preferred_domain_match
        and not is_related_company
        and not is_official_domain
    ):
        score -= 4.0
        breakdown["企業不一致ペナルティ"] = "-4.0"

    if domain.endswith(".co.jp"):
        score += 1.5
        breakdown["TLD品質"] = "+1.5 (.co.jp)"
    elif domain.endswith(".jp"):
        score += 1.0
        breakdown["TLD品質"] = "+1.0 (.jp)"
    elif domain.endswith(".com"):
        score += 0.5
        breakdown["TLD品質"] = "+0.5 (.com)"
    elif domain.endswith(".net"):
        score += 0.5
        breakdown["TLD品質"] = "+0.5 (.net)"
    elif any(
        domain.endswith(bad) for bad in [".xyz", ".info", ".biz", ".site", ".dev", ".test"]
    ):
        score -= 1.0
        breakdown["TLD品質"] = "-1.0 (低品質)"

    if content_type and content_type in CONTENT_TYPE_KEYWORDS:
        ct_keywords = CONTENT_TYPE_KEYWORDS[content_type]
        ct_label = {
            "new_grad_recruitment": "新卒採用",
            "midcareer_recruitment": "中途採用",
            "ceo_message": "社長メッセージ",
            "employee_interviews": "社員インタビュー",
            "press_release": "プレスリリース",
            "ir_materials": "IR資料",
            "csr_sustainability": "CSR/サステナ",
            "midterm_plan": "中期経営計画",
            "corporate_site": "企業情報",
        }.get(content_type, content_type)

        ct_url_matched = url_matches_content_type(url, content_type)
        if ct_url_matched:
            score += 2.5
            breakdown[f"{ct_label}URLパターン"] = "+2.5"

        for kw in ct_keywords["title"]:
            if kw.lower() in title_lower or kw in title:
                score += 2.0
                breakdown[f"{ct_label}タイトル一致"] = f"+2.0 ({kw})"
                break

        for kw in ct_keywords["snippet"]:
            if kw.lower() in snippet_lower or kw in snippet:
                score += 1.0
                breakdown[f"{ct_label}スニペット一致"] = f"+1.0 ({kw})"
                break

        detected_ct = detect_content_type_from_url(url)
        if detected_ct and detected_ct != content_type:
            conflicting_types = get_conflicting_content_types(content_type)
            if detected_ct in conflicting_types or detected_ct not in [
                content_type,
                "corporate_site",
            ]:
                score -= 2.0
                breakdown["ContentType不一致ペナルティ"] = f"-2.0 (検出: {detected_ct})"

    else:
        keywords = CORP_KEYWORDS.get(search_type, {})
        type_label = {"about": "企業情報", "ir": "IR", "business": "事業"}.get(
            search_type, search_type
        )

        for kw in keywords.get("url", []):
            if kw in path or kw in url_lower:
                score += 2.0
                breakdown[f"{type_label}URLキーワード"] = f"+2.0 ({kw})"
                break

        for kw in keywords.get("title", []):
            if kw.lower() in title_lower or kw in title:
                score += 2.0
                breakdown[f"{type_label}タイトルキーワード"] = f"+2.0 ({kw})"
                break

        for kw in keywords.get("snippet", []):
            if kw.lower() in snippet_lower or kw in snippet:
                score += 1.0
                breakdown[f"{type_label}スニペットキーワード"] = f"+1.0 ({kw})"
                break

    if preferred_domain:
        if domain == preferred_domain or domain.endswith(f".{preferred_domain}"):
            score += 3.0
            breakdown["優先ドメイン一致"] = "+3.0"
        else:
            score -= 1.0
            breakdown["優先ドメイン不一致"] = "-1.0"

    is_ir_search = search_type == "ir" or content_type == "ir_materials"
    if is_ir_search and url_lower.endswith(".pdf"):
        score += 1.5
        breakdown["IR PDF"] = "+1.5"

    if is_ir_search:
        for kw in IR_DOC_KEYWORDS:
            kw_lower = kw.lower()
            if (
                kw_lower in title_lower
                or kw_lower in snippet_lower
                or kw_lower in url_lower
            ):
                score += 2.5
                breakdown["IR文書キーワード"] = f"+2.5 ({kw})"
                break

    if is_aggregator:
        score -= 2.0
        breakdown["アグリゲーターペナルティ"] = "-2.0"

    return score, breakdown, get_company_domain_patterns(company_name, ascii_name)


# ---------------------------------------------------------------------------
# DuckDuckGo search
# ---------------------------------------------------------------------------

async def _search_with_ddgs(
    query: str,
    max_results: int = 10,
    use_cache: bool = True,
    cache_mode: str | None = None,
    retry_on_low_results: bool = True,
    min_results_for_retry: int = 3,
) -> list[dict]:
    if not HAS_DDGS:
        return []

    from app.routers.company_info_config import CACHE_MODES

    def _normalize_cache_mode(mode: str | None, fallback: str) -> str:
        if mode in CACHE_MODES:
            return mode
        return fallback

    effective_mode = _normalize_cache_mode(
        cache_mode, "use" if use_cache else "bypass"
    )
    read_cache = effective_mode == "use"
    write_cache = effective_mode in {"use", "refresh"}

    if read_cache:
        cached = _get_cached_ddgs_results(query, max_results)
        if cached is not None:
            return cached

    def _do_search() -> list[dict]:
        try:
            with DDGS() as ddgs:
                results = list(
                    ddgs.text(query, safesearch="moderate", max_results=max_results)
                )
                return results
        except Exception as e:
            logger.error(f"[企業サイト検索] DuckDuckGo 検索エラー: {e}")
            return []

    results = _do_search()

    if retry_on_low_results and len(results) < min_results_for_retry:
        await asyncio.sleep(1.0)
        retry_results = _do_search()
        seen_urls = {r.get("href", r.get("url", "")) for r in results}
        for r in retry_results:
            url = r.get("href", r.get("url", ""))
            if url and url not in seen_urls:
                results.append(r)
                seen_urls.add(url)

    if write_cache and results:
        _set_ddgs_cache(query, max_results, results)

    return results
