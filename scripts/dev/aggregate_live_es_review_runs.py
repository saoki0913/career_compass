#!/usr/bin/env python3
"""Aggregate multiple live_es_review_*.json reports into one summary (MD + JSON).

Large aggregate .md files (full rewrites per run) are intended for local analysis;
they live under backend/tests/output/ which is typically gitignored.
"""

from __future__ import annotations

import json
import sys
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path


def _load_rows(path: Path) -> list[dict]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, list):
        return []
    return [r for r in raw if isinstance(r, dict)]


def _md_safe_line(s: str) -> str:
    return (s or "").replace("\r\n", "\n").replace("\r", "\n")


def _format_trace_md(trace: object) -> list[str]:
    lines: list[str] = []
    if not isinstance(trace, list) or not trace:
        lines.append(
            "_（`rewrite_attempt_trace` が空です。`LIVE_ES_REVIEW_CAPTURE_DEBUG=1` でライブテストを再実行してください。）_"
        )
        return lines
    for idx, item in enumerate(trace, start=1):
        if not isinstance(item, dict):
            lines.append(f"- trace[{idx}]: {item!r}")
            continue
        stage = item.get("stage", "")
        accepted = item.get("accepted", "")
        lines.append(f"#### Trace {idx}: stage=`{stage}` accepted=`{accepted}`")
        if item.get("attempt_index"):
            lines.append(f"- attempt_index: {item.get('attempt_index')}/{item.get('total_rewrite_attempts', '')}")
        if item.get("prompt_mode"):
            lines.append(f"- prompt_mode: {item.get('prompt_mode')}")
        if item.get("fix_pass"):
            lines.append(f"- fix_pass: {item.get('fix_pass')}/{item.get('length_fix_total', '')}")
        if item.get("retry_reason"):
            lines.append(f"- retry_reason: `{item.get('retry_reason')}`")
        lines.append(f"- char_count: {item.get('char_count', '')}")
        lines.append("")
        lines.append("```")
        lines.append(_md_safe_line(str(item.get("text", ""))))
        lines.append("```")
        lines.append("")
    return lines


def _format_list_md(label: str, items: object) -> list[str]:
    lines = [f"- **{label}**:"]
    if not items:
        lines.append("  - （なし）")
        return lines
    if isinstance(items, list):
        for it in items:
            lines.append(f"  - `{_md_safe_line(str(it))}`")
    else:
        lines.append(f"  - `{_md_safe_line(str(items))}`")
    return lines


def main() -> int:
    repo_root = Path(__file__).resolve().parents[2]
    default_glob = "live_es_review_*.json"
    if len(sys.argv) > 1:
        paths = [Path(p) for p in sys.argv[1:]]
    else:
        out = repo_root / "backend" / "tests" / "output"
        paths = sorted(out.glob(default_glob))
    paths = [p for p in paths if p.is_file() and "aggregate" not in p.name]
    if not paths:
        print("No live_es_review_*.json files found.", file=sys.stderr)
        return 1

    per_key: dict[tuple[str, str], dict[str, object]] = {}
    global_reasons: Counter[str] = Counter()
    runs_detail: list[dict[str, object]] = []

    for path in paths:
        for row_index, row in enumerate(_load_rows(path)):
            detail_entry = dict(row)
            detail_entry["source_file"] = str(path)
            detail_entry["row_index"] = row_index
            runs_detail.append(detail_entry)

            case_id = str(row.get("case_id") or "")
            model = str(row.get("model") or "")
            if case_id == "*" or not case_id:
                continue
            key = (model, case_id)
            if key not in per_key:
                per_key[key] = {
                    "model": model,
                    "case_id": case_id,
                    "runs": 0,
                    "passed": 0,
                    "failed": 0,
                }
            st = per_key[key]
            st["runs"] = int(st["runs"]) + 1  # type: ignore[arg-type]
            status = row.get("status")
            if status == "passed":
                st["passed"] = int(st["passed"]) + 1  # type: ignore[arg-type]
            else:
                st["failed"] = int(st["failed"]) + 1  # type: ignore[arg-type]
            for r in row.get("deterministic_fail_reasons") or []:
                s = str(r)
                global_reasons[s] += 1
            for r in row.get("judge_blocking_reasons") or []:
                s = str(r)
                global_reasons[s] += 1

    ts = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    out_dir = repo_root / "backend" / "tests" / "output"
    out_dir.mkdir(parents=True, exist_ok=True)
    json_path = out_dir / f"live_es_review_aggregate_{ts}.json"
    md_path = out_dir / f"live_es_review_aggregate_{ts}.md"

    summary = {
        "generated_at": ts,
        "source_files": [str(p) for p in paths],
        "by_model_case": [per_key[k] for k in sorted(per_key, key=lambda x: (x[0], x[1]))],
        "failure_reason_counts": dict(global_reasons.most_common()),
        "runs_detail": runs_detail,
    }
    json_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    lines = [
        f"# Live ES review aggregate ({ts})",
        "",
        f"Source files: {len(paths)}",
        "",
        "## Pass rate by model × case_id",
        "",
        "| model | case_id | runs | passed | failed | pass_rate |",
        "|---|---|---:|---:|---:|---:|",
    ]
    for item in summary["by_model_case"]:
        runs = int(item["runs"])
        passed = int(item["passed"])
        rate = f"{100.0 * passed / runs:.0f}%" if runs else "n/a"
        lines.append(
            f"| {item['model']} | {item['case_id']} | {runs} | {passed} | {item['failed']} | {rate} |"
        )
    lines.extend(["", "## Failure reason frequency (all runs)", ""])
    for reason, cnt in global_reasons.most_common(80):
        lines.append(f"- `{cnt}` × {reason}")
    lines.extend(
        [
            "",
            "## Run-by-run detail",
            "",
            "各ソース JSON の行順。リライト全文を含むためファイルサイズが大きくなります。",
            "",
        ]
    )

    for entry in runs_detail:
        src = Path(str(entry.get("source_file", ""))).name
        model = entry.get("model", "")
        case_id = entry.get("case_id", "")
        ri = entry.get("row_index", "")
        lines.append(f"### {src} | row {ri} | {model} | {case_id}")
        lines.append("")
        lines.append(f"- **status**: {entry.get('status', '')}")
        lines.append(f"- **template_type**: `{entry.get('template_type', '')}`")
        lines.append("- **question**:")
        lines.append("")
        lines.append("```")
        lines.append(_md_safe_line(str(entry.get("question", ""))))
        lines.append("```")
        lines.append("")
        lines.append(
            f"- **char_min / char_max / char_count**: {entry.get('char_min', '')} / "
            f"{entry.get('char_max', '')} / {entry.get('char_count', '')}"
        )
        lines.append(f"- **rewrite_attempt_count**（採用試行・1-based）: {entry.get('rewrite_attempt_count', '')}")
        lines.append(
            f"- **rewrite_total_rewrite_attempts**（rewrite ループ上限）: "
            f"{entry.get('rewrite_total_rewrite_attempts', '')}"
        )
        lines.extend(_format_list_md("rewrite_rejection_reasons", entry.get("rewrite_rejection_reasons")))
        lines.append("")
        lines.append("- **rewrite_attempt_trace**（各試行の生成テキスト）:")
        lines.append("")
        lines.extend(_format_trace_md(entry.get("rewrite_attempt_trace")))
        lines.append("- **final_rewrite**（採用された最終案）:")
        lines.append("")
        lines.append("```")
        lines.append(_md_safe_line(str(entry.get("final_rewrite", ""))))
        lines.append("```")
        lines.append("")
        lines.extend(_format_list_md("deterministic_fail_reasons", entry.get("deterministic_fail_reasons")))
        lines.extend(_format_list_md("judge_blocking_reasons", entry.get("judge_blocking_reasons")))
        if entry.get("template_rewrite_debug"):
            lines.append("- **template_rewrite_debug**（422 等）:")
            lines.append("")
            lines.append("```json")
            try:
                lines.append(json.dumps(entry.get("template_rewrite_debug"), ensure_ascii=False, indent=2))
            except TypeError:
                lines.append(repr(entry.get("template_rewrite_debug")))
            lines.append("```")
        lines.append("")
        oa = entry.get("original_answer")
        if oa is not None and oa != "":
            lines.append("- **original_answer**（学生ドラフト）:")
            lines.append("")
            lines.append("```")
            lines.append(_md_safe_line(str(oa)))
            lines.append("```")
            lines.append("")

    md_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {json_path}")
    print(f"Wrote {md_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
