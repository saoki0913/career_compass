"""Query-aware RAG gap analysis for agentic search decisions.

Evaluates whether a company's RAG corpus is sufficient for a given
query + template combination. Used by:
1. POST /rag/gap-analysis — frontend RAG status UI
2. evaluate_query_gap() — ES review pipeline (Phase A trigger)
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Optional

from app.config import settings
from app.utils.content_types import CONTENT_TYPES

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Facet definitions
# ---------------------------------------------------------------------------

FACET_CONTENT_TYPE_MAP: dict[str, list[str]] = {
    "recruitment": ["new_grad_recruitment", "midcareer_recruitment"],
    "corporate_overview": ["corporate_site"],
    "business_strategy": ["ir_materials", "midterm_plan"],
    "culture": ["employee_interviews", "ceo_message"],
    "public_communications": ["press_release", "csr_sustainability"],
}

ALL_FACETS = list(FACET_CONTENT_TYPE_MAP.keys())

_CONTENT_TYPE_TO_FACET: dict[str, str] = {}
for _facet, _types in FACET_CONTENT_TYPE_MAP.items():
    for _ct in _types:
        _CONTENT_TYPE_TO_FACET[_ct] = _facet

STALE_THRESHOLD_DAYS = 30

# ---------------------------------------------------------------------------
# Template → required facets mapping
# ---------------------------------------------------------------------------

TEMPLATE_REQUIRED_FACETS: dict[str, list[str]] = {
    "company_motivation": ["recruitment", "business_strategy", "culture"],
    "intern_reason": ["recruitment", "culture"],
    "intern_goals": ["recruitment", "culture"],
    "post_join_goals": ["business_strategy", "recruitment", "culture"],
    "role_course_reason": ["recruitment", "business_strategy", "culture"],
    "basic": ["recruitment"],
    "self_pr": ["recruitment"],
    "gakuchika": [],
    "work_values": [],
}

GROUNDING_THRESHOLDS: dict[str, float] = {
    "deep": 0.55,
    "standard": 0.40,
    "light": 0.25,
    "none": 0.0,
}


def _get_grounding_level(template_type: str) -> str:
    from app.prompts.es_templates import TEMPLATE_DEFS

    tdef = TEMPLATE_DEFS.get(template_type, {})
    return tdef.get("grounding_level", "light")


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class FacetCoverage:
    facet: str
    coverage: float
    chunk_count: int
    freshest_at: Optional[str]
    source_diversity: int


@dataclass
class GapAnalysisResult:
    company_id: str
    overall_score: float
    facets: list[FacetCoverage]
    missing_facets: list[str]
    stale_sources: list[dict]
    duplicate_ratio: float
    next_fetch_targets: list[dict]
    needs_enrichment: bool


# ---------------------------------------------------------------------------
# Internal scoring helpers
# ---------------------------------------------------------------------------

_CHUNK_SATURATION = 12


def _facet_chunk_score(chunk_count: int) -> float:
    if chunk_count == 0:
        return 0.0
    return min(1.0, chunk_count / _CHUNK_SATURATION)


def _facet_search_score(hits: list[dict]) -> float:
    if not hits:
        return 0.0
    scores = [h.get("score", 0.0) for h in hits]
    top_score = max(scores) if scores else 0.0
    avg_score = sum(scores) / len(scores) if scores else 0.0
    return min(1.0, 0.6 * top_score + 0.4 * avg_score)


def _compute_facet_coverage(
    facet: str,
    chunk_counts: dict[str, int],
    search_hits_by_facet: dict[str, list[dict]],
    source_urls_by_facet: dict[str, set[str]],
    freshest_by_facet: dict[str, Optional[str]],
) -> FacetCoverage:
    content_types = FACET_CONTENT_TYPE_MAP[facet]
    total_chunks = sum(chunk_counts.get(ct, 0) for ct in content_types)

    chunk_score = _facet_chunk_score(total_chunks)
    search_score = _facet_search_score(search_hits_by_facet.get(facet, []))

    coverage = 0.5 * chunk_score + 0.5 * search_score

    return FacetCoverage(
        facet=facet,
        coverage=round(coverage, 3),
        chunk_count=total_chunks,
        freshest_at=freshest_by_facet.get(facet),
        source_diversity=len(source_urls_by_facet.get(facet, set())),
    )


def _classify_search_hits(
    results: list[dict],
) -> tuple[dict[str, list[dict]], dict[str, set[str]], dict[str, Optional[str]]]:
    hits_by_facet: dict[str, list[dict]] = {f: [] for f in ALL_FACETS}
    urls_by_facet: dict[str, set[str]] = {f: set() for f in ALL_FACETS}
    freshest_by_facet: dict[str, Optional[str]] = {f: None for f in ALL_FACETS}

    for r in results:
        meta = r.get("metadata", r)
        ct = meta.get("content_type", "corporate_site")
        facet = _CONTENT_TYPE_TO_FACET.get(ct)
        if facet is None:
            continue

        hits_by_facet[facet].append(r)

        url = meta.get("source_url", "")
        if url:
            urls_by_facet[facet].add(url)

        fetched_at = meta.get("fetched_at")
        if fetched_at:
            cur = freshest_by_facet[facet]
            if cur is None or fetched_at > cur:
                freshest_by_facet[facet] = fetched_at

    return hits_by_facet, urls_by_facet, freshest_by_facet


def _detect_stale_sources(results: list[dict]) -> list[dict]:
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=STALE_THRESHOLD_DAYS)
    stale: list[dict] = []
    seen_urls: set[str] = set()

    for r in results:
        meta = r.get("metadata", r)
        url = meta.get("source_url", "")
        fetched_at_str = meta.get("fetched_at")
        if not url or not fetched_at_str or url in seen_urls:
            continue
        seen_urls.add(url)

        try:
            fetched_at = datetime.fromisoformat(fetched_at_str.replace("Z", "+00:00"))
            if fetched_at < cutoff:
                stale.append({"url": url, "fetched_at": fetched_at_str})
        except (ValueError, TypeError):
            continue

    return stale


def _compute_duplicate_ratio(results: list[dict]) -> float:
    if not results:
        return 0.0
    texts = [r.get("text", r.get("document", ""))[:200] for r in results]
    unique = len(set(texts))
    return round(1.0 - unique / len(texts), 3) if texts else 0.0


def _build_fetch_targets(
    missing_facets: list[str],
    weak_facets: list[FacetCoverage],
) -> list[dict]:
    targets: list[dict] = []
    priority = 1

    for facet in missing_facets:
        content_types = FACET_CONTENT_TYPE_MAP.get(facet, [])
        targets.append({
            "content_type": content_types[0] if content_types else facet,
            "query_hint": _facet_query_hint(facet),
            "priority": priority,
        })
        priority += 1

    for fc in weak_facets:
        if fc.facet in missing_facets:
            continue
        content_types = FACET_CONTENT_TYPE_MAP.get(fc.facet, [])
        targets.append({
            "content_type": content_types[0] if content_types else fc.facet,
            "query_hint": _facet_query_hint(fc.facet),
            "priority": priority,
        })
        priority += 1

    return targets


_FACET_QUERY_HINTS: dict[str, str] = {
    "recruitment": "新卒採用 募集要項 選考フロー",
    "corporate_overview": "企業概要 事業内容 会社情報",
    "business_strategy": "中期経営計画 事業戦略 IR",
    "culture": "社員インタビュー 社風 働き方",
    "public_communications": "プレスリリース CSR サステナビリティ",
}


def _facet_query_hint(facet: str) -> str:
    return _FACET_QUERY_HINTS.get(facet, facet)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

_WEAK_FACET_THRESHOLD = 0.3


async def analyze_company_rag_gap(
    company_id: str,
    query: str,
    template_type: str,
) -> GapAnalysisResult:
    """Full gap analysis for HTTP endpoint and internal use."""
    from app.utils.vector_store import (
        get_company_rag_status,
        hybrid_search_company_context_enhanced,
    )

    rag_status = get_company_rag_status(company_id)
    chunk_counts: dict[str, int] = {}
    for ct in CONTENT_TYPES:
        chunk_counts[ct] = rag_status.get(f"{ct}_chunks", 0)

    search_results: list[dict] = []
    if rag_status.get("has_rag", False) and query:
        try:
            search_results = await hybrid_search_company_context_enhanced(
                company_id=company_id,
                query=query,
                n_results=15,
                content_types=None,
                expand_queries=settings.rag_use_query_expansion,
                rerank=settings.rag_use_rerank,
                short_circuit=True,
            )
        except Exception:
            logger.warning(
                "gap_analysis: hybrid search failed for %s", company_id, exc_info=True,
            )

    hits_by_facet, urls_by_facet, freshest_by_facet = _classify_search_hits(
        search_results
    )

    required_facets = TEMPLATE_REQUIRED_FACETS.get(template_type, [])
    grounding_level = _get_grounding_level(template_type)
    enrichment_threshold = GROUNDING_THRESHOLDS.get(grounding_level, 0.25)

    facet_coverages: list[FacetCoverage] = []
    for facet in ALL_FACETS:
        fc = _compute_facet_coverage(
            facet, chunk_counts, hits_by_facet, urls_by_facet, freshest_by_facet,
        )
        facet_coverages.append(fc)

    facet_map = {fc.facet: fc for fc in facet_coverages}
    missing: list[str] = []
    weak: list[FacetCoverage] = []
    for rf in required_facets:
        fc = facet_map.get(rf)
        if fc is None or fc.coverage == 0.0:
            missing.append(rf)
        elif fc.coverage < _WEAK_FACET_THRESHOLD:
            weak.append(fc)

    if required_facets:
        required_scores = [facet_map[f].coverage for f in required_facets if f in facet_map]
        overall = sum(required_scores) / len(required_scores) if required_scores else 0.0
    else:
        overall = 1.0

    stale = _detect_stale_sources(search_results)
    dup_ratio = _compute_duplicate_ratio(search_results)
    fetch_targets = _build_fetch_targets(missing, weak)

    needs_enrichment = (
        bool(required_facets)
        and overall < enrichment_threshold
    )

    return GapAnalysisResult(
        company_id=company_id,
        overall_score=round(overall, 3),
        facets=facet_coverages,
        missing_facets=missing,
        stale_sources=stale,
        duplicate_ratio=dup_ratio,
        next_fetch_targets=fetch_targets,
        needs_enrichment=needs_enrichment,
    )


async def evaluate_query_gap(
    company_id: str,
    query: str,
    template_type: str,
) -> tuple[bool, float]:
    """Lightweight wrapper for ES review pipeline.

    Returns (needs_enrichment, overall_score).
    """
    result = await analyze_company_rag_gap(company_id, query, template_type)
    return result.needs_enrichment, result.overall_score
