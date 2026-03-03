"""
Search execution runner.

Extracts the search execution loop from test_live_company_info_search_report.py
(lines 746-937) into a composable class.
"""

from __future__ import annotations

import contextlib
import os
import sys
from dataclasses import asdict
from datetime import datetime
from pathlib import Path
from typing import Any, AsyncIterator, Optional
from urllib.parse import urlparse

from tests.search_eval.config import SearchTestConfig
from tests.search_eval.models import HybridRawResult, RunRecord


def _truncate(text: str, max_chars: int) -> str:
    t = (text or "").strip()
    if len(t) <= max_chars:
        return t
    return t[: max(0, max_chars - 3)] + "..."


def _pydantic_to_dict(obj: Any) -> dict[str, Any]:
    if obj is None:
        return {}
    if hasattr(obj, "model_dump"):
        return obj.model_dump()
    if hasattr(obj, "dict"):
        return obj.dict()
    if isinstance(obj, dict):
        return dict(obj)
    return {"value": str(obj)}


def _compute_legacy_raw(
    candidates: list[dict[str, Any]],
    company_name: str,
    domain_patterns: list[str],
    graduation_year: int | None,
    _domain_pattern_matches_fn: Any,
    _contains_company_name_fn: Any,
) -> list[dict[str, Any]]:
    """Recompute raw metadata for Legacy search candidates."""
    results: list[dict[str, Any]] = []
    for c in candidates:
        url = c.get("url", "")
        title = c.get("title", "")

        try:
            domain = urlparse(url).netloc.lower()
        except Exception:
            domain = ""

        is_official = False
        if domain and domain_patterns:
            is_official = any(
                _domain_pattern_matches_fn(domain, pat) for pat in domain_patterns
            )

        company_matched = False
        try:
            company_matched = _contains_company_name_fn(
                company_name, title, url, ""
            )
        except Exception:
            pass

        year_matched = False
        if graduation_year:
            text = (url + " " + title).lower()
            year_short = str(graduation_year % 100)
            year_full = str(graduation_year)
            if year_short in text or year_full in text:
                year_matched = True

        results.append({
            "url": url,
            "domain": domain,
            "title": _truncate(title, 120),
            "snippet": _truncate(c.get("snippet", ""), 200),
            "source_type": c.get("source_type", ""),
            "is_official": is_official,
            "is_parent": False,
            "is_subsidiary": False,
            "company_name_matched": company_matched,
            "year_matched": year_matched,
        })
    return results


# Recruitment case definitions
RECRUIT_CASES = [
    ("recruitment_main", "main_selection"),
    ("recruitment_intern", "internship"),
]

# Corporate content types
CORPORATE_CONTENT_TYPES = [
    "new_grad_recruitment",
    "midcareer_recruitment",
    "corporate_site",
    "press_release",
    "ir_materials",
    "ceo_message",
    "employee_interviews",
    "csr_sustainability",
    "midterm_plan",
]


class SearchRunner:
    """Execute searches across companies and modes."""

    def __init__(
        self,
        config: SearchTestConfig,
        monkeypatch: Any,
        backend_root: Path,
    ):
        self.config = config
        self.monkeypatch = monkeypatch
        self.backend_root = backend_root
        self.started_at: Optional[datetime] = None
        self.finished_at: Optional[datetime] = None
        self._snapshot_cache: Optional[Any] = None
        self._limiter: Optional[Any] = None

        # Shared state for capturing raw results
        self._raw_by_run_key: dict[str, list[HybridRawResult]] = {}
        self._current_run_key: dict[str, Optional[str]] = {"key": None}

    async def execute(
        self,
        companies: list[str],
        company_industry_map: dict[str, str],
    ) -> list[RunRecord]:
        """Execute all search runs.

        Returns list of RunRecord (including meta records).
        """
        from app.routers import company_info
        from app.utils.company_names import (
            domain_pattern_matches,
            get_company_domain_patterns,
        )
        from app.utils.web_search import (
            generate_query_variations,
        )
        from tests.utils.rate_limiter import DistributedRateLimiter
        from tests.search_eval.monkeypatch_helpers import setup_search_patches

        # Setup rate limiter
        self._limiter = DistributedRateLimiter(
            tokens_per_second=self.config.tokens_per_second,
            max_tokens=self.config.max_tokens,
        )

        # Setup monkeypatches
        self._snapshot_cache = setup_search_patches(
            monkeypatch=self.monkeypatch,
            config=self.config,
            limiter=self._limiter,
            backend_root=self.backend_root,
            raw_by_run_key=self._raw_by_run_key,
            current_run_key=self._current_run_key,
        )

        _domain_pattern_matches_fn = domain_pattern_matches
        _contains_company_name_fn = company_info._contains_company_name

        grad_year = company_info._get_graduation_year()
        modes = self.config.modes

        self.started_at = datetime.now()
        run_records: list[RunRecord] = []

        devnull = open(os.devnull, "w", encoding="utf-8")
        try:
            for company_idx, company_name in enumerate(companies, start=1):
                patterns = get_company_domain_patterns(company_name)
                industry_label = company_industry_map.get(company_name, "?")
                sys.__stdout__.write(
                    f"[live-search] ({company_idx}/{len(companies)}) "
                    f"{company_name} [{industry_label}]\n"
                )
                sys.__stdout__.flush()

                for mode in modes:
                    self.monkeypatch.setattr(
                        company_info, "USE_HYBRID_SEARCH", mode == "hybrid"
                    )

                    # Recruitment runs
                    for kind, selection_type in RECRUIT_CASES:
                        run_key = f"{company_name}::{mode}::{kind}"
                        self._current_run_key["key"] = run_key

                        record = RunRecord(
                            mode=mode,
                            kind=kind,
                            company_name=company_name,
                            industry=company_industry_map.get(company_name),
                            params={
                                "selection_type": selection_type,
                                "graduation_year": grad_year,
                                "max_results": self.config.max_results,
                                "allow_snippet_match": self.config.allow_snippet_match,
                                "cache_mode": self.config.cache_mode,
                            },
                        )

                        if mode == "hybrid":
                            record.queries = generate_query_variations(
                                company_name=company_name,
                                search_intent="recruitment",
                                graduation_year=grad_year,
                                selection_type=selection_type,
                            )
                        else:
                            record.queries = company_info._build_recruit_queries(
                                company_name=company_name,
                                industry=None,
                                custom_query=None,
                                graduation_year=grad_year,
                                selection_type=selection_type,
                            )

                        try:
                            req = company_info.SearchPagesRequest(
                                company_name=company_name,
                                industry=None,
                                custom_query=None,
                                max_results=self.config.max_results,
                                graduation_year=grad_year,
                                selection_type=selection_type,
                                allow_snippet_match=self.config.allow_snippet_match,
                            )
                            with contextlib.redirect_stdout(
                                devnull
                            ), contextlib.redirect_stderr(devnull):
                                resp = await company_info.search_company_pages(req)

                            candidates = (resp or {}).get("candidates", [])
                            record.candidates = [
                                _pydantic_to_dict(c)
                                for c in candidates[: self.config.report_top_n]
                            ]
                            record.hybrid_raw_top = self._raw_by_run_key.get(
                                run_key, []
                            )

                            if mode == "legacy" and not record.hybrid_raw_top:
                                record.legacy_raw_top = _compute_legacy_raw(
                                    candidates=record.candidates,
                                    company_name=company_name,
                                    domain_patterns=patterns,
                                    graduation_year=grad_year,
                                    _domain_pattern_matches_fn=_domain_pattern_matches_fn,
                                    _contains_company_name_fn=_contains_company_name_fn,
                                )
                        except Exception as e:
                            record.error = str(e)[:500]

                        run_records.append(record)
                        self._current_run_key["key"] = None

                    # Corporate runs
                    for content_type in CORPORATE_CONTENT_TYPES:
                        kind = f"content_type:{content_type}"
                        run_key = f"{company_name}::{mode}::{kind}"
                        self._current_run_key["key"] = run_key

                        record = RunRecord(
                            mode=mode,
                            kind=kind,
                            company_name=company_name,
                            industry=company_industry_map.get(company_name),
                            params={
                                "content_type": content_type,
                                "search_type": "about",
                                "graduation_year": grad_year,
                                "max_results": self.config.max_results,
                                "strict_company_match": True,
                                "allow_aggregators": False,
                                "allow_snippet_match": self.config.allow_snippet_match,
                                "preferred_domain": None,
                                "cache_mode": self.config.cache_mode,
                            },
                        )

                        if mode == "hybrid":
                            search_intent = company_info.CONTENT_TYPE_SEARCH_INTENT.get(
                                content_type, "corporate_about"
                            )
                            record.queries = generate_query_variations(
                                company_name=company_name,
                                search_intent=search_intent,
                                graduation_year=grad_year,
                                selection_type=None,
                            )
                        else:
                            record.queries = company_info._build_corporate_queries(
                                company_name=company_name,
                                search_type="about",
                                custom_query=None,
                                preferred_domain=None,
                                content_type=content_type,
                            )

                        try:
                            req = company_info.SearchCorporatePagesRequest(
                                company_name=company_name,
                                search_type="about",
                                content_type=content_type,
                                graduation_year=grad_year,
                                custom_query=None,
                                preferred_domain=None,
                                strict_company_match=True,
                                allow_aggregators=False,
                                max_results=self.config.max_results,
                                allow_snippet_match=self.config.allow_snippet_match,
                                cache_mode=self.config.cache_mode,
                            )
                            with contextlib.redirect_stdout(
                                devnull
                            ), contextlib.redirect_stderr(devnull):
                                resp = await company_info.search_corporate_pages(req)

                            candidates = (resp or {}).get("candidates", [])
                            record.candidates = [
                                _pydantic_to_dict(c)
                                for c in candidates[: self.config.report_top_n]
                            ]
                            record.hybrid_raw_top = self._raw_by_run_key.get(
                                run_key, []
                            )

                            if mode == "legacy" and not record.hybrid_raw_top:
                                record.legacy_raw_top = _compute_legacy_raw(
                                    candidates=record.candidates,
                                    company_name=company_name,
                                    domain_patterns=patterns,
                                    graduation_year=grad_year,
                                    _domain_pattern_matches_fn=_domain_pattern_matches_fn,
                                    _contains_company_name_fn=_contains_company_name_fn,
                                )
                        except Exception as e:
                            record.error = str(e)[:500]

                        run_records.append(record)
                        self._current_run_key["key"] = None

                # Meta record per company
                run_records.append(
                    RunRecord(
                        mode="meta",
                        kind="company_context",
                        company_name=company_name,
                        industry=company_industry_map.get(company_name),
                        params={
                            "domain_patterns": patterns,
                            "sample_seed": self.config.sample_seed,
                            "sample_size": self.config.sample_size,
                        },
                    )
                )
        finally:
            devnull.close()

        self.finished_at = datetime.now()
        return run_records

    def get_stats(self) -> dict[str, Any]:
        """Return execution statistics."""
        stats: dict[str, Any] = {}
        if self.started_at and self.finished_at:
            stats["started_at"] = self.started_at.isoformat()
            stats["finished_at"] = self.finished_at.isoformat()
            stats["duration_seconds"] = round(
                (self.finished_at - self.started_at).total_seconds(), 2
            )
        if self._limiter:
            stats["rate_limiter"] = self._limiter.get_stats()
        if self._snapshot_cache:
            stats["snapshot_cache"] = {
                "mode": self.config.snapshot_mode,
                "db": self.config.snapshot_db,
                **getattr(self._snapshot_cache, "stats", {}),
            }
        else:
            stats["snapshot_cache"] = {"mode": "live_only"}
        return stats
