"""Tracing helpers for ES review rewrite attempts."""

from __future__ import annotations

import os
from typing import Any, TypedDict
from urllib.parse import urlparse

from app.config import settings


class RewriteAttemptTraceRow(TypedDict, total=False):
    stage: str
    accepted: bool
    char_count: int
    text: str
    generated_by_llm: bool
    retry_reason: str
    attempt_index: int
    total_rewrite_attempts: int
    prompt_mode: str
    prompt_modes: list[str]
    retry_code: str
    primary_failure_code: str
    failure_codes: list[str]
    selected_retry_codes: list[str]
    length_control_mode: str
    target_window_lower: int
    target_window_upper: int
    latest_failed_length: int
    length_shortfall: int
    shortfall_delta_band: str
    validation_char_count: int
    length_policy: str
    soft_min_floor_ratio: float
    llm_failed_checks: list[str]
    llm_warned_checks: list[str]
    llm_retry_hint: str
    llm_lenient_pass: bool
    hallucination_warnings: list[dict[str, Any]]
    hallucination_tier: int
    hallucination_score: float
    hallucination_band: str
    retry_hints_count: int
    safe_rewrite: bool
    composite_retry_mode: str


def _capture_rewrite_debug_enabled() -> bool:
    if settings.is_deployed:
        return False
    return os.getenv("LIVE_ES_REVIEW_CAPTURE_DEBUG", "").strip() == "1"


def _copy_string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item) for item in value if str(item or "").strip()]


def _copy_dict_list(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [dict(item) for item in value if isinstance(item, dict)]


def _append_rewrite_attempt_trace(
    trace: list[dict[str, Any]],
    *,
    stage: str,
    text: str,
    accepted: bool,
    retry_reason: str = "",
    retry_code: str = "",
    primary_failure_code: str = "",
    selected_retry_codes: list[str] | None = None,
    attempt_index: int = 0,
    total_rewrite_attempts: int = 0,
    prompt_mode: str = "",
    prompt_modes: list[str] | None = None,
    failure_codes: list[str] | None = None,
    validation_meta: dict[str, Any] | None = None,
    length_control_mode: str = "",
    target_window_lower: int | None = None,
    target_window_upper: int | None = None,
    latest_failed_length: int | None = None,
    length_shortfall: int | None = None,
    shortfall_delta_band: str | None = None,
    retry_hints_count: int = 0,
    safe_rewrite: bool = False,
    generated_by_llm: bool = True,
    composite_retry_mode: str | None = None,
) -> RewriteAttemptTraceRow | None:
    if not _capture_rewrite_debug_enabled():
        return None

    meta = validation_meta or {}
    row: RewriteAttemptTraceRow = {
        "stage": stage,
        "accepted": accepted,
        "char_count": len(text or ""),
        "text": text or "",
        "generated_by_llm": generated_by_llm,
    }
    if retry_reason:
        row["retry_reason"] = retry_reason
    if retry_code:
        row["retry_code"] = retry_code
    if primary_failure_code:
        row["primary_failure_code"] = primary_failure_code
    elif meta.get("primary_failure_code"):
        row["primary_failure_code"] = str(meta.get("primary_failure_code"))
    selected = _copy_string_list(selected_retry_codes)
    if selected:
        row["selected_retry_codes"] = selected
    if attempt_index:
        row["attempt_index"] = attempt_index
    if total_rewrite_attempts:
        row["total_rewrite_attempts"] = total_rewrite_attempts
    if prompt_mode:
        row["prompt_mode"] = prompt_mode
    if prompt_modes:
        row["prompt_modes"] = list(prompt_modes)
    codes = _copy_string_list(failure_codes)
    if not codes:
        codes = _copy_string_list(meta.get("failure_codes") or meta.get("failed_checks"))
    if codes:
        row["failure_codes"] = codes
    if length_control_mode:
        row["length_control_mode"] = length_control_mode
    if target_window_lower is not None:
        row["target_window_lower"] = target_window_lower
    if target_window_upper is not None:
        row["target_window_upper"] = target_window_upper
    if latest_failed_length is not None:
        row["latest_failed_length"] = latest_failed_length
    if length_shortfall is not None:
        row["length_shortfall"] = length_shortfall
    elif meta.get("length_shortfall") is not None:
        row["length_shortfall"] = int(meta.get("length_shortfall") or 0)
    if shortfall_delta_band:
        row["shortfall_delta_band"] = shortfall_delta_band
    if meta.get("char_count") is not None:
        row["validation_char_count"] = int(meta.get("char_count") or 0)
    if meta.get("length_policy"):
        row["length_policy"] = str(meta.get("length_policy"))
    if meta.get("soft_min_floor_ratio") is not None:
        row["soft_min_floor_ratio"] = float(meta.get("soft_min_floor_ratio") or 0)
    llm_failed = _copy_string_list(meta.get("llm_failed_checks"))
    if llm_failed:
        row["llm_failed_checks"] = llm_failed
    llm_warned = _copy_string_list(meta.get("llm_warned_checks"))
    if llm_warned:
        row["llm_warned_checks"] = llm_warned
    if meta.get("llm_retry_hint"):
        row["llm_retry_hint"] = str(meta.get("llm_retry_hint"))
    if meta.get("llm_lenient_pass") is not None:
        row["llm_lenient_pass"] = bool(meta.get("llm_lenient_pass"))
    hallucination_warnings = _copy_dict_list(meta.get("hallucination_warnings"))
    if hallucination_warnings:
        row["hallucination_warnings"] = hallucination_warnings
    if meta.get("hallucination_tier") is not None:
        row["hallucination_tier"] = int(meta.get("hallucination_tier") or 0)
    if meta.get("hallucination_score") is not None:
        row["hallucination_score"] = float(meta.get("hallucination_score") or 0)
    if meta.get("hallucination_band"):
        row["hallucination_band"] = str(meta.get("hallucination_band"))
    if retry_hints_count:
        row["retry_hints_count"] = retry_hints_count
    if safe_rewrite:
        row["safe_rewrite"] = True
    if composite_retry_mode:
        row["composite_retry_mode"] = composite_retry_mode
    trace.append(row)
    return row


# ---------------------------------------------------------------------------
# Debug log formatters (dev-only, gated by _capture_rewrite_debug_enabled)
# ---------------------------------------------------------------------------

_ANSWER_TRUNCATE_LEN = 500
_CLAIM_TRUNCATE_LEN = 80
_FACT_TRUNCATE_LEN = 120


def _truncate(text: str, max_len: int) -> str:
    if len(text) <= max_len:
        return text
    return text[:max_len] + "... (truncated)"


def _extract_host(url: str) -> str:
    try:
        return urlparse(url).hostname or url
    except Exception:
        return url


def _format_rewrite_attempt_input_block(
    *,
    attempt: int,
    total_attempts: int,
    template_type: str,
    focus_modes_serialized: str,
    retry_plan_primary_code: str,
    retry_plan_selected_codes: tuple[str, ...],
    retry_plan_length_control_mode: str,
    retry_plan_shortfall_delta_band: str | None,
    retry_plan_guidance_items: tuple[str, ...],
    target_window_lower: int | None,
    target_window_upper: int | None,
    char_min: int | None,
    char_max: int | None,
    original_answer: str,
    selected_user_facts: list[dict[str, str]],
    selected_evidence_cards: list[dict[str, Any]],
    retry_hints: list[str],
    use_safe_rewrite: bool,
    grounding_mode: str,
    company_grounding: str,
) -> str:
    lines: list[str] = []
    lines.append(f"=== ATTEMPT {attempt + 1}/{total_attempts} ({template_type}) ===")

    if original_answer:
        lines.append("--- Original Answer ---")
        lines.append(_truncate(original_answer, _ANSWER_TRUNCATE_LEN))
        lines.append(f"({len(original_answer)} chars)")

    lines.append("--- Retry Plan ---")
    lines.append(f"primary_code={retry_plan_primary_code}")
    if retry_plan_selected_codes:
        lines.append(f"selected_codes={list(retry_plan_selected_codes)}")
    lines.append(f"length_control={retry_plan_length_control_mode}")
    tw_lower = retry_plan_shortfall_delta_band or "-"
    lines.append(f"delta_band={tw_lower}")
    if target_window_lower is not None or target_window_upper is not None:
        lines.append(f"target_window={target_window_lower}-{target_window_upper}")

    lines.append("--- Length Constraints ---")
    lines.append(f"char_min={char_min} char_max={char_max}")

    lines.append("--- Grounding ---")
    lines.append(f"grounding_mode={grounding_mode} company_grounding={company_grounding}")

    lines.append("--- Focus Modes ---")
    lines.append(f"[{focus_modes_serialized}]")
    lines.append(f"safe_rewrite={use_safe_rewrite}")

    lines.append(f"--- Evidence Cards ({len(selected_evidence_cards)} selected) ---")
    if selected_evidence_cards:
        for i, card in enumerate(selected_evidence_cards, 1):
            theme = card.get("theme", "?")
            claim = _truncate(card.get("claim", ""), _CLAIM_TRUNCATE_LEN)
            host = _extract_host(card.get("source_url", ""))
            lines.append(f"  {i}. theme={theme} | claim={claim} | host={host}")
    else:
        lines.append("  (none)")

    lines.append(f"--- User Facts ({len(selected_user_facts)} selected) ---")
    if selected_user_facts:
        for i, fact in enumerate(selected_user_facts, 1):
            source = fact.get("source", "?")
            text = _truncate(fact.get("text", ""), _FACT_TRUNCATE_LEN)
            lines.append(f"  {i}. [{source}] {text}")
    else:
        lines.append("  (none)")

    lines.append(f"--- Retry Hints ({len(retry_hints)}) ---")
    if retry_hints:
        for i, hint in enumerate(retry_hints, 1):
            lines.append(f"  {i}. {hint}")
    else:
        lines.append("  (none)")

    if retry_plan_guidance_items:
        lines.append(f"--- Retry Plan Guidance ({len(retry_plan_guidance_items)}) ---")
        for i, item in enumerate(retry_plan_guidance_items, 1):
            lines.append(f"  {i}. {item}")

    return "\n".join(lines)


def _format_rewrite_attempt_output_block(
    *,
    attempt: int,
    total_attempts: int,
    template_type: str,
    candidate: str,
    accepted: bool,
    retry_code: str,
    failure_codes: list[str],
    focus_modes_serialized: str,
    char_count: int,
    llm_failed_checks: list[str],
    llm_warned_checks: list[str],
    retry_reason: str,
) -> str:
    lines: list[str] = []
    lines.append(f"=== OUTPUT {attempt + 1}/{total_attempts} ({template_type}) ===")
    lines.append(f"accepted={accepted} | chars={char_count} | mode={focus_modes_serialized}")
    if retry_code or failure_codes:
        lines.append(f"retry_code={retry_code} | failure_codes={failure_codes}")
    if llm_failed_checks or llm_warned_checks:
        lines.append(f"llm_failed={llm_failed_checks} llm_warned={llm_warned_checks}")
    if not accepted and retry_reason:
        lines.append(f"retry_reason: {retry_reason}")
    lines.append("--- Candidate ---")
    lines.append(candidate)
    return "\n".join(lines)


def _format_rewrite_loop_summary_block(
    *,
    template_type: str,
    total_attempts: int,
    executed_attempts: int,
    accepted_attempt: int | None,
    final_rewrite_chars: int,
    best_effort_adopted: bool,
    best_effort_codes: list[str],
    safe_rewrite_triggered: bool,
) -> str:
    lines: list[str] = []
    lines.append(f"=== REWRITE LOOP SUMMARY ({template_type}) ===")
    lines.append(f"total_attempts={total_attempts} executed={executed_attempts}")
    if best_effort_adopted:
        lines.append(f"winner=best_effort codes={best_effort_codes}")
    elif accepted_attempt is not None:
        lines.append(f"winner=attempt {accepted_attempt}")
    else:
        lines.append("winner=none (total failure)")
    lines.append(f"chars={final_rewrite_chars}")
    if safe_rewrite_triggered:
        lines.append("safe_rewrite=True")
    return "\n".join(lines)
