"""
Live Company Info Search Report Test.

Orchestrator that uses the company info search eval package to:
1. Load companies
2. Execute searches (hybrid + legacy)
3. Apply graded judgments
4. Compute IR metrics (MRR, NDCG, Precision@K, grade distributions)
5. Compare against baseline (regression detection)
6. Generate JSON + Markdown reports

All heavy logic has been extracted to backend/evals/company_info_search/.
"""

import sys
from pathlib import Path

import pytest

from evals.company_info_search.config import SearchTestConfig
from evals.company_info_search.company_loader import CompanyLoader
from evals.company_info_search.runner import SearchRunner
from evals.company_info_search.judge import ResultJudge
from evals.company_info_search.metrics import MetricsComputer
from evals.company_info_search.baseline import BaselineManager
from evals.company_info_search.report import ReportGenerator
from tests.company_info.integration.live_feature_report import (
    write_company_info_search_live_report,
)


def _collect_gate_failures(
    metrics: dict,
    config: SearchTestConfig,
) -> list[str]:
    mode = config.primary_mode
    failures: list[str] = []

    checks = [
        ("overall", metrics.get("overall", {}).get(mode, {}).get("rate", 0.0), config.min_overall_rate),
        ("recruitment", metrics.get("recruitment", {}).get(mode, {}).get("rate", 0.0), config.min_recruitment_rate),
        ("corporate", metrics.get("corporate", {}).get(mode, {}).get("rate", 0.0), config.min_corporate_rate),
        ("candidate_mrr", metrics.get("ir_metrics", {}).get(mode, {}).get("candidate_mrr", 0.0), config.min_candidate_mrr),
        ("ndcg@5", metrics.get("ir_metrics", {}).get(mode, {}).get("ndcg@5", 0.0), config.min_ndcg5),
        ("mean_grade_score", metrics.get("ir_metrics", {}).get(mode, {}).get("mean_grade_score", 0.0), config.min_mean_grade_score),
    ]
    for name, actual, threshold in checks:
        if actual < threshold:
            failures.append(f"{mode}.{name} {actual:.4f} < {threshold:.4f}")

    for kind, threshold in config.min_kind_rates.items():
        actual = metrics.get("by_content_type", {}).get(kind, {}).get(mode, {}).get("rate", 0.0)
        if actual < threshold:
            failures.append(f"{mode}.{kind}.rate {actual:.4f} < {threshold:.4f}")

    return failures


@pytest.mark.integration
@pytest.mark.slow
@pytest.mark.asyncio
async def test_live_company_info_search_report(monkeypatch: pytest.MonkeyPatch) -> None:
    # Load config from env vars
    config = SearchTestConfig.load()
    if not config.should_run():
        pytest.skip("Set RUN_LIVE_SEARCH=1 to enable live web search report test.")

    backend_root = Path(__file__).resolve().parents[3]
    sys.path.insert(0, str(backend_root))

    from app.utils.web_search import HAS_DDGS

    if not HAS_DDGS:
        pytest.skip("ddgs is not installed; live web search is unavailable.")

    # -------------------------------------------------------------------------
    # 1. Load companies
    # -------------------------------------------------------------------------
    loader = CompanyLoader(config, backend_root)
    companies, company_industry_map, company_source, curated_version = loader.load()

    if not companies:
        pytest.skip("No companies found.")

    CompanyLoader.log_industry_coverage(companies, company_industry_map)

    # -------------------------------------------------------------------------
    # 2. Execute searches
    # -------------------------------------------------------------------------
    runner = SearchRunner(config, monkeypatch, backend_root)
    run_records = await runner.execute(companies, company_industry_map)

    # -------------------------------------------------------------------------
    # 3. Judge each run (graded)
    # -------------------------------------------------------------------------
    from app.utils.company_names import get_company_domain_patterns

    judge = ResultJudge(config)
    judge.judge_all(run_records, get_patterns_fn=get_company_domain_patterns)

    # -------------------------------------------------------------------------
    # 4. Compute metrics
    # -------------------------------------------------------------------------
    computer = MetricsComputer()
    metrics = computer.compute(run_records, config.modes, company_industry_map)

    # Add per-company pass/fail for baseline comparison
    company_results: dict[str, bool] = {}
    for r in run_records:
        if r.mode == "meta" and r.kind == "company_context":
            continue
        if r.judgment:
            key = f"{r.company_name}::{r.mode}::{r.kind}"
            company_results[key] = r.judgment.passed
    metrics["_company_results"] = company_results

    # -------------------------------------------------------------------------
    # 5. Compare with baseline
    # -------------------------------------------------------------------------
    baselines_dir = backend_root / "evals" / "company_info_search" / "output" / "baselines"
    baseline_mgr = BaselineManager(
        baselines_dir=baselines_dir,
        threshold_pp=config.regression_threshold_pp,
    )
    regression = baseline_mgr.compare(metrics, config.baseline_path)

    # -------------------------------------------------------------------------
    # 6. Generate reports
    # -------------------------------------------------------------------------
    reporter = ReportGenerator(config)
    json_path, md_path = reporter.generate(
        run_records=run_records,
        metrics=metrics,
        regression=regression,
        runner_stats=runner.get_stats(),
        companies=companies,
        company_industry_map=company_industry_map,
        company_source=company_source,
        curated_version=curated_version,
    )
    ai_live_json_path, ai_live_md_path = write_company_info_search_live_report(run_records)

    # -------------------------------------------------------------------------
    # 7. Optionally save baseline
    # -------------------------------------------------------------------------
    if config.baseline_save:
        saved = baseline_mgr.save_baseline(
            metrics=metrics,
            config_fingerprint=config.fingerprint(),
            company_source=company_source,
            companies_count=len(companies),
        )
        sys.__stdout__.write(f"[live-search] Baseline saved: {saved}\n")

    if config.baseline_auto_promote and not regression.has_regression:
        saved = baseline_mgr.save_baseline(
            metrics=metrics,
            config_fingerprint=config.fingerprint(),
            company_source=company_source,
            companies_count=len(companies),
            tag="auto",
        )
        sys.__stdout__.write(f"[live-search] Baseline auto-promoted: {saved}\n")

    # -------------------------------------------------------------------------
    # 8. Assertions
    # -------------------------------------------------------------------------
    assert json_path.exists()
    assert md_path.exists()
    assert ai_live_json_path.exists()
    assert ai_live_md_path.exists()

    # Fail on critical regression
    if config.fail_on_regression and regression.has_regression:
        if regression.severity in ("critical", "major"):
            pytest.fail(
                f"Search regression detected ({regression.severity}): "
                f"{regression.summary}"
            )

    # Fail on configured gate thresholds for the primary mode
    if config.fail_on_low_rate:
        gate_failures = _collect_gate_failures(metrics, config)
        if gate_failures:
            pytest.fail(
                "Primary gate failed:\n- "
                + "\n- ".join(gate_failures)
                + "\nSet LIVE_SEARCH_FAIL_ON_LOW_RATE=0 to disable."
            )
