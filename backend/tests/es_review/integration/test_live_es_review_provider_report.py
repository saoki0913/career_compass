from __future__ import annotations

import asyncio
import json
import os
import socket
import sys
from datetime import UTC, datetime
from pathlib import Path
from time import perf_counter

import pytest
from fastapi import HTTPException

from app.config import settings
from app.routers.es_review import ReviewRequest, TemplateRequest, review_section_with_template
from app.testing.es_review_live_gate import (
    CANARY_CASE_SET,
    DEFAULT_JUDGE_MODEL,
    SMOKE_CASE_SET,
    LiveESReviewCase,
    evaluate_live_case,
    filter_live_cases,
    get_live_cases,
    get_selected_models,
)
from app.utils.llm import call_llm_with_error


MODEL_MATRIX = {
    "claude-sonnet": {"provider": "claude", "api_key_attr": "anthropic_api_key", "host": "api.anthropic.com"},
    "gpt-5.4": {"provider": "openai", "api_key_attr": "openai_api_key", "host": "api.openai.com"},
    "gpt-5.4-mini": {"provider": "openai", "api_key_attr": "openai_api_key", "host": "api.openai.com"},
    "low-cost": {"provider": "openai", "api_key_attr": "openai_api_key", "host": "api.openai.com"},
    "gemini-3.1-pro-preview": {
        "provider": "google",
        "api_key_attr": "google_api_key",
        "host": "generativelanguage.googleapis.com",
    },
}

JUDGE_SCHEMA = {
    "type": "object",
    "properties": {
        "question_fit": {"type": "integer", "minimum": 1, "maximum": 5},
        "user_fact_use": {"type": "integer", "minimum": 1, "maximum": 5},
        "company_grounding": {"type": "integer", "minimum": 1, "maximum": 5},
        "composition_quality": {"type": "integer", "minimum": 1, "maximum": 5},
        "naturalness": {"type": "integer", "minimum": 1, "maximum": 5},
        "overall_pass": {"type": "boolean"},
        "warnings": {"type": "array", "items": {"type": "string"}},
        "fail_reasons": {"type": "array", "items": {"type": "string"}},
    },
    "required": [
        "question_fit",
        "user_fact_use",
        "company_grounding",
        "composition_quality",
        "naturalness",
        "overall_pass",
        "warnings",
        "fail_reasons",
    ],
    "additionalProperties": False,
}


def _selected_case_set() -> str:
    return (os.getenv("LIVE_ES_REVIEW_CASE_SET", SMOKE_CASE_SET).strip().lower() or SMOKE_CASE_SET)


def _selected_cases(case_set: str) -> list[LiveESReviewCase]:
    cases = get_live_cases(case_set)
    return filter_live_cases(cases, os.getenv("LIVE_ES_REVIEW_CASE_FILTER", ""))


def _selected_models(case_set: str) -> list[str]:
    return get_selected_models(case_set, os.getenv("LIVE_ES_REVIEW_PROVIDERS", ""))


def _output_dir() -> Path:
    default = Path(__file__).resolve().parents[2] / "output"
    raw = os.getenv("LIVE_ES_REVIEW_OUTPUT_DIR", "").strip()
    return Path(raw) if raw else default


def _judge_enabled(case_set: str) -> bool:
    default = "0" if case_set == SMOKE_CASE_SET else "1"
    return os.getenv("LIVE_ES_REVIEW_ENABLE_JUDGE", default) == "1"


def _judge_model() -> str:
    return os.getenv("LIVE_ES_REVIEW_JUDGE_MODEL", DEFAULT_JUDGE_MODEL).strip() or DEFAULT_JUDGE_MODEL


def _collect_only() -> bool:
    return os.getenv("LIVE_ES_REVIEW_COLLECT_ONLY", "0").strip() == "1"


def _blocking_failures_enabled(case_set: str) -> bool:
    override = os.getenv("LIVE_ES_REVIEW_BLOCKING_FAILURES", "").strip()
    if override == "1":
        return True
    if override == "0":
        return False
    if _collect_only():
        return False
    return case_set == SMOKE_CASE_SET


def _md_detail_level() -> str:
    """Markdown 付録に載せるケース: failed のみ（既定） / 全件（all）。"""
    raw = os.getenv("LIVE_ES_REVIEW_MD_DETAIL", "failed").strip().lower()
    return "all" if raw == "all" else "failed"


def _review_meta_diag(review_meta: object | None) -> dict[str, object] | None:
    if review_meta is None:
        return None
    return {
        "llm_provider": getattr(review_meta, "llm_provider", None),
        "llm_model": getattr(review_meta, "llm_model", None),
        "grounding_mode": getattr(review_meta, "grounding_mode", None),
        "company_grounding_policy": getattr(review_meta, "company_grounding_policy", None),
        "effective_company_grounding_policy": getattr(
            review_meta, "effective_company_grounding_policy", None
        ),
        "company_evidence_count": getattr(review_meta, "company_evidence_count", None),
        "company_evidence_verified_count": getattr(review_meta, "company_evidence_verified_count", None),
        "evidence_coverage_level": getattr(review_meta, "evidence_coverage_level", None),
        "weak_evidence_notice": getattr(review_meta, "weak_evidence_notice", None),
        "selected_company_evidence_themes": list(
            getattr(review_meta, "selected_company_evidence_themes", []) or []
        ),
        "rewrite_validation_status": getattr(review_meta, "rewrite_validation_status", None),
        "rewrite_validation_codes": list(getattr(review_meta, "rewrite_validation_codes", []) or []),
        "rewrite_generation_mode": getattr(review_meta, "rewrite_generation_mode", None),
        "length_profile_id": getattr(review_meta, "length_profile_id", None),
        "target_window_lower": getattr(review_meta, "target_window_lower", None),
        "target_window_upper": getattr(review_meta, "target_window_upper", None),
        "length_shortfall": getattr(review_meta, "length_shortfall", None),
        "length_shortfall_bucket": getattr(review_meta, "length_shortfall_bucket", None),
        "unfinished_tail_detected": getattr(review_meta, "unfinished_tail_detected", None),
        "retrieval_profile_name": getattr(review_meta, "retrieval_profile_name", None),
        "priority_source_match_count": getattr(review_meta, "priority_source_match_count", None),
    }


def _bucket_deterministic_failure(reason: str) -> str:
    r = (reason or "").strip()
    if r.startswith("char_count"):
        return "文字数"
    if r.startswith("length_shortfall_bucket"):
        return "文字数"
    if "focus_tokens" in r or r.startswith("forbidden_token"):
        return "フォーカス/禁止語"
    if r.startswith("focus_group_missing"):
        return "フォーカス/禁止語"
    if r.startswith("style:") or r == "style:not_dearu":
        return "文体(だ・である)"
    if r.startswith("unfinished_tail"):
        return "文体(だ・である)"
    if r.startswith("review_meta"):
        return "review_meta欠落"
    if "company_evidence_count" in r:
        return "企業根拠件数"
    if r.startswith("evidence_coverage_level"):
        return "根拠カバレッジ"
    if r.startswith("grounding_mode"):
        return "grounding_mode"
    if r.startswith("weak_evidence_notice"):
        return "弱根拠通知"
    if r.startswith("first_sentence"):
        return "先頭文"
    if r.startswith("company_tokens") or r.startswith("user_fact_tokens"):
        return "必須トークン(ユーザー/企業)"
    if r.startswith("companyless"):
        return "companyless違反"
    if r.startswith("llm_provider") or r.startswith("llm_model"):
        return "provider/modelメタ"
    if r.startswith("company_grounding_policy"):
        return "groundingポリシー"
    if r.startswith("judge:"):
        return "ジャッジブロック"
    return "その他"


def test_review_meta_diag_includes_new_length_and_grounding_diagnostics() -> None:
    review_meta = type(
        "Meta",
        (),
        {
            "llm_provider": "openai",
            "llm_model": "gpt-5.4-mini",
            "grounding_mode": "company_general",
            "company_grounding_policy": "required",
            "effective_company_grounding_policy": "required",
            "company_evidence_count": 2,
            "company_evidence_verified_count": 2,
            "evidence_coverage_level": "partial",
            "weak_evidence_notice": True,
            "selected_company_evidence_themes": ["事業理解", "現場期待"],
            "rewrite_validation_status": "strict_ok",
            "rewrite_validation_codes": [],
            "rewrite_generation_mode": "rewrite",
            "length_profile_id": "openai-mini-medium",
            "target_window_lower": 180,
            "target_window_upper": 200,
            "length_shortfall": 12,
            "length_shortfall_bucket": "6-20",
            "unfinished_tail_detected": True,
            "retrieval_profile_name": "family_aligned",
            "priority_source_match_count": 1,
        },
    )()

    diag = _review_meta_diag(review_meta)

    assert diag is not None
    assert diag["selected_company_evidence_themes"] == ["事業理解", "現場期待"]
    assert diag["length_shortfall_bucket"] == "6-20"
    assert diag["unfinished_tail_detected"] is True


def test_bucket_deterministic_failure_maps_new_reasons() -> None:
    assert _bucket_deterministic_failure("length_shortfall_bucket:6-20") == "文字数"
    assert _bucket_deterministic_failure("focus_group_missing:2") == "フォーカス/禁止語"
    assert _bucket_deterministic_failure("unfinished_tail:detected") == "文体(だ・である)"


def _format_attempt_trace_md(trace: object) -> str:
    if not isinstance(trace, list) or not trace:
        return "_(なし)_"
    lines: list[str] = []
    for step in trace[-24:]:
        if not isinstance(step, dict):
            lines.append(f"- `{step}`")
            continue
        stage = step.get("stage", "")
        att = step.get("attempt_index", step.get("fix_pass", ""))
        acc = step.get("accepted", "")
        rr = (step.get("retry_reason") or "").replace("\n", " ").strip()
        if len(rr) > 200:
            rr = rr[:197] + "..."
        codes = step.get("failure_codes") or []
        lft = step.get("length_fix_total")
        fp = step.get("fix_pass")
        sfx_parts: list[str] = []
        if lft is not None:
            sfx_parts.append(f"length_fix_total={lft}")
        if fp is not None:
            sfx_parts.append(f"fix_pass={fp}")
        sfx = (" " + " ".join(sfx_parts)) if sfx_parts else ""
        lines.append(
            f"- **{stage}** attempt={att} accepted={acc} codes={codes}{sfx}"
            + (f" — {rr}" if rr else "")
        )
    if len(trace) > 24:
        lines.insert(0, f"_（直近24件 / 全{len(trace)}件）_")
    return "\n".join(lines)


def _judge_scores_md(scores: object) -> str:
    if not isinstance(scores, dict):
        return "_(なし)_"
    lines = [
        f"- overall_pass: `{scores.get('overall_pass')}`",
    ]
    for k in (
        "question_fit",
        "user_fact_use",
        "company_grounding",
        "composition_quality",
        "naturalness",
    ):
        if k in scores:
            lines.append(f"- {k}: `{scores.get(k)}`")
    fr = scores.get("fail_reasons")
    if isinstance(fr, list) and fr:
        lines.append("- fail_reasons:")
        for item in fr:
            lines.append(f"  - {item}")
    warn = scores.get("warnings")
    if isinstance(warn, list) and warn:
        lines.append("- warnings:")
        for item in warn[:8]:
            lines.append(f"  - {item}")
    return "\n".join(lines)


def _append_markdown_diagnostic_appendix(md_lines: list[str], rows: list[dict[str, object]]) -> None:
    detail = _md_detail_level()
    md_lines.extend(
        [
            "",
            "## 読み方（表と付録）",
            "",
            "- 表の `judge` は **ジャッジ API が応答したか** の要約に近い。`ok` でも **`deterministic_fail_reasons` あり**なら `status=failed` になり得る（`LIVE_ES_REVIEW_REQUIRE_JUDGE_PASS=0` 時はジャッジはブロックに使われないことが多い）。",
            "- 次節の **失敗内訳** は `evaluate_live_case` の文字列を大まかに分類したもの。",
            f"- **ケース別詳細** は `LIVE_ES_REVIEW_MD_DETAIL={detail}`（`failed`=失敗のみ / `all`=全件）。",
            "",
        ]
    )

    bucket_counts: dict[str, int] = {}
    for row in rows:
        if row.get("status") != "failed":
            continue
        for r in row.get("deterministic_fail_reasons") or []:
            b = _bucket_deterministic_failure(str(r))
            bucket_counts[b] = bucket_counts.get(b, 0) + 1
        for r in row.get("judge_blocking_reasons") or []:
            b = _bucket_deterministic_failure(str(r))
            bucket_counts[b] = bucket_counts.get(b, 0) + 1

    if bucket_counts:
        md_lines.extend(["## 失敗の内訳（決定論・ジャッジ理由の粗分類）", "", "| 分類 | 件数 |", "|---|---:|"])
        for name, cnt in sorted(bucket_counts.items(), key=lambda x: (-x[1], x[0])):
            md_lines.append(f"| {name} | {cnt} |")
        md_lines.append("")
    else:
        md_lines.extend(["## 失敗の内訳", "", "_（今回の実行では失敗行なし）_", ""])

    md_lines.extend(
        [
            "## ケース別詳細（改善用）",
            "",
        ]
    )

    for row in rows:
        st = str(row.get("status", ""))
        if detail == "failed" and st == "passed":
            continue
        cid = row.get("case_id", "")
        model = row.get("model", "")
        if cid == "*" and st == "skipped":
            md_lines.extend(
                [
                    f"### `{model}` × `*` — **skipped**",
                    "",
                    f"- note: `{row.get('note', '')}`",
                    "",
                    "---",
                    "",
                ]
            )
            continue
        heading = f"### `{model}` × `{cid}` — **{st}**"
        md_lines.extend([heading, ""])

        det = row.get("deterministic_fail_reasons")
        jb = row.get("judge_blocking_reasons")
        md_lines.append("**決定論失敗**")
        if det:
            md_lines.extend([""] + [f"- `{d}`" for d in det] + [""])
        else:
            md_lines.extend(["", "_(なし)_", ""])
        md_lines.append("**ジャッジでブロックした理由**（該当時）")
        if jb:
            md_lines.extend([""] + [f"- `{j}`" for j in jb] + [""])
        else:
            md_lines.extend(["", "_(なし)_", ""])

        cmin, cmax = row.get("char_min"), row.get("char_max")
        cc = row.get("char_count")
        md_lines.extend(
            [
                "| 項目 | 値 |",
                "|---|---|",
                f"| template | `{row.get('template_type', '')}` |",
                f"| 文字数 | **{cc}** / 要求 `[{cmin}, {cmax}]` |",
                f"| retries / length_fix | `{row.get('rewrite_attempt_count')}` / `{row.get('length_fix_result')}` |",
                f"| length_policy / shortfall | `{row.get('length_policy')}` / `{row.get('length_shortfall')}` |",
                f"| judge_status | `{row.get('judge_status')}` |",
                "",
            ]
        )

        diag = row.get("review_meta_diag")
        if isinstance(diag, dict) and diag:
            md_lines.extend(
                [
                    "**review_meta（ログ相当の要約）**",
                    "",
                    "| キー | 値 |",
                    "|---|---|",
                ]
            )
            for k, v in diag.items():
                md_lines.append(f"| {k} | `{v}` |")
            md_lines.append("")

        md_lines.extend(["**ジャッジスコア**（有効時）", "", _judge_scores_md(row.get("judge_scores")), ""])

        fr = row.get("final_rewrite")
        if isinstance(fr, str) and fr.strip():
            md_lines.extend(
                [
                    "**final_rewrite**",
                    "",
                    "```",
                    fr.strip(),
                    "```",
                    "",
                ]
            )

        md_lines.extend(
            [
                "**rewrite_attempt_trace**（`LIVE_ES_REVIEW_CAPTURE_DEBUG=1` 時）",
                "",
                _format_attempt_trace_md(row.get("rewrite_attempt_trace")),
                "",
            ]
        )

        rr = row.get("rewrite_rejection_reasons")
        if isinstance(rr, list) and rr:
            md_lines.extend(["**rewrite_rejection_reasons**", ""] + [f"- {x}" for x in rr[-16:]] + [""])

        if row.get("template_rewrite_debug"):
            md_lines.extend(
                [
                    "**HTTP 422 debug（抜粋）**",
                    "",
                    "```json",
                    json.dumps(row["template_rewrite_debug"], ensure_ascii=False, indent=2)[:8000],
                    "```",
                    "",
                ]
            )

        q = row.get("question")
        if isinstance(q, str) and q.strip():
            md_lines.extend(["**設問（抜粋）**", "", f"> {q[:400]}{'…' if len(q) > 400 else ''}", ""])

        md_lines.append("---")
        md_lines.append("")


def _case_report_fields(case: LiveESReviewCase) -> dict[str, object]:
    return {
        "template_type": case.template_type,
        "question": case.question,
        "char_min": case.char_min,
        "char_max": case.char_max,
        "original_answer": case.answer,
    }


def _cli_progress_enabled() -> bool:
    return os.getenv("LIVE_ES_REVIEW_CLI_PROGRESS", "0").strip() == "1"


def _cli_progress(
    *,
    step: int,
    total: int,
    phase: str,
    model_id: str,
    case_id: str,
    detail: str = "",
) -> None:
    if not _cli_progress_enabled():
        return
    rnd = os.getenv("LIVE_ES_REVIEW_CLI_ROUND", "").strip()
    head = "[live-es-review]"
    if rnd:
        head += f" round {rnd}"
    line = f"{head} [{step}/{total}] {phase} model={model_id} case={case_id}"
    if detail:
        line += f" | {detail}"
    print(line, file=sys.stderr, flush=True)


def _require_judge_pass() -> bool:
    return os.getenv("LIVE_ES_REVIEW_REQUIRE_JUDGE_PASS", "0").strip() == "1"


def _judge_min_score_thresholds() -> dict[str, int]:
    raw = os.getenv("LIVE_ES_REVIEW_JUDGE_MIN_SCORES", "").strip()
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    if not isinstance(parsed, dict):
        return {}
    out: dict[str, int] = {}
    for k, v in parsed.items():
        if isinstance(k, str) and isinstance(v, (int, float)):
            out[k] = int(v)
    return out


def _judge_blocking_failures(
    judge_result: dict[str, object] | None,
    *,
    require: bool,
    min_scores: dict[str, int],
) -> list[str]:
    if not require or judge_result is None:
        return []
    status = str(judge_result.get("status") or "")
    if status == "skipped":
        return [f"judge:skipped:{judge_result.get('reason', '')}"]
    if status != "ok":
        return [f"judge:{status}:{judge_result.get('reason', '')}"]
    scores = judge_result.get("scores")
    if not isinstance(scores, dict):
        return ["judge:invalid_scores"]
    if not scores.get("overall_pass"):
        fr = scores.get("fail_reasons")
        detail = ", ".join(str(x) for x in fr) if isinstance(fr, list) else str(fr)
        return [f"judge:overall_pass_false:{detail}"]
    for key, minimum in min_scores.items():
        val = scores.get(key)
        if isinstance(val, bool):
            continue
        if isinstance(val, (int, float)) and int(val) < minimum:
            return [f"judge:score_{key}:{val}<{minimum}"]
    return []


def _is_canary_case_set(case_set: str) -> bool:
    return case_set == CANARY_CASE_SET


def _preflight_provider(model_id: str) -> dict[str, str]:
    metadata = MODEL_MATRIX.get(model_id)
    if not metadata:
        return {"status": "unknown", "failure_kind": "config", "reason": "unknown_model"}
    api_key = getattr(settings, metadata["api_key_attr"], "")
    if not api_key:
        return {"status": "missing_api_key", "failure_kind": "config", "reason": "missing_api_key"}
    host = metadata.get("host", "")
    if not host:
        return {"status": "ready", "failure_kind": "none", "reason": "no_host_check"}
    try:
        socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
    except OSError as exc:
        return {"status": "dns_failed", "failure_kind": "infra", "reason": f"dns_failed:{exc}"}
    return {"status": "ready", "failure_kind": "none", "reason": "ready"}


def _infer_failure_kind(note: str) -> str:
    lowered = (note or "").lower()
    if any(token in lowered for token in ("network", "接続", "nodename nor servname", "dns", "timeout")):
        return "infra"
    if "missing_api_key" in lowered:
        return "config"
    return "quality"


async def _review_section_with_template_retry(**kwargs: object) -> object:
    last_exc: BaseException | None = None
    for attempt in range(3):
        try:
            return await review_section_with_template(**kwargs)  # type: ignore[arg-type]
        except Exception as exc:
            last_exc = exc
            msg = str(exc)
            if attempt < 2 and "422" in msg and "再実行" in msg:
                await asyncio.sleep(3)
                continue
            raise
    assert last_exc is not None
    raise last_exc


async def _maybe_run_judge(case: LiveESReviewCase, rewrite: str) -> dict[str, object] | None:
    if not settings.openai_api_key:
        return {"status": "skipped", "reason": "missing_openai_api_key"}

    user_lines = [
        f"case_id: {case.case_id}",
        f"template_type: {case.template_type}",
        f"question: {case.question}",
        f"original_answer: {case.answer}",
        f"rewrite: {rewrite}",
        f"char_range: {case.char_min}-{case.char_max}",
        f"company_context: {case.company_context}",
    ]
    if case.company_name:
        user_lines.append(f"company_name: {case.company_name}")
    if case.role_name:
        user_lines.append(f"role_name: {case.role_name}")
    if case.intern_name:
        user_lines.append(f"intern_name: {case.intern_name}")
    if case.rag_sources:
        user_lines.append("rag_sources:")
        for source in case.rag_sources[:3]:
            user_lines.append(
                f"- {source.get('title','')} / {source.get('excerpt','')} / {source.get('source_url','')}"
            )

    system_prompt = """あなたは日本語ES添削の品質評価者です。
与えられた設問・元回答・添削後回答を読み、以下を5点満点で厳格に採点してください。
- question_fit: 設問に正面から答えているか
- user_fact_use: ユーザー元回答の事実や経験を活用できているか
- company_grounding: 企業情報の使い方が適切で、必要以上に断定していないか
- composition_quality: 結論先行で、参考ESらしい構成と読みやすさがあるか
- naturalness: 日本語として不自然でないか
fail_reasons には重大な欠点だけ、warnings には軽微な懸念だけを書いてください。
JSON以外は出力しないでください。"""

    result = await call_llm_with_error(
        system_prompt=system_prompt,
        user_message="\n".join(user_lines),
        max_tokens=250,
        temperature=0.1,
        model=_judge_model(),
        feature="es_review",
        response_format="json_schema",
        json_schema=JUDGE_SCHEMA,
        use_responses_api=True,
        retry_on_parse=True,
        disable_fallback=True,
    )
    if not result.success or not result.data:
        return {
            "status": "failed",
            "reason": getattr(result.error, "detail", "judge_failed") if result.error else "judge_failed",
        }
    return {
        "status": "ok",
        "scores": result.data,
        "usage": result.usage,
    }


def _write_report(case_set: str, rows: list[dict[str, object]]) -> tuple[Path, Path]:
    output_dir = _output_dir()
    output_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    json_path = output_dir / f"live_es_review_{case_set}_{timestamp}.json"
    md_path = output_dir / f"live_es_review_{case_set}_{timestamp}.md"

    json_path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    md_lines = [
        f"# Live ES Review Report ({case_set})",
        "",
        "| model | case | band | context | status | failure_kind | preflight | chars | retries | length_fix | judge | duration_ms | note |",
        "|---|---|---|---|---:|---|---|---:|---:|---|---|---:|---|",
    ]
    for row in rows:
        judge = row.get("judge_status", "")
        md_lines.append(
            f"| {row['model']} | {row['case_id']} | {row.get('char_band','')} | {row.get('company_context','')} | {row['status']} | {row.get('failure_kind','')} | {row.get('preflight_status','')} | {row.get('char_count','')} | {row.get('rewrite_attempt_count','')} | {row.get('length_fix_result','')} | {judge} | {row.get('duration_ms', '')} | {row.get('note','')} |"
        )
    _append_markdown_diagnostic_appendix(md_lines, rows)
    md_path.write_text("\n".join(md_lines) + "\n", encoding="utf-8")
    return json_path, md_path


@pytest.mark.integration
@pytest.mark.slow
@pytest.mark.asyncio
async def test_live_es_review_provider_report(monkeypatch: pytest.MonkeyPatch) -> None:
    if os.getenv("RUN_LIVE_ES_REVIEW") != "1":
        pytest.skip("Set RUN_LIVE_ES_REVIEW=1 to enable live ES review provider gate.")

    case_set = _selected_case_set()
    selected_cases = _selected_cases(case_set)
    selected_models = _selected_models(case_set)
    fail_on_missing_keys = os.getenv("LIVE_ES_REVIEW_FAIL_ON_MISSING_KEYS", "0") == "1"
    enable_judge = _judge_enabled(case_set)
    require_judge_pass = _require_judge_pass()
    judge_min_scores = _judge_min_score_thresholds()
    collect_only = _collect_only()
    blocking_failures_enabled = _blocking_failures_enabled(case_set)
    missing_models = [
        model_id
        for model_id in selected_models
        if model_id not in MODEL_MATRIX or not getattr(settings, MODEL_MATRIX[model_id]["api_key_attr"], "")
    ]
    if missing_models and fail_on_missing_keys:
        pytest.fail(f"Missing API keys for live ES review providers: {', '.join(missing_models)}")
    if len(missing_models) == len(selected_models):
        pytest.skip("No live ES review provider API keys are configured.")

    monkeypatch.setenv("LIVE_ES_REVIEW_CAPTURE_DEBUG", "1")

    rows: list[dict[str, object]] = []
    blocking_failures: list[str] = []

    progress_total = len(selected_models) * len(selected_cases)
    progress_step = 0

    for model_id in selected_models:
        if model_id in missing_models:
            progress_step += len(selected_cases)
            _cli_progress(
                step=min(progress_step, progress_total),
                total=progress_total,
                phase="skip_model_missing_key",
                model_id=model_id,
                case_id="*",
            )
            rows.append(
                {
                    "case_set": case_set,
                    "model": model_id,
                    "case_id": "*",
                    "status": "skipped",
                    "failure_kind": "config",
                    "preflight_status": "missing_api_key",
                    "duration_ms": 0,
                    "note": "missing_api_key",
                }
            )
            continue

        provider = MODEL_MATRIX[model_id]["provider"]
        preflight = _preflight_provider(model_id)
        if preflight["status"] != "ready":
            for case in selected_cases:
                progress_step += 1
                _cli_progress(
                    step=progress_step,
                    total=progress_total,
                    phase="preflight_block",
                    model_id=model_id,
                    case_id=case.case_id,
                    detail=preflight["reason"],
                )
                rows.append(
                    {
                        **_case_report_fields(case),
                        "case_set": case_set,
                        "model": model_id,
                        "case_id": case.case_id,
                        "char_band": case.char_band,
                        "company_context": case.company_context,
                        "status": "failed",
                        "failure_kind": preflight["failure_kind"],
                        "preflight_status": preflight["status"],
                        "judge_status": "not_run",
                        "duration_ms": 0,
                        "note": preflight["reason"],
                    }
                )
                if not _is_canary_case_set(case_set) and blocking_failures_enabled:
                    blocking_failures.append(f"{model_id}::{case.case_id} failed: {preflight['reason']}")
            continue
        for case in selected_cases:
            progress_step += 1
            _cli_progress(
                step=progress_step,
                total=progress_total,
                phase="review_start",
                model_id=model_id,
                case_id=case.case_id,
            )
            started = perf_counter()
            judge_result: dict[str, object] | None = None
            try:
                result = await _review_section_with_template_retry(
                    request=ReviewRequest(
                        content=case.answer,
                        section_title=case.question,
                        template_request=TemplateRequest(
                            template_type=case.template_type,
                            company_name=case.company_name,
                            question=case.question,
                            answer=case.answer,
                            char_min=case.char_min,
                            char_max=case.char_max,
                            intern_name=case.intern_name,
                            role_name=case.role_name,
                        ),
                    ),
                    rag_sources=case.rag_sources,
                    company_rag_available=bool(case.rag_sources),
                    llm_provider=provider,
                    llm_model=model_id,
                    grounding_mode=case.grounding_mode,
                    progress_queue=None,
                )
                rewrite = result.rewrites[0]
                review_meta = result.review_meta
                deterministic_failures = evaluate_live_case(
                    case,
                    rewrite=rewrite,
                    review_meta=review_meta,
                    provider=provider,
                    model_id=model_id,
                )
                if enable_judge:
                    judge_result = await _maybe_run_judge(case, rewrite)
                judge_failures = _judge_blocking_failures(
                    judge_result,
                    require=require_judge_pass and enable_judge,
                    min_scores=judge_min_scores,
                )
                combined_failures = list(deterministic_failures) + judge_failures

                duration_ms = int((perf_counter() - started) * 1000)
                # rewrite_attempt_count: ルーターが採用した改善案の試行番号（rewrite または length_fix を通算した 1-based）
                row: dict[str, object] = {
                    **_case_report_fields(case),
                    "case_set": case_set,
                    "model": model_id,
                    "case_id": case.case_id,
                    "char_band": case.char_band,
                    "company_context": case.company_context,
                    "status": "passed" if not combined_failures else "failed",
                    "failure_kind": "quality" if combined_failures else "none",
                    "preflight_status": preflight["status"],
                    "char_count": len(rewrite),
                    "rewrite_attempt_count": getattr(review_meta, "rewrite_attempt_count", None),
                    "rewrite_total_rewrite_attempts": getattr(
                        review_meta, "rewrite_total_rewrite_attempts", None
                    ),
                    "rewrite_rejection_reasons": list(
                        getattr(review_meta, "rewrite_rejection_reasons", []) or []
                    ),
                    "rewrite_attempt_trace": list(
                        getattr(review_meta, "rewrite_attempt_trace", []) or []
                    ),
                    "final_rewrite": rewrite,
                    "length_policy": getattr(review_meta, "length_policy", None),
                    "length_shortfall": getattr(review_meta, "length_shortfall", None),
                    "length_fix_result": getattr(review_meta, "length_fix_result", None),
                    "weak_evidence_notice": getattr(review_meta, "weak_evidence_notice", None),
                    "token_usage": review_meta.token_usage.model_dump() if review_meta and review_meta.token_usage else None,
                    "judge_status": judge_result.get("status") if judge_result else "disabled",
                    "judge_scores": judge_result.get("scores") if judge_result else None,
                    "judge_usage": judge_result.get("usage") if judge_result else None,
                    "deterministic_fail_reasons": deterministic_failures,
                    "judge_blocking_reasons": judge_failures,
                    "review_meta_diag": _review_meta_diag(review_meta),
                    "duration_ms": duration_ms,
                    "note": rewrite[:100].replace("\n", " "),
                }
                rows.append(row)
                st = "passed" if not combined_failures else "failed"
                _cli_progress(
                    step=progress_step,
                    total=progress_total,
                    phase=f"review_done:{st}",
                    model_id=model_id,
                    case_id=case.case_id,
                    detail=f"{duration_ms}ms det={len(deterministic_failures)} judge_block={len(judge_failures)}",
                )
                if combined_failures:
                    if not _is_canary_case_set(case_set) and blocking_failures_enabled:
                        blocking_failures.append(
                            f"{model_id}::{case.case_id} failed: {', '.join(combined_failures)}"
                        )
            except HTTPException as exc:
                detail = exc.detail if isinstance(exc.detail, dict) else {}
                dbg = detail.get("debug") if isinstance(detail, dict) else None
                note = str(exc.detail)[:500] if exc.detail is not None else str(exc)
                failure_kind = _infer_failure_kind(note)
                rows.append(
                    {
                        **_case_report_fields(case),
                        "case_set": case_set,
                        "model": model_id,
                        "case_id": case.case_id,
                        "char_band": case.char_band,
                        "company_context": case.company_context,
                        "status": "failed",
                        "failure_kind": failure_kind,
                        "preflight_status": preflight["status"],
                        "judge_status": judge_result.get("status") if judge_result else "not_run",
                        "duration_ms": int((perf_counter() - started) * 1000),
                        "template_rewrite_debug": dbg,
                        "rewrite_attempt_trace": (dbg or {}).get("rewrite_attempt_trace") if dbg else None,
                        "rewrite_rejection_reasons": (dbg or {}).get("attempt_failures") if dbg else None,
                        "note": note,
                    }
                )
                if not _is_canary_case_set(case_set) and blocking_failures_enabled:
                    blocking_failures.append(
                        f"{model_id}::{case.case_id} failed: {exc.detail}"
                        + (f" | debug={dbg}" if dbg else "")
                    )
                _cli_progress(
                    step=progress_step,
                    total=progress_total,
                    phase="review_done:failed_http",
                    model_id=model_id,
                    case_id=case.case_id,
                    detail=f"{int((perf_counter() - started) * 1000)}ms http",
                )
            except Exception as exc:  # pragma: no cover
                failure_kind = _infer_failure_kind(str(exc))
                rows.append(
                    {
                        **_case_report_fields(case),
                        "case_set": case_set,
                        "model": model_id,
                        "case_id": case.case_id,
                        "char_band": case.char_band,
                        "company_context": case.company_context,
                        "status": "failed",
                        "failure_kind": failure_kind,
                        "preflight_status": preflight["status"],
                        "judge_status": judge_result.get("status") if judge_result else "not_run",
                        "duration_ms": int((perf_counter() - started) * 1000),
                        "note": str(exc),
                    }
                )
                if not _is_canary_case_set(case_set) and blocking_failures_enabled:
                    blocking_failures.append(f"{model_id}::{case.case_id} failed: {exc}")
                _cli_progress(
                    step=progress_step,
                    total=progress_total,
                    phase="review_done:failed_exception",
                    model_id=model_id,
                    case_id=case.case_id,
                    detail=f"{int((perf_counter() - started) * 1000)}ms err={type(exc).__name__}",
                )

    json_path, md_path = _write_report(case_set, rows)
    assert json_path.exists()
    assert md_path.exists()
    if blocking_failures and blocking_failures_enabled:
        pytest.fail("\n".join(blocking_failures))
