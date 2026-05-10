"""Tracing helpers for ES review rewrite attempts."""

from __future__ import annotations

import os
from typing import Any


def _capture_rewrite_debug_enabled() -> bool:
    return os.getenv("LIVE_ES_REVIEW_CAPTURE_DEBUG", "").strip() == "1"


def _append_rewrite_attempt_trace(
    trace: list[dict[str, Any]],
    *,
    stage: str,
    text: str,
    accepted: bool,
    retry_reason: str = "",
    attempt_index: int = 0,
    total_rewrite_attempts: int = 0,
    prompt_mode: str = "",
    prompt_modes: list[str] | None = None,
    failure_codes: list[str] | None = None,
    fix_pass: int = 0,
    length_fix_total: int = 0,
) -> None:
    if not _capture_rewrite_debug_enabled():
        return
    row: dict[str, Any] = {
        "stage": stage,
        "accepted": accepted,
        "char_count": len(text or ""),
        "text": text or "",
    }
    if retry_reason:
        row["retry_reason"] = retry_reason
    if attempt_index:
        row["attempt_index"] = attempt_index
    if total_rewrite_attempts:
        row["total_rewrite_attempts"] = total_rewrite_attempts
    if prompt_mode:
        row["prompt_mode"] = prompt_mode
    if prompt_modes:
        row["prompt_modes"] = list(prompt_modes)
    if failure_codes:
        row["failure_codes"] = list(failure_codes)
    if fix_pass:
        row["fix_pass"] = fix_pass
    if length_fix_total:
        row["length_fix_total"] = length_fix_total
    trace.append(row)
