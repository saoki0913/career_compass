import contextlib
import json
import os
import random
import sys
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

import pytest


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


def _load_company_sample(
    mappings_path: Path,
    sample_size: int,
    seed: int,
) -> list[str]:
    raw = json.loads(mappings_path.read_text(encoding="utf-8"))
    mappings = raw.get("mappings") if isinstance(raw, dict) else None
    if not isinstance(mappings, dict):
        return []
    companies = [
        name
        for name in mappings.keys()
        if isinstance(name, str) and name and not name.startswith("_")
    ]
    companies = sorted(set(companies))
    if not companies:
        return []
    k = min(max(1, sample_size), len(companies))
    rng = random.Random(seed)
    return rng.sample(companies, k)


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
    error: Optional[str] = None


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
    # Sample companies
    # -------------------------------------------------------------------------
    mappings_path = backend_root / "data" / "company_mappings.json"
    companies = _load_company_sample(
        mappings_path=mappings_path, sample_size=sample_size, seed=sample_seed
    )
    if not companies:
        pytest.skip("No companies found in company_mappings.json mappings.")

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
            sys.__stdout__.write(
                f"[live-search] ({company_idx}/{len(companies)}) {company_name}\n"
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
        "allow_snippet_match": allow_snippet_match,
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

    payload = {
        "meta": meta,
        "companies": companies,
        "runs": [
            {
                **asdict(r),
                "hybrid_raw_top": [asdict(x) for x in r.hybrid_raw_top],
            }
            for r in run_records
        ],
    }

    json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    # Markdown (human readable)
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
    lines.append(f"- allow_snippet_match: `{allow_snippet_match}`")
    lines.append("")
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

    def _render_hybrid_raw(raw: list[HybridRawResult]) -> list[str]:
        if not raw:
            return []
        out: list[str] = []
        out.append("")
        out.append("**Hybrid raw (debug)**")
        out.append("")
        out.append(
            "| # | url | combined | rrf | rerank | source_type | official | company_match | year_match |"
        )
        out.append(
            "| - | --- | -------- | --- | ------ | ---------- | -------- | ------------ | --------- |"
        )
        for idx, r in enumerate(raw, start=1):
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
        return out

    for company_name in companies:
        lines.append(f"## {company_name}")
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
            patterns = ctx.params.get("domain_patterns", [])
            if patterns:
                lines.append(f"- domain_patterns: `{', '.join(patterns)}`")
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
            lines.append(f"### [{r.mode}] {r.kind}")
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
            lines.extend(_render_hybrid_raw(r.hybrid_raw_top))
            lines.append("")

    md_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    # Always pass (report-only). Ensure report paths exist for convenience.
    assert json_path.exists()
    assert md_path.exists()
