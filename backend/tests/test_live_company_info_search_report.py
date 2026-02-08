import contextlib
import json
import os
import random
import re
import sys
from collections import Counter
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urlparse

import pytest

from tests.fixtures.search_expectations import (
    RunJudgment,
    judge_corporate_run,
    judge_recruitment_run,
)


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


def _truncate(text: str, max_chars: int) -> str:
    t = (text or "").strip()
    if len(t) <= max_chars:
        return t
    return t[: max(0, max_chars - 3)] + "..."


def _pydantic_to_dict(obj: Any) -> dict[str, Any]:
    if obj is None:
        return {}
    # pydantic v2
    if hasattr(obj, "model_dump"):
        return obj.model_dump()
    # pydantic v1
    if hasattr(obj, "dict"):
        return obj.dict()
    if isinstance(obj, dict):
        return dict(obj)
    return {"value": str(obj)}


# =========================================================================
# Industry Mapping (runtime parse from company_mappings.json section markers)
# =========================================================================
def _build_industry_map(mappings: dict) -> dict[str, str]:
    """Parse _section_XX markers in mappings to build company -> industry map.

    Section markers follow the pattern:
      "_section_01": "=== 商社 ==="
    Companies between _section_01 and _section_02 belong to "商社".
    """
    industry_map: dict[str, str] = {}
    current_industry: str | None = None

    for key, value in mappings.items():
        if key.startswith("_section_") and isinstance(value, str):
            # Extract label: "=== 商社 ===" -> "商社"
            label = value.strip().strip("=").strip()
            current_industry = label if label else None
            continue
        if key.startswith("_"):  # Skip subsection markers, comments, etc.
            continue
        if current_industry and isinstance(key, str) and key:
            industry_map[key] = current_industry

    return industry_map


def _load_company_sample_by_industry(
    mappings_path: Path,
    total_sample_size: int,
    seed: int,
    per_industry_min: int = 1,
) -> tuple[list[str], dict[str, str]]:
    """Sample companies with industry coverage guarantee.

    Strategy:
    1. Build industry map from section markers
    2. Group companies by industry
    3. Allocate per_industry_min from each industry first
    4. Fill remaining quota from full pool
    """
    raw = json.loads(mappings_path.read_text(encoding="utf-8"))
    mappings = raw.get("mappings") if isinstance(raw, dict) else None
    if not isinstance(mappings, dict):
        return [], {}

    industry_map = _build_industry_map(mappings)

    # Group by industry
    by_industry: dict[str, list[str]] = {}
    for name, industry in industry_map.items():
        by_industry.setdefault(industry, []).append(name)

    rng = random.Random(seed)
    sampled: list[str] = []
    sampled_set: set[str] = set()

    # Phase 1: guarantee minimum per industry
    for industry in sorted(by_industry.keys()):
        companies = by_industry[industry]
        k = min(per_industry_min, len(companies))
        chosen = rng.sample(companies, k)
        for c in chosen:
            if c not in sampled_set:
                sampled.append(c)
                sampled_set.add(c)

    # Phase 2: fill remaining quota from full pool
    remaining = total_sample_size - len(sampled)
    if remaining > 0:
        pool = [name for name in industry_map if name not in sampled_set]
        rng.shuffle(pool)
        for c in pool[:remaining]:
            sampled.append(c)
            sampled_set.add(c)

    # Build industry map for sampled companies only
    sampled_industry = {c: industry_map[c] for c in sampled if c in industry_map}
    return sampled, sampled_industry


# =========================================================================
# Legacy raw metadata recomputation
# =========================================================================
def _compute_legacy_raw(
    candidates: list[dict[str, Any]],
    company_name: str,
    domain_patterns: list[str],
    graduation_year: int | None,
    _domain_pattern_matches_fn: Any,
    _contains_company_name_fn: Any,
) -> list[dict[str, Any]]:
    """Recompute raw metadata for Legacy search candidates.

    Since Legacy mode only returns SearchCandidate(url, title, confidence, source_type),
    we re-derive is_official, company_name_matched, year_matched from the URL/title.
    """
    results: list[dict[str, Any]] = []
    for c in candidates:
        url = c.get("url", "")
        title = c.get("title", "")

        # Domain extraction
        try:
            domain = urlparse(url).netloc.lower()
        except Exception:
            domain = ""

        # Official domain check (segment-based matching)
        is_official = False
        if domain and domain_patterns:
            is_official = any(
                _domain_pattern_matches_fn(domain, pat) for pat in domain_patterns
            )

        # Company name match
        company_matched = False
        try:
            company_matched = _contains_company_name_fn(
                company_name, title, url, ""
            )
        except Exception:
            pass

        # Year match (simple text check in URL + title)
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
            "is_parent": False,  # Cannot determine from Legacy candidates
            "is_subsidiary": False,
            "company_name_matched": company_matched,
            "year_matched": year_matched,
        })
    return results


@dataclass
class HybridRawResult:
    url: str
    domain: str
    title: str
    snippet: str
    rrf_score: float
    rerank_score: float
    combined_score: float
    source_type: str
    is_official: bool
    is_parent: bool
    is_subsidiary: bool
    company_name_matched: bool
    year_matched: bool


@dataclass
class RunRecord:
    mode: str
    kind: str
    company_name: str
    params: dict[str, Any] = field(default_factory=dict)
    queries: list[str] = field(default_factory=list)
    candidates: list[dict[str, Any]] = field(default_factory=list)
    hybrid_raw_top: list[HybridRawResult] = field(default_factory=list)
    legacy_raw_top: list[dict[str, Any]] = field(default_factory=list)
    error: Optional[str] = None
    judgment: Optional[RunJudgment] = None
    industry: Optional[str] = None


# =========================================================================
# Judgment dispatcher
# =========================================================================
def _judge_run(
    record: RunRecord,
    domain_patterns: list[str],
    top_n: int = 5,
) -> RunJudgment:
    """Apply pass/fail judgment to a completed run."""
    if record.error:
        return RunJudgment(
            passed=False,
            official_found=False,
            details=f"Error: {record.error[:200]}",
            failure_reasons=["error"],
        )

    # Build raw list (dicts) from either hybrid or legacy raw
    raw_dicts: list[dict[str, Any]] = []
    if record.hybrid_raw_top:
        raw_dicts = [asdict(r) for r in record.hybrid_raw_top]
    elif record.legacy_raw_top:
        raw_dicts = record.legacy_raw_top

    if record.kind.startswith("recruitment_"):
        return judge_recruitment_run(
            candidates=record.candidates,
            raw_results=raw_dicts,
            domain_patterns=domain_patterns,
            top_n=top_n,
        )
    elif record.kind.startswith("content_type:"):
        content_type = record.kind.split(":", 1)[1]
        return judge_corporate_run(
            candidates=record.candidates,
            raw_results=raw_dicts,
            domain_patterns=domain_patterns,
            content_type=content_type,
            top_n=top_n,
        )
    else:
        # meta or unknown
        return RunJudgment(passed=True, official_found=True, details="Meta/skip")


# =========================================================================
# Summary statistics computation
# =========================================================================
def _compute_summary_stats(
    run_records: list[RunRecord],
    modes: list[str],
    company_industry_map: dict[str, str],
) -> dict[str, Any]:
    """Compute aggregate summary statistics from judged run records."""

    def _rate(passed: int, total: int) -> float:
        return round(passed / total, 4) if total > 0 else 0.0

    def _stat(records: list[RunRecord]) -> dict[str, Any]:
        total = len(records)
        passed = sum(1 for r in records if r.judgment and r.judgment.passed)
        errors = sum(1 for r in records if r.error)
        return {
            "total": total,
            "passed": passed,
            "failed": total - passed,
            "errors": errors,
            "rate": _rate(passed, total),
        }

    # Filter to non-meta records
    search_runs = [
        r for r in run_records if r.mode != "meta" and r.kind != "company_context"
    ]

    # Overall by mode
    overall: dict[str, Any] = {}
    for mode in modes:
        mode_runs = [r for r in search_runs if r.mode == mode]
        overall[mode] = _stat(mode_runs)

    # Recruitment by mode
    recruitment: dict[str, Any] = {}
    for mode in modes:
        mode_runs = [
            r for r in search_runs
            if r.mode == mode and r.kind.startswith("recruitment_")
        ]
        recruitment[mode] = _stat(mode_runs)

    # Corporate by mode
    corporate: dict[str, Any] = {}
    for mode in modes:
        mode_runs = [
            r for r in search_runs
            if r.mode == mode and r.kind.startswith("content_type:")
        ]
        corporate[mode] = _stat(mode_runs)

    # By content type (recruitment kinds + corporate content types)
    all_kinds = sorted(set(r.kind for r in search_runs))
    by_content_type: dict[str, dict[str, Any]] = {}
    for kind in all_kinds:
        by_content_type[kind] = {}
        for mode in modes:
            mode_runs = [r for r in search_runs if r.mode == mode and r.kind == kind]
            by_content_type[kind][mode] = _stat(mode_runs)

    # By industry
    all_industries = sorted(set(company_industry_map.values()))
    by_industry: dict[str, dict[str, Any]] = {}
    for industry in all_industries:
        industry_companies = {
            c for c, ind in company_industry_map.items() if ind == industry
        }
        by_industry[industry] = {}
        for mode in modes:
            mode_runs = [
                r for r in search_runs
                if r.mode == mode and r.company_name in industry_companies
            ]
            by_industry[industry][mode] = _stat(mode_runs)

    # Metadata accuracy (only for non-error runs with judgments)
    metadata_accuracy: dict[str, dict[str, Any]] = {}
    metadata_fields = [
        "source_type_correct",
        "company_match_correct",
        "year_match_correct",
        "confidence_appropriate",
        "url_pattern_match",
    ]
    for mf in metadata_fields:
        metadata_accuracy[mf] = {}
        for mode in modes:
            mode_runs = [
                r for r in search_runs
                if r.mode == mode and r.judgment and not r.error
            ]
            # Filter to applicable runs
            if mf == "year_match_correct":
                mode_runs = [r for r in mode_runs if r.kind.startswith("recruitment_")]
            elif mf == "url_pattern_match":
                mode_runs = [r for r in mode_runs if r.kind.startswith("content_type:")]

            total = len(mode_runs)
            correct = sum(1 for r in mode_runs if getattr(r.judgment, mf, False))
            metadata_accuracy[mf][mode] = {
                "correct": correct,
                "total": total,
                "rate": _rate(correct, total),
            }

    # Failure analysis
    failure_reasons: Counter[str] = Counter()
    failing_companies: Counter[str] = Counter()
    for r in search_runs:
        if r.judgment and not r.judgment.passed:
            for reason in r.judgment.failure_reasons:
                failure_reasons[reason] += 1
            failing_companies[r.company_name] += 1

    return {
        "overall": overall,
        "recruitment": recruitment,
        "corporate": corporate,
        "by_content_type": by_content_type,
        "by_industry": by_industry,
        "metadata_accuracy": metadata_accuracy,
        "failure_analysis": {
            "top_reasons": failure_reasons.most_common(10),
            "failing_companies": failing_companies.most_common(10),
        },
    }


@pytest.mark.integration
@pytest.mark.slow
@pytest.mark.asyncio
async def test_live_company_info_search_report(monkeypatch: pytest.MonkeyPatch) -> None:
    if not _env_flag("RUN_LIVE_SEARCH", default=False):
        pytest.skip("Set RUN_LIVE_SEARCH=1 to enable live web search report test.")

    backend_root = Path(__file__).resolve().parent.parent
    sys.path.insert(0, str(backend_root))

    from app.routers import company_info  # noqa: E402
    from tests.utils.rate_limiter import (  # noqa: E402
        DistributedRateLimiter,
        rate_limited_request,
    )
    from app.utils.company_names import get_company_domain_patterns  # noqa: E402
    from app.utils.web_search import (  # noqa: E402
        HAS_DDGS,
        generate_query_variations,
        WEB_SEARCH_MAX_QUERIES,
        WEB_SEARCH_RESULTS_PER_QUERY,
        WEB_SEARCH_RERANK_TOP_K,
    )

    if not HAS_DDGS:
        pytest.skip("ddgs is not installed; live web search is unavailable.")

    # -------------------------------------------------------------------------
    # Config
    # -------------------------------------------------------------------------
    sample_seed = _env_int("LIVE_SEARCH_SAMPLE_SEED", 15)
    sample_size = _env_int("LIVE_SEARCH_SAMPLE_SIZE", 30)
    per_industry_min = _env_int("LIVE_SEARCH_PER_INDUSTRY_MIN", 1)
    modes = [
        m.strip().lower()
        for m in _env_str("LIVE_SEARCH_MODES", "hybrid,legacy").split(",")
        if m.strip()
    ]
    modes = [m for m in modes if m in {"hybrid", "legacy"}]
    if not modes:
        modes = ["hybrid", "legacy"]

    # In tests, default to bypass to reduce "it worked because cache" ambiguity.
    forced_cache_mode = _env_str("LIVE_SEARCH_CACHE_MODE", "bypass")
    if forced_cache_mode not in {"use", "refresh", "bypass"}:
        forced_cache_mode = "bypass"

    max_results = max(1, min(_env_int("LIVE_SEARCH_MAX_RESULTS", 5), 15))
    report_top_n = max(1, min(_env_int("LIVE_SEARCH_REPORT_TOP_N", 10), 30))
    allow_snippet_match = _env_flag("LIVE_SEARCH_ALLOW_SNIPPET_MATCH", default=False)
    pass_top_n = max(1, min(_env_int("LIVE_SEARCH_PASS_TOP_N", 5), 15))

    # Hybrid throttling (patch module-level constants for this test run only)
    patched_max_queries = max(
        1, min(_env_int("LIVE_SEARCH_MAX_QUERIES", WEB_SEARCH_MAX_QUERIES), 10)
    )
    patched_results_per_query = max(
        1,
        min(
            _env_int(
                "LIVE_SEARCH_RESULTS_PER_QUERY", WEB_SEARCH_RESULTS_PER_QUERY
            ),
            12,
        ),
    )
    patched_rerank_top_k = max(
        1, min(_env_int("LIVE_SEARCH_RERANK_TOP_K", WEB_SEARCH_RERANK_TOP_K), 30)
    )

    # Distributed rate limiter shared across processes (safe even without xdist)
    tokens_per_second = _env_float("LIVE_SEARCH_TOKENS_PER_SECOND", 1.0)
    max_tokens = _env_float("LIVE_SEARCH_MAX_TOKENS", 1.0)
    limiter = DistributedRateLimiter(
        tokens_per_second=tokens_per_second, max_tokens=max_tokens
    )

    # -------------------------------------------------------------------------
    # Sample companies (industry-balanced)
    # -------------------------------------------------------------------------
    mappings_path = backend_root / "data" / "company_mappings.json"
    companies, company_industry_map = _load_company_sample_by_industry(
        mappings_path=mappings_path,
        total_sample_size=sample_size,
        seed=sample_seed,
        per_industry_min=per_industry_min,
    )
    if not companies:
        pytest.skip("No companies found in company_mappings.json mappings.")

    # Log industry coverage
    industry_counts: Counter[str] = Counter()
    for c in companies:
        ind = company_industry_map.get(c, "unknown")
        industry_counts[ind] += 1
    sys.__stdout__.write(
        f"[live-search] Industry coverage: {dict(industry_counts)}\n"
    )
    sys.__stdout__.flush()

    # -------------------------------------------------------------------------
    # Monkeypatch: make Hybrid/Legacy reproducible & rate-limited
    # -------------------------------------------------------------------------
    import app.utils.web_search as web_search_mod  # noqa: E402

    # Patch hybrid search constants (reduce total DDG calls)
    monkeypatch.setattr(web_search_mod, "WEB_SEARCH_MAX_QUERIES", patched_max_queries)
    monkeypatch.setattr(
        web_search_mod,
        "WEB_SEARCH_RESULTS_PER_QUERY",
        patched_results_per_query,
    )
    monkeypatch.setattr(web_search_mod, "WEB_SEARCH_RERANK_TOP_K", patched_rerank_top_k)

    # Patch web_search._search_ddg_async to be rate-limited + retryable.
    original_search_ddg_async = web_search_mod._search_ddg_async

    async def _rate_limited_search_ddg_async(query: str, max_results: int = 8):
        return await rate_limited_request(
            original_search_ddg_async,
            query,
            max_results,
            rate_limiter=limiter,
        )

    monkeypatch.setattr(web_search_mod, "_search_ddg_async", _rate_limited_search_ddg_async)

    # Patch company_info._search_with_ddgs to force cache_mode and rate-limit per-query
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
        # Force cache behavior for test determinism.
        return await original_search_with_ddgs(
            query=query,
            max_results=max_results,
            use_cache=(forced_cache_mode != "bypass"),
            cache_mode=forced_cache_mode,
            retry_on_low_results=retry_on_low_results,
            min_results_for_retry=min_results_for_retry,
        )

    monkeypatch.setattr(company_info, "_search_with_ddgs", _wrapped_search_with_ddgs)

    # Patch company_info.hybrid_web_search to force cache_mode and capture raw results
    original_hybrid_web_search = company_info.hybrid_web_search
    raw_by_run_key: dict[str, list[HybridRawResult]] = {}
    current_run_key: dict[str, str | None] = {"key": None}

    async def _wrapped_hybrid_web_search(*args: Any, **kwargs: Any):
        kwargs["cache_mode"] = forced_cache_mode
        kwargs["use_cache"] = forced_cache_mode != "bypass"
        results = await original_hybrid_web_search(*args, **kwargs)

        key = current_run_key.get("key")
        if key:
            simplified: list[HybridRawResult] = []
            for r in results[: max(report_top_n, max_results)]:
                simplified.append(
                    HybridRawResult(
                        url=getattr(r, "url", ""),
                        domain=getattr(r, "domain", ""),
                        title=_truncate(getattr(r, "title", ""), 120),
                        snippet=_truncate(getattr(r, "snippet", ""), 200),
                        rrf_score=float(getattr(r, "rrf_score", 0.0) or 0.0),
                        rerank_score=float(getattr(r, "rerank_score", 0.0) or 0.0),
                        combined_score=float(getattr(r, "combined_score", 0.0) or 0.0),
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

    # Import functions needed for Legacy raw metadata recomputation
    _domain_pattern_matches_fn = company_info._domain_pattern_matches
    _contains_company_name_fn = company_info._contains_company_name

    # -------------------------------------------------------------------------
    # Define cases
    # -------------------------------------------------------------------------
    # Recruitment: main selection / internship
    recruit_cases = [
        ("recruitment_main", "main_selection"),
        ("recruitment_intern", "internship"),
    ]

    # Corporate: 9 content types
    corporate_content_types = [
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

    # graduation year: keep consistent with runtime default used by query generation
    # (use company_info._get_graduation_year for legacy alignment).
    grad_year = company_info._get_graduation_year()

    # -------------------------------------------------------------------------
    # Execute searches
    # -------------------------------------------------------------------------
    started_at = datetime.now()
    run_records: list[RunRecord] = []

    # Silence extremely verbose endpoint prints (they are designed for manual debugging).
    devnull = open(os.devnull, "w", encoding="utf-8")
    try:
        for company_idx, company_name in enumerate(companies, start=1):
            patterns = get_company_domain_patterns(company_name)
            # Minimal progress so user knows it's running.
            industry_label = company_industry_map.get(company_name, "?")
            sys.__stdout__.write(
                f"[live-search] ({company_idx}/{len(companies)}) {company_name} [{industry_label}]\n"
            )
            sys.__stdout__.flush()

            for mode in modes:
                monkeypatch.setattr(company_info, "USE_HYBRID_SEARCH", mode == "hybrid")

                # Recruitment runs
                for kind, selection_type in recruit_cases:
                    run_key = f"{company_name}::{mode}::{kind}"
                    current_run_key["key"] = run_key

                    record = RunRecord(
                        mode=mode,
                        kind=kind,
                        company_name=company_name,
                        industry=company_industry_map.get(company_name),
                        params={
                            "selection_type": selection_type,
                            "graduation_year": grad_year,
                            "max_results": max_results,
                            "allow_snippet_match": allow_snippet_match,
                            "cache_mode": forced_cache_mode,
                        },
                    )

                    # Queries used (mode-specific)
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
                            max_results=max_results,
                            graduation_year=grad_year,
                            selection_type=selection_type,
                            allow_snippet_match=allow_snippet_match,
                        )
                        with contextlib.redirect_stdout(devnull), contextlib.redirect_stderr(
                            devnull
                        ):
                            resp = await company_info.search_company_pages(req)

                        candidates = (resp or {}).get("candidates", [])
                        record.candidates = [
                            _pydantic_to_dict(c) for c in candidates[:report_top_n]
                        ]
                        record.hybrid_raw_top = raw_by_run_key.get(run_key, [])

                        # Legacy raw recomputation
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
                    current_run_key["key"] = None

                # Corporate runs
                for content_type in corporate_content_types:
                    kind = f"content_type:{content_type}"
                    run_key = f"{company_name}::{mode}::{kind}"
                    current_run_key["key"] = run_key

                    record = RunRecord(
                        mode=mode,
                        kind=kind,
                        company_name=company_name,
                        industry=company_industry_map.get(company_name),
                        params={
                            "content_type": content_type,
                            "search_type": "about",
                            "graduation_year": grad_year,
                            "max_results": max_results,
                            "strict_company_match": True,
                            "allow_aggregators": False,
                            "allow_snippet_match": allow_snippet_match,
                            "preferred_domain": None,
                            "cache_mode": forced_cache_mode,
                        },
                    )

                    # Queries used (mode-specific)
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
                            max_results=max_results,
                            allow_snippet_match=allow_snippet_match,
                            cache_mode=forced_cache_mode,
                        )
                        with contextlib.redirect_stdout(devnull), contextlib.redirect_stderr(
                            devnull
                        ):
                            resp = await company_info.search_corporate_pages(req)

                        candidates = (resp or {}).get("candidates", [])
                        record.candidates = [
                            _pydantic_to_dict(c) for c in candidates[:report_top_n]
                        ]
                        record.hybrid_raw_top = raw_by_run_key.get(run_key, [])

                        # Legacy raw recomputation
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
                    current_run_key["key"] = None

            # Also include mapping patterns for context in the report (per-company).
            # This is stored in a meta run record (non-search) to keep JSON simple.
            run_records.append(
                RunRecord(
                    mode="meta",
                    kind="company_context",
                    company_name=company_name,
                    industry=company_industry_map.get(company_name),
                    params={
                        "domain_patterns": patterns,
                        "sample_seed": sample_seed,
                        "sample_size": sample_size,
                    },
                )
            )
    finally:
        devnull.close()

    finished_at = datetime.now()

    # -------------------------------------------------------------------------
    # Judge each run
    # -------------------------------------------------------------------------
    patterns_cache: dict[str, list[str]] = {}

    for record in run_records:
        if record.mode == "meta" and record.kind == "company_context":
            continue

        # Get domain patterns (cached per company)
        if record.company_name not in patterns_cache:
            patterns_cache[record.company_name] = get_company_domain_patterns(
                record.company_name
            )
        domain_pats = patterns_cache[record.company_name]

        # Judge
        record.judgment = _judge_run(record, domain_pats, top_n=pass_top_n)

    # Compute summary statistics
    summary = _compute_summary_stats(run_records, modes, company_industry_map)

    # -------------------------------------------------------------------------
    # Write report
    # -------------------------------------------------------------------------
    output_dir = Path(__file__).resolve().parent / "output"
    output_dir.mkdir(parents=True, exist_ok=True)

    ts = finished_at.strftime("%Y%m%d_%H%M%S")
    base = f"live_company_info_search_{ts}_seed{sample_seed}"
    json_path = output_dir / f"{base}.json"
    md_path = output_dir / f"{base}.md"

    meta = {
        "generated_at": finished_at.isoformat(),
        "started_at": started_at.isoformat(),
        "duration_seconds": round((finished_at - started_at).total_seconds(), 2),
        "sample_seed": sample_seed,
        "sample_size": sample_size,
        "companies_count": len(companies),
        "modes": modes,
        "graduation_year": grad_year,
        "cache_mode": forced_cache_mode,
        "max_results": max_results,
        "report_top_n": report_top_n,
        "pass_top_n": pass_top_n,
        "allow_snippet_match": allow_snippet_match,
        "per_industry_min": per_industry_min,
        "rate_limiter": {
            "tokens_per_second": tokens_per_second,
            "max_tokens": max_tokens,
            "stats": limiter.get_stats(),
        },
        "patched_hybrid": {
            "WEB_SEARCH_MAX_QUERIES": patched_max_queries,
            "WEB_SEARCH_RESULTS_PER_QUERY": patched_results_per_query,
            "WEB_SEARCH_RERANK_TOP_K": patched_rerank_top_k,
        },
    }

    # Serialize judgments
    def _judgment_to_dict(j: Optional[RunJudgment]) -> Optional[dict[str, Any]]:
        if j is None:
            return None
        return asdict(j)

    payload = {
        "meta": meta,
        "summary": summary,
        "company_industries": company_industry_map,
        "companies": companies,
        "runs": [
            {
                **{
                    k: v for k, v in asdict(r).items()
                    if k not in ("hybrid_raw_top", "legacy_raw_top", "judgment")
                },
                "hybrid_raw_top": [asdict(x) for x in r.hybrid_raw_top],
                "legacy_raw_top": r.legacy_raw_top,
                "judgment": _judgment_to_dict(r.judgment),
            }
            for r in run_records
        ],
    }

    json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    # -------------------------------------------------------------------------
    # Markdown (human readable)
    # -------------------------------------------------------------------------
    lines: list[str] = []
    lines.append("# Live Company Info Search Report")
    lines.append("")
    lines.append("## Meta")
    lines.append("")
    lines.append(f"- generated_at: `{meta['generated_at']}`")
    lines.append(f"- duration_seconds: `{meta['duration_seconds']}`")
    lines.append(f"- sample_seed: `{sample_seed}`")
    lines.append(f"- sample_size: `{sample_size}`")
    lines.append(f"- companies_count: `{len(companies)}`")
    lines.append(f"- modes: `{', '.join(modes)}`")
    lines.append(f"- graduation_year: `{grad_year}`")
    lines.append(f"- cache_mode: `{forced_cache_mode}`")
    lines.append(f"- max_results: `{max_results}`")
    lines.append(f"- report_top_n: `{report_top_n}`")
    lines.append(f"- pass_top_n: `{pass_top_n}`")
    lines.append(f"- per_industry_min: `{per_industry_min}`")
    lines.append(f"- allow_snippet_match: `{allow_snippet_match}`")
    lines.append("")

    # -------------------------------------------------------------------------
    # Summary section
    # -------------------------------------------------------------------------
    lines.append("## Summary")
    lines.append("")

    # Overall Success Rate
    lines.append("### Overall Success Rate")
    lines.append("")
    header = "| Metric |"
    sep = "| ------ |"
    for mode in modes:
        header += f" {mode.capitalize()} |"
        sep += " ------ |"
    lines.append(header)
    lines.append(sep)

    for label, key in [("Overall", "overall"), ("Recruitment", "recruitment"), ("Corporate", "corporate")]:
        row = f"| {label} |"
        for mode in modes:
            s = summary[key].get(mode, {})
            total = s.get("total", 0)
            passed = s.get("passed", 0)
            rate = s.get("rate", 0.0)
            row += f" {rate:.0%} ({passed}/{total}) |"
        lines.append(row)
    lines.append("")

    # Per Content Type Success
    lines.append("### Per Content Type Success")
    lines.append("")
    header = "| Content Type |"
    sep = "| ------------ |"
    for mode in modes:
        header += f" {mode.capitalize()} |"
        sep += " ------ |"
    lines.append(header)
    lines.append(sep)

    for kind in sorted(summary["by_content_type"].keys()):
        row = f"| {kind} |"
        for mode in modes:
            s = summary["by_content_type"][kind].get(mode, {})
            total = s.get("total", 0)
            passed = s.get("passed", 0)
            rate = s.get("rate", 0.0)
            row += f" {rate:.0%} ({passed}/{total}) |"
        lines.append(row)
    lines.append("")

    # Per Industry Success
    lines.append("### Per Industry Success")
    lines.append("")
    header = "| Industry |"
    sep = "| -------- |"
    for mode in modes:
        header += f" {mode.capitalize()} |"
        sep += " ------ |"
    lines.append(header)
    lines.append(sep)

    for industry in sorted(summary["by_industry"].keys()):
        row = f"| {industry} |"
        for mode in modes:
            s = summary["by_industry"][industry].get(mode, {})
            total = s.get("total", 0)
            passed = s.get("passed", 0)
            rate = s.get("rate", 0.0)
            row += f" {rate:.0%} ({passed}/{total}) |"
        lines.append(row)
    lines.append("")

    # Metadata Accuracy
    lines.append("### Metadata Accuracy")
    lines.append("")
    header = "| Field |"
    sep = "| ----- |"
    for mode in modes:
        header += f" {mode.capitalize()} |"
        sep += " ------ |"
    lines.append(header)
    lines.append(sep)

    field_labels = {
        "source_type_correct": "source_type correct",
        "company_match_correct": "company_name_matched",
        "year_match_correct": "year_matched (recruit)",
        "confidence_appropriate": "confidence appropriate",
        "url_pattern_match": "url_pattern_match (corp)",
    }
    for mf, label in field_labels.items():
        row = f"| {label} |"
        for mode in modes:
            s = summary["metadata_accuracy"].get(mf, {}).get(mode, {})
            correct = s.get("correct", 0)
            total = s.get("total", 0)
            rate = s.get("rate", 0.0)
            if total > 0:
                row += f" {rate:.0%} ({correct}/{total}) |"
            else:
                row += " N/A |"
        lines.append(row)
    lines.append("")

    # Failure Analysis
    lines.append("### Failure Analysis")
    lines.append("")
    fa = summary.get("failure_analysis", {})
    top_reasons = fa.get("top_reasons", [])
    if top_reasons:
        lines.append("**Top failure reasons:**")
        lines.append("")
        for reason, count in top_reasons:
            lines.append(f"- `{reason}`: {count}")
        lines.append("")

    failing_cos = fa.get("failing_companies", [])
    if failing_cos:
        lines.append("**Companies with most failures:**")
        lines.append("")
        for co, count in failing_cos:
            lines.append(f"- {co}: {count} failures")
        lines.append("")

    # -------------------------------------------------------------------------
    # Per-company details
    # -------------------------------------------------------------------------
    lines.append("## Companies")
    lines.append("")
    lines.append(", ".join(companies))
    lines.append("")

    # Index runs by company for easier rendering
    runs_by_company: dict[str, list[RunRecord]] = {}
    for r in run_records:
        runs_by_company.setdefault(r.company_name, []).append(r)

    def _render_candidates_table(cands: list[dict[str, Any]]) -> list[str]:
        if not cands:
            return ["(no candidates)"]
        out: list[str] = []
        out.append("| # | url | confidence | source_type | title | snippet |")
        out.append("| - | --- | ---------- | ---------- | ----- | ------- |")
        for idx, c in enumerate(cands, start=1):
            url = _truncate(str(c.get("url", "")), 120)
            confidence = str(c.get("confidence", ""))
            source_type = str(c.get("source_type", ""))
            title = _truncate(str(c.get("title", "")), 80)
            snippet = _truncate(str(c.get("snippet", "")), 80)
            out.append(
                f"| {idx} | {url} | {confidence} | {source_type} | {title} | {snippet} |"
            )
        return out

    def _render_raw_table(raw: list[HybridRawResult] | list[dict[str, Any]], mode: str) -> list[str]:
        if not raw:
            return []
        out: list[str] = []
        out.append("")
        label = "Hybrid" if mode == "hybrid" else "Legacy"
        out.append(f"**{label} raw (debug)**")
        out.append("")

        if mode == "hybrid":
            out.append(
                "| # | url | combined | rrf | rerank | source_type | official | company_match | year_match |"
            )
            out.append(
                "| - | --- | -------- | --- | ------ | ---------- | -------- | ------------ | --------- |"
            )
            for idx, r in enumerate(raw, start=1):
                if isinstance(r, HybridRawResult):
                    out.append(
                        "| %d | %s | %.3f | %.3f | %.3f | %s | %s | %s | %s |"
                        % (
                            idx,
                            _truncate(r.url, 120),
                            r.combined_score,
                            r.rrf_score,
                            r.rerank_score,
                            r.source_type,
                            "Y" if r.is_official else "N",
                            "Y" if r.company_name_matched else "N",
                            "Y" if r.year_matched else "N",
                        )
                    )
        else:
            # Legacy raw (dict format)
            out.append(
                "| # | url | source_type | official | company_match | year_match |"
            )
            out.append(
                "| - | --- | ---------- | -------- | ------------ | --------- |"
            )
            for idx, r in enumerate(raw, start=1):
                out.append(
                    "| %d | %s | %s | %s | %s | %s |"
                    % (
                        idx,
                        _truncate(r.get("url", ""), 120),
                        r.get("source_type", ""),
                        "Y" if r.get("is_official") else "N",
                        "Y" if r.get("company_name_matched") else "N",
                        "Y" if r.get("year_matched") else "N",
                    )
                )
        return out

    for company_name in companies:
        lines.append(f"## {company_name}")
        industry = company_industry_map.get(company_name, "")
        if industry:
            lines.append(f"*Industry: {industry}*")
        lines.append("")

        # Show domain patterns from meta record if present
        ctx = next(
            (
                r
                for r in runs_by_company.get(company_name, [])
                if r.mode == "meta" and r.kind == "company_context"
            ),
            None,
        )
        if ctx:
            ctx_patterns = ctx.params.get("domain_patterns", [])
            if ctx_patterns:
                lines.append(f"- domain_patterns: `{', '.join(ctx_patterns)}`")
            lines.append("")

        company_runs = [
            r
            for r in runs_by_company.get(company_name, [])
            if not (r.mode == "meta" and r.kind == "company_context")
        ]
        # Stable order: mode -> kind
        mode_priority = {m: i for i, m in enumerate(modes)}
        company_runs.sort(key=lambda r: (mode_priority.get(r.mode, 99), r.kind))

        for r in company_runs:
            # Per-run verdict badge
            if r.judgment:
                if r.judgment.passed:
                    rank_info = f" (rank {r.judgment.official_rank})" if r.judgment.official_rank else ""
                    badge = f"PASS{rank_info}"
                else:
                    badge = f"FAIL -- {r.judgment.details[:100]}"
                lines.append(f"### [{r.mode}] {r.kind}  {'PASS' if r.judgment.passed else 'FAIL'}")
            else:
                badge = ""
                lines.append(f"### [{r.mode}] {r.kind}")
            lines.append("")

            if r.judgment:
                if r.judgment.passed:
                    rank_info = f" (rank {r.judgment.official_rank})" if r.judgment.official_rank else ""
                    lines.append(f"**Verdict: PASS{rank_info}**")
                else:
                    lines.append(f"**Verdict: FAIL** -- {r.judgment.details[:200]}")

                # Metadata detail line
                meta_parts = []
                if r.judgment.source_type_correct:
                    meta_parts.append("source_type:OK")
                elif r.judgment.official_found:
                    meta_parts.append("source_type:NG")
                if r.judgment.company_match_correct:
                    meta_parts.append("company_match:OK")
                elif r.judgment.official_found:
                    meta_parts.append("company_match:NG")
                if r.kind.startswith("recruitment_"):
                    meta_parts.append(
                        f"year_match:{'OK' if r.judgment.year_match_correct else 'NG'}"
                    )
                if r.kind.startswith("content_type:"):
                    meta_parts.append(
                        f"url_pattern:{'OK' if r.judgment.url_pattern_match else 'NG'}"
                    )
                meta_parts.append(
                    f"confidence:{'OK' if r.judgment.confidence_appropriate else 'NG'}"
                )
                if meta_parts:
                    lines.append(f"Metadata: {' | '.join(meta_parts)}")
                lines.append("")

            if r.error:
                lines.append(f"- error: `{_truncate(r.error, 200)}`")
                lines.append("")
                continue
            if r.queries:
                lines.append(f"- queries_count: `{len(r.queries)}`")
                # Keep query list short in Markdown
                for q in r.queries[: min(len(r.queries), 6)]:
                    lines.append(f"  - `{_truncate(q, 140)}`")
                if len(r.queries) > 6:
                    lines.append("  - `...`")
                lines.append("")

            lines.extend(_render_candidates_table(r.candidates))

            # Render raw debug table
            if r.hybrid_raw_top:
                lines.extend(_render_raw_table(r.hybrid_raw_top, "hybrid"))
            elif r.legacy_raw_top:
                lines.extend(_render_raw_table(r.legacy_raw_top, "legacy"))
            lines.append("")

    md_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    # -------------------------------------------------------------------------
    # Print summary to stdout
    # -------------------------------------------------------------------------
    sys.__stdout__.write("\n" + "=" * 60 + "\n")
    sys.__stdout__.write("LIVE SEARCH REPORT SUMMARY\n")
    sys.__stdout__.write("=" * 60 + "\n")
    for mode in modes:
        s = summary["overall"].get(mode, {})
        sys.__stdout__.write(
            f"  {mode.upper():>8}: {s.get('rate', 0):.0%} "
            f"({s.get('passed', 0)}/{s.get('total', 0)}) "
            f"[errors: {s.get('errors', 0)}]\n"
        )
    sys.__stdout__.write(f"  Reports: {md_path}\n")
    sys.__stdout__.write(f"           {json_path}\n")
    sys.__stdout__.write("=" * 60 + "\n\n")
    sys.__stdout__.flush()

    # -------------------------------------------------------------------------
    # Assertions
    # -------------------------------------------------------------------------
    assert json_path.exists()
    assert md_path.exists()

    # Optional: fail on low success rate
    fail_on_low_rate = _env_flag("LIVE_SEARCH_FAIL_ON_LOW_RATE", default=False)
    min_overall_rate = _env_float("LIVE_SEARCH_MIN_SUCCESS_RATE", 0.70)

    if fail_on_low_rate:
        for mode in modes:
            mode_stats = summary["overall"].get(mode, {})
            actual_rate = mode_stats.get("rate", 0.0)
            if actual_rate < min_overall_rate:
                pytest.fail(
                    f"{mode} success rate {actual_rate:.1%} is below threshold "
                    f"{min_overall_rate:.1%}. "
                    f"Set LIVE_SEARCH_FAIL_ON_LOW_RATE=0 to disable."
                )
