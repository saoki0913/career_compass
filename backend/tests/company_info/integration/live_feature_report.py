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


def _append_check(
    checks: list[dict[str, Any]],
    *,
    name: str,
    passed: bool,
    evidence: list[object] | None = None,
) -> None:
    checks.append(
        {
            "name": name,
            "passed": passed,
            "evidence": [str(item) for item in (evidence or []) if item is not None and str(item) != ""],
        }
    )


_MD_APPENDIX_FIELD_MAX = 900


def _md_escape_scalar(value: str, max_len: int = _MD_APPENDIX_FIELD_MAX) -> str:
    text = " ".join(value.split())
    if len(text) <= max_len:
        return text
    return text[: max_len - 3] + "..."


def _md_appendix_lines_for_row(row: dict[str, Any]) -> list[str]:
    """Debug appendix for failed/degraded company-info live rows (selection_schedule, rag_ingest, etc.)."""
    sev = str(row.get("severity", "")).lower()
    if sev not in ("failed", "degraded"):
        return []
    lines: list[str] = ["#### appendix", ""]
    fk = row.get("failureKind") or row.get("failure_kind")
    if fk:
        lines.append(f"- failure_kind: `{fk}`")
    err = row.get("representativeError") or row.get("representative_error") or row.get("error")
    if err:
        lines.append(f"- error: `{_md_escape_scalar(str(err), 800)}`")
    url = row.get("sourceUrl") or row.get("source_url")
    if url:
        lines.append(f"- source_url: `{_md_escape_scalar(str(url), 500)}`")
    checks = normalize_checks_for_report(row.get("checks"))
    failed_checks = [c for c in checks if not c.get("passed")]
    for check in failed_checks[:12]:
        evidence = check.get("evidence") or []
        ev_text = ", ".join(str(x) for x in evidence) if evidence else ""
        lines.append(
            f"- check_fail: `{check.get('name', '?')}` "
            f"evidence: `{_md_escape_scalar(ev_text, _MD_APPENDIX_FIELD_MAX) if ev_text else '(none)'}`"
        )
    lines.append("")
    return lines


def normalize_checks_for_report(checks: Any) -> list[dict[str, Any]]:
    """Coerce row ``checks`` to list[dict] for Markdown rendering (dict legacy supported)."""
    if checks is None:
        return []
    if isinstance(checks, dict):
        return [
            {"name": str(k), "passed": bool(v), "evidence": []}
            for k, v in checks.items()
        ]
    if isinstance(checks, list):
        out: list[dict[str, Any]] = []
        for item in checks:
            if isinstance(item, dict) and "name" in item:
                out.append(item)
        return out
    return []


def build_company_info_search_live_rows(run_records: list[Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []

    for record in run_records:
        mode = str(getattr(record, "mode", "") or "")
        kind = str(getattr(record, "kind", "") or "")
        if mode == "meta" or kind == "company_context":
            continue

        company_name = str(getattr(record, "company_name", "") or "")
        error = getattr(record, "error", None)
        judgment = getattr(record, "judgment", None)
        candidates = list(getattr(record, "candidates", []) or [])

        checks: list[dict[str, Any]] = []
        deterministic_fail_reasons: list[str] = []
        representative_log: str | None = None
        representative_error = str(error) if error else None

        if error:
            status = "failed"
            severity = "failed"
            failure_kind = "infra"
            deterministic_fail_reasons.append("search_error")
        elif judgment is None:
            status = "failed"
            severity = "failed"
            failure_kind = "unknown"
            deterministic_fail_reasons.append("missing_judgment")
        else:
            gate_level = str(getattr(getattr(judgment, "gate_level", None), "value", getattr(judgment, "gate_level", "")))
            if gate_level == "soft_fail":
                severity = "degraded"
                failure_kind = "quality"
            elif gate_level == "hard_fail":
                severity = "failed"
                failure_kind = "quality"
            else:
                severity = "passed"
                failure_kind = "none"
            status = "passed"

            failure_codes = [str(item) for item in list(getattr(judgment, "failure_codes", []) or [])]
            failure_reasons = [str(item) for item in list(getattr(judgment, "failure_reasons", []) or [])]
            deterministic_fail_reasons.extend(failure_codes)
            deterministic_fail_reasons.extend(failure_reasons)
            representative_log = str(getattr(judgment, "details", "") or "") or None

            _append_check(
                checks,
                name="official_found",
                passed=bool(getattr(judgment, "official_found", False)),
                evidence=[f"candidates={len(candidates)}"],
            )
            _append_check(
                checks,
                name="top_n_gate",
                passed=severity == "passed",
                evidence=[
                    f"gate_level={gate_level or 'pass'}",
                    f"official_rank={getattr(judgment, 'official_rank', None)}",
                    f"raw_official_rank={getattr(judgment, 'raw_official_rank', None)}",
                ],
            )
            _append_check(
                checks,
                name="metadata_score",
                passed=float(getattr(judgment, "metadata_score", 0.0) or 0.0) >= 0.85,
                evidence=[f"metadata_score={getattr(judgment, 'metadata_score', 0.0)}"],
            )

        rows.append(
            {
                "caseId": f"{company_name}::{mode}::{kind}",
                "title": f"{company_name} / {mode} / {kind}",
                "status": status,
                "severity": severity,
                "failureKind": failure_kind,
                "durationMs": 0,
                "deterministicFailReasons": sorted(set(deterministic_fail_reasons)),
                "representativeLog": representative_log,
                "representativeError": representative_error,
                "checks": checks,
                "cleanup": {"ok": True, "removedIds": []},
                "candidateCount": len(candidates),
                "mode": mode,
                "kind": kind,
            }
        )

    return rows


def write_company_info_search_live_report(run_records: list[Any]) -> tuple[Path, Path]:
    return write_live_feature_report(
        report_type="company_info_search",
        display_name="企業情報検索",
        rows=build_company_info_search_live_rows(run_records),
    )


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
        checks = normalize_checks_for_report(row.get("checks"))
        cleanup = row.get("cleanup") or {"ok": True}
        fk = row.get("failureKind") or row.get("failure_kind") or "-"
        md_lines.extend(
            [
                f"### `{row.get('caseId', '-')}` / `{row.get('severity', row.get('status', '-'))}`",
                "",
                f"- title: `{row.get('title', '-')}`",
                f"- status: `{row.get('status', '-')}`",
                f"- severity: `{row.get('severity', '-')}`",
                f"- failure_kind: `{fk}`",
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
        md_lines.extend(_md_appendix_lines_for_row(row))

    md_path.write_text("\n".join(md_lines) + "\n", encoding="utf-8")
    return json_path, md_path
