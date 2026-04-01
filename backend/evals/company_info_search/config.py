"""
Configuration management for search evaluation tests.

Loads from environment variables (backward compatible) with optional
YAML config file support.
"""

from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


def _env_flag(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _env_str(name: str, default: str) -> str:
    value = os.getenv(name)
    if value is None:
        return default
    value = value.strip()
    return value if value else default


def _env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return int(value)
    except Exception:
        return default


def _env_float(name: str, default: float) -> float:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return float(value)
    except Exception:
        return default


def _env_json_map(name: str, default: dict[str, float]) -> dict[str, float]:
    value = os.getenv(name)
    if value is None:
        return dict(default)
    try:
        parsed = json.loads(value)
    except Exception:
        return dict(default)
    if not isinstance(parsed, dict):
        return dict(default)
    result: dict[str, float] = {}
    for key, raw in parsed.items():
        try:
            result[str(key)] = float(raw)
        except Exception:
            continue
    return result or dict(default)


DEFAULT_KIND_THRESHOLDS: dict[str, float] = {
    "recruitment_main": 0.95,
    "recruitment_intern": 0.94,
    "content_type:new_grad_recruitment": 0.95,
    "content_type:midcareer_recruitment": 0.95,
    "content_type:corporate_site": 0.95,
    "content_type:press_release": 0.94,
    "content_type:ir_materials": 0.93,
    "content_type:ceo_message": 0.93,
    "content_type:employee_interviews": 0.93,
    "content_type:csr_sustainability": 0.94,
    "content_type:midterm_plan": 0.93,
}


@dataclass
class SearchTestConfig:
    """Immutable test configuration loaded from env vars.

    All existing env vars continue to work unchanged.
    """

    # Sampling
    company_source: str = "curated"
    sample_seed: int = 15
    sample_size: int = 350
    per_industry_min: int = 1
    companies_override: Optional[str] = None

    # Search modes
    modes: list[str] = field(default_factory=lambda: ["hybrid", "legacy"])

    # Search parameters
    max_results: int = 5
    report_top_n: int = 10
    pass_top_n: int = 5
    allow_snippet_match: bool = False
    cache_mode: str = "bypass"

    # Hybrid tuning
    max_queries: int = 10
    fast_max_queries: int = 4
    results_per_query: int = 12
    rerank_top_k: int = 30

    # Rate limiting
    tokens_per_second: float = 1.0
    max_tokens: float = 1.0

    # Snapshot cache
    snapshot_mode: str = "live_only"
    snapshot_db: str = ""

    # Baseline
    baseline_path: Optional[str] = None
    baseline_save: bool = False
    baseline_auto_promote: bool = False

    # Thresholds
    fail_on_regression: bool = False
    fail_on_low_rate: bool = False
    min_overall_rate: float = 0.95
    regression_threshold_pp: float = 2.0
    primary_mode: str = "hybrid"
    min_recruitment_rate: float = 0.95
    min_corporate_rate: float = 0.94
    min_kind_rates: dict[str, float] = field(default_factory=lambda: dict(DEFAULT_KIND_THRESHOLDS))
    min_candidate_mrr: float = 0.75
    min_ndcg5: float = 0.80
    min_mean_grade_score: float = 0.85
    hard_max_official_rank: int = 3
    hard_min_metadata_score: float = 0.85
    soft_max_official_rank: int = 5
    soft_min_metadata_score: float = 0.75

    @classmethod
    def load(cls, web_search_defaults: Optional[dict] = None) -> SearchTestConfig:
        """Load config from environment variables.

        Args:
            web_search_defaults: Optional dict with WEB_SEARCH_MAX_QUERIES,
                WEB_SEARCH_RESULTS_PER_QUERY, WEB_SEARCH_RERANK_TOP_K
                from the web_search module (avoids import at module level).
        """
        ws = web_search_defaults or {}

        use_curated = _env_flag("LIVE_SEARCH_USE_CURATED", default=True)
        override_str = os.getenv("LIVE_SEARCH_COMPANIES")

        if override_str:
            company_source = "override"
        elif use_curated:
            company_source = "curated"
        else:
            company_source = "random"

        modes_str = _env_str("LIVE_SEARCH_MODES", "hybrid,legacy")
        modes = [
            m.strip().lower()
            for m in modes_str.split(",")
            if m.strip() and m.strip().lower() in {"hybrid", "legacy"}
        ]
        if not modes:
            modes = ["hybrid", "legacy"]

        cache_mode = _env_str("LIVE_SEARCH_CACHE_MODE", "bypass")
        if cache_mode not in {"use", "refresh", "bypass"}:
            cache_mode = "bypass"

        return cls(
            company_source=company_source,
            sample_seed=_env_int("LIVE_SEARCH_SAMPLE_SEED", 15),
            sample_size=_env_int("LIVE_SEARCH_SAMPLE_SIZE", 350),
            per_industry_min=_env_int("LIVE_SEARCH_PER_INDUSTRY_MIN", 1),
            companies_override=override_str,
            modes=modes,
            max_results=max(1, min(_env_int("LIVE_SEARCH_MAX_RESULTS", 5), 15)),
            report_top_n=max(1, min(_env_int("LIVE_SEARCH_REPORT_TOP_N", 10), 30)),
            pass_top_n=max(1, min(_env_int("LIVE_SEARCH_PASS_TOP_N", 5), 15)),
            allow_snippet_match=_env_flag("LIVE_SEARCH_ALLOW_SNIPPET_MATCH", default=False),
            cache_mode=cache_mode,
            max_queries=max(
                1,
                min(
                    _env_int("LIVE_SEARCH_MAX_QUERIES", ws.get("WEB_SEARCH_MAX_QUERIES", 10)),
                    10,
                ),
            ),
            fast_max_queries=max(
                1,
                min(
                    _env_int(
                        "LIVE_SEARCH_FAST_MAX_QUERIES",
                        ws.get("WEB_SEARCH_FAST_MAX_QUERIES", 4),
                    ),
                    10,
                ),
            ),
            results_per_query=max(
                1,
                min(
                    _env_int(
                        "LIVE_SEARCH_RESULTS_PER_QUERY",
                        ws.get("WEB_SEARCH_RESULTS_PER_QUERY", 12),
                    ),
                    12,
                ),
            ),
            rerank_top_k=max(
                1,
                min(
                    _env_int(
                        "LIVE_SEARCH_RERANK_TOP_K",
                        ws.get("WEB_SEARCH_RERANK_TOP_K", 30),
                    ),
                    30,
                ),
            ),
            tokens_per_second=_env_float("LIVE_SEARCH_TOKENS_PER_SECOND", 1.0),
            max_tokens=_env_float("LIVE_SEARCH_MAX_TOKENS", 1.0),
            snapshot_mode=os.getenv("SNAPSHOT_MODE", "live_only"),
            snapshot_db=os.getenv("SNAPSHOT_DB", ""),
            baseline_path=os.getenv("BASELINE_PATH"),
            baseline_save=_env_flag("BASELINE_SAVE", default=False),
            baseline_auto_promote=_env_flag("BASELINE_AUTO_PROMOTE", default=False),
            fail_on_regression=_env_flag("LIVE_SEARCH_FAIL_ON_REGRESSION", default=False),
            fail_on_low_rate=_env_flag("LIVE_SEARCH_FAIL_ON_LOW_RATE", default=False),
            min_overall_rate=_env_float("LIVE_SEARCH_MIN_SUCCESS_RATE", 0.95),
            regression_threshold_pp=_env_float("LIVE_SEARCH_REGRESSION_THRESHOLD_PP", 2.0),
            primary_mode=_env_str("LIVE_SEARCH_PRIMARY_MODE", "hybrid"),
            min_recruitment_rate=_env_float("LIVE_SEARCH_MIN_RECRUITMENT_RATE", 0.95),
            min_corporate_rate=_env_float("LIVE_SEARCH_MIN_CORPORATE_RATE", 0.94),
            min_kind_rates=_env_json_map("LIVE_SEARCH_MIN_KIND_RATES", DEFAULT_KIND_THRESHOLDS),
            min_candidate_mrr=_env_float("LIVE_SEARCH_MIN_CANDIDATE_MRR", 0.75),
            min_ndcg5=_env_float("LIVE_SEARCH_MIN_NDCG5", 0.80),
            min_mean_grade_score=_env_float("LIVE_SEARCH_MIN_MEAN_GRADE_SCORE", 0.85),
            hard_max_official_rank=_env_int("LIVE_SEARCH_HARD_MAX_OFFICIAL_RANK", 3),
            hard_min_metadata_score=_env_float("LIVE_SEARCH_HARD_MIN_METADATA_SCORE", 0.85),
            soft_max_official_rank=_env_int("LIVE_SEARCH_SOFT_MAX_OFFICIAL_RANK", 5),
            soft_min_metadata_score=_env_float("LIVE_SEARCH_SOFT_MIN_METADATA_SCORE", 0.75),
        )

    def should_run(self) -> bool:
        """Check if the test should run (RUN_LIVE_SEARCH=1)."""
        return _env_flag("RUN_LIVE_SEARCH", default=False)

    def fingerprint(self) -> str:
        """Hash of search-affecting parameters for baseline consistency."""
        relevant = {
            "company_source": self.company_source,
            "sample_seed": self.sample_seed,
            "sample_size": self.sample_size,
            "modes": sorted(self.modes),
            "max_results": self.max_results,
            "pass_top_n": self.pass_top_n,
            "allow_snippet_match": self.allow_snippet_match,
            "max_queries": self.max_queries,
            "fast_max_queries": self.fast_max_queries,
            "results_per_query": self.results_per_query,
            "rerank_top_k": self.rerank_top_k,
            "primary_mode": self.primary_mode,
            "min_overall_rate": self.min_overall_rate,
            "min_recruitment_rate": self.min_recruitment_rate,
            "min_corporate_rate": self.min_corporate_rate,
            "min_kind_rates": self.min_kind_rates,
            "min_candidate_mrr": self.min_candidate_mrr,
            "min_ndcg5": self.min_ndcg5,
            "min_mean_grade_score": self.min_mean_grade_score,
            "hard_max_official_rank": self.hard_max_official_rank,
            "hard_min_metadata_score": self.hard_min_metadata_score,
        }
        raw = json.dumps(relevant, sort_keys=True)
        return hashlib.sha256(raw.encode()).hexdigest()[:16]
