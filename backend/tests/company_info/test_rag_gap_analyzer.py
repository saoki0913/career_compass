"""Tests for backend/app/utils/rag_gap_analyzer.py"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest

from app.utils.rag_gap_analyzer import (
    ALL_FACETS,
    FACET_CONTENT_TYPE_MAP,
    GROUNDING_THRESHOLDS,
    TEMPLATE_REQUIRED_FACETS,
    GapAnalysisResult,
    _classify_search_hits,
    _compute_duplicate_ratio,
    _compute_facet_coverage,
    _detect_stale_sources,
    _facet_chunk_score,
    _facet_search_score,
    analyze_company_rag_gap,
    evaluate_query_gap,
)


# ---------------------------------------------------------------------------
# Unit: scoring helpers
# ---------------------------------------------------------------------------


class TestFacetChunkScore:
    def test_zero_chunks(self):
        assert _facet_chunk_score(0) == 0.0

    def test_saturated(self):
        assert _facet_chunk_score(12) == 1.0
        assert _facet_chunk_score(20) == 1.0

    def test_partial(self):
        score = _facet_chunk_score(6)
        assert 0.4 < score < 0.6


class TestFacetSearchScore:
    def test_no_hits(self):
        assert _facet_search_score([]) == 0.0

    def test_single_high_hit(self):
        hits = [{"score": 0.9}]
        score = _facet_search_score(hits)
        assert score == pytest.approx(0.9, abs=0.01)

    def test_mixed_hits(self):
        hits = [{"score": 0.8}, {"score": 0.4}, {"score": 0.2}]
        score = _facet_search_score(hits)
        assert 0.4 < score < 0.8


# ---------------------------------------------------------------------------
# Unit: classify search hits
# ---------------------------------------------------------------------------


class TestClassifySearchHits:
    def test_groups_by_facet(self):
        results = [
            {"metadata": {"content_type": "new_grad_recruitment", "source_url": "https://a.com"}},
            {"metadata": {"content_type": "ir_materials", "source_url": "https://b.com"}},
            {"metadata": {"content_type": "employee_interviews", "source_url": "https://c.com"}},
        ]
        hits, urls, freshest = _classify_search_hits(results)
        assert len(hits["recruitment"]) == 1
        assert len(hits["business_strategy"]) == 1
        assert len(hits["culture"]) == 1
        assert "https://a.com" in urls["recruitment"]

    def test_unknown_content_type_skipped(self):
        results = [{"metadata": {"content_type": "unknown_type"}}]
        hits, urls, freshest = _classify_search_hits(results)
        for facet in ALL_FACETS:
            assert len(hits[facet]) == 0

    def test_freshest_tracked(self):
        results = [
            {"metadata": {"content_type": "ceo_message", "fetched_at": "2026-04-01T00:00:00Z"}},
            {"metadata": {"content_type": "employee_interviews", "fetched_at": "2026-04-10T00:00:00Z"}},
        ]
        _, _, freshest = _classify_search_hits(results)
        assert freshest["culture"] == "2026-04-10T00:00:00Z"


# ---------------------------------------------------------------------------
# Unit: stale source detection
# ---------------------------------------------------------------------------


class TestStaleSources:
    def test_fresh_not_stale(self):
        now = datetime.now(timezone.utc)
        results = [
            {"metadata": {"source_url": "https://fresh.com", "fetched_at": now.isoformat()}},
        ]
        assert _detect_stale_sources(results) == []

    def test_old_is_stale(self):
        old = (datetime.now(timezone.utc) - timedelta(days=60)).isoformat()
        results = [
            {"metadata": {"source_url": "https://old.com", "fetched_at": old}},
        ]
        stale = _detect_stale_sources(results)
        assert len(stale) == 1
        assert stale[0]["url"] == "https://old.com"

    def test_deduplicates_urls(self):
        old = (datetime.now(timezone.utc) - timedelta(days=60)).isoformat()
        results = [
            {"metadata": {"source_url": "https://old.com", "fetched_at": old}},
            {"metadata": {"source_url": "https://old.com", "fetched_at": old}},
        ]
        assert len(_detect_stale_sources(results)) == 1


# ---------------------------------------------------------------------------
# Unit: duplicate ratio
# ---------------------------------------------------------------------------


class TestDuplicateRatio:
    def test_no_results(self):
        assert _compute_duplicate_ratio([]) == 0.0

    def test_all_unique(self):
        results = [{"text": "aaa"}, {"text": "bbb"}, {"text": "ccc"}]
        assert _compute_duplicate_ratio(results) == 0.0

    def test_all_same(self):
        results = [{"text": "same"}, {"text": "same"}, {"text": "same"}]
        ratio = _compute_duplicate_ratio(results)
        assert ratio > 0.5


# ---------------------------------------------------------------------------
# Unit: template requirements coverage
# ---------------------------------------------------------------------------


class TestTemplateRequirements:
    def test_all_template_types_have_requirements(self):
        from app.prompts.es_templates import TEMPLATE_DEFS

        for key in TEMPLATE_DEFS:
            assert key in TEMPLATE_REQUIRED_FACETS, f"Missing requirements for {key}"

    def test_required_facets_are_valid(self):
        for ttype, facets in TEMPLATE_REQUIRED_FACETS.items():
            for f in facets:
                assert f in ALL_FACETS, f"Invalid facet '{f}' in {ttype}"

    def test_deep_grounding_requires_more_facets(self):
        deep_types = [
            k for k, v in TEMPLATE_REQUIRED_FACETS.items()
            if len(v) >= 3
        ]
        for dt in deep_types:
            from app.prompts.es_templates import TEMPLATE_DEFS
            level = TEMPLATE_DEFS.get(dt, {}).get("grounding_level", "light")
            assert level in ("deep", "standard"), f"{dt} has many facets but grounding={level}"


# ---------------------------------------------------------------------------
# Integration: analyze_company_rag_gap (mocked dependencies)
# ---------------------------------------------------------------------------


def _make_rag_status(*, has_rag: bool = True, **overrides) -> dict:
    base = {
        "has_rag": has_rag,
        "total_chunks": 0,
        "new_grad_recruitment_chunks": 0,
        "midcareer_recruitment_chunks": 0,
        "corporate_site_chunks": 0,
        "ir_materials_chunks": 0,
        "ceo_message_chunks": 0,
        "employee_interviews_chunks": 0,
        "press_release_chunks": 0,
        "csr_sustainability_chunks": 0,
        "midterm_plan_chunks": 0,
        "last_updated": None,
    }
    base.update(overrides)
    return base


def _make_search_result(content_type: str, score: float, url: str = "https://example.com") -> dict:
    return {
        "text": f"sample text for {content_type}",
        "score": score,
        "metadata": {
            "content_type": content_type,
            "source_url": url,
            "fetched_at": datetime.now(timezone.utc).isoformat(),
        },
    }


@pytest.mark.asyncio
async def test_empty_rag_needs_enrichment_for_company_motivation():
    with (
        patch(
            "app.utils.vector_store.get_company_rag_status",
            return_value=_make_rag_status(has_rag=False),
        ),
        patch(
            "app.utils.vector_store.hybrid_search_company_context_enhanced",
            new_callable=AsyncMock,
            return_value=[],
        ),
    ):
        result = await analyze_company_rag_gap(
            company_id="test-co",
            query="なぜ御社を志望するのか",
            template_type="company_motivation",
        )

    assert isinstance(result, GapAnalysisResult)
    assert result.needs_enrichment is True
    assert result.overall_score == 0.0
    assert "recruitment" in result.missing_facets
    assert "business_strategy" in result.missing_facets


@pytest.mark.asyncio
async def test_rich_rag_no_enrichment_for_company_motivation():
    search_results = [
        _make_search_result("new_grad_recruitment", 0.85, "https://recruit.example.com/1"),
        _make_search_result("new_grad_recruitment", 0.75, "https://recruit.example.com/2"),
        _make_search_result("ir_materials", 0.80, "https://ir.example.com/1"),
        _make_search_result("midterm_plan", 0.70, "https://ir.example.com/2"),
        _make_search_result("employee_interviews", 0.82, "https://people.example.com"),
        _make_search_result("ceo_message", 0.65, "https://ceo.example.com"),
    ]
    rag_status = _make_rag_status(
        has_rag=True,
        total_chunks=50,
        new_grad_recruitment_chunks=15,
        ir_materials_chunks=10,
        midterm_plan_chunks=8,
        employee_interviews_chunks=10,
        ceo_message_chunks=5,
    )

    with (
        patch(
            "app.utils.vector_store.get_company_rag_status",
            return_value=rag_status,
        ),
        patch(
            "app.utils.vector_store.hybrid_search_company_context_enhanced",
            new_callable=AsyncMock,
            return_value=search_results,
        ),
    ):
        result = await analyze_company_rag_gap(
            company_id="rich-co",
            query="なぜ御社を志望するのか",
            template_type="company_motivation",
        )

    assert result.needs_enrichment is False
    assert result.overall_score > 0.55
    assert len(result.missing_facets) == 0


@pytest.mark.asyncio
async def test_gakuchika_never_needs_enrichment():
    with (
        patch(
            "app.utils.vector_store.get_company_rag_status",
            return_value=_make_rag_status(has_rag=False),
        ),
        patch(
            "app.utils.vector_store.hybrid_search_company_context_enhanced",
            new_callable=AsyncMock,
            return_value=[],
        ),
    ):
        result = await analyze_company_rag_gap(
            company_id="test-co",
            query="学生時代に力を入れたこと",
            template_type="gakuchika",
        )

    assert result.needs_enrichment is False
    assert result.overall_score == 1.0


@pytest.mark.asyncio
async def test_partial_coverage_triggers_enrichment():
    search_results = [
        _make_search_result("new_grad_recruitment", 0.4, "https://r.example.com"),
    ]
    rag_status = _make_rag_status(
        has_rag=True,
        total_chunks=5,
        new_grad_recruitment_chunks=3,
    )

    with (
        patch(
            "app.utils.vector_store.get_company_rag_status",
            return_value=rag_status,
        ),
        patch(
            "app.utils.vector_store.hybrid_search_company_context_enhanced",
            new_callable=AsyncMock,
            return_value=search_results,
        ),
    ):
        result = await analyze_company_rag_gap(
            company_id="partial-co",
            query="なぜ御社を志望するのか",
            template_type="company_motivation",
        )

    assert result.needs_enrichment is True
    assert "business_strategy" in result.missing_facets
    assert "culture" in result.missing_facets
    assert len(result.next_fetch_targets) > 0


@pytest.mark.asyncio
async def test_search_failure_graceful():
    with (
        patch(
            "app.utils.vector_store.get_company_rag_status",
            return_value=_make_rag_status(has_rag=True, total_chunks=10),
        ),
        patch(
            "app.utils.vector_store.hybrid_search_company_context_enhanced",
            new_callable=AsyncMock,
            side_effect=RuntimeError("search down"),
        ),
    ):
        result = await analyze_company_rag_gap(
            company_id="err-co",
            query="test query",
            template_type="company_motivation",
        )

    assert isinstance(result, GapAnalysisResult)


# ---------------------------------------------------------------------------
# evaluate_query_gap wrapper
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_evaluate_query_gap_returns_tuple():
    with (
        patch(
            "app.utils.vector_store.get_company_rag_status",
            return_value=_make_rag_status(has_rag=False),
        ),
        patch(
            "app.utils.vector_store.hybrid_search_company_context_enhanced",
            new_callable=AsyncMock,
            return_value=[],
        ),
    ):
        needs, score = await evaluate_query_gap(
            "co-1", "志望理由", "company_motivation",
        )

    assert isinstance(needs, bool)
    assert isinstance(score, float)
    assert needs is True
