from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


def _format_number(value: Any, digits: int = 3) -> str:
    if value is None:
        return "-"
    if isinstance(value, float):
        return f"{value:.{digits}f}"
    return str(value)


def write_calibration_report(
    results: list[dict[str, Any]],
    metrics: dict[str, Any],
    output_dir: Path,
) -> tuple[Path, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    generated_at = datetime.now(UTC)
    stamp = generated_at.strftime("%Y%m%dT%H%M%SZ")

    payload = {
        "generatedAt": generated_at.isoformat(),
        "results": results,
        "metrics": metrics,
        "note": "This is a regression monitoring baseline from synthetic data, not a production quality guarantee",
    }

    json_path = output_dir / f"calibration_{stamp}.json"
    md_path = output_dir / f"calibration_{stamp}.md"
    json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    overall = metrics.get("overall", {})
    per_axis = metrics.get("per_axis", {})
    facets = metrics.get("facets", {})

    lines = [
        "# Interview Calibration Report",
        "",
        f"- generated_at: `{payload['generatedAt']}`",
        f"- cases: `{len(results)}`",
        "- note: `This is a regression monitoring baseline from synthetic data, not a production quality guarantee`",
        "",
        "## Overall Summary",
        "",
        "| macro_kappa | mean_mad | calibration_label |",
        "| --- | --- | --- |",
        (
            f"| {_format_number(overall.get('macro_kappa'))} | "
            f"{_format_number(overall.get('mean_mad'))} | "
            f"{overall.get('calibration_label', '-')} |"
        ),
        "",
        "## Per-Axis Agreement",
        "",
        "| axis | n | kappa | pearson_r | mad | exact_match_pct | within_1_pct |",
        "| --- | --- | --- | --- | --- | --- | --- |",
    ]

    for axis, axis_metrics in per_axis.items():
        lines.append(
            f"| {axis} | {axis_metrics.get('n', '-')} | "
            f"{_format_number(axis_metrics.get('kappa'))} | "
            f"{_format_number(axis_metrics.get('pearson_r'))} | "
            f"{_format_number(axis_metrics.get('mad'))} | "
            f"{_format_number(axis_metrics.get('exact_match_pct'), 1)} | "
            f"{_format_number(axis_metrics.get('within_1_pct'), 1)} |"
        )

    lines.extend(["", "## Faceted Breakdown", ""])
    for facet_name, facet_rows in facets.items():
        lines.extend(
            [
                f"### {facet_name}",
                "",
                "| facet | n | macro_kappa |",
                "| --- | --- | --- |",
            ]
        )
        for facet_value, facet_metrics in facet_rows.items():
            lines.append(
                f"| {facet_value} | {facet_metrics.get('n', '-')} | "
                f"{_format_number(facet_metrics.get('macro_kappa'))} |"
            )
        lines.append("")

    lines.extend(
        [
            "## Limitations",
            "",
            "- This is a regression monitoring baseline from synthetic data, not a production quality guarantee.",
            "- Synthetic conversations may understate ambiguity and interviewer variation seen in production.",
            "- Faceted metrics are descriptive only and should not be used as merge gates by themselves.",
        ]
    )

    md_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return json_path, md_path
