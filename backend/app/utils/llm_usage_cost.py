from __future__ import annotations

import contextvars
import json
import os
from functools import lru_cache
from typing import Any, Literal

from app.config import settings
from app.utils.secure_logger import get_logger

logger = get_logger(__name__)

_request_llm_cost_summary_var: contextvars.ContextVar[dict[str, Any] | None] = contextvars.ContextVar(
    "request_llm_cost_summary",
    default=None,
)

_DEFAULT_LLM_PRICE_CATALOG: dict[str, dict[str, float]] = {
    "gpt-5.4": {
        "input_per_mtok_usd": 2.5,
        "cached_input_per_mtok_usd": 0.25,
        "output_per_mtok_usd": 15.0,
    },
    "gpt-5.4-mini": {
        "input_per_mtok_usd": 0.75,
        "cached_input_per_mtok_usd": 0.075,
        "output_per_mtok_usd": 4.5,
    },
    "gpt-5.4-nano": {
        "input_per_mtok_usd": 0.20,
        "cached_input_per_mtok_usd": 0.02,
        "output_per_mtok_usd": 1.25,
    },
    "claude-sonnet-4-6": {
        "input_per_mtok_usd": 3.0,
        "cached_input_per_mtok_usd": 0.3,
        "output_per_mtok_usd": 15.0,
    },
    "claude-haiku-4-5": {
        "input_per_mtok_usd": 1.0,
        "cached_input_per_mtok_usd": 0.10,
        "output_per_mtok_usd": 5.0,
    },
    "gemini-3.1-pro-preview": {
        "input_per_mtok_usd": 2.0,
        "cached_input_per_mtok_usd": 0.2,
        "output_per_mtok_usd": 12.0,
    },
}


def merge_llm_usage_tokens(
    accumulator: dict[str, int], usage: dict[str, int] | None
) -> None:
    """Merge OpenAI-style usage dicts in place."""
    if not usage:
        return
    for key, value in usage.items():
        accumulator[key] = accumulator.get(key, 0) + int(value)


def _normalize_usage_summary(usage: dict[str, Any] | None) -> dict[str, int] | None:
    if not isinstance(usage, dict):
        return None
    return {
        "input_tokens": int(usage.get("input_tokens") or 0),
        "output_tokens": int(usage.get("output_tokens") or 0),
        "reasoning_tokens": int(usage.get("reasoning_tokens") or 0),
        "cached_input_tokens": int(usage.get("cached_input_tokens") or 0),
    }


def _canonical_price_model(model_id: str | None) -> str:
    mid = (model_id or "").strip().lower()
    if not mid:
        return ""
    nano_ref = str(settings.gpt_nano_model).strip().lower()
    if mid == nano_ref or "gpt-5.4-nano" in mid or ("nano" in mid and mid.startswith("gpt-5.4")):
        return "gpt-5.4-nano"
    if mid == str(settings.gpt_model).strip().lower() or (
        mid.startswith("gpt-5.4") and "mini" not in mid and "nano" not in mid
    ):
        return "gpt-5.4"
    if mid == str(settings.gpt_mini_model).strip().lower() or "gpt-5.4-mini" in mid or mid == "gpt-fast":
        return "gpt-5.4-mini"
    if "claude-sonnet-4-6" in mid or mid == str(settings.claude_sonnet_model).strip().lower():
        return "claude-sonnet-4-6"
    if "haiku" in mid or mid == "claude-haiku" or mid == str(settings.claude_haiku_model).strip().lower():
        return "claude-haiku-4-5"
    if "gemini-3.1-pro-preview" in mid or "gemini-3-pro-preview" in mid:
        return "gemini-3.1-pro-preview"
    return mid


@lru_cache(maxsize=1)
def _load_price_overrides() -> dict[str, dict[str, float]]:
    raw = os.getenv("LLM_PRICE_OVERRIDES_JSON", "").strip()
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("event=llm_cost_config status=invalid_overrides_json")
        return {}
    if not isinstance(parsed, dict):
        logger.warning("event=llm_cost_config status=invalid_overrides_type")
        return {}

    overrides: dict[str, dict[str, float]] = {}
    for model_id, value in parsed.items():
        if not isinstance(model_id, str) or not isinstance(value, dict):
            continue
        if "input_per_mtok_usd" not in value or "output_per_mtok_usd" not in value:
            continue
        try:
            overrides[_canonical_price_model(model_id)] = {
                "input_per_mtok_usd": float(value["input_per_mtok_usd"]),
                "cached_input_per_mtok_usd": float(
                    value.get("cached_input_per_mtok_usd", value["input_per_mtok_usd"])
                ),
                "output_per_mtok_usd": float(value["output_per_mtok_usd"]),
            }
        except (TypeError, ValueError):
            continue
    return overrides


def _resolve_price_entry(model_id: str | None) -> dict[str, float] | None:
    canonical = _canonical_price_model(model_id)
    overrides = _load_price_overrides()
    if canonical in overrides:
        return overrides[canonical]
    if canonical == "gpt-5.4-mini":
        pin = settings.openai_price_gpt_5_4_mini_input_per_mtok_usd
        pout = settings.openai_price_gpt_5_4_mini_output_per_mtok_usd
        if pin is not None and pout is not None:
            return {
                "input_per_mtok_usd": pin,
                "cached_input_per_mtok_usd": settings.openai_price_gpt_5_4_mini_cached_input_per_mtok_usd
                if settings.openai_price_gpt_5_4_mini_cached_input_per_mtok_usd is not None
                else pin,
                "output_per_mtok_usd": pout,
            }
    if canonical == "gpt-5.4-nano":
        pin = settings.openai_price_gpt_5_4_nano_input_per_mtok_usd
        pout = settings.openai_price_gpt_5_4_nano_output_per_mtok_usd
        if pin is not None and pout is not None:
            return {
                "input_per_mtok_usd": pin,
                "cached_input_per_mtok_usd": settings.openai_price_gpt_5_4_nano_cached_input_per_mtok_usd
                if settings.openai_price_gpt_5_4_nano_cached_input_per_mtok_usd is not None
                else pin,
                "output_per_mtok_usd": pout,
            }
    return _DEFAULT_LLM_PRICE_CATALOG.get(canonical)


def estimate_llm_usage_cost_usd(model_id: str, usage: dict[str, int]) -> float | None:
    entry = _resolve_price_entry(model_id)
    normalized_usage = _normalize_usage_summary(usage)
    if entry is None or normalized_usage is None:
        return None
    inp = normalized_usage["input_tokens"]
    out = normalized_usage["output_tokens"]
    cached = normalized_usage["cached_input_tokens"]
    non_cached = max(0, inp - cached)
    reasoning = normalized_usage["reasoning_tokens"]
    pin = entry["input_per_mtok_usd"]
    pout = entry["output_per_mtok_usd"]
    pcached = entry.get("cached_input_per_mtok_usd", pin)
    out_total = out + reasoning
    return (
        (non_cached / 1_000_000.0) * pin
        + (cached / 1_000_000.0) * pcached
        + (out_total / 1_000_000.0) * pout
    )


def estimate_openai_usage_cost_usd(model_id: str, usage: dict[str, int]) -> float | None:
    return estimate_llm_usage_cost_usd(model_id, usage)


def _should_log_llm_cost() -> bool:
    return bool(settings.llm_usage_cost_log)


def _should_log_llm_cost_debug() -> bool:
    return bool(settings.llm_usage_cost_debug_log)


def reset_request_llm_cost_summary() -> None:
    _request_llm_cost_summary_var.set(None)


def _merge_usage_status(current: str | None, incoming: str) -> str:
    if current in {None, "", "ok"}:
        return incoming
    if incoming == "ok":
        return current
    if current == incoming:
        return current
    return "partial_unavailable"


def _record_request_llm_cost_summary(
    *,
    feature: str,
    resolved_model: str,
    normalized_usage: dict[str, int],
    usage_status: str,
    est: float | None,
) -> None:
    summary = _request_llm_cost_summary_var.get()
    if summary is None:
        summary = {
            "feature": feature,
            "input_tokens_total": 0,
            "output_tokens_total": 0,
            "reasoning_tokens_total": 0,
            "cached_input_tokens_total": 0,
            "est_usd_total": 0.0,
            "est_jpy_total": None,
            "models_used": [],
            "usage_status": "ok",
        }

    summary["feature"] = feature or summary.get("feature") or "unknown"
    summary["input_tokens_total"] += int(normalized_usage.get("input_tokens") or 0)
    summary["output_tokens_total"] += int(normalized_usage.get("output_tokens") or 0)
    summary["reasoning_tokens_total"] += int(normalized_usage.get("reasoning_tokens") or 0)
    summary["cached_input_tokens_total"] += int(normalized_usage.get("cached_input_tokens") or 0)
    if est is not None:
        summary["est_usd_total"] += float(est)
        jpy_rate = settings.llm_cost_usd_to_jpy_rate
        if jpy_rate is not None and jpy_rate > 0:
            summary["est_jpy_total"] = (summary.get("est_jpy_total") or 0.0) + (float(est) * jpy_rate)
    summary["usage_status"] = _merge_usage_status(str(summary.get("usage_status") or "ok"), usage_status)
    models_used = summary.setdefault("models_used", [])
    if resolved_model and resolved_model not in models_used:
        models_used.append(resolved_model)
    _request_llm_cost_summary_var.set(summary)


def consume_request_llm_cost_summary(feature: str | None = None) -> dict[str, Any] | None:
    summary = _request_llm_cost_summary_var.get()
    _request_llm_cost_summary_var.set(None)
    if not summary:
        return None
    if feature:
        summary["feature"] = feature
    result: dict[str, Any] = {
        "feature": summary.get("feature") or "unknown",
        "input_tokens_total": int(summary.get("input_tokens_total") or 0),
        "output_tokens_total": int(summary.get("output_tokens_total") or 0),
        "reasoning_tokens_total": int(summary.get("reasoning_tokens_total") or 0),
        "cached_input_tokens_total": int(summary.get("cached_input_tokens_total") or 0),
        "usage_status": str(summary.get("usage_status") or "ok"),
        "models_used": list(summary.get("models_used") or []),
    }
    est_usd_total = summary.get("est_usd_total")
    if isinstance(est_usd_total, (int, float)) and est_usd_total > 0:
        result["est_usd_total"] = round(float(est_usd_total), 6)
    est_jpy_total = summary.get("est_jpy_total")
    if isinstance(est_jpy_total, (int, float)) and est_jpy_total > 0:
        result["est_jpy_total"] = round(float(est_jpy_total), 2)
    logger.info("[llm_cost_summary] %s", json.dumps(result, ensure_ascii=False))
    if settings.debug:
        return result
    return None


def _append_llm_cost_estimate_parts(parts: list[str], est: float | None) -> None:
    if est is None:
        return
    parts.append(f"est_usd={est:.6f}")
    jpy_rate = settings.llm_cost_usd_to_jpy_rate
    if jpy_rate is not None and jpy_rate > 0:
        parts.append(f"est_jpy={est * jpy_rate:.2f}")


def _format_llm_cost_kv_line(
    *,
    scope: Literal["call", "request"],
    feature: str,
    provider: str,
    resolved_model: str,
    call_kind: str,
    normalized_usage: dict[str, int],
    usage_status: str,
    est: float | None,
    trace_id: str | None = None,
    source_url: str | None = None,
) -> str:
    parts: list[str] = [
        "event=llm_cost",
        f"scope={scope}",
        f"feature={feature}",
        f"provider={provider}",
        f"resolved_model={resolved_model}",
        f"call_kind={call_kind}",
        f"input_tokens={normalized_usage['input_tokens']}",
        f"output_tokens={normalized_usage['output_tokens']}",
        f"reasoning_tokens={normalized_usage['reasoning_tokens']}",
        f"cached_input_tokens={normalized_usage['cached_input_tokens']}",
        f"usage_status={usage_status}",
    ]
    if source_url:
        su = source_url.strip()
        if len(su) > 120:
            su = su[:120]
        parts.append(f"source_url={su}")
    _append_llm_cost_estimate_parts(parts, est)
    if trace_id:
        parts.append(f"trace_id={trace_id}")
    return " ".join(parts)
