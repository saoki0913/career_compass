from __future__ import annotations

import asyncio
import json
import os
import socket
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
    "command-a-03-2025": {"provider": "cohere", "api_key_attr": "cohere_api_key", "host": "api.cohere.com"},
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
            f"| {row['model']} | {row['case_id']} | {row.get('char_band','')} | {row.get('company_context','')} | {row['status']} | {row.get('failure_kind','')} | {row.get('preflight_status','')} | {row.get('char_count','')} | {row.get('rewrite_attempt_count','')} | {row.get('length_fix_result','')} | {judge} | {row['duration_ms']} | {row.get('note','')} |"
        )
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
    missing_models = [
        model_id
        for model_id in selected_models
        if model_id not in MODEL_MATRIX or not getattr(settings, MODEL_MATRIX[model_id]["api_key_attr"], "")
    ]
    if missing_models and fail_on_missing_keys:
        pytest.fail(f"Missing API keys for live ES review providers: {', '.join(missing_models)}")
    if len(missing_models) == len(selected_models):
        pytest.skip("No live ES review provider API keys are configured.")

    monkeypatch.setattr("app.routers.es_review._validate_reference_distance", lambda *args, **kwargs: (True, None))
    monkeypatch.setenv("LIVE_ES_REVIEW_CAPTURE_DEBUG", "1")

    rows: list[dict[str, object]] = []
    blocking_failures: list[str] = []

    for model_id in selected_models:
        if model_id in missing_models:
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
                rows.append(
                    {
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
                if not _is_canary_case_set(case_set):
                    blocking_failures.append(f"{model_id}::{case.case_id} failed: {preflight['reason']}")
            continue
        for case in selected_cases:
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
                    top3_count=len(result.top3),
                    provider=provider,
                    model_id=model_id,
                )
                if enable_judge:
                    judge_result = await _maybe_run_judge(case, rewrite)

                row: dict[str, object] = {
                    "case_set": case_set,
                    "model": model_id,
                    "case_id": case.case_id,
                    "char_band": case.char_band,
                    "company_context": case.company_context,
                    "status": "passed" if not deterministic_failures else "failed",
                    "failure_kind": "quality" if deterministic_failures else "none",
                    "preflight_status": preflight["status"],
                    "char_count": len(rewrite),
                    "rewrite_attempt_count": getattr(review_meta, "rewrite_attempt_count", None),
                    "length_policy": getattr(review_meta, "length_policy", None),
                    "length_shortfall": getattr(review_meta, "length_shortfall", None),
                    "length_fix_result": getattr(review_meta, "length_fix_result", None),
                    "weak_evidence_notice": getattr(review_meta, "weak_evidence_notice", None),
                    "token_usage": review_meta.token_usage.model_dump() if review_meta and review_meta.token_usage else None,
                    "judge_status": judge_result.get("status") if judge_result else "disabled",
                    "judge_scores": judge_result.get("scores") if judge_result else None,
                    "judge_usage": judge_result.get("usage") if judge_result else None,
                    "deterministic_fail_reasons": deterministic_failures,
                    "duration_ms": int((perf_counter() - started) * 1000),
                    "note": rewrite[:100].replace("\n", " "),
                }
                rows.append(row)
                if deterministic_failures:
                    if not _is_canary_case_set(case_set):
                        blocking_failures.append(
                        f"{model_id}::{case.case_id} failed: {', '.join(deterministic_failures)}"
                        )
            except HTTPException as exc:
                detail = exc.detail if isinstance(exc.detail, dict) else {}
                dbg = detail.get("debug") if isinstance(detail, dict) else None
                note = str(exc.detail)[:500] if exc.detail is not None else str(exc)
                failure_kind = _infer_failure_kind(note)
                rows.append(
                    {
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
                        "note": note,
                    }
                )
                if not _is_canary_case_set(case_set):
                    blocking_failures.append(
                        f"{model_id}::{case.case_id} failed: {exc.detail}"
                        + (f" | debug={dbg}" if dbg else "")
                    )
            except Exception as exc:  # pragma: no cover
                failure_kind = _infer_failure_kind(str(exc))
                rows.append(
                    {
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
                if not _is_canary_case_set(case_set):
                    blocking_failures.append(f"{model_id}::{case.case_id} failed: {exc}")

    json_path, md_path = _write_report(case_set, rows)
    assert json_path.exists()
    assert md_path.exists()
    if blocking_failures:
        pytest.fail("\n".join(blocking_failures))
