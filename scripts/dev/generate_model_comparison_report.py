#!/usr/bin/env python3
"""Generate a multi-model ES review comparison report for human quality review.

Reads live_es_review_*.json files from a batch directory and produces a Markdown
report with side-by-side rewrite comparisons across models, deterministic check
summaries, and stability analysis across runs.

Usage:
  python scripts/dev/generate_model_comparison_report.py --input-dir <batch_dir> [--output <path.md>]
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter, defaultdict
from datetime import UTC, datetime
from pathlib import Path
from statistics import mean, pstdev


def _load_rows(path: Path) -> list[dict]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, list):
        return []
    return [r for r in raw if isinstance(r, dict)]


def _collect_all_rows(input_dir: Path, case_set: str) -> list[dict]:
    pattern = f"live_es_review_{case_set}_*.json"
    paths = sorted(input_dir.glob(pattern))
    paths = [p for p in paths if p.is_file() and "aggregate" not in p.name]
    if not paths:
        pattern = "live_es_review_*.json"
        paths = sorted(input_dir.glob(pattern))
        paths = [p for p in paths if p.is_file() and "aggregate" not in p.name]
    rows: list[dict] = []
    for idx, path in enumerate(paths):
        for row in _load_rows(path):
            row["_run_index"] = idx
            row["_source_file"] = path.name
            rows.append(row)
    return rows


def _bucket_failure(reason: str) -> str:
    r = (reason or "").strip()
    if r.startswith("char_count") or r.startswith("length_shortfall"):
        return "文字数"
    if "focus_tokens" in r or r.startswith("forbidden_token") or r.startswith("focus_group"):
        return "フォーカス/禁止語"
    if r.startswith("style:") or r.startswith("unfinished_tail"):
        return "文体"
    if "company_evidence" in r or r.startswith("evidence_coverage"):
        return "企業根拠"
    if r.startswith("grounding_mode") or r.startswith("company_grounding"):
        return "grounding"
    if r.startswith("company_tokens") or r.startswith("user_fact_tokens"):
        return "必須トークン"
    if r.startswith("companyless"):
        return "companyless"
    if r.startswith("llm_provider") or r.startswith("llm_model"):
        return "provider/model"
    return "その他"


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate ES review model comparison report")
    parser.add_argument("--input-dir", required=True, help="Batch directory with live_es_review_*.json files")
    parser.add_argument("--output", default="", help="Output markdown path (default: docs/review/feature/...)")
    parser.add_argument("--case-set", default="extended", help="Case set prefix for file matching")
    args = parser.parse_args()

    input_dir = Path(args.input_dir)
    if not input_dir.is_dir():
        print(f"Input directory not found: {input_dir}", file=sys.stderr)
        return 1

    rows = _collect_all_rows(input_dir, args.case_set)
    if not rows:
        print(f"No live_es_review_*.json files found in {input_dir}", file=sys.stderr)
        return 1

    models = sorted(set(r.get("model", "") for r in rows if r.get("case_id", "") != "*"))
    case_ids = list(dict.fromkeys(r.get("case_id", "") for r in rows if r.get("case_id", "") != "*"))
    run_count = max(r.get("_run_index", 0) for r in rows) + 1

    by_model_case: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for row in rows:
        cid = row.get("case_id", "")
        model = row.get("model", "")
        if cid != "*":
            by_model_case[(model, cid)].append(row)

    ts = datetime.now(UTC).strftime("%Y-%m-%d")
    lines: list[str] = []

    lines.append(f"# ES添削 マルチモデル品質比較レポート ({ts})")
    lines.append("")
    lines.append("## 概要")
    lines.append("")
    lines.append(f"- **モデル**: {', '.join(models)}")
    lines.append(f"- **ケースセット**: {args.case_set}")
    lines.append(f"- **ケース数**: {len(case_ids)}")
    lines.append(f"- **実行回数**: {run_count}")
    lines.append(f"- **合計データポイント**: {len([r for r in rows if r.get('case_id', '') != '*'])}")
    lines.append("- **Judge**: 無効（ユーザーレビュー方式）")
    lines.append(f"- **入力ディレクトリ**: `{input_dir}`")
    lines.append("")

    # --- Section 1: Deterministic check summary ---
    lines.append("## 1. 決定論チェック結果サマリ")
    lines.append("")

    model_stats: dict[str, dict] = {}
    for model in models:
        model_rows = [r for r in rows if r.get("model") == model and r.get("case_id", "") != "*"]
        total = len(model_rows)
        passed = sum(1 for r in model_rows if r.get("status") == "passed")
        pass_rate = f"{100.0 * passed / total:.1f}%" if total else "n/a"

        failure_buckets: Counter[str] = Counter()
        for r in model_rows:
            for reason in r.get("deterministic_fail_reasons") or []:
                failure_buckets[_bucket_failure(str(reason))] += 1

        char_counts = [r.get("char_count", 0) for r in model_rows if r.get("char_count")]
        durations = [r.get("duration_ms", 0) for r in model_rows if r.get("duration_ms")]
        retries = [r.get("rewrite_attempt_count", 1) for r in model_rows]

        model_stats[model] = {
            "total": total,
            "passed": passed,
            "pass_rate": pass_rate,
            "failure_buckets": failure_buckets,
            "avg_chars": f"{mean(char_counts):.0f}" if char_counts else "n/a",
            "avg_duration_ms": f"{mean(durations):.0f}" if durations else "n/a",
            "avg_retries": f"{mean(retries):.1f}" if retries else "n/a",
        }

    header = "| model | total | passed | pass率 | 文字数違反 | 文体違反 | フォーカス語 | 企業根拠 | 平均文字数 | 平均所要時間(ms) | 平均retry |"
    sep = "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|"
    lines.extend([header, sep])
    for model in models:
        s = model_stats[model]
        fb = s["failure_buckets"]
        lines.append(
            f"| {model} | {s['total']} | {s['passed']} | {s['pass_rate']} "
            f"| {fb.get('文字数', 0)} | {fb.get('文体', 0)} | {fb.get('フォーカス/禁止語', 0)} "
            f"| {fb.get('企業根拠', 0)} | {s['avg_chars']} | {s['avg_duration_ms']} | {s['avg_retries']} |"
        )
    lines.append("")

    # --- Section 2: Template type pass rate ---
    lines.append("## 2. テンプレートタイプ別 pass率")
    lines.append("")

    template_types = sorted(set(r.get("template_type", "") for r in rows if r.get("case_id", "") != "*"))
    header2 = "| template_type | " + " | ".join(models) + " |"
    sep2 = "|---| " + " | ".join(["---:" for _ in models]) + " |"
    lines.extend([header2, sep2])
    for tt in template_types:
        cells = []
        for model in models:
            tt_rows = [
                r for r in rows
                if r.get("model") == model and r.get("template_type") == tt and r.get("case_id", "") != "*"
            ]
            if not tt_rows:
                cells.append("n/a")
            else:
                passed = sum(1 for r in tt_rows if r.get("status") == "passed")
                cells.append(f"{100 * passed // len(tt_rows)}% ({passed}/{len(tt_rows)})")
        lines.append(f"| {tt} | " + " | ".join(cells) + " |")
    lines.append("")

    # --- Section 3: Per-case rewrite comparison ---
    lines.append("## 3. ケース別 添削結果一覧")
    lines.append("")
    lines.append("> ユーザーレビュー用: 各ケースの設問・元回答と各モデルの添削結果を表示します。")
    lines.append("> 3回実行のうち、最も代表的な結果（pass時は最初のpass、fail時は最後の結果）を表示。")
    lines.append("")

    for case_id in case_ids:
        first_row = None
        for m in models:
            candidate = by_model_case.get((m, case_id))
            if candidate:
                first_row = candidate[0]
                break
        if first_row is None:
            continue

        lines.append(f"### {case_id}")
        lines.append("")
        lines.append(f"**テンプレート**: `{first_row.get('template_type', '')}`")
        lines.append(f"**文字数制限**: {first_row.get('char_min', '')}-{first_row.get('char_max', '')}字")
        lines.append(f"**企業コンテキスト**: `{first_row.get('company_context', '')}`")
        lines.append("")
        lines.append("**設問**:")
        lines.append("")
        lines.append(f"> {first_row.get('question', '')}")
        lines.append("")
        lines.append("**元回答（学生ドラフト）**:")
        lines.append("")
        lines.append(f"> {first_row.get('original_answer', '')}")
        lines.append("")

        for model in models:
            model_runs = by_model_case.get((model, case_id), [])
            if not model_runs:
                lines.append(f"#### {model}: _(データなし)_")
                lines.append("")
                continue

            rep = None
            for r in model_runs:
                if r.get("status") == "passed":
                    rep = r
                    break
            if rep is None:
                rep = model_runs[-1]

            status = rep.get("status", "unknown")
            status_mark = "PASS" if status == "passed" else "FAIL"
            pass_count = sum(1 for r in model_runs if r.get("status") == "passed")
            stability = f"{pass_count}/{len(model_runs)}"

            lines.append(f"#### {model} [{status_mark}] (pass: {stability})")
            lines.append("")

            rewrite = rep.get("final_rewrite") or rep.get("note") or ""
            lines.append(f"> {rewrite}")
            lines.append("")

            char_count = rep.get("char_count", "?")
            duration = rep.get("duration_ms", "?")
            retries = rep.get("rewrite_attempt_count", "?")
            ai_smell = rep.get("ai_smell_count", 0)
            fail_reasons = rep.get("deterministic_fail_reasons") or []

            lines.append(f"- 文字数: **{char_count}** / 制限 [{first_row.get('char_min','')}-{first_row.get('char_max','')}]")
            lines.append(f"- 所要時間: {duration}ms")
            lines.append(f"- retry回数: {retries}")
            if ai_smell:
                smell_details = [
                    w.get("code", "") if isinstance(w, dict) else str(w)
                    for w in (rep.get("ai_smell_warnings") or [])
                ]
                lines.append(f"- AI臭検出: {ai_smell}件 ({', '.join(smell_details)})")
            if fail_reasons:
                lines.append(f"- 失敗理由: {', '.join(str(r) for r in fail_reasons)}")

            meta = rep.get("review_meta_diag") or {}
            if meta.get("evidence_coverage_level"):
                lines.append(f"- 企業根拠: {meta.get('company_evidence_count', 0)}件 (カバレッジ: {meta.get('evidence_coverage_level', '')})")
            if meta.get("selected_company_evidence_themes"):
                themes = meta["selected_company_evidence_themes"]
                lines.append(f"- 根拠テーマ: {', '.join(themes)}")

            lines.append("")

        lines.append("---")
        lines.append("")

    # --- Section 4: Stability analysis ---
    lines.append("## 4. 安定性分析（実行回ごとのばらつき）")
    lines.append("")

    header4 = "| model | run | passed | failed | pass率 |"
    sep4 = "|---|---:|---:|---:|---:|"
    lines.extend([header4, sep4])
    for model in models:
        for run_idx in range(run_count):
            run_rows = [
                r for r in rows
                if r.get("model") == model and r.get("_run_index") == run_idx and r.get("case_id", "") != "*"
            ]
            if not run_rows:
                continue
            passed = sum(1 for r in run_rows if r.get("status") == "passed")
            failed = len(run_rows) - passed
            rate = f"{100 * passed / len(run_rows):.1f}%"
            lines.append(f"| {model} | {run_idx + 1} | {passed} | {failed} | {rate} |")
    lines.append("")

    pass_rates_by_model: dict[str, list[float]] = defaultdict(list)
    for model in models:
        for run_idx in range(run_count):
            run_rows = [
                r for r in rows
                if r.get("model") == model and r.get("_run_index") == run_idx and r.get("case_id", "") != "*"
            ]
            if run_rows:
                passed = sum(1 for r in run_rows if r.get("status") == "passed")
                pass_rates_by_model[model].append(100 * passed / len(run_rows))

    if any(len(v) > 1 for v in pass_rates_by_model.values()):
        lines.append("### pass率の標準偏差")
        lines.append("")
        lines.append("| model | 平均pass率 | 標準偏差 | 最低 | 最高 |")
        lines.append("|---|---:|---:|---:|---:|")
        for model in models:
            rates = pass_rates_by_model.get(model, [])
            if len(rates) > 1:
                lines.append(
                    f"| {model} | {mean(rates):.1f}% | {pstdev(rates):.1f}% | {min(rates):.1f}% | {max(rates):.1f}% |"
                )
            elif rates:
                lines.append(f"| {model} | {rates[0]:.1f}% | n/a | {rates[0]:.1f}% | {rates[0]:.1f}% |")
        lines.append("")

    # --- Section 5: Failure pattern analysis ---
    lines.append("## 5. 失敗パターン分析")
    lines.append("")

    global_buckets: dict[str, Counter[str]] = {m: Counter() for m in models}
    for row in rows:
        model = row.get("model", "")
        if row.get("case_id", "") == "*" or model not in global_buckets:
            continue
        for reason in row.get("deterministic_fail_reasons") or []:
            global_buckets[model][_bucket_failure(str(reason))] += 1

    all_bucket_names = sorted(set(b for c in global_buckets.values() for b in c))
    if all_bucket_names:
        header5 = "| 失敗分類 | " + " | ".join(models) + " | 合計 |"
        sep5 = "|---| " + " | ".join(["---:" for _ in models]) + " | ---: |"
        lines.extend([header5, sep5])
        for bucket in all_bucket_names:
            cells = [str(global_buckets[m].get(bucket, 0)) for m in models]
            total = sum(global_buckets[m].get(bucket, 0) for m in models)
            lines.append(f"| {bucket} | " + " | ".join(cells) + f" | {total} |")
        lines.append("")
    else:
        lines.append("_失敗なし_")
        lines.append("")

    # --- Write output ---
    output_path: Path
    if args.output:
        output_path = Path(args.output)
    else:
        repo_root = Path(__file__).resolve().parents[2]
        output_path = repo_root / "docs" / "review" / "feature" / f"es-review-model-comparison-{ts}.md"

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
