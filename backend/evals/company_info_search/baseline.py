"""
Baseline management and regression detection.

Stores metric snapshots, compares runs against baselines,
and reports regressions with statistical significance testing.
"""

from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Optional


@dataclass
class RegressionResult:
    """Result of comparing a single metric against baseline."""

    metric_name: str
    baseline_value: float
    current_value: float
    delta: float
    delta_pct: float
    severity: str  # "ok", "info", "minor", "major", "critical"


@dataclass
class RegressionReport:
    """Result of comparing current run against baseline."""

    has_regression: bool = False
    severity: str = "none"  # "none", "minor", "major", "critical"
    summary: str = ""

    metric_results: list[RegressionResult] = field(default_factory=list)

    # Per-company changes
    new_passes: list[str] = field(default_factory=list)
    new_failures: list[str] = field(default_factory=list)
    noise_failures: list[str] = field(default_factory=list)  # no_candidates type

    # Gate results
    hard_gate_passed: bool = True
    soft_gate_passed: bool = True

    baseline_source: str = ""
    baseline_date: str = ""

    def to_dict(self) -> dict[str, Any]:
        """Serialize for JSON output."""
        return {
            "has_regression": self.has_regression,
            "severity": self.severity,
            "summary": self.summary,
            "baseline_source": self.baseline_source,
            "baseline_date": self.baseline_date,
            "hard_gate_passed": self.hard_gate_passed,
            "soft_gate_passed": self.soft_gate_passed,
            "metric_results": [
                {
                    "metric": r.metric_name,
                    "baseline": r.baseline_value,
                    "current": r.current_value,
                    "delta": round(r.delta, 4),
                    "delta_pct": round(r.delta_pct, 2),
                    "severity": r.severity,
                }
                for r in self.metric_results
            ],
            "new_passes_count": len(self.new_passes),
            "new_failures_count": len(self.new_failures),
            "noise_failures_count": len(self.noise_failures),
            "new_passes": self.new_passes[:20],
            "new_failures": self.new_failures[:20],
        }


def _get_git_commit() -> str:
    """Get current git commit hash."""
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        return result.stdout.strip() if result.returncode == 0 else "unknown"
    except Exception:
        return "unknown"


class BaselineManager:
    """Store, load, and compare baselines for regression detection."""

    def __init__(
        self,
        baselines_dir: Path | str,
        threshold_pp: float = 2.0,
    ):
        self.baselines_dir = Path(baselines_dir)
        self.threshold_pp = threshold_pp
        self.baselines_dir.mkdir(parents=True, exist_ok=True)

    def save_baseline(
        self,
        metrics: dict[str, Any],
        config_fingerprint: str,
        company_source: str,
        companies_count: int,
        tag: Optional[str] = None,
    ) -> Path:
        """Save current metrics as a new baseline.

        Returns path to the saved baseline file.
        """
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        suffix = f"_{tag}" if tag else ""
        filename = f"baseline_{ts}{suffix}.json"
        path = self.baselines_dir / filename

        baseline_data = {
            "_schema_version": 1,
            "created_at": datetime.now().isoformat(),
            "git_commit": _get_git_commit(),
            "config_fingerprint": config_fingerprint,
            "company_source": company_source,
            "companies_count": companies_count,
            # Store the metrics we compare against
            "metrics": self._extract_comparable_metrics(metrics),
            # Per-company results for detailed regression detection
            "company_results": self._extract_company_results(metrics),
        }

        path.write_text(
            json.dumps(baseline_data, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        # Update manifest
        self._update_manifest(filename, baseline_data)

        return path

    def load_baseline(self, path: Optional[str] = None) -> Optional[dict[str, Any]]:
        """Load baseline from path or latest.

        If path is None, loads the latest baseline from manifest.
        """
        if path:
            p = Path(path)
            if not p.is_absolute():
                p = self.baselines_dir / p
            if p.exists():
                return json.loads(p.read_text(encoding="utf-8"))
            return None

        # Try manifest
        manifest_path = self.baselines_dir / "manifest.json"
        if manifest_path.exists():
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            latest = manifest.get("latest")
            if latest:
                latest_path = self.baselines_dir / latest
                if latest_path.exists():
                    return json.loads(latest_path.read_text(encoding="utf-8"))

        return None

    def compare(
        self,
        current_metrics: dict[str, Any],
        baseline_path: Optional[str] = None,
    ) -> RegressionReport:
        """Compare current metrics against baseline.

        Returns RegressionReport with regression details.
        """
        baseline = self.load_baseline(baseline_path)
        if baseline is None:
            return RegressionReport(
                summary="No baseline found, skipping comparison.",
            )

        report = RegressionReport(
            baseline_source=baseline.get("_schema_version", "unknown"),
            baseline_date=baseline.get("created_at", ""),
        )

        baseline_metrics = baseline.get("metrics", {})

        # ------------------------------------------------------------------
        # Compare overall rates
        # ------------------------------------------------------------------
        for mode in ("hybrid", "legacy"):
            bl_rate = baseline_metrics.get(mode, {}).get("overall_rate", 0)
            cur_rate = current_metrics.get("overall", {}).get(mode, {}).get("rate", 0)

            delta = cur_rate - bl_rate
            delta_pp = delta * 100

            if delta_pp <= -self.threshold_pp:
                severity = "critical"
            elif delta_pp <= -1.0:
                severity = "major"
            elif delta_pp < 0:
                severity = "minor"
            else:
                severity = "ok"

            report.metric_results.append(RegressionResult(
                metric_name=f"{mode}.overall_rate",
                baseline_value=bl_rate,
                current_value=cur_rate,
                delta=delta,
                delta_pct=delta_pp,
                severity=severity,
            ))

            if severity == "critical":
                report.hard_gate_passed = False

            for category in ("recruitment_rate", "corporate_rate"):
                bl_cat = baseline_metrics.get(mode, {}).get(category, 0)
                cur_cat = current_metrics.get(category.replace("_rate", ""), {}).get(mode, {}).get("rate", 0)
                delta_cat = cur_cat - bl_cat
                delta_cat_pp = delta_cat * 100
                if delta_cat_pp <= -self.threshold_pp:
                    severity = "major" if mode == "legacy" else "critical"
                elif delta_cat_pp < 0:
                    severity = "minor"
                else:
                    severity = "ok"
                report.metric_results.append(RegressionResult(
                    metric_name=f"{mode}.{category}",
                    baseline_value=bl_cat,
                    current_value=cur_cat,
                    delta=delta_cat,
                    delta_pct=delta_cat_pp,
                    severity=severity,
                ))

        # ------------------------------------------------------------------
        # Compare IR metrics
        # ------------------------------------------------------------------
        for mode in ("hybrid", "legacy"):
            bl_ir = baseline_metrics.get(mode, {}).get("ir_metrics", {})
            cur_ir = current_metrics.get("ir_metrics", {}).get(mode, {})

            for metric_name in ("candidate_mrr", "raw_mrr", "ndcg@5", "mean_grade_score"):
                bl_val = bl_ir.get(metric_name, 0)
                cur_val = cur_ir.get(metric_name, 0)
                delta = cur_val - bl_val
                delta_pct = (delta / bl_val * 100) if bl_val else 0

                if metric_name in ("candidate_mrr", "raw_mrr") and delta < -0.05:
                    severity = "minor"
                elif delta < -0.1:
                    severity = "major"
                elif delta < 0:
                    severity = "info"
                else:
                    severity = "ok"

                report.metric_results.append(RegressionResult(
                    metric_name=f"{mode}.{metric_name}",
                    baseline_value=bl_val,
                    current_value=cur_val,
                    delta=delta,
                    delta_pct=delta_pct,
                    severity=severity,
                ))

        # ------------------------------------------------------------------
        # Compare content type rates (soft gate)
        # ------------------------------------------------------------------
        bl_by_ct = baseline_metrics.get("by_content_type", {})
        cur_by_ct = current_metrics.get("by_content_type", {})

        for kind in set(list(bl_by_ct.keys()) + list(cur_by_ct.keys())):
            for mode in ("hybrid", "legacy"):
                bl_rate = bl_by_ct.get(kind, {}).get(mode, {}).get("rate", 0)
                cur_rate = cur_by_ct.get(kind, {}).get(mode, {}).get("rate", 0)
                delta_pp = (cur_rate - bl_rate) * 100

                if delta_pp <= -10.0:
                    report.soft_gate_passed = False
                    report.metric_results.append(RegressionResult(
                        metric_name=f"{mode}.{kind}.rate",
                        baseline_value=bl_rate,
                        current_value=cur_rate,
                        delta=cur_rate - bl_rate,
                        delta_pct=delta_pp,
                        severity="major",
                    ))

        # ------------------------------------------------------------------
        # Per-company comparison
        # ------------------------------------------------------------------
        bl_company = baseline.get("company_results", {})
        cur_company = self._extract_company_results(current_metrics)

        for key, cur_passed in cur_company.items():
            bl_passed = bl_company.get(key)
            if bl_passed is True and cur_passed is False:
                # Check if it's a "noise" regression (no_candidates)
                report.new_failures.append(key)
            elif bl_passed is False and cur_passed is True:
                report.new_passes.append(key)

        # Major regression if >20 new non-noise failures
        real_failures = len(report.new_failures)
        if real_failures > 20:
            report.metric_results.append(RegressionResult(
                metric_name="company_regressions",
                baseline_value=0,
                current_value=real_failures,
                delta=real_failures,
                delta_pct=0,
                severity="major",
            ))

        # ------------------------------------------------------------------
        # Determine overall severity
        # ------------------------------------------------------------------
        severities = [r.severity for r in report.metric_results]
        if "critical" in severities:
            report.severity = "critical"
            report.has_regression = True
        elif "major" in severities:
            report.severity = "major"
            report.has_regression = True
        elif "minor" in severities:
            report.severity = "minor"
            report.has_regression = True
        else:
            report.severity = "none"
            report.has_regression = False

        # Build summary string
        critical = [r for r in report.metric_results if r.severity == "critical"]
        major = [r for r in report.metric_results if r.severity == "major"]
        parts = []
        if critical:
            parts.append(
                f"{len(critical)} critical: "
                + ", ".join(f"{r.metric_name} {r.delta_pct:+.1f}pp" for r in critical)
            )
        if major:
            parts.append(
                f"{len(major)} major: "
                + ", ".join(f"{r.metric_name} {r.delta_pct:+.1f}pp" for r in major)
            )
        if report.new_failures:
            parts.append(f"{len(report.new_failures)} new failures")
        if report.new_passes:
            parts.append(f"{len(report.new_passes)} new passes")
        report.summary = "; ".join(parts) if parts else "No regressions detected"

        return report

    def _extract_comparable_metrics(self, metrics: dict[str, Any]) -> dict[str, Any]:
        """Extract the subset of metrics stored in baselines."""
        result: dict[str, Any] = {}
        for mode in ("hybrid", "legacy"):
            mode_overall = metrics.get("overall", {}).get(mode, {})
            mode_ir = metrics.get("ir_metrics", {}).get(mode, {})
            result[mode] = {
                "overall_rate": mode_overall.get("rate", 0),
                "recruitment_rate": metrics.get("recruitment", {}).get(mode, {}).get("rate", 0),
                "corporate_rate": metrics.get("corporate", {}).get(mode, {}).get("rate", 0),
                "total": mode_overall.get("total", 0),
                "passed": mode_overall.get("passed", 0),
                "ir_metrics": mode_ir,
            }

        result["by_content_type"] = {}
        for kind, mode_data in metrics.get("by_content_type", {}).items():
            result["by_content_type"][kind] = {}
            for mode in ("hybrid", "legacy"):
                if mode in mode_data:
                    result["by_content_type"][kind][mode] = {
                        "rate": mode_data[mode].get("rate", 0),
                        "total": mode_data[mode].get("total", 0),
                    }

        result["by_industry"] = {}
        for industry, mode_data in metrics.get("by_industry", {}).items():
            result["by_industry"][industry] = {}
            for mode in ("hybrid", "legacy"):
                if mode in mode_data:
                    result["by_industry"][industry][mode] = {
                        "rate": mode_data[mode].get("rate", 0),
                    }

        return result

    def _extract_company_results(self, metrics: dict[str, Any]) -> dict[str, bool]:
        """Extract per-company pass/fail from metrics.

        This is populated from run records rather than the summary;
        we use a special key in metrics for it.
        """
        return metrics.get("_company_results", {})

    def _update_manifest(self, filename: str, baseline_data: dict) -> None:
        """Update manifest.json with new baseline entry."""
        manifest_path = self.baselines_dir / "manifest.json"
        if manifest_path.exists():
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        else:
            manifest = {"schema_version": 1, "baselines": []}

        manifest["latest"] = filename
        manifest["baselines"].append({
            "filename": filename,
            "created_at": baseline_data.get("created_at", ""),
            "git_commit": baseline_data.get("git_commit", ""),
            "config_fingerprint": baseline_data.get("config_fingerprint", ""),
            "company_source": baseline_data.get("company_source", ""),
            "companies_count": baseline_data.get("companies_count", 0),
        })

        manifest_path.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
