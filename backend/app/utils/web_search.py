"""
Web Search Module with Hybrid Search Patterns

Applies RRF fusion and cross-encoder reranking to DuckDuckGo search
for improved precision when searching for company recruitment pages.

Key improvements over simple DDG search:
1. Multi-query search with company name variants
2. RRF fusion to combine results from multiple queries
3. Cross-encoder reranking for semantic relevance
4. Score combination with heuristic signals
"""

import asyncio
import hashlib
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Optional
from urllib.parse import urlparse

from app.utils.company_names import (
    get_conflicting_companies_for_domain,
    is_parent_domain,
    is_subsidiary_domain,
    resolve_domain_profile,
)
from app.utils.http_fetch import fetch_page_content, extract_text_from_html
from app.utils.intent_profile import AMBIGUOUS_RULES, AMBIGUOUS_TOKENS, get_all_intent_profiles, get_intent_profile

logger = logging.getLogger(__name__)

# Try to import DuckDuckGo search (ddgs is the new package name)
try:
    from ddgs import DDGS

    HAS_DDGS = True
except ImportError:
    try:
        # Fallback to old package name
        from duckduckgo_search import DDGS

        HAS_DDGS = True
    except ImportError:
        HAS_DDGS = False
        logger.warning("ddgs/duckduckgo-search not installed. Web search disabled.")

# Try to import reranker
try:
    from app.utils.reranker import get_reranker, CrossEncoderReranker

    HAS_RERANKER = True
except ImportError:
    HAS_RERANKER = False
    logger.warning("reranker not available. Reranking disabled.")

# =============================================================================
# Configuration
# =============================================================================

WEB_SEARCH_MAX_QUERIES = 10  # Maximum query variations to generate
WEB_SEARCH_RESULTS_PER_QUERY = 12  # Results per DuckDuckGo search
WEB_SEARCH_RRF_K = 60  # RRF constant
WEB_SEARCH_RERANK_TOP_K = 30  # Top results to rerank
WEB_SEARCH_SITE_RETRY_MIN_RESULTS = 3  # Trigger site: rescue below this count

# Score combination weights
WEIGHT_RERANK = 0.45  # Semantic relevance
WEIGHT_INTENT = 0.40  # Intent/domain/year signals
WEIGHT_RRF = 0.15  # Multi-query frequency

# Short company name guard (e.g., "AGC", "TDK")
SHORT_NAME_OFFICIAL_TLDS = (".co.jp", ".jp", ".com")

# Intent score normalization (fixed range + bias)
INTENT_SCORE_MIN = -6.0
INTENT_SCORE_MAX = 8.0
INTENT_SCORE_BIAS = 0.1

# Light verification settings
VERIFY_CANDIDATE_TOP_K = 5
VERIFY_INTENT_THRESHOLD = 2.0
VERIFY_TIMEOUT = 8.0
VERIFY_MAX_CONCURRENCY = 3
VERIFY_CACHE_TTL = timedelta(minutes=30)

# Cache settings
CACHE_TTL = timedelta(minutes=30)
CACHE_MAX_SIZE = 200

# Company name suffixes to normalize
COMPANY_SUFFIXES = [
    "株式会社",
    "（株）",
    "(株)",
    "㈱",
    "有限会社",
    "合同会社",
    "合資会社",
    "Inc.",
    "Inc",
    "Ltd.",
    "Ltd",
    "Co.,Ltd.",
    "Co.,Ltd",
    "Co., Ltd.",
    "Corporation",
    "Corp.",
    "Corp",
    "Holdings",
    "ホールディングス",
    "HD",
    "グループ",
]

# Company-specific query aliases (used to improve recall for brand/English names)
COMPANY_QUERY_ALIASES = {
    "BCG": ["BCG", "Boston Consulting Group"],
    "PwC": ["PwC", "PricewaterhouseCoopers"],
    "KPMG": ["KPMG"],
    "P&G": ["P&G", "P&G Japan", "Procter & Gamble", "Procter and Gamble", "Procter Gamble", "PG"],
    "SUBARU": ["SUBARU"],
    "NTTデータ": ["NTT DATA", "NTTData"],
    "NTTドコモ": ["docomo", "ドコモ"],
    "三菱UFJ銀行": ["MUFG", "MUFG Bank", "MUFGBANK"],
    "JFE商事": ["JFE商事", "JFETC"],
    "三越伊勢丹": ["IMHDS", "IMHD", "三越伊勢丹ホールディングス"],
}

# Recruitment-related keywords for scoring
RECRUIT_KEYWORDS_TITLE = [
    "採用",
    "新卒",
    "エントリー",
    "募集",
    "選考",
    "インターン",
    "マイページ",
    "採用情報",
    "新卒採用",
    "キャリア",
    "リクルート",
    "recruit",
    "career",
    "entry",
]

RECRUIT_KEYWORDS_URL = [
    "recruit",
    "saiyo",
    "entry",
    "career",
    "graduate",
    "fresh",
    "newgrads",
    "intern",
    "internship",
    "shinsotsu",
    "mypage",
    "job",
    "careers",
]

RECRUIT_SUBDOMAINS = ["recruit", "saiyo", "entry", "career", "careers", "job", "jobs"]

# Excluded domains
EXCLUDED_DOMAINS = [
    "youtube.com",
    "twitter.com",
    "x.com",
    "instagram.com",
    "facebook.com",
    "tiktok.com",
    "note.com",
    "ameblo.jp",
    "hatena.ne.jp",
    "prtimes.jp",
    "news.yahoo.co.jp",
    "nikkei.com",
    "wikipedia.org",
    "tickerreport.com",
    "aum13f.com",
    "ibankie.com",
    "cryptonews.com",
    "tapwage.com",
    "interviewanswers.com",
    "skymizer.ai",
    "yell.com",
    "ncsy.org",
    "nttdatafoundation.com",
    "presseportal.de",
    "telcomagazine.com",
    "test-dev-site.site",
    "i-webs.jp",
    "snar.jp",
    "hrmos.co.jp",
    "hrmos.co",
]

# Job aggregator sites (lower score but not excluded)
AGGREGATOR_DOMAINS = [
    "rikunabi.com",
    "mynavi.jp",
    "onecareer.jp",
    "unistyle.jp",
    "goodfind.jp",
    "offerbox.jp",
    "wantedly.com",
    "indeed.com",
    "en-japan.com",
    "doda.jp",
    "careerpark.jp",
    "rikeinavi.com",
    "reashu.com",
    "ut-board.com",
    "talentsquare.co.jp",
    "renew-career.com",
    "abuild-c.com",
    "pasonacareer.jp",
    "r-agent.com",
    "careerup-media.com",
    "syukatsu-kaigi.jp",
]

# FAQ/Help-like paths to exclude in certain categories
FAQ_LIKE_PATTERNS = [
    "faq",
    "help",
    "support",
    "shop",
    "campaign",
    "loan",
    "net_simulation",
    "tenpoinfo",
    "branch",
    "store",
]

# Categories where external sites should be excluded entirely
EXTERNAL_STRICT_CATEGORIES = {
    "new_grad_recruitment",
    "midcareer_recruitment",
    "ir_materials",
    "csr_sustainability",
    "midterm_plan",
    "press_release",
}

# Categories where FAQ/help-like pages should be excluded
FAQ_EXCLUDE_CATEGORIES = {
    "ceo_message",
    "employee_interviews",
    "ir_materials",
    "csr_sustainability",
    "midterm_plan",
    "press_release",
}

# Categories where intent gate should be enforced
INTENT_GATE_CATEGORIES = {
    "new_grad_recruitment",
    "midcareer_recruitment",
    "ir_materials",
    "csr_sustainability",
    "midterm_plan",
    "press_release",
    "ceo_message",
    "employee_interviews",
}

INTENT_GATE_THRESHOLD = 0.8

# Content type to search intent mapping
CONTENT_TYPE_SEARCH_INTENT = {
    "new_grad_recruitment": "new_grad",
    "midcareer_recruitment": "midcareer",
    "ceo_message": "ceo_message",
    "employee_interviews": "employee_interviews",
    "ir_materials": "corporate_ir",
    "csr_sustainability": "csr",
    "midterm_plan": "midterm_plan",
    "press_release": "press_release",
    "corporate_site": "corporate_about",
}


# =============================================================================
# Data Classes
# =============================================================================


@dataclass
class WebSearchResult:
    """Represents a single web search result with scores."""

    url: str
    title: str
    snippet: str

    # Scores
    rrf_score: float = 0.0
    rerank_score: float = 0.0
    heuristic_score: float = 0.0
    combined_score: float = 0.0
    intent_score_raw: float = 0.0
    domain_score: float = 0.0
    company_score: float = 0.0
    year_score: float = 0.0

    # Metadata
    source_type: str = "other"  # "official", "aggregator", "other"
    year_matched: bool = False
    domain: str = ""
    is_official: bool = False
    is_parent: bool = False
    is_subsidiary: bool = False
    is_conflict: bool = False
    is_aggregator: bool = False
    company_name_matched: bool = False

    # Score breakdown for debugging
    score_breakdown: dict = field(default_factory=dict)

    def __post_init__(self):
        if not self.domain:
            try:
                self.domain = urlparse(self.url).netloc.lower()
            except Exception:
                self.domain = ""


# =============================================================================
# Cache
# =============================================================================

_hybrid_search_cache: dict[str, tuple[list[WebSearchResult], datetime]] = {}
_verify_cache: dict[str, tuple[dict, datetime]] = {}
CACHE_MODES = {"use", "refresh", "bypass"}


def _get_cache_key(
    company_name: str,
    search_intent: str,
    graduation_year: int | None,
    selection_type: str | None,
    content_type: str | None = None,
    preferred_domain: str | None = None,
    strict_company_match: bool | None = None,
    allow_aggregators: bool | None = None,
    allow_snippet_match: bool | None = None,
) -> str:
    """Build cache key for hybrid search results."""
    parts = [
        company_name.lower(),
        search_intent,
        str(graduation_year) if graduation_year else "",
        selection_type or "",
        content_type or "",
        (preferred_domain or "").lower(),
        str(strict_company_match) if strict_company_match is not None else "",
        str(allow_aggregators) if allow_aggregators is not None else "",
        str(allow_snippet_match) if allow_snippet_match is not None else "",
    ]
    return hashlib.md5(":".join(parts).encode()).hexdigest()


def _get_cached_results(cache_key: str) -> list[WebSearchResult] | None:
    """Get cached results if available and not expired."""
    if cache_key in _hybrid_search_cache:
        results, cached_at = _hybrid_search_cache[cache_key]
        if datetime.now() - cached_at < CACHE_TTL:
            logger.debug(f"[WebSearch] Cache hit for key {cache_key[:8]}...")
            return results
        del _hybrid_search_cache[cache_key]
    return None


def _set_cache(cache_key: str, results: list[WebSearchResult]):
    """Cache processed results."""
    # Evict oldest entry if cache is full
    if len(_hybrid_search_cache) >= CACHE_MAX_SIZE:
        oldest_key = min(
            _hybrid_search_cache.keys(), key=lambda k: _hybrid_search_cache[k][1]
        )
        del _hybrid_search_cache[oldest_key]

    _hybrid_search_cache[cache_key] = (results, datetime.now())


def _get_verify_cached(url: str) -> dict | None:
    if url in _verify_cache:
        data, cached_at = _verify_cache[url]
        if datetime.now() - cached_at < VERIFY_CACHE_TTL:
            return data
        del _verify_cache[url]
    return None


def _set_verify_cache(url: str, data: dict):
    _verify_cache[url] = (data, datetime.now())


def clear_cache():
    """Clear the search cache."""
    _hybrid_search_cache.clear()


def _normalize_cache_mode(cache_mode: str | None, fallback: str) -> str:
    if cache_mode in CACHE_MODES:
        return cache_mode
    return fallback


# =============================================================================
# Company Name Utilities
# =============================================================================


def normalize_company_name(name: str) -> str:
    """Normalize company name by removing legal suffixes."""
    result = name
    for suffix in COMPANY_SUFFIXES:
        result = result.replace(suffix, "")
    return result.strip()


def extract_ascii_name(name: str) -> str | None:
    """Extract ASCII/romanized version of company name."""
    # Check for ASCII-only portions
    ascii_parts = re.findall(r"[A-Za-z]{2,}", name)
    if ascii_parts:
        return ascii_parts[0].lower()
    return None


def generate_company_variants(company_name: str) -> list[str]:
    """
    Generate company name variants for search queries.

    Returns list of variants: [original, normalized, ascii, short forms]
    """
    variants = [company_name]

    # Normalized (without legal suffix)
    normalized = normalize_company_name(company_name)
    if normalized != company_name and normalized:
        variants.append(normalized)

    # ASCII/romanized version
    ascii_name = extract_ascii_name(company_name)
    if ascii_name:
        variants.append(ascii_name)

    # Remove duplicates while preserving order
    seen = set()
    unique_variants = []
    for v in variants:
        v_lower = v.lower()
        if v_lower not in seen and v:
            seen.add(v_lower)
            unique_variants.append(v)

    return unique_variants


def _merge_query_aliases(company_name: str, base_variants: list[str]) -> list[str]:
    aliases = COMPANY_QUERY_ALIASES.get(company_name, [])
    if not aliases:
        return base_variants

    merged = list(base_variants)
    seen = {v.lower() for v in base_variants if v}
    for alias in aliases:
        alias_normalized = alias.lower()
        if alias_normalized in seen or not alias:
            continue
        merged.append(alias)
        seen.add(alias_normalized)

    return merged


# =============================================================================
# Query Generation
# =============================================================================


def generate_query_variations(
    company_name: str,
    search_intent: str = "recruitment",
    graduation_year: int | None = None,
    selection_type: str | None = None,
) -> list[str]:
    """
    Generate diverse search query variations for improved recall.

    Args:
        company_name: Company name to search for
        search_intent: "recruitment" | "corporate_ir" | "corporate_about"
        graduation_year: Target graduation year (e.g., 2027)
        selection_type: "main_selection" | "internship" | None

    Returns:
        List of 6-8 unique search queries
    """
    queries = []
    base_variants = generate_company_variants(company_name)
    company_variants = _merge_query_aliases(company_name, base_variants)
    primary_name = company_variants[0]
    short_name = company_variants[1] if len(company_variants) > 1 else primary_name
    alias_name = company_variants[2] if len(company_variants) > 2 else None
    ascii_name = base_variants[2] if len(base_variants) > 2 else None

    grad_year = graduation_year or _get_graduation_year()
    grad_year_short = grad_year % 100

    def add_queries(suffixes: list[str]):
        for suffix in suffixes:
            queries.append(f"{primary_name} {suffix}")
            if short_name != primary_name:
                queries.append(f"{short_name} {suffix}")

    if search_intent in {"recruitment", "new_grad"}:
        if alias_name:
            queries.extend([f"{alias_name} 新卒採用", f"{alias_name} Graduate Recruitment"])
        if selection_type == "internship":
            add_queries(
                [
                    f"インターン {grad_year_short}卒",
                    "インターンシップ 募集",
                    f"サマーインターン {grad_year}",
                    "インターン エントリー",
                ]
            )
        else:
            add_queries(
                [
                    f"新卒採用 {grad_year_short}卒",
                    f"新卒採用 {grad_year}",
                    "新卒採用情報",
                    "新卒 採用HP",
                    "Graduate Recruitment",
                    "Early Career",
                ]
            )
        if ascii_name:
            queries.append(f"{ascii_name} graduate recruitment")

    elif search_intent == "midcareer":
        if alias_name:
            queries.extend([f"{alias_name} キャリア採用", f"{alias_name} Job Openings"])
        add_queries(
            [
                "中途採用",
                "キャリア採用",
                "経験者採用",
                "Job Openings",
                "Experienced Hire",
            ]
        )

    elif search_intent == "corporate_ir":
        add_queries(["IR", "投資家情報", "有価証券報告書", "決算説明資料"])

    elif search_intent == "corporate_about":
        add_queries(["会社概要", "企業情報", "事業内容", "会社案内"])

    elif search_intent == "ceo_message":
        add_queries(
            [
                "社長メッセージ",
                "代表挨拶",
                "トップメッセージ",
                "CEO Message",
            ]
        )

    elif search_intent == "employee_interviews":
        add_queries(
            [
                "社員インタビュー",
                "社員紹介",
                "社員の声",
                "Employee Interview",
                "Culture",
            ]
        )

    elif search_intent == "csr":
        add_queries(
            [
                "CSR",
                "サステナビリティ",
                "ESG",
                "サステナビリティレポート",
                "ESG Report",
            ]
        )

    elif search_intent == "midterm_plan":
        add_queries(
            [
                "中期経営計画",
                "中期計画",
                "中期経営方針",
                "Medium-Term Plan",
            ]
        )

    elif search_intent == "press_release":
        add_queries(
            [
                "プレスリリース",
                "ニュースリリース",
                "報道発表",
                "Press Release",
            ]
        )

    # Deduplicate while preserving order
    seen = set()
    unique_queries = []
    for q in queries:
        q_normalized = q.lower().strip()
        if q_normalized not in seen:
            seen.add(q_normalized)
            unique_queries.append(q)

    return unique_queries[:WEB_SEARCH_MAX_QUERIES]


def _get_graduation_year() -> int:
    """Calculate the current target graduation year."""
    now = datetime.now()
    # If before October, target next year + 2 (e.g., 2024年1月 → 2026卒)
    # If October or later, target next year + 3 (e.g., 2024年10月 → 2027卒)
    if now.month < 10:
        return now.year + 2
    return now.year + 3


# =============================================================================
# DuckDuckGo Search
# =============================================================================


def _search_ddg_sync(query: str, max_results: int = 8) -> list[dict]:
    """Execute synchronous DuckDuckGo search."""
    if not HAS_DDGS:
        return []

    try:
        with DDGS() as ddgs:
            results = list(
                ddgs.text(query, safesearch="moderate", max_results=max_results)
            )
            return results
    except Exception as e:
        logger.warning(f"[WebSearch] DDG search error: {e}")
        return []


async def _search_ddg_async(query: str, max_results: int = 8) -> list[dict]:
    """Execute DuckDuckGo search asynchronously."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _search_ddg_sync, query, max_results)


# =============================================================================
# RRF Fusion
# =============================================================================


def rrf_merge_web_results(
    results_by_query: list[list[dict]], k: int = 60
) -> list[WebSearchResult]:
    """
    Merge multiple search result lists using Reciprocal Rank Fusion.

    Results appearing in multiple searches get higher RRF scores.

    Args:
        results_by_query: List of result lists from different queries
        k: RRF constant (default: 60)

    Returns:
        Merged and deduplicated results with RRF scores
    """
    scores: dict[str, float] = {}
    best_items: dict[str, dict] = {}

    for results in results_by_query:
        for rank, item in enumerate(results):
            url = item.get("href") or item.get("url", "")
            if not url:
                continue

            # Normalize URL for deduplication
            url_normalized = url.lower().rstrip("/")

            # Calculate RRF score
            rrf_score = 1 / (k + rank + 1)
            scores[url_normalized] = scores.get(url_normalized, 0) + rrf_score

            # Keep the first (best) item for each URL
            if url_normalized not in best_items:
                best_items[url_normalized] = item

    # Create WebSearchResult objects
    merged = []
    for url_normalized, rrf_score in scores.items():
        item = best_items[url_normalized]
        result = WebSearchResult(
            url=item.get("href") or item.get("url", ""),
            title=item.get("title", ""),
            snippet=item.get("body", ""),
            rrf_score=rrf_score,
        )
        merged.append(result)

    # Sort by RRF score
    merged.sort(key=lambda x: x.rrf_score, reverse=True)

    return merged


async def search_with_rrf_fusion(
    queries: list[str],
    max_results_per_query: int = 8,
    rrf_k: int = 60,
    return_raw: bool = False,
) -> list[WebSearchResult] | tuple[list[WebSearchResult], list[list[dict]]]:
    """
    Execute multiple DuckDuckGo searches and combine with RRF.

    Args:
        queries: List of search queries
        max_results_per_query: Max results per query
        rrf_k: RRF constant

    Returns:
        Merged results with RRF scores
    """
    if not queries:
        return ([], []) if return_raw else []

    # Execute all searches in parallel
    tasks = [_search_ddg_async(q, max_results_per_query) for q in queries]
    results_by_query = await asyncio.gather(*tasks, return_exceptions=True)

    # Filter out exceptions and empty results
    valid_results = [r for r in results_by_query if isinstance(r, list) and r]

    if not valid_results:
        logger.warning("[WebSearch] All DDG searches failed or returned empty")
        return ([], []) if return_raw else []

    logger.debug(f"[WebSearch] RRF merging {len(valid_results)} query results")

    merged = rrf_merge_web_results(valid_results, k=rrf_k)
    if return_raw:
        return merged, valid_results
    return merged


# =============================================================================
# Cross-Encoder Reranking
# =============================================================================


def rerank_web_results(
    query: str,
    results: list[WebSearchResult],
    top_k: int = 20,
) -> list[WebSearchResult]:
    """
    Rerank web search results using CrossEncoderReranker.

    Args:
        query: Original search intent
        results: Web search results to rerank
        top_k: Number of results to rerank and return

    Returns:
        Reranked results with rerank_score field set
    """
    if not results:
        return results

    if not HAS_RERANKER:
        logger.debug("[WebSearch] Reranker not available, skipping rerank")
        return results[:top_k]

    try:
        reranker = get_reranker()
        if not reranker.is_available():
            logger.debug("[WebSearch] Reranker model not loaded, skipping rerank")
            return results[:top_k]

        # Prepare documents for reranking (title + snippet)
        docs = [{"text": f"{r.title} {r.snippet}"[:512]} for r in results[:top_k]]

        # Rerank
        reranked = reranker.rerank(
            query=query,
            results=docs,
            top_k=top_k,
            text_key="text",
        )

        # Map scores back to WebSearchResult objects
        url_to_score = {}
        for i, doc in enumerate(reranked):
            if i < len(results):
                url_to_score[results[i].url] = doc.get("rerank_score", 0.0)

        # Update results with rerank scores
        for result in results[:top_k]:
            result.rerank_score = url_to_score.get(result.url, 0.0)

        # Sort by rerank score
        results[:top_k] = sorted(
            results[:top_k], key=lambda x: x.rerank_score, reverse=True
        )

        logger.debug(f"[WebSearch] Reranked {len(results[:top_k])} results")

    except Exception as e:
        logger.warning(f"[WebSearch] Reranking failed: {e}")

    return results[:top_k]


# =============================================================================
# Intent-aware Scoring
# =============================================================================


def _normalize_text_for_match(text: str) -> tuple[str, str]:
    lowered = (text or "").lower()
    compact = re.sub(r"\s+", "", lowered)
    return lowered, compact


def _term_in_text(text_lower: str, text_compact: str, term: str) -> bool:
    term_lower = (term or "").lower()
    if not term_lower:
        return False
    if " " in term_lower:
        return term_lower.replace(" ", "") in text_compact
    return term_lower in text_lower


def _match_terms(
    text_lower: str, text_compact: str, terms: list[str], ignore: set[str] | None = None
) -> list[str]:
    matches: list[str] = []
    for term in terms:
        if ignore and term in ignore:
            continue
        if _term_in_text(text_lower, text_compact, term):
            matches.append(term)
    return matches


def _match_url_terms(url_lower: str, terms: list[str], ignore: set[str] | None = None) -> list[str]:
    matches: list[str] = []
    for term in terms:
        if ignore and term in ignore:
            continue
        if term and term.lower() in url_lower:
            matches.append(term)
    return matches


def _contains_company_name(
    company_name: str,
    title: str,
    url: str,
    snippet: str = "",
    allow_snippet_match: bool = False,
) -> bool:
    normalized = normalize_company_name(company_name)
    if not normalized:
        return False

    title_lower = (title or "").lower()
    url_lower = (url or "").lower()
    snippet_lower = (snippet or "").lower()

    # Full match in title
    if normalized.lower() in title_lower:
        return True

    # Prefix match
    prefixes = [
        normalized[: min(8, len(normalized))].lower(),
        normalized[: min(6, len(normalized))].lower(),
        normalized[:4].lower() if len(normalized) >= 4 else normalized.lower(),
    ]
    for prefix in prefixes:
        if prefix and (prefix in title_lower or prefix in url_lower):
            return True

    # ASCII variant
    ascii_name = extract_ascii_name(company_name)
    if ascii_name and ascii_name in url_lower:
        return True

    if allow_snippet_match and snippet_lower:
        if normalized.lower() in snippet_lower:
            return True
        for prefix in prefixes:
            if prefix and prefix in snippet_lower:
                return True

    return False


def _is_short_company_name(company_name: str) -> bool:
    normalized = normalize_company_name(company_name)
    if not normalized:
        return False
    cleaned = re.sub(r"[^a-zA-Z0-9]", "", normalized)
    if not cleaned:
        return False
    if not cleaned.isascii():
        return False
    return len(cleaned) <= 3


def _has_short_name_allowed_tld(domain: str) -> bool:
    return any(domain.endswith(tld) for tld in SHORT_NAME_OFFICIAL_TLDS)


def _is_official_domain(
    domain: str,
    patterns: list[str],
    short_name_guard: bool,
) -> bool:
    if not patterns:
        return False

    if short_name_guard:
        dotted = [p for p in patterns if "." in p]
        if dotted:
            return any(_domain_pattern_matches(domain, pattern) for pattern in dotted)
        if not _has_short_name_allowed_tld(domain):
            return False

    return any(_domain_pattern_matches(domain, pattern) for pattern in patterns)


def _resolve_site_domains(
    domain_profile: dict,
    preferred_domain: str | None,
    max_domains: int = 2,
) -> list[str]:
    if preferred_domain:
        return [preferred_domain]

    patterns = domain_profile.get("official_patterns") or []
    dotted: list[str] = []
    seen: set[str] = set()
    for pattern in patterns:
        if "." not in pattern:
            continue
        key = pattern.lower()
        if key in seen:
            continue
        seen.add(key)
        dotted.append(pattern)
        if len(dotted) >= max_domains:
            break

    return dotted


def _build_site_queries(base_queries: list[str], site_domains: list[str]) -> list[str]:
    if not base_queries or not site_domains:
        return []
    queries: list[str] = []
    for domain in site_domains:
        for q in base_queries:
            queries.append(f"{q} site:{domain}")

    seen = set()
    deduped: list[str] = []
    for q in queries:
        key = q.lower().strip()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(q)

    return deduped


def _prefilter_results(
    results: list[WebSearchResult],
    company_name: str,
    official_patterns: list[str],
    strict_match: bool,
    allow_aggs: bool,
    allow_snippet_match: bool,
    short_name_guard: bool,
    content_type: str | None,
    parent_allowed: bool,
    target_intent: str,
) -> list[WebSearchResult]:
    filtered: list[WebSearchResult] = []
    lower_content_type = content_type or ""
    exclude_external = lower_content_type in EXTERNAL_STRICT_CATEGORIES
    exclude_faq = lower_content_type in FAQ_EXCLUDE_CATEGORIES
    enforce_intent_gate = lower_content_type in INTENT_GATE_CATEGORIES
    for result in results:
        domain = result.domain
        url_lower = (result.url or "").lower()

        # Hard exclude known irrelevant domains
        if any(excl in domain for excl in EXCLUDED_DOMAINS):
            continue

        conflicts = get_conflicting_companies_for_domain(domain, company_name)
        if conflicts:
            result.is_conflict = True
            continue

        is_aggregator = any(agg in domain for agg in AGGREGATOR_DOMAINS)
        if not allow_aggs and is_aggregator:
            continue

        is_official = _is_official_domain(domain, official_patterns, short_name_guard)
        is_parent_site = is_parent_domain(result.url, company_name)
        result.is_parent = is_parent_site

        if is_parent_site and not parent_allowed:
            continue

        if exclude_faq and any(pattern in url_lower for pattern in FAQ_LIKE_PATTERNS):
            continue

        if exclude_external and not is_official and not (
            is_parent_site and parent_allowed
        ):
            continue

        company_match = _contains_company_name(
            company_name,
            title=result.title,
            url=result.url,
            snippet=result.snippet,
            allow_snippet_match=allow_snippet_match,
        )
        result.company_name_matched = company_match
        result.is_official = is_official

        # Short company names: only official domains are allowed
        if short_name_guard and not is_official:
            continue

        if strict_match and not is_official and not company_match:
            continue

        if enforce_intent_gate:
            intent_gate_score = _calculate_intent_match_score(result, target_intent)
            result.score_breakdown["intent_gate"] = intent_gate_score
            if intent_gate_score < INTENT_GATE_THRESHOLD:
                continue

        filtered.append(result)

    return filtered


def _score_ambiguous_terms(
    target_intent: str, text_lower: str, text_compact: str
) -> float:
    score = 0.0
    # message
    rule = AMBIGUOUS_RULES.get("message")
    if rule and target_intent == rule["intent"]:
        tokens = rule["tokens"]
        if any(_term_in_text(text_lower, text_compact, t) for t in tokens):
            score += 0.5
            if any(_term_in_text(text_lower, text_compact, t) for t in rule["context"]):
                score += 2.0

    # news
    rule = AMBIGUOUS_RULES.get("news")
    if rule:
        tokens = rule["tokens"]
        if any(_term_in_text(text_lower, text_compact, t) for t in tokens):
            press_ctx = any(
                _term_in_text(text_lower, text_compact, t) for t in rule["press_context"]
            )
            ir_ctx = any(
                _term_in_text(text_lower, text_compact, t) for t in rule["ir_context"]
            )
            if target_intent == rule["press_intent"]:
                score += 0.5
                if press_ctx:
                    score += 2.0
            elif target_intent == rule["ir_intent"]:
                score += 0.5
                if ir_ctx:
                    score += 2.0
            elif target_intent == rule["fallback_intent"] and not press_ctx and not ir_ctx:
                score += 0.5

    # career
    rule = AMBIGUOUS_RULES.get("career")
    if rule and target_intent == rule["intent"]:
        tokens = rule["tokens"]
        if any(_term_in_text(text_lower, text_compact, t) for t in tokens):
            score += 0.5
            if any(_term_in_text(text_lower, text_compact, t) for t in rule["context"]):
                score += 2.0

    return score


def _detect_year_score(
    text_lower: str,
    graduation_year: int | None,
    result: WebSearchResult,
) -> float:
    if not graduation_year:
        return 0.0
    year_short = str(graduation_year % 100)
    year_full = str(graduation_year)

    if year_short in text_lower or year_full in text_lower:
        result.year_matched = True
        return 1.0

    years = re.findall(r"(\d{2})卒|20(\d{2})", text_lower)
    for match in years:
        detected = match[0] or match[1]
        if detected and detected != year_short and detected != year_full[-2:]:
            return -1.5
    return 0.0


def _compute_intent_matches(result: WebSearchResult) -> dict[str, dict[str, bool]]:
    text_lower, text_compact = _normalize_text_for_match(
        f"{result.title} {result.snippet}"
    )
    url_lower = (result.url or "").lower()

    matches: dict[str, dict[str, bool]] = {}
    profiles = get_all_intent_profiles()
    for ct, profile in profiles.items():
        strong_hits = _match_terms(
            text_lower, text_compact, list(profile.strong_keywords)
        )
        weak_hits = _match_terms(
            text_lower, text_compact, list(profile.weak_keywords), ignore=AMBIGUOUS_TOKENS
        )
        url_hits = _match_url_terms(
            url_lower, list(profile.url_patterns), ignore=AMBIGUOUS_TOKENS
        )
        matches[ct] = {
            "strong": bool(strong_hits),
            "weak_text": bool(weak_hits),
            "weak_url": bool(url_hits),
        }
    return matches


def calculate_intent_score(
    result: WebSearchResult,
    target_intent: str,
    graduation_year: int | None,
) -> float:
    intent_matches = _compute_intent_matches(result)

    text_lower, text_compact = _normalize_text_for_match(
        f"{result.title} {result.snippet}"
    )

    breakdown: dict[str, float] = {}
    score = 0.0

    target = intent_matches.get(target_intent, {})
    if target.get("strong"):
        score += 4.0
        breakdown["intent_strong"] = 4.0
    if target.get("weak_text"):
        score += 1.5
        breakdown["intent_weak_text"] = 1.5
    if target.get("weak_url"):
        score += 0.8
        breakdown["intent_weak_url"] = 0.8

    ambiguous_score = _score_ambiguous_terms(target_intent, text_lower, text_compact)
    if ambiguous_score:
        score += ambiguous_score
        breakdown["intent_ambiguous"] = ambiguous_score

    other_strong = any(
        ct != target_intent and flags.get("strong")
        for ct, flags in intent_matches.items()
    )
    other_weak = any(
        ct != target_intent
        and (flags.get("weak_text") or flags.get("weak_url"))
        for ct, flags in intent_matches.items()
    )
    if other_strong:
        score -= 5.0
        breakdown["intent_mismatch_strong"] = -5.0
    elif other_weak:
        score -= 2.0
        breakdown["intent_mismatch_weak"] = -2.0

    # Graduation year penalty/bonus (new-grad only)
    if target_intent == "new_grad_recruitment":
        year_score = _detect_year_score(text_lower, graduation_year, result)
        if year_score:
            score += year_score
            breakdown["year_score"] = year_score
            result.year_score = year_score

    result.score_breakdown.update(breakdown)
    return score


def _calculate_intent_match_score(
    result: WebSearchResult,
    target_intent: str,
) -> float:
    intent_matches = _compute_intent_matches(result)
    text_lower, text_compact = _normalize_text_for_match(
        f"{result.title} {result.snippet}"
    )

    score = 0.0
    target = intent_matches.get(target_intent, {})
    if target.get("strong"):
        score += 4.0
    if target.get("weak_text"):
        score += 1.5
    if target.get("weak_url"):
        score += 0.8

    score += _score_ambiguous_terms(target_intent, text_lower, text_compact)

    other_strong = any(
        ct != target_intent and flags.get("strong")
        for ct, flags in intent_matches.items()
    )
    other_weak = any(
        ct != target_intent
        and (flags.get("weak_text") or flags.get("weak_url"))
        for ct, flags in intent_matches.items()
    )
    if other_strong:
        score -= 5.0
    elif other_weak:
        score -= 2.0

    return score


def calculate_domain_score(
    result: WebSearchResult,
    company_name: str,
    domain_profile: dict,
    preferred_domain: str | None,
    allow_aggregators: bool,
) -> float:
    score = 0.0
    breakdown: dict[str, float] = {}

    domain = result.domain
    official_patterns = list(domain_profile.get("official_patterns") or [])
    if preferred_domain and preferred_domain not in official_patterns:
        official_patterns.insert(0, preferred_domain)
    parent_allowed = bool(domain_profile.get("parent_allowed"))

    short_name_guard = _is_short_company_name(company_name)
    is_official = _is_official_domain(domain, official_patterns, short_name_guard)

    result.is_official = is_official

    if is_official:
        score = max(score, 3.5)
        breakdown["official_domain"] = 3.5

    if preferred_domain and _domain_pattern_matches(domain, preferred_domain):
        score = max(score, 2.0)
        breakdown["preferred_domain"] = 2.0

    is_parent_site = is_parent_domain(result.url, company_name)
    if is_parent_site and parent_allowed:
        score += 1.0
        breakdown["parent_allowed"] = 1.0
    result.is_parent = is_parent_site

    is_sub, _ = is_subsidiary_domain(result.url, company_name)
    if is_sub:
        score -= 2.0
        breakdown["subsidiary_penalty"] = -2.0
    result.is_subsidiary = is_sub

    is_aggregator = any(agg in domain for agg in AGGREGATOR_DOMAINS)
    if is_aggregator and allow_aggregators:
        score -= 3.0
        breakdown["aggregator"] = -3.0
    result.is_aggregator = is_aggregator

    if result.is_official:
        result.source_type = "official"
    elif result.is_aggregator:
        result.source_type = "aggregator"
    elif result.is_parent:
        result.source_type = "parent"
    elif result.is_subsidiary:
        result.source_type = "subsidiary"
    else:
        result.source_type = "other"

    result.domain_score = score
    result.score_breakdown.update(breakdown)
    return score


def calculate_company_score(
    result: WebSearchResult, company_name: str
) -> float:
    score = 0.0
    breakdown: dict[str, float] = {}
    normalized = normalize_company_name(company_name).lower()
    title_lower = (result.title or "").lower()
    snippet_lower = (result.snippet or "").lower()

    if normalized and normalized in title_lower:
        score += 2.0
        breakdown["company_title"] = 2.0
    if normalized and normalized in snippet_lower:
        score += 1.0
        breakdown["company_snippet"] = 1.0
    ascii_name = extract_ascii_name(company_name)
    if ascii_name and ascii_name in title_lower and "company_title_ascii" not in breakdown:
        score += 2.0
        breakdown["company_title_ascii"] = 2.0
    if ascii_name and ascii_name in snippet_lower and "company_snippet_ascii" not in breakdown:
        score += 1.0
        breakdown["company_snippet_ascii"] = 1.0

    result.company_score = score
    result.score_breakdown.update(breakdown)
    return score


def score_results(
    results: list[WebSearchResult],
    company_name: str,
    target_intent: str,
    domain_profile: dict,
    preferred_domain: str | None,
    allow_aggregators: bool,
    graduation_year: int | None,
) -> list[WebSearchResult]:
    for result in results:
        intent_score = calculate_intent_score(
            result, target_intent=target_intent, graduation_year=graduation_year
        )
        domain_score = calculate_domain_score(
            result,
            company_name=company_name,
            domain_profile=domain_profile,
            preferred_domain=preferred_domain,
            allow_aggregators=allow_aggregators,
        )
        company_score = calculate_company_score(result, company_name=company_name)
        if company_score > 0:
            result.company_name_matched = True
        result.intent_score_raw = intent_score + domain_score + company_score
        result.heuristic_score = result.intent_score_raw

    return results


def _domain_pattern_matches(domain: str, pattern: str) -> bool:
    """
    Check if domain matches pattern using segment-based matching.

    Avoids false positives from substring matching.
    e.g., "mec" matches "mec.co.jp" but not "mecyes.co.jp"
    """
    if len(pattern) < 3:
        from app.utils.company_names import get_short_domain_allowlist_patterns

        if pattern.lower() not in get_short_domain_allowlist_patterns():
            return False

    pattern_lower = pattern.lower()
    domain_lower = domain.lower()

    if "." in pattern_lower:
        if domain_lower == pattern_lower:
            return True
        if domain_lower.endswith("." + pattern_lower):
            return True
        # Allow multi-segment pattern like "bk.mufg"
        if re.search(rf"(?:^|\.){re.escape(pattern_lower)}(?:\.|$)", domain_lower):
            return True
        return False

    segments = domain_lower.split(".")
    for segment in segments:
        # Exact match
        if segment == pattern_lower:
            return True
        # Prefix match (e.g., "mec-recruit")
        if segment.startswith(pattern_lower + "-"):
            return True
        # Suffix match (e.g., "recruit-mec")
        if segment.endswith("-" + pattern_lower):
            return True

    return False


# =============================================================================
# Score Combination
# =============================================================================


def combine_scores(
    results: list[WebSearchResult],
    weights: dict[str, float] | None = None,
) -> list[WebSearchResult]:
    """
    Combine RRF, rerank, and intent/domain scores into final combined score.

    Args:
        results: Results with rrf_score and rerank_score already set
        weights: Score combination weights

    Returns:
        Results sorted by combined_score
    """
    if not results:
        return results

    weights = weights or {
        "rerank": WEIGHT_RERANK,
        "intent": WEIGHT_INTENT,
        "rrf": WEIGHT_RRF,
    }

    # Normalize scores to 0-1 range
    max_rrf = max((r.rrf_score for r in results), default=1) or 1
    max_rerank = max((r.rerank_score for r in results), default=0.0)
    raw_scores = [r.intent_score_raw for r in results]
    min_raw = min(raw_scores) if raw_scores else 0.0
    max_raw = max(raw_scores) if raw_scores else 0.0

    for result in results:
        norm_rrf = result.rrf_score / max_rrf
        if max_rerank <= 0:
            norm_rerank = 0.0
        else:
            norm_rerank = result.rerank_score / max_rerank
            norm_rerank = max(0.0, min(1.0, norm_rerank))
        # Fixed range normalization with bias
        norm_intent = 0.0
        if INTENT_SCORE_MAX > INTENT_SCORE_MIN:
            norm_intent = (result.intent_score_raw - INTENT_SCORE_MIN) / (
                INTENT_SCORE_MAX - INTENT_SCORE_MIN
            )
        if max_raw == min_raw:
            norm_intent = min(1.0, norm_intent + INTENT_SCORE_BIAS)
        norm_intent = max(0.0, min(1.0, norm_intent))

        result.combined_score = (
            weights["rerank"] * norm_rerank
            + weights["intent"] * norm_intent
            + weights["rrf"] * norm_rrf
        )

    # Sort by combined score
    results.sort(key=lambda x: x.combined_score, reverse=True)

    return results


# =============================================================================
# Light Verification
# =============================================================================


def _resolve_target_intent(search_intent: str, content_type: str | None) -> str:
    if content_type and get_intent_profile(content_type):
        return content_type
    mapping = {
        "recruitment": "new_grad_recruitment",
        "new_grad": "new_grad_recruitment",
        "midcareer": "midcareer_recruitment",
        "corporate_ir": "ir_materials",
        "corporate_about": "corporate_site",
        "ceo_message": "ceo_message",
        "employee_interviews": "employee_interviews",
        "press_release": "press_release",
        "csr": "csr_sustainability",
        "midterm_plan": "midterm_plan",
    }
    return mapping.get(search_intent, "corporate_site")


def _augment_site_queries(
    base_queries: list[str],
    domain_patterns: list[str] | None,
    preferred_domain: str | None,
) -> list[str]:
    site_domains: list[str] = []
    if preferred_domain:
        site_domains.append(preferred_domain)
    for pattern in domain_patterns or []:
        if "." in pattern:
            site_domains.append(pattern)

    # Deduplicate site domains
    seen = set()
    unique_domains = []
    for domain in site_domains:
        key = domain.lower()
        if key not in seen:
            seen.add(key)
            unique_domains.append(domain)

    if not unique_domains:
        return base_queries

    base_limit = max(1, WEB_SEARCH_MAX_QUERIES - min(3, len(unique_domains)))
    trimmed_base = base_queries[:base_limit]

    site_queries: list[str] = []
    for domain in unique_domains:
        for q in trimmed_base[:2]:
            site_queries.append(f"{q} site:{domain}")

    combined = trimmed_base + site_queries

    # Deduplicate while preserving order
    seen_q = set()
    deduped: list[str] = []
    for q in combined:
        key = q.lower().strip()
        if key in seen_q:
            continue
        seen_q.add(key)
        deduped.append(q)

    return deduped[:WEB_SEARCH_MAX_QUERIES]


async def verify_candidate_light(
    url: str, company_name: str, target_intent: str
) -> dict:
    cached = _get_verify_cached(url)
    if cached is not None:
        return cached

    try:
        html = await fetch_page_content(url, timeout=VERIFY_TIMEOUT)
    except Exception:
        data = {"company_match": False, "intent_match": False}
        _set_verify_cache(url, data)
        return data

    text = extract_text_from_html(html)
    text_lower, text_compact = _normalize_text_for_match(text)

    normalized = normalize_company_name(company_name).lower()
    ascii_name = extract_ascii_name(company_name)
    company_match = False
    if normalized and normalized in text_lower:
        company_match = True
    if ascii_name and ascii_name in text_lower:
        company_match = True

    intent_match = False
    profile = get_intent_profile(target_intent)
    if profile:
        strong = _match_terms(text_lower, text_compact, list(profile.strong_keywords))
        weak = _match_terms(text_lower, text_compact, list(profile.weak_keywords))
        intent_match = bool(strong or weak)

    data = {"company_match": company_match, "intent_match": intent_match}
    _set_verify_cache(url, data)
    return data


async def _apply_light_verification(
    results: list[WebSearchResult],
    company_name: str,
    target_intent: str,
) -> tuple[list[WebSearchResult], bool]:
    if not results:
        return results, False

    candidates = [
        r
        for r in results[:VERIFY_CANDIDATE_TOP_K]
        if r.intent_score_raw < VERIFY_INTENT_THRESHOLD
    ]
    if not candidates:
        return results, False

    semaphore = asyncio.Semaphore(VERIFY_MAX_CONCURRENCY)

    async def _verify(result: WebSearchResult) -> bool:
        async with semaphore:
            verdict = await verify_candidate_light(
                result.url, company_name, target_intent
            )
        updated = False
        if verdict.get("company_match"):
            result.intent_score_raw += 1.5
            result.score_breakdown["verify_company"] = 1.5
            updated = True
        if verdict.get("intent_match"):
            result.intent_score_raw += 2.0
            result.score_breakdown["verify_intent"] = 2.0
            updated = True
        if updated:
            result.heuristic_score = result.intent_score_raw
        return updated

    updates = await asyncio.gather(*[_verify(r) for r in candidates])
    return results, any(updates)


# =============================================================================
# Main Entry Point
# =============================================================================


async def hybrid_web_search(
    company_name: str,
    search_intent: str = "recruitment",
    graduation_year: int | None = None,
    selection_type: str | None = None,
    max_results: int = 10,
    domain_patterns: list[str] | None = None,
    use_cache: bool = True,
    cache_mode: str | None = None,
    content_type: str | None = None,
    preferred_domain: str | None = None,
    strict_company_match: bool | None = None,
    allow_aggregators: bool | None = None,
    allow_snippet_match: bool = False,
) -> list[WebSearchResult]:
    """
    Hybrid web search with RRF fusion and cross-encoder reranking.

    Pipeline:
    1. Generate query variations
    2. Execute parallel DuckDuckGo searches
    3. RRF fusion to merge results
    4. Cross-encoder reranking for semantic relevance
    5. Combine with heuristic scores
    6. Cache final results

    Args:
        company_name: Company name to search for
        search_intent: "recruitment" | "corporate_ir" | "corporate_about" | "new_grad" | ...
        graduation_year: Target graduation year (e.g., 2027)
        selection_type: "main_selection" | "internship" | None
        max_results: Maximum results to return
        domain_patterns: Known official domain patterns for scoring
        use_cache: Whether to use result caching
        cache_mode: "use" | "refresh" | "bypass"
        content_type: 9-category content type (optional)
        preferred_domain: Preferred domain (optional)
        strict_company_match: If True, require company match for non-official domains
        allow_aggregators: If True, allow aggregator domains
        allow_snippet_match: If True, allow snippet match in company check

    Returns:
        High-quality search results sorted by combined score
    """
    effective_mode = _normalize_cache_mode(
        cache_mode, "use" if use_cache else "bypass"
    )
    read_cache = effective_mode == "use"
    write_cache = effective_mode in {"use", "refresh"}

    cache_key = None
    if read_cache or write_cache:
        cache_key = _get_cache_key(
            company_name=company_name,
            search_intent=search_intent,
            graduation_year=graduation_year,
            selection_type=selection_type,
            content_type=content_type,
            preferred_domain=preferred_domain,
            strict_company_match=strict_company_match,
            allow_aggregators=allow_aggregators,
            allow_snippet_match=allow_snippet_match,
        )

    # Check cache
    if read_cache and cache_key:
        cached = _get_cached_results(cache_key)
        if cached:
            return cached[:max_results]

    logger.info(f"[WebSearch] Starting hybrid search for '{company_name}'")

    domain_profile = resolve_domain_profile(company_name, content_type)
    if domain_patterns:
        domain_profile["official_patterns"] = domain_patterns

    # Step 1: Generate query variations
    queries = generate_query_variations(
        company_name=company_name,
        search_intent=search_intent,
        graduation_year=graduation_year,
        selection_type=selection_type,
    )
    logger.debug(f"[WebSearch] Generated {len(queries)} query variations")

    # Step 2 & 3: Execute searches and RRF fusion
    results, raw_results = await search_with_rrf_fusion(
        queries=queries,
        max_results_per_query=WEB_SEARCH_RESULTS_PER_QUERY,
        rrf_k=WEB_SEARCH_RRF_K,
        return_raw=True,
    )

    if not results:
        logger.warning(f"[WebSearch] No results for '{company_name}'")
        return []

    logger.debug(f"[WebSearch] RRF merged {len(results)} unique results")

    # Step 3.5: Pre-filter (conflicts / strict match / aggregators)
    strict_match = True if strict_company_match is None else strict_company_match
    allow_aggs = True if allow_aggregators else False
    if content_type == "new_grad_recruitment" or search_intent in {
        "recruitment",
        "new_grad",
    }:
        allow_aggs = False
    official_patterns = domain_profile.get("official_patterns") or []

    if preferred_domain and preferred_domain not in official_patterns:
        official_patterns = [preferred_domain] + list(official_patterns)

    short_name_guard = _is_short_company_name(company_name)
    target_intent = _resolve_target_intent(search_intent, content_type)

    results = _prefilter_results(
        results=results,
        company_name=company_name,
        official_patterns=list(official_patterns),
        strict_match=strict_match,
        allow_aggs=allow_aggs,
        allow_snippet_match=allow_snippet_match,
        short_name_guard=short_name_guard,
        content_type=content_type,
        parent_allowed=bool(domain_profile.get("parent_allowed")),
        target_intent=target_intent,
    )

    official_count = sum(1 for r in results if r.is_official)
    should_rescue = (
        len(results) < WEB_SEARCH_SITE_RETRY_MIN_RESULTS or official_count == 0
    )

    if should_rescue:
        site_domains = _resolve_site_domains(
            domain_profile=domain_profile,
            preferred_domain=preferred_domain,
        )
        site_queries = _build_site_queries(queries, site_domains)
        if site_queries:
            logger.info(
                f"[WebSearch] Site rescue triggered (domains={site_domains}, "
                f"initial_count={len(results)}, official_count={official_count})"
            )
            site_results, site_raw = await search_with_rrf_fusion(
                queries=site_queries,
                max_results_per_query=WEB_SEARCH_RESULTS_PER_QUERY,
                rrf_k=WEB_SEARCH_RRF_K,
                return_raw=True,
            )
            combined_raw = (raw_results or []) + (site_raw or [])
            if combined_raw:
                results = rrf_merge_web_results(combined_raw, k=WEB_SEARCH_RRF_K)
                results = _prefilter_results(
                    results=results,
                    company_name=company_name,
                    official_patterns=list(official_patterns),
                    strict_match=strict_match,
                    allow_aggs=allow_aggs,
                    allow_snippet_match=allow_snippet_match,
                    short_name_guard=short_name_guard,
                    content_type=content_type,
                    parent_allowed=bool(domain_profile.get("parent_allowed")),
                    target_intent=target_intent,
                )
        else:
            logger.info(
                f"[WebSearch] Site rescue skipped (no dotted official domains)"
            )

    if not results:
        logger.warning(f"[WebSearch] No results after pre-filter for '{company_name}'")
        return []

    # Step 4: Cross-encoder reranking
    # Create combined query for reranking
    rerank_query = f"{company_name} {search_intent.replace('_', ' ')}"
    if graduation_year:
        rerank_query += f" {graduation_year}"

    results = rerank_web_results(
        query=rerank_query,
        results=results,
        top_k=WEB_SEARCH_RERANK_TOP_K,
    )

    # Step 5: Score + Combine
    results = score_results(
        results=results,
        company_name=company_name,
        target_intent=target_intent,
        domain_profile=domain_profile,
        preferred_domain=preferred_domain,
        allow_aggregators=allow_aggs,
        graduation_year=graduation_year,
    )
    results = combine_scores(results=results)

    # Step 6: Light verification (top-K only)
    results, updated = await _apply_light_verification(
        results, company_name=company_name, target_intent=target_intent
    )
    if updated:
        results = combine_scores(results=results)

    # Limit to max_results
    results = results[:max_results]

    logger.info(
        f"[WebSearch] Completed: {len(results)} results for '{company_name}' "
        f"(top score: {results[0].combined_score:.3f})"
        if results
        else ""
    )

    # Cache results
    if write_cache and results and cache_key:
        _set_cache(cache_key, results)

    return results
