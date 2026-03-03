"""
Enhanced report generation for search evaluation.

Generates both JSON and Markdown reports with:
- Executive summary
- IR metrics tables
- Grade distribution
- Regression analysis
- Failure drill-down (failures only)
- Legacy tables (content type, industry, metadata accuracy)
"""

from __future__ import annotations

import json
import sys
from dataclasses import asdict
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from tests.search_eval.config import SearchTestConfig
from tests.search_eval.models import HybridRawResult, RunJudgment, RunRecord
from tests.search_eval.baseline import RegressionReport
from tests.search_eval.failure_taxonomy import FailureTaxonomy


def _truncate(text: str, max_chars: int) -> str:
    t = (text or "").strip()
    if len(t) <= max_chars:
        return t
    return t[: max(0, max_chars - 3)] + "..."


class ReportGenerator:
    """Generate JSON and Markdown search evaluation reports."""

    def __init__(self, config: SearchTestConfig):
        self.config = config

    def generate(
        self,
        run_records: list[RunRecord],
        metrics: dict[str, Any],
        regression: Optional[RegressionReport],
        runner_stats: dict[str, Any],
        companies: list[str],
        company_industry_map: dict[str, str],
        company_source: str,
        curated_version: int,
        output_dir: Optional[Path] = None,
    ) -> tuple[Path, Path]:
        """Generate JSON and Markdown reports.

        Returns (json_path, md_path).
        """
        if output_dir is None:
            output_dir = Path(__file__).resolve().parent.parent / "output"
        output_dir.mkdir(parents=True, exist_ok=True)

        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        if company_source == "curated":
            base = f"live_company_info_search_{ts}_curated"
        else:
            base = f"live_company_info_search_{ts}_seed{self.config.sample_seed}"
        json_path = output_dir / f"{base}.json"
        md_path = output_dir / f"{base}.md"

        # Build JSON payload
        payload = self._build_json_payload(
            run_records, metrics, regression, runner_stats,
            companies, company_industry_map, company_source, curated_version,
        )
        json_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
        )

        # Build Markdown
        md_content = self._build_markdown(
            run_records, metrics, regression,
            companies, company_industry_map, company_source, curated_version,
            runner_stats,
        )
        md_path.write_text(md_content, encoding="utf-8")

        # Print summary to stdout
        self._print_summary(metrics, regression, md_path, json_path)

        return json_path, md_path

    def _build_json_payload(
        self,
        run_records: list[RunRecord],
        metrics: dict[str, Any],
        regression: Optional[RegressionReport],
        runner_stats: dict[str, Any],
        companies: list[str],
        company_industry_map: dict[str, str],
        company_source: str,
        curated_version: int,
    ) -> dict[str, Any]:
        """Build the full JSON report payload."""
        meta = {
            "generated_at": datetime.now().isoformat(),
            **runner_stats,
            "company_source": company_source,
            "curated_list_version": curated_version,
            "sample_seed": self.config.sample_seed,
            "sample_size": self.config.sample_size,
            "companies_count": len(companies),
            "modes": self.config.modes,
            "cache_mode": self.config.cache_mode,
            "max_results": self.config.max_results,
            "report_top_n": self.config.report_top_n,
            "pass_top_n": self.config.pass_top_n,
            "allow_snippet_match": self.config.allow_snippet_match,
            "per_industry_min": self.config.per_industry_min,
            "patched_hybrid": {
                "WEB_SEARCH_MAX_QUERIES": self.config.max_queries,
                "WEB_SEARCH_RESULTS_PER_QUERY": self.config.results_per_query,
                "WEB_SEARCH_RERANK_TOP_K": self.config.rerank_top_k,
            },
        }

        # Serialize runs
        serialized_runs = []
        for r in run_records:
            run_dict = {
                k: v
                for k, v in asdict(r).items()
                if k not in ("hybrid_raw_top", "legacy_raw_top", "judgment")
            }
            run_dict["hybrid_raw_top"] = [asdict(x) for x in r.hybrid_raw_top]
            run_dict["legacy_raw_top"] = r.legacy_raw_top
            if r.judgment:
                run_dict["judgment"] = r.judgment.to_dict()
            else:
                run_dict["judgment"] = None
            serialized_runs.append(run_dict)

        # Filter out per-query data from ir_metrics (too large for JSON)
        ir_metrics_clean = {}
        for k, v in metrics.get("ir_metrics", {}).items():
            if not k.endswith("_per_query"):
                ir_metrics_clean[k] = v

        payload = {
            "meta": meta,
            "summary": {
                "overall": metrics.get("overall", {}),
                "recruitment": metrics.get("recruitment", {}),
                "corporate": metrics.get("corporate", {}),
                "by_content_type": metrics.get("by_content_type", {}),
                "by_industry": metrics.get("by_industry", {}),
                "metadata_accuracy": metrics.get("metadata_accuracy", {}),
                "failure_analysis": metrics.get("failure_analysis", {}),
                "gate_summary": self._build_gate_summary(metrics),
            },
            "ir_metrics": ir_metrics_clean,
            "grade_distribution": metrics.get("grade_distribution", {}),
            "score_distributions": metrics.get("score_distributions", {}),
            "mode_comparison": metrics.get("mode_comparison", {}),
            "company_industries": company_industry_map,
            "companies": companies,
            "runs": serialized_runs,
        }

        if regression:
            payload["regression"] = regression.to_dict()

        # Failure taxonomy
        taxonomy = FailureTaxonomy(run_records)
        payload["failure_taxonomy"] = {
            "by_category": taxonomy.aggregate_by_category(),
            "by_mode": taxonomy.aggregate_by_mode(),
            "by_industry": taxonomy.aggregate_by_industry(company_industry_map),
        }

        return payload

    def _build_gate_summary(self, metrics: dict[str, Any]) -> dict[str, Any]:
        mode = self.config.primary_mode
        summary: dict[str, Any] = {
            "primary_mode": mode,
            "thresholds": {
                "overall": self.config.min_overall_rate,
                "recruitment": self.config.min_recruitment_rate,
                "corporate": self.config.min_corporate_rate,
                "candidate_mrr": self.config.min_candidate_mrr,
                "ndcg@5": self.config.min_ndcg5,
                "mean_grade_score": self.config.min_mean_grade_score,
                "hard_max_official_rank": self.config.hard_max_official_rank,
                "hard_min_metadata_score": self.config.hard_min_metadata_score,
                "per_kind": self.config.min_kind_rates,
            },
            "checks": [],
            "failed_checks": [],
            "passed": True,
        }

        checks: list[tuple[str, float, float]] = [
            ("overall", metrics.get("overall", {}).get(mode, {}).get("rate", 0.0), self.config.min_overall_rate),
            ("recruitment", metrics.get("recruitment", {}).get(mode, {}).get("rate", 0.0), self.config.min_recruitment_rate),
            ("corporate", metrics.get("corporate", {}).get(mode, {}).get("rate", 0.0), self.config.min_corporate_rate),
            ("candidate_mrr", metrics.get("ir_metrics", {}).get(mode, {}).get("candidate_mrr", 0.0), self.config.min_candidate_mrr),
            ("ndcg@5", metrics.get("ir_metrics", {}).get(mode, {}).get("ndcg@5", 0.0), self.config.min_ndcg5),
            ("mean_grade_score", metrics.get("ir_metrics", {}).get(mode, {}).get("mean_grade_score", 0.0), self.config.min_mean_grade_score),
        ]
        for name, actual, threshold in checks:
            passed = actual >= threshold
            item = {"name": name, "actual": round(actual, 4), "threshold": round(threshold, 4), "passed": passed}
            summary["checks"].append(item)
            if not passed:
                summary["failed_checks"].append(item)

        by_kind = metrics.get("by_content_type", {})
        for kind, threshold in self.config.min_kind_rates.items():
            actual = by_kind.get(kind, {}).get(mode, {}).get("rate", 0.0)
            passed = actual >= threshold
            item = {
                "name": f"{kind}.rate",
                "kind": kind,
                "actual": round(actual, 4),
                "threshold": round(threshold, 4),
                "passed": passed,
            }
            summary["checks"].append(item)
            if not passed:
                summary["failed_checks"].append(item)

        summary["passed"] = not summary["failed_checks"]
        return summary

    def _build_markdown(
        self,
        run_records: list[RunRecord],
        metrics: dict[str, Any],
        regression: Optional[RegressionReport],
        companies: list[str],
        company_industry_map: dict[str, str],
        company_source: str,
        curated_version: int,
        runner_stats: dict[str, Any],
    ) -> str:
        """Build the Markdown report."""
        modes = self.config.modes
        lines: list[str] = []

        # =================================================================
        # Executive Summary
        # =================================================================
        lines.append("# Live Company Info Search Report")
        lines.append("")
        lines.append("## Executive Summary")
        lines.append("")

        gate_summary = self._build_gate_summary(metrics)
        lines.append(
            f"**Primary Gate ({gate_summary['primary_mode']})**: "
            f"{'PASS' if gate_summary['passed'] else 'FAIL'}"
        )
        lines.append("")
        for mode in modes:
            s = metrics.get("overall", {}).get(mode, {})
            ir = metrics.get("ir_metrics", {}).get(mode, {})
            rate = s.get("rate", 0)
            mrr = ir.get("candidate_mrr", 0)
            ndcg5 = ir.get("ndcg@5", 0)
            lines.append(
                f"**{mode.capitalize()}**: {rate:.1%} pass rate | "
                f"MRR {mrr:.4f} | nDCG@5 {ndcg5:.4f}"
            )
        lines.append("")

        # Regression alerts
        if regression and regression.has_regression:
            lines.append(f"**Regression Alert ({regression.severity.upper()})**: {regression.summary}")
        elif regression:
            lines.append("**No regressions detected** vs baseline")
        lines.append("")

        lines.append("## CI Gate Summary")
        lines.append("")
        lines.append("| Check | Actual | Threshold | Result |")
        lines.append("| ----- | ------ | --------- | ------ |")
        for item in gate_summary["checks"]:
            lines.append(
                f"| {item['name']} | {item['actual']:.4f} | {item['threshold']:.4f} | "
                f"{'PASS' if item['passed'] else 'FAIL'} |"
            )
        lines.append("")

        # =================================================================
        # Meta
        # =================================================================
        lines.append("## Meta")
        lines.append("")
        lines.append(f"- company_source: `{company_source}`")
        if curated_version:
            lines.append(f"- curated_list_version: `{curated_version}`")
        lines.append(f"- companies_count: `{len(companies)}`")
        lines.append(f"- modes: `{', '.join(modes)}`")
        duration = runner_stats.get("duration_seconds", "?")
        lines.append(f"- duration_seconds: `{duration}`")
        lines.append(f"- pass_top_n: `{self.config.pass_top_n}`")
        lines.append("")

        # =================================================================
        # IR Metrics
        # =================================================================
        lines.append("## IR Metrics")
        lines.append("")
        header = "| Metric |"
        sep = "| ------ |"
        for mode in modes:
            header += f" {mode.capitalize()} |"
            sep += " ------ |"
        lines.append(header)
        lines.append(sep)

        ir_metric_names = [
            ("Candidate MRR", "candidate_mrr"),
            ("Raw MRR", "raw_mrr"),
            ("Mean Grade Score", "mean_grade_score"),
            ("Hit Rate@1", "hit_rate@1"),
            ("Hit Rate@3", "hit_rate@3"),
            ("Hit Rate@5", "hit_rate@5"),
            ("Precision@5", "precision@5"),
            ("nDCG@3", "ndcg@3"),
            ("nDCG@5", "ndcg@5"),
            ("nDCG@10", "ndcg@10"),
        ]
        for label, key in ir_metric_names:
            row = f"| {label} |"
            for mode in modes:
                val = metrics.get("ir_metrics", {}).get(mode, {}).get(key, 0)
                row += f" {val:.4f} |"
            lines.append(row)
        lines.append("")

        # =================================================================
        # Grade Distribution
        # =================================================================
        lines.append("## Grade Distribution")
        lines.append("")
        header = "| Grade |"
        sep = "| ----- |"
        for mode in modes:
            header += f" {mode.capitalize()} |"
            sep += " ------ |"
        lines.append(header)
        lines.append(sep)

        from tests.search_eval.models import JudgmentGrade

        for grade in JudgmentGrade:
            row = f"| {grade.value.upper()} |"
            for mode in modes:
                count = metrics.get("grade_distribution", {}).get(mode, {}).get(grade.value, 0)
                total = metrics.get("overall", {}).get(mode, {}).get("total", 1)
                pct = count / total * 100 if total else 0
                row += f" {count} ({pct:.1f}%) |"
            lines.append(row)
        lines.append("")

        # =================================================================
        # Regression Report
        # =================================================================
        if regression and regression.baseline_date:
            lines.append("## Regression Analysis")
            lines.append("")
            lines.append(f"Baseline: `{regression.baseline_source}` ({regression.baseline_date})")
            lines.append("")

            if regression.metric_results:
                lines.append("| Metric | Baseline | Current | Delta | Severity |")
                lines.append("| ------ | -------- | ------- | ----- | -------- |")
                for r in regression.metric_results:
                    lines.append(
                        f"| {r.metric_name} | {r.baseline_value:.4f} | "
                        f"{r.current_value:.4f} | {r.delta_pct:+.2f}pp | "
                        f"{r.severity} |"
                    )
                lines.append("")

            if regression.new_passes:
                lines.append(f"### New Passes (+{len(regression.new_passes)})")
                lines.append("")
                for p in regression.new_passes[:20]:
                    lines.append(f"- {p}")
                lines.append("")

            if regression.new_failures:
                lines.append(f"### Regressions (-{len(regression.new_failures)})")
                lines.append("")
                for f in regression.new_failures[:20]:
                    lines.append(f"- {f}")
                lines.append("")

            legacy_regressions = [
                r for r in regression.metric_results
                if r.metric_name.startswith("legacy.") and r.severity in {"major", "critical", "minor"}
            ]
            if legacy_regressions:
                lines.append("### Legacy Warnings")
                lines.append("")
                for r in legacy_regressions[:20]:
                    lines.append(
                        f"- `{r.metric_name}`: {r.current_value:.4f} "
                        f"(baseline {r.baseline_value:.4f}, {r.delta_pct:+.2f})"
                    )
                lines.append("")

        # =================================================================
        # Failure Taxonomy
        # =================================================================
        taxonomy = FailureTaxonomy(run_records)
        by_cat = taxonomy.aggregate_by_category()
        if by_cat:
            lines.append("## Failure Root Cause Taxonomy")
            lines.append("")
            lines.append("| Category | Count |")
            lines.append("| -------- | ----- |")
            for cat, count in sorted(by_cat.items(), key=lambda x: -x[1]):
                lines.append(f"| {cat} | {count} |")
            lines.append("")

        # =================================================================
        # Overall Success Rate (legacy table)
        # =================================================================
        lines.append("## Overall Success Rate")
        lines.append("")
        header = "| Metric |"
        sep = "| ------ |"
        for mode in modes:
            header += f" {mode.capitalize()} |"
            sep += " ------ |"
        lines.append(header)
        lines.append(sep)

        for label, key in [
            ("Overall", "overall"),
            ("Recruitment", "recruitment"),
            ("Corporate", "corporate"),
        ]:
            row = f"| {label} |"
            for mode in modes:
                s = metrics[key].get(mode, {})
                total = s.get("total", 0)
                passed = s.get("passed", 0)
                rate = s.get("rate", 0.0)
                row += f" {rate:.0%} ({passed}/{total}) |"
            lines.append(row)
        lines.append("")

        # Per Content Type
        lines.append("### Per Content Type Success")
        lines.append("")
        header = "| Content Type |"
        sep = "| ------------ |"
        for mode in modes:
            header += f" {mode.capitalize()} |"
            sep += " ------ |"
        lines.append(header)
        lines.append(sep)

        for kind in sorted(metrics.get("by_content_type", {}).keys()):
            row = f"| {kind} |"
            for mode in modes:
                s = metrics["by_content_type"][kind].get(mode, {})
                total = s.get("total", 0)
                passed = s.get("passed", 0)
                rate = s.get("rate", 0.0)
                row += f" {rate:.0%} ({passed}/{total}) |"
            lines.append(row)
        lines.append("")

        # Per Industry
        lines.append("### Per Industry Success")
        lines.append("")
        header = "| Industry |"
        sep = "| -------- |"
        for mode in modes:
            header += f" {mode.capitalize()} |"
            sep += " ------ |"
        lines.append(header)
        lines.append(sep)

        for industry in sorted(metrics.get("by_industry", {}).keys()):
            row = f"| {industry} |"
            for mode in modes:
                s = metrics["by_industry"][industry].get(mode, {})
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
                s = metrics.get("metadata_accuracy", {}).get(mf, {}).get(mode, {})
                correct = s.get("correct", 0)
                total = s.get("total", 0)
                rate = s.get("rate", 0.0)
                if total > 0:
                    row += f" {rate:.0%} ({correct}/{total}) |"
                else:
                    row += " N/A |"
            lines.append(row)
        lines.append("")

        # Failure Analysis (legacy)
        fa = metrics.get("failure_analysis", {})
        top_reasons = fa.get("top_reasons", [])
        top_codes = fa.get("top_failure_codes", [])
        if top_codes:
            lines.append("### Failure Codes")
            lines.append("")
            for code, count in top_codes:
                lines.append(f"- `{code}`: {count}")
            lines.append("")

        if top_reasons:
            lines.append("### Failure Analysis")
            lines.append("")
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

        # =================================================================
        # Mode Comparison
        # =================================================================
        mc = metrics.get("mode_comparison", {})
        if mc:
            lines.append("## Mode Comparison")
            lines.append("")
            lines.append(f"- {mc.get('pair', '')}")
            for k, v in mc.items():
                if k != "pair":
                    lines.append(f"- {k}: {v}")
            lines.append("")

        # =================================================================
        # Failure Drill-Down (failures only)
        # =================================================================
        lines.append("## Failure Drill-Down")
        lines.append("")

        runs_by_company: dict[str, list[RunRecord]] = {}
        for r in run_records:
            runs_by_company.setdefault(r.company_name, []).append(r)

        # Only render companies with failures
        for company_name in companies:
            company_runs = [
                r for r in runs_by_company.get(company_name, [])
                if not (r.mode == "meta" and r.kind == "company_context")
            ]
            failed_runs = [
                r for r in company_runs if r.judgment and not r.judgment.passed
            ]
            if not failed_runs:
                continue

            total = len(company_runs)
            fail_count = len(failed_runs)
            lines.append(f"### {company_name} ({fail_count} failures / {total} runs)")
            industry = company_industry_map.get(company_name, "")
            if industry:
                lines.append(f"*Industry: {industry}*")
            lines.append("")

            # Show domain patterns
            ctx = next(
                (
                    r for r in runs_by_company.get(company_name, [])
                    if r.mode == "meta" and r.kind == "company_context"
                ),
                None,
            )
            if ctx:
                ctx_patterns = ctx.params.get("domain_patterns", [])
                if ctx_patterns:
                    lines.append(f"- domain_patterns: `{', '.join(ctx_patterns)}`")
                lines.append("")

            lines.append("| Mode | Kind | Grade | Rank | Details |")
            lines.append("| ---- | ---- | ----- | ---- | ------- |")
            for r in failed_runs:
                grade = r.judgment.grade.value if r.judgment else "?"
                rank = r.judgment.official_rank or "-" if r.judgment else "-"
                raw_rank = r.judgment.raw_official_rank or "-" if r.judgment else "-"
                details = _truncate(r.judgment.details if r.judgment else "", 80)
                if r.judgment and r.judgment.failure_codes:
                    details = _truncate(f"{details} | codes={','.join(r.judgment.failure_codes[:4])}", 80)
                lines.append(
                    f"| {r.mode} | {r.kind} | {grade} | "
                    f"cand:{rank} raw:{raw_rank} | {details} |"
                )
            lines.append("")

        # =================================================================
        # Companies list
        # =================================================================
        lines.append("## Companies")
        lines.append("")
        lines.append(", ".join(companies))
        lines.append("")

        return "\n".join(lines) + "\n"

    def _print_summary(
        self,
        metrics: dict[str, Any],
        regression: Optional[RegressionReport],
        md_path: Path,
        json_path: Path,
    ) -> None:
        """Print summary to stdout."""
        modes = self.config.modes
        sys.__stdout__.write("\n" + "=" * 60 + "\n")
        sys.__stdout__.write("LIVE SEARCH REPORT SUMMARY\n")
        sys.__stdout__.write("=" * 60 + "\n")
        for mode in modes:
            s = metrics.get("overall", {}).get(mode, {})
            ir = metrics.get("ir_metrics", {}).get(mode, {})
            sys.__stdout__.write(
                f"  {mode.upper():>8}: {s.get('rate', 0):.0%} "
                f"({s.get('passed', 0)}/{s.get('total', 0)}) "
                f"[MRR: {ir.get('candidate_mrr', 0):.4f}] "
                f"[errors: {s.get('errors', 0)}]\n"
            )
        gate_summary = self._build_gate_summary(metrics)
        sys.__stdout__.write(
            f"  PRIMARY GATE ({gate_summary['primary_mode']}): "
            f"{'PASS' if gate_summary['passed'] else 'FAIL'}\n"
        )
        if gate_summary["failed_checks"]:
            for item in gate_summary["failed_checks"][:10]:
                sys.__stdout__.write(
                    f"    - {item['name']}: {item['actual']:.4f} < {item['threshold']:.4f}\n"
                )
        if regression:
            if regression.has_regression:
                sys.__stdout__.write(
                    f"  REGRESSION ({regression.severity}): {regression.summary}\n"
                )
            else:
                sys.__stdout__.write("  REGRESSION: None detected\n")
        sys.__stdout__.write(f"  Reports: {md_path}\n")
        sys.__stdout__.write(f"           {json_path}\n")
        sys.__stdout__.write("=" * 60 + "\n\n")
        sys.__stdout__.flush()
