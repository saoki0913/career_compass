from __future__ import annotations

import json
import os
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


def _default_output_dir() -> Path:
    if os.getenv("AI_LIVE_OUTPUT_DIR"):
        return Path(os.environ["AI_LIVE_OUTPUT_DIR"])
    if os.getenv("LIVE_COMPANY_INFO_OUTPUT_DIR"):
        return Path(os.environ["LIVE_COMPANY_INFO_OUTPUT_DIR"])
    return Path("backend/tests/output")


def selected_case_set() -> str:
    return os.getenv("LIVE_COMPANY_INFO_CASE_SET", os.getenv("AI_LIVE_SUITE", "smoke")).strip() or "smoke"


def target_env() -> str:
    return os.getenv("LIVE_COMPANY_INFO_TARGET_ENV", "staging").strip() or "staging"


def summarize_rows(rows: list[dict[str, Any]]) -> dict[str, int]:
    summary = Counter({"total": 0, "passed": 0, "degraded": 0, "failed": 0, "skipped": 0})
    for row in rows:
        summary["total"] += 1
        severity = str(row.get("severity", row.get("status", ""))).lower()
        if severity in {"passed", "degraded", "failed"}:
            summary[severity] += 1
        if str(row.get("status", "")).lower() == "skipped":
            summary["skipped"] += 1
    return dict(summary)


def write_live_feature_report(
    *,
    report_type: str,
    display_name: str,
    rows: list[dict[str, Any]],
) -> tuple[Path, Path]:
    output_dir = _default_output_dir()
    output_dir.mkdir(parents=True, exist_ok=True)

    generated_at = datetime.now(UTC)
    stamp = generated_at.strftime("%Y%m%dT%H%M%SZ")
    summary = summarize_rows(rows)
    payload = {
        "reportType": report_type,
        "displayName": display_name,
        "generatedAt": generated_at.isoformat(),
        "generatedAtStamp": stamp,
        "suiteDepth": selected_case_set(),
        "targetEnv": target_env(),
        "summary": summary,
        "rows": rows,
    }

    json_path = output_dir / f"live_{report_type}_{selected_case_set()}_{stamp}.json"
    md_path = output_dir / f"live_{report_type}_{selected_case_set()}_{stamp}.md"
    json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    md_lines = [
        f"# {display_name} Live Report",
        "",
        f"- report_type: `{report_type}`",
        f"- suite_depth: `{payload['suiteDepth']}`",
        f"- target_env: `{payload['targetEnv']}`",
        (
            f"- total: `{summary['total']}` "
            f"passed=`{summary['passed']}` degraded=`{summary['degraded']}` "
            f"failed=`{summary['failed']}` skipped=`{summary['skipped']}`"
        ),
        "",
        "## Rows",
        "",
    ]

    for row in rows:
        reasons = row.get("deterministicFailReasons") or []
        checks = row.get("checks") or []
        cleanup = row.get("cleanup") or {"ok": True}
        md_lines.extend(
            [
                f"### `{row.get('caseId', '-')}` / `{row.get('severity', row.get('status', '-'))}`",
                "",
                f"- title: `{row.get('title', '-')}`",
                f"- status: `{row.get('status', '-')}`",
                f"- severity: `{row.get('severity', '-')}`",
                f"- duration_ms: `{row.get('durationMs', 0)}`",
                (
                    "- deterministic_fail_reasons: "
                    + ", ".join(f"`{reason}`" for reason in reasons)
                    if reasons
                    else "- deterministic_fail_reasons: `none`"
                ),
                (
                    "- checks: "
                    + ", ".join(
                        f"`{check.get('name','?')}:{'pass' if check.get('passed') else 'fail'}`"
                        for check in checks
                    )
                    if checks
                    else "- checks: `none`"
                ),
                f"- cleanup: `{'ok' if cleanup.get('ok') else 'failed'}`",
                "",
            ]
        )

    md_path.write_text("\n".join(md_lines) + "\n", encoding="utf-8")
    return json_path, md_path
