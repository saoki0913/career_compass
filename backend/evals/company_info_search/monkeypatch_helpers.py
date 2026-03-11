"""Monkeypatch helpers for company info search evaluation."""

from __future__ import annotations

import sys
from typing import Any, Optional

from evals.company_info_search.config import SearchTestConfig
from evals.company_info_search.models import HybridRawResult


def _truncate(text: str, max_chars: int) -> str:
    t = (text or "").strip()
    if len(t) <= max_chars:
        return t
    return t[: max(0, max_chars - 3)] + "..."


def setup_search_patches(
    monkeypatch: Any,
    config: SearchTestConfig,
    limiter: Any,
    backend_root: Any,
    raw_by_run_key: dict[str, list[HybridRawResult]],
    current_run_key: dict[str, Optional[str]],
) -> Optional[Any]:
    """Apply all monkeypatches for the search test environment.

    Returns:
        snapshot_cache instance if enabled, else None.
    """
    import app.utils.web_search as web_search_mod
    from app.routers import company_info
    from evals.company_info_search.support.rate_limiter import rate_limited_request

    # Patch hybrid search constants
    monkeypatch.setattr(web_search_mod, "WEB_SEARCH_MAX_QUERIES", config.max_queries)
    monkeypatch.setattr(
        web_search_mod, "WEB_SEARCH_RESULTS_PER_QUERY", config.results_per_query
    )
    monkeypatch.setattr(web_search_mod, "WEB_SEARCH_RERANK_TOP_K", config.rerank_top_k)

    # Patch DDG search to be rate-limited
    original_search_ddg_async = web_search_mod._search_ddg_async

    async def _rate_limited_search_ddg_async(query: str, max_results: int = 8):
        return await rate_limited_request(
            original_search_ddg_async,
            query,
            max_results,
            rate_limiter=limiter,
        )

    # Optional: DDG response snapshot cache
    snapshot_mode = config.snapshot_mode
    snapshot_db = config.snapshot_db or str(
        backend_root / "evals" / "company_info_search" / "output" / "ddg_snapshots.db"
    )
    snapshot_cache = None

    if snapshot_mode != "live_only":
        from evals.company_info_search.support.snapshot_cache import SnapshotCache

        snapshot_cache = SnapshotCache(mode=snapshot_mode, db_path=snapshot_db)
        _final_search_fn = snapshot_cache.wrap(_rate_limited_search_ddg_async)
        sys.__stdout__.write(
            f"[live-search] Snapshot cache: mode={snapshot_mode}, "
            f"db={snapshot_db}, entries={snapshot_cache.entry_count()}\n"
        )
    else:
        _final_search_fn = _rate_limited_search_ddg_async

    monkeypatch.setattr(web_search_mod, "_search_ddg_async", _final_search_fn)

    # Patch company_info._search_with_ddgs
    original_search_with_ddgs = company_info._search_with_ddgs

    async def _wrapped_search_with_ddgs(
        query: str,
        max_results: int = 10,
        use_cache: bool = True,
        cache_mode: str | None = None,
        retry_on_low_results: bool = True,
        min_results_for_retry: int = 3,
    ):
        await limiter.acquire()
        return await original_search_with_ddgs(
            query=query,
            max_results=max_results,
            use_cache=(config.cache_mode != "bypass"),
            cache_mode=config.cache_mode,
            retry_on_low_results=retry_on_low_results,
            min_results_for_retry=min_results_for_retry,
        )

    monkeypatch.setattr(company_info, "_search_with_ddgs", _wrapped_search_with_ddgs)

    # Patch hybrid_web_search to capture raw results
    original_hybrid_web_search = company_info.hybrid_web_search

    async def _wrapped_hybrid_web_search(*args: Any, **kwargs: Any):
        kwargs["cache_mode"] = config.cache_mode
        kwargs["use_cache"] = config.cache_mode != "bypass"
        results = await original_hybrid_web_search(*args, **kwargs)

        key = current_run_key.get("key")
        if key:
            simplified: list[HybridRawResult] = []
            for r in results[: max(config.report_top_n, config.max_results)]:
                simplified.append(
                    HybridRawResult(
                        url=getattr(r, "url", ""),
                        domain=getattr(r, "domain", ""),
                        title=_truncate(getattr(r, "title", ""), 120),
                        snippet=_truncate(getattr(r, "snippet", ""), 200),
                        rrf_score=float(getattr(r, "rrf_score", 0.0) or 0.0),
                        rerank_score=float(getattr(r, "rerank_score", 0.0) or 0.0),
                        combined_score=float(
                            getattr(r, "combined_score", 0.0) or 0.0
                        ),
                        source_type=str(getattr(r, "source_type", "") or ""),
                        is_official=bool(getattr(r, "is_official", False)),
                        is_parent=bool(getattr(r, "is_parent", False)),
                        is_subsidiary=bool(getattr(r, "is_subsidiary", False)),
                        company_name_matched=bool(
                            getattr(r, "company_name_matched", False)
                        ),
                        year_matched=bool(getattr(r, "year_matched", False)),
                    )
                )
            raw_by_run_key[key] = simplified
        return results

    monkeypatch.setattr(company_info, "hybrid_web_search", _wrapped_hybrid_web_search)

    return snapshot_cache
