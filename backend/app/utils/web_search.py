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

WEB_SEARCH_MAX_QUERIES = 8  # Maximum query variations to generate
WEB_SEARCH_RESULTS_PER_QUERY = 8  # Results per DuckDuckGo search
WEB_SEARCH_RRF_K = 60  # RRF constant
WEB_SEARCH_RERANK_TOP_K = 20  # Top results to rerank

# Score combination weights
WEIGHT_RERANK = 0.5  # Semantic relevance
WEIGHT_HEURISTIC = 0.3  # Domain/keyword patterns
WEIGHT_RRF = 0.2  # Multi-query frequency

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
]

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

    # Metadata
    source_type: str = "other"  # "official", "aggregator", "other"
    year_matched: bool = False
    domain: str = ""

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
CACHE_MODES = {"use", "refresh", "bypass"}


def _get_cache_key(
    company_name: str,
    search_intent: str,
    graduation_year: int | None,
    selection_type: str | None,
) -> str:
    """Build cache key for hybrid search results."""
    parts = [
        company_name.lower(),
        search_intent,
        str(graduation_year) if graduation_year else "",
        selection_type or "",
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
    alias_name = (
        company_variants[2] if len(company_variants) > 2 else None
    )
    ascii_name = base_variants[2] if len(base_variants) > 2 else None

    # Year formats
    grad_year = graduation_year or _get_graduation_year()
    grad_year_short = grad_year % 100

    if search_intent == "recruitment":
        # Alias-first queries for brand/English names
        if alias_name:
            queries.extend(
                [
                    f"{alias_name} 採用",
                    f"{alias_name} recruit",
                ]
            )

        if selection_type == "internship":
            # Internship-focused queries
            queries.extend(
                [
                    f"{primary_name} インターン {grad_year_short}卒",
                    f"{short_name} インターンシップ 募集",
                    f"{primary_name} サマーインターン {grad_year}",
                    f"{short_name} インターン エントリー",
                    f"{primary_name} インターン 選考",
                    f"{short_name} インターンシップ {grad_year}",
                ]
            )
        elif selection_type == "main_selection":
            # Main selection focused queries
            queries.extend(
                [
                    f"{primary_name} 本選考 {grad_year_short}卒",
                    f"{short_name} 新卒採用 {grad_year}",
                    f"{primary_name} 本選考 エントリー",
                    f"{short_name} {grad_year_short}卒 選考",
                    f"{primary_name} 新卒 マイページ",
                    f"{short_name} 採用サイト {grad_year}",
                ]
            )
        else:
            # General recruitment queries
            queries.extend(
                [
                    f"{primary_name} 新卒採用 {grad_year_short}卒",
                    f"{short_name} 採用サイト {grad_year}",
                    f"{primary_name} 採用情報",
                    f"{short_name} 採用情報 {grad_year_short}卒",
                    f"{primary_name} キャリア採用",
                    f"{short_name} 募集要項",
                ]
            )

        # Add ASCII variant query if available
        if ascii_name:
            queries.append(f"{ascii_name} recruit {grad_year}")

    elif search_intent == "corporate_ir":
        queries.extend(
            [
                f"{primary_name} IR",
                f"{short_name} 投資家情報",
                f"{primary_name} 決算",
                f"{short_name} 有価証券報告書",
            ]
        )

    elif search_intent == "corporate_about":
        queries.extend(
            [
                f"{primary_name} 会社概要",
                f"{short_name} 企業情報",
                f"{primary_name} 社長メッセージ",
                f"{short_name} 事業内容",
            ]
        )

    # ===== Content Type Specific Search Intents =====

    elif search_intent == "new_grad":
        if alias_name:
            queries.extend(
                [
                    f"{alias_name} 新卒採用",
                    f"{alias_name} recruit",
                ]
            )
        # 新卒採用HP専用検索
        queries.extend(
            [
                f"{primary_name} 新卒採用",
                f"{short_name} 新卒 採用HP",
                f"{primary_name} 採用サイト",
                f"{short_name} リクルート 新卒",
                f"{primary_name} recruit",
                f"{short_name} 新卒採用 公式",
            ]
        )
        # Add ASCII variant
        if len(company_variants) > 2:
            ascii_name = company_variants[2]
            queries.append(f"{ascii_name} recruit")

    elif search_intent == "midcareer":
        if alias_name:
            queries.extend(
                [
                    f"{alias_name} キャリア採用",
                    f"{alias_name} career",
                ]
            )
        # 中途採用専用検索
        queries.extend(
            [
                f"{primary_name} 中途採用",
                f"{short_name} キャリア採用",
                f"{primary_name} 転職",
                f"{short_name} 経験者採用",
                f"{primary_name} career",
            ]
        )

    elif search_intent == "ceo_message":
        # 社長メッセージ専用検索
        queries.extend(
            [
                f"{primary_name} 社長メッセージ",
                f"{short_name} 代表挨拶",
                f"{primary_name} トップメッセージ",
                f"{short_name} 社長 挨拶",
                f"{primary_name} CEO message",
                f"{short_name} 経営者 メッセージ",
            ]
        )

    elif search_intent == "employee_interviews":
        # 社員インタビュー専用検索
        queries.extend(
            [
                f"{primary_name} 社員インタビュー",
                f"{short_name} 社員紹介",
                f"{primary_name} 先輩社員",
                f"{short_name} 社員の声",
                f"{primary_name} 社員 働く",
                f"{short_name} people interview",
            ]
        )

    elif search_intent == "csr":
        # CSR/サステナビリティ専用検索
        queries.extend(
            [
                f"{primary_name} CSR",
                f"{short_name} サステナビリティ",
                f"{primary_name} SDGs",
                f"{short_name} 社会貢献",
                f"{primary_name} sustainability",
            ]
        )

    elif search_intent == "midterm_plan":
        # 中期経営計画専用検索
        queries.extend(
            [
                f"{primary_name} 中期経営計画",
                f"{short_name} 経営計画",
                f"{primary_name} 中計",
                f"{short_name} 経営戦略",
                f"{primary_name} 事業計画",
            ]
        )

    elif search_intent == "press_release":
        # プレスリリース専用検索
        queries.extend(
            [
                f"{primary_name} プレスリリース",
                f"{short_name} ニュース",
                f"{primary_name} お知らせ",
                f"{short_name} ニュースリリース",
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
) -> list[WebSearchResult]:
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
        return []

    # Execute all searches in parallel
    tasks = [_search_ddg_async(q, max_results_per_query) for q in queries]
    results_by_query = await asyncio.gather(*tasks, return_exceptions=True)

    # Filter out exceptions and empty results
    valid_results = [r for r in results_by_query if isinstance(r, list) and r]

    if not valid_results:
        logger.warning("[WebSearch] All DDG searches failed or returned empty")
        return []

    logger.debug(f"[WebSearch] RRF merging {len(valid_results)} query results")

    return rrf_merge_web_results(valid_results, k=rrf_k)


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
# Heuristic Scoring
# =============================================================================


def calculate_heuristic_score(
    result: WebSearchResult,
    company_name: str,
    graduation_year: int | None = None,
    domain_patterns: list[str] | None = None,
) -> float:
    """
    Calculate heuristic score based on domain patterns, keywords, etc.

    This preserves the existing scoring logic from company_info.py
    """
    score = 0.0
    breakdown = {}

    url_lower = result.url.lower()
    title_lower = result.title.lower()
    snippet_lower = result.snippet.lower()
    domain = result.domain

    # Normalize company name for matching
    normalized_name = normalize_company_name(company_name).lower()

    # 1. Domain pattern matching (+4.0)
    if domain_patterns:
        for pattern in domain_patterns:
            if _domain_pattern_matches(domain, pattern):
                score += 4.0
                breakdown["domain_pattern"] = 4.0
                result.source_type = "official"
                break

    # 2. Company name in title (+3.0)
    if normalized_name in title_lower:
        score += 3.0
        breakdown["company_in_title"] = 3.0

    # 3. Recruitment subdomain (+3.0)
    for subdomain in RECRUIT_SUBDOMAINS:
        if domain.startswith(f"{subdomain}."):
            score += 3.0
            breakdown["recruit_subdomain"] = 3.0
            break

    # 4. Recruitment URL keywords (+3.0)
    for kw in RECRUIT_KEYWORDS_URL:
        if kw in url_lower:
            score += 3.0
            breakdown["recruit_url_keyword"] = 3.0
            break

    # 5. Recruitment title keywords (+2.0)
    for kw in RECRUIT_KEYWORDS_TITLE:
        if kw in title_lower:
            score += 2.0
            breakdown["recruit_title_keyword"] = 2.0
            break

    # 6. TLD scoring
    if domain.endswith(".co.jp"):
        score += 2.0
        breakdown["tld_co_jp"] = 2.0
    elif domain.endswith(".jp"):
        score += 1.5
        breakdown["tld_jp"] = 1.5
    elif domain.endswith(".com"):
        score += 1.0
        breakdown["tld_com"] = 1.0
    elif any(domain.endswith(bad) for bad in [".xyz", ".info", ".biz", ".site", ".dev", ".test"]):
        score -= 1.0
        breakdown["tld_low_quality"] = -1.0

    # 7. Company name in snippet (+2.0)
    if normalized_name in snippet_lower:
        score += 2.0
        breakdown["company_in_snippet"] = 2.0

    # 8. Graduation year matching (+1.0 / -2.0)
    if graduation_year:
        year_short = str(graduation_year % 100)
        year_full = str(graduation_year)
        combined = f"{url_lower} {title_lower} {snippet_lower}"

        if year_short in combined or year_full in combined:
            score += 1.0
            breakdown["year_match"] = 1.0
            result.year_matched = True
        else:
            # Check for different year (penalty)
            import re

            years = re.findall(r"(\d{2})卒|20(\d{2})", combined)
            for match in years:
                detected = match[0] or match[1]
                if detected and detected != year_short and detected != year_full[-2:]:
                    score -= 2.0
                    breakdown["year_mismatch"] = -2.0
                    break

    # 9. Aggregator penalty (-3.0)
    for agg_domain in AGGREGATOR_DOMAINS:
        if agg_domain in domain:
            score -= 3.0
            breakdown["aggregator"] = -3.0
            result.source_type = "aggregator"
            break

    # 10. Excluded domain penalty (-10.0)
    for excl_domain in EXCLUDED_DOMAINS:
        if excl_domain in domain:
            score -= 10.0
            breakdown["excluded"] = -10.0
            break

    result.heuristic_score = score
    result.score_breakdown = breakdown

    return score


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
    company_name: str,
    graduation_year: int | None = None,
    domain_patterns: list[str] | None = None,
    weights: dict[str, float] | None = None,
) -> list[WebSearchResult]:
    """
    Combine RRF, rerank, and heuristic scores into final combined score.

    Args:
        results: Results with rrf_score and rerank_score already set
        company_name: Company name for heuristic scoring
        graduation_year: Target graduation year
        domain_patterns: Known official domain patterns
        weights: Score combination weights

    Returns:
        Results sorted by combined_score
    """
    if not results:
        return results

    weights = weights or {
        "rerank": WEIGHT_RERANK,
        "heuristic": WEIGHT_HEURISTIC,
        "rrf": WEIGHT_RRF,
    }

    # Calculate heuristic scores
    for result in results:
        calculate_heuristic_score(
            result, company_name, graduation_year, domain_patterns
        )

    # Normalize scores to 0-1 range
    max_rrf = max((r.rrf_score for r in results), default=1) or 1
    max_rerank = max((r.rerank_score for r in results), default=1) or 1
    max_heuristic = max((r.heuristic_score for r in results), default=1) or 1
    min_heuristic = min((r.heuristic_score for r in results), default=0)

    # Shift heuristic to handle negative values
    heuristic_range = max_heuristic - min_heuristic or 1

    for result in results:
        norm_rrf = result.rrf_score / max_rrf
        norm_rerank = result.rerank_score / max_rerank if max_rerank > 0 else 0
        norm_heuristic = (result.heuristic_score - min_heuristic) / heuristic_range

        result.combined_score = (
            weights["rerank"] * norm_rerank
            + weights["heuristic"] * norm_heuristic
            + weights["rrf"] * norm_rrf
        )

    # Sort by combined score
    results.sort(key=lambda x: x.combined_score, reverse=True)

    return results


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
        search_intent: "recruitment" | "corporate_ir" | "corporate_about"
        graduation_year: Target graduation year (e.g., 2027)
        selection_type: "main_selection" | "internship" | None
        max_results: Maximum results to return
        domain_patterns: Known official domain patterns for scoring
        use_cache: Whether to use result caching
        cache_mode: "use" | "refresh" | "bypass"

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
            company_name, search_intent, graduation_year, selection_type
        )

    # Check cache
    if read_cache and cache_key:
        cached = _get_cached_results(cache_key)
        if cached:
            return cached[:max_results]

    logger.info(f"[WebSearch] Starting hybrid search for '{company_name}'")

    # Step 1: Generate query variations
    queries = generate_query_variations(
        company_name=company_name,
        search_intent=search_intent,
        graduation_year=graduation_year,
        selection_type=selection_type,
    )
    logger.debug(f"[WebSearch] Generated {len(queries)} query variations")

    # Step 2 & 3: Execute searches and RRF fusion
    results = await search_with_rrf_fusion(
        queries=queries,
        max_results_per_query=WEB_SEARCH_RESULTS_PER_QUERY,
        rrf_k=WEB_SEARCH_RRF_K,
    )

    if not results:
        logger.warning(f"[WebSearch] No results for '{company_name}'")
        return []

    logger.debug(f"[WebSearch] RRF merged {len(results)} unique results")

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

    # Step 5: Combine scores
    results = combine_scores(
        results=results,
        company_name=company_name,
        graduation_year=graduation_year,
        domain_patterns=domain_patterns,
    )

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
