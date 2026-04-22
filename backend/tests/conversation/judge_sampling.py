"""
Judge sampling helpers for gakuchika prompt quality measurement (Phase 0.2).

Wraps tests/conversation/llm_judge.py::run_conversation_judge() with:
- N-sample pointwise sampling (mean/sd) to absorb temperature=0.1 noise
- AB/BA pairwise judge for position-bias-free preference comparison

llm_judge.py は touch しない (pure 維持)。
"""

from __future__ import annotations

import os
import statistics
import traceback
from typing import Any

from app.utils.llm import call_llm_with_error
from app.utils.llm_usage_cost import estimate_llm_usage_cost_usd

from tests.conversation.llm_judge import (
    JUDGE_AXES,
    judge_model,
    run_conversation_judge,
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_DEFAULT_SAMPLE_COUNT = 3
_SAMPLE_COUNT_ENV = "GAKUCHIKA_JUDGE_SAMPLES"

# Truncation budgets mirror llm_judge._TRANSCRIPT_CHAR_LIMIT / _FINAL_TEXT_CHAR_LIMIT
# but tightened slightly because pairwise prompts carry two final texts.
_PAIRWISE_TRANSCRIPT_CHAR_LIMIT = 18_000
_PAIRWISE_FINAL_TEXT_CHAR_LIMIT = 8_000


# ---------------------------------------------------------------------------
# Sample count resolution
# ---------------------------------------------------------------------------


def _resolve_sample_count(n_samples: int | None) -> int:
    """Resolve sample count: explicit arg > env var > default 3."""
    if isinstance(n_samples, int) and n_samples > 0:
        return n_samples
    raw = os.getenv(_SAMPLE_COUNT_ENV, "").strip()
    if raw:
        try:
            parsed = int(raw)
            if parsed > 0:
                return parsed
        except ValueError:
            pass
    return _DEFAULT_SAMPLE_COUNT


# ---------------------------------------------------------------------------
# Pointwise N-sample wrapper
# ---------------------------------------------------------------------------


async def run_judge_pointwise_n(
    feature: str,
    case_id: str,
    title: str,
    transcript: list[dict],
    final_text: str,
    n_samples: int | None = None,
) -> dict[str, Any]:
    """N 回 run_conversation_judge() を呼んで mean/sd を返す。

    各サンプルは temperature=0.1 で揺らぐため、N>=3 で平均/標準偏差を取り、
    1 回の judge スコアでは検出できない小さな改善差分を可視化する。
    並列化はせず逐次実行する (コスト/レート制限/再現性の観点)。

    Returns:
        {
            "feature": str,
            "case_id": str,
            "n_samples": int,
            "samples": [{"sample_idx": int, "scores": dict, "raw": dict}, ...],
            "axes": {axis: {"mean": float, "sd": float, "values": list[int]}},
            "overall_mean": float,  # 全軸 mean の平均 (有効スコアのみ)
            "errors": [{"sample_idx": int, "message": str}, ...],
        }
    """
    resolved_n = _resolve_sample_count(n_samples)
    axes_for_feature = JUDGE_AXES.get(feature, [])

    samples: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []
    # axis -> list of int values across samples (only successful judges)
    axis_values: dict[str, list[int]] = {axis: [] for axis in axes_for_feature}

    for idx in range(resolved_n):
        try:
            result = await run_conversation_judge(
                feature=feature,
                case_id=case_id,
                title=title,
                transcript=transcript,
                final_text=final_text,
            )
        except Exception:
            errors.append(
                {
                    "sample_idx": idx,
                    "message": f"exception: {traceback.format_exc()[:200]}",
                }
            )
            continue

        if result is None:
            errors.append(
                {
                    "sample_idx": idx,
                    "message": "judge_disabled_or_unknown_feature",
                }
            )
            continue

        # judge_error sentinel from llm_judge._error_result()
        if "judge_error" in (result.get("reasons") or []):
            errors.append(
                {
                    "sample_idx": idx,
                    "message": "; ".join(result.get("warnings") or ["judge_error"]),
                }
            )
            # still record the sample for debuggability, but skip score aggregation
            samples.append({"sample_idx": idx, "scores": {}, "raw": result})
            continue

        scores = result.get("scores") or {}
        # Only add an axis value when the score is a valid 1..5 integer.
        # llm_judge sets 0 when the LLM omitted the axis; treat 0 as missing.
        per_sample_scores: dict[str, int] = {}
        for axis in axes_for_feature:
            value = scores.get(axis)
            if isinstance(value, int) and 1 <= value <= 5:
                axis_values[axis].append(value)
                per_sample_scores[axis] = value

        samples.append(
            {
                "sample_idx": idx,
                "scores": per_sample_scores,
                "raw": result,
            }
        )

    # Aggregate
    axes_summary: dict[str, dict[str, Any]] = {}
    axis_means: list[float] = []
    for axis in axes_for_feature:
        values = axis_values[axis]
        if values:
            mean_v = statistics.mean(values)
            # pstdev is defined for a single-element list (returns 0.0).
            sd_v = statistics.pstdev(values) if len(values) >= 1 else 0.0
            axes_summary[axis] = {
                "mean": round(mean_v, 4),
                "sd": round(sd_v, 4),
                "values": list(values),
            }
            axis_means.append(mean_v)
        else:
            axes_summary[axis] = {"mean": 0.0, "sd": 0.0, "values": []}

    overall_mean = round(statistics.mean(axis_means), 4) if axis_means else 0.0

    return {
        "feature": feature,
        "case_id": case_id,
        "n_samples": resolved_n,
        "samples": samples,
        "axes": axes_summary,
        "overall_mean": overall_mean,
        "errors": errors,
    }


# ---------------------------------------------------------------------------
# Pairwise AB/BA judge
# ---------------------------------------------------------------------------


def _format_transcript_for_pairwise(transcript: list[dict]) -> str:
    lines: list[str] = []
    for turn in transcript:
        role = turn.get("role", "unknown")
        content = turn.get("content", "")
        lines.append(f"{role}: {content}")
    full = "\n".join(lines)
    if len(full) <= _PAIRWISE_TRANSCRIPT_CHAR_LIMIT:
        return full
    return full[:_PAIRWISE_TRANSCRIPT_CHAR_LIMIT] + "\n... (truncated)"


def _truncate_for_pairwise(text: str) -> str:
    if len(text) <= _PAIRWISE_FINAL_TEXT_CHAR_LIMIT:
        return text
    return text[:_PAIRWISE_FINAL_TEXT_CHAR_LIMIT] + "\n... (truncated)"


def _build_pairwise_system_prompt(feature: str) -> str:
    """Build pairwise system prompt scoped to the feature's axes.

    Kept inside this module on purpose: llm_judge._JUDGE_SYSTEM_PROMPTS は
    pointwise rubric 用なので汚染しない。
    """
    axes = JUDGE_AXES.get(feature, [])
    axes_block = " / ".join(axes) if axes else "総合品質"
    return (
        "あなたは就活 ES 品質審査官です。"
        "同じ会話に対して生成された 2 つの ES ドラフト (A と B) を比較し、"
        f"以下 {len(axes) if axes else ''}軸の総合的に優れている方を判定してください。\n\n"
        f"軸: {axes_block}\n\n"
        "判定ルール:\n"
        "- いずれかが明確に優れていれば \"winner\": \"a\" or \"b\"\n"
        "- 互角 / 大差なし / 判定不能なら \"winner\": \"tie\" を必ず使うこと\n"
        "- tie を躊躇しないこと。1 点差レベルで強引に勝者を決めない\n\n"
        "出力 JSON のみ (コードフェンス・前置き禁止):\n"
        "{\n"
        "  \"winner\": \"a\" | \"b\" | \"tie\",\n"
        "  \"reason\": \"30-80 字で根拠\"\n"
        "}"
    )


def _build_pairwise_user_prompt(
    feature: str,
    case_id: str,
    title: str,
    transcript_text: str,
    text_a: str,
    text_b: str,
) -> str:
    """Build the user prompt with two final-text candidates labeled A / B."""
    return (
        f"## 評価対象\n"
        f"- feature: {feature}\n"
        f"- caseId: {case_id}\n"
        f"- title: {title}\n"
        f"\n"
        f"## 会話ログ\n"
        f"{transcript_text}\n"
        f"\n"
        f"## ドラフト A\n"
        f"{text_a}\n"
        f"\n"
        f"## ドラフト B\n"
        f"{text_b}\n"
    )


def _normalize_winner(raw: Any) -> str:
    """Normalize LLM-returned winner to one of {'a','b','tie'}."""
    if not isinstance(raw, str):
        return "tie"
    normalized = raw.strip().lower()
    if normalized in {"a", "b", "tie"}:
        return normalized
    if normalized in {"draft_a", "ドラフトa", "a勝ち"}:
        return "a"
    if normalized in {"draft_b", "ドラフトb", "b勝ち"}:
        return "b"
    return "tie"


async def _run_single_pairwise(
    feature: str,
    case_id: str,
    title: str,
    transcript_text: str,
    text_first: str,
    text_second: str,
) -> dict[str, Any]:
    """Single pairwise judge call. text_first is presented as A, text_second as B
    in the LLM prompt; caller is responsible for swap-back semantics.
    """
    system_prompt = _build_pairwise_system_prompt(feature)
    user_prompt = _build_pairwise_user_prompt(
        feature=feature,
        case_id=case_id,
        title=title,
        transcript_text=transcript_text,
        text_a=text_first,
        text_b=text_second,
    )
    model = judge_model()

    try:
        result = await call_llm_with_error(
            system_prompt=system_prompt,
            user_message=user_prompt,
            max_tokens=300,
            temperature=0.0,
            model=model,
            feature=f"conversation_pairwise_{feature}",
            response_format="json_object",
        )
    except Exception:
        return {
            "winner_in_prompt": "tie",
            "reason": f"exception: {traceback.format_exc()[:200]}",
            "model": model,
            "ok": False,
        }

    if not result.success or result.data is None:
        error_msg = ""
        if result.error is not None:
            error_msg = getattr(result.error, "message", str(result.error))
        return {
            "winner_in_prompt": "tie",
            "reason": f"llm_failure: {error_msg[:200]}",
            "model": model,
            "ok": False,
        }

    data = result.data
    winner_in_prompt = _normalize_winner(data.get("winner"))
    reason = data.get("reason")
    if not isinstance(reason, str):
        reason = ""
    return {
        "winner_in_prompt": winner_in_prompt,
        "reason": reason[:300],
        "model": model,
        "ok": True,
    }


def _decide_pairwise_winner(ab_winner: str, ba_winner: str) -> str:
    """Position-debiased winner from the two real-side judgments.

    Both arguments are already mapped to the *real* candidate side
    ('a' = original final_text_a, 'b' = original final_text_b, 'tie').

    Decision table:
    - same side wins both orders -> that side
    - one tie + one decisive -> the decisive side
    - opposite winners (a vs b) -> tie  (position bias detected)
    - both tie -> tie
    """
    if ab_winner == ba_winner:
        return ab_winner  # incl. ('tie','tie')
    if ab_winner == "tie":
        return ba_winner
    if ba_winner == "tie":
        return ab_winner
    # Opposite decisive winners: position bias / no signal -> tie
    return "tie"


async def run_judge_pairwise_ab_ba(
    feature: str,
    case_id: str,
    title: str,
    transcript: list[dict],
    final_text_a: str,
    final_text_b: str,
) -> dict[str, Any]:
    """AB / BA の 2 順序で pairwise 評価し position-debiased winner を返す。

    実装メモ:
    - AB 順: prompt の A=final_text_a, B=final_text_b。LLM の "a" は real "a"。
    - BA 順: prompt の A=final_text_b, B=final_text_a。LLM の "a" は real "b" を、
      LLM の "b" は real "a" を指す → 必ず swap-back する。
    - 両方向で同じ side が勝てば確定、片方 tie + 片方決定なら決定側、
      逆判定 (AB:a vs BA:b) は position bias とみなし tie。
    """
    transcript_text = _format_transcript_for_pairwise(transcript)
    text_a_truncated = _truncate_for_pairwise(final_text_a)
    text_b_truncated = _truncate_for_pairwise(final_text_b)

    # AB 順: prompt(A=real_a, B=real_b)。LLM 出力をそのまま real-side に使える。
    ab_call = await _run_single_pairwise(
        feature=feature,
        case_id=case_id,
        title=title,
        transcript_text=transcript_text,
        text_first=text_a_truncated,
        text_second=text_b_truncated,
    )
    ab_in_prompt = ab_call["winner_in_prompt"]
    ab_real = ab_in_prompt  # same labeling

    # BA 順: prompt(A=real_b, B=real_a)。LLM の "a"/"b" を real-side に swap する。
    ba_call = await _run_single_pairwise(
        feature=feature,
        case_id=case_id,
        title=title,
        transcript_text=transcript_text,
        text_first=text_b_truncated,
        text_second=text_a_truncated,
    )
    ba_in_prompt = ba_call["winner_in_prompt"]
    if ba_in_prompt == "a":
        ba_real = "b"
    elif ba_in_prompt == "b":
        ba_real = "a"
    else:
        ba_real = "tie"

    final_winner = _decide_pairwise_winner(ab_real, ba_real)
    consistent = ab_real == ba_real

    return {
        "feature": feature,
        "case_id": case_id,
        "ab": {
            "order": "AB",
            "winner": ab_real,
            "reason": ab_call.get("reason", ""),
        },
        "ba": {
            "order": "BA",
            "winner": ba_real,
            "reason": ba_call.get("reason", ""),
        },
        "winner": final_winner,
        "consistent": consistent,
    }


# ---------------------------------------------------------------------------
# Cost estimation (a-priori, used by Phase 0.4 pre-flight check)
# ---------------------------------------------------------------------------


# Heuristic per-call token budget for a gakuchika judge invocation.
# Source: empirical inspection of llm_judge._build_user_prompt outputs against
# 5-axis gakuchika rubric (system prompt ~1.6 K chars, transcript truncation
# limit 24 K chars, final-text limit 12 K chars). Conservative midpoints below.
_HEURISTIC_INPUT_TOKENS_PER_CALL = 3_000
_HEURISTIC_OUTPUT_TOKENS_PER_CALL = 500


def estimate_pointwise_cost(
    n_cases: int,
    n_samples: int,
    axes_per_case: int,
    *,
    model: str | None = None,
    input_tokens_per_call: int | None = None,
    output_tokens_per_call: int | None = None,
) -> dict[str, Any]:
    """Estimate input/output tokens and USD cost for a pointwise sampling sweep.

    Approximation strategy:
    - Total LLM calls = n_cases * n_samples (axes_per_case is informational only;
      the judge returns all axes in a single JSON response).
    - Per-call token budget defaults to module heuristic constants
      (_HEURISTIC_INPUT_TOKENS_PER_CALL / _HEURISTIC_OUTPUT_TOKENS_PER_CALL).
    - USD cost is delegated to app.utils.llm_usage_cost.estimate_llm_usage_cost_usd
      to stay in lock-step with production cost accounting; if the model is
      unknown to the catalog we fall back to a documented pricing pair.

    Returns:
        {
            "model": str,
            "n_calls": int,
            "input_tokens": int,
            "output_tokens": int,
            "total_tokens": int,
            "estimated_usd": float | None,
            "axes_per_case": int,
            "assumptions": {
                "input_tokens_per_call": int,
                "output_tokens_per_call": int,
                "fallback_pricing_used": bool,
                "fallback_input_per_mtok_usd": float | None,
                "fallback_output_per_mtok_usd": float | None,
            },
        }
    """
    n_cases = max(0, int(n_cases))
    n_samples = max(0, int(n_samples))
    axes_per_case = max(0, int(axes_per_case))
    in_per_call = (
        int(input_tokens_per_call)
        if isinstance(input_tokens_per_call, int) and input_tokens_per_call > 0
        else _HEURISTIC_INPUT_TOKENS_PER_CALL
    )
    out_per_call = (
        int(output_tokens_per_call)
        if isinstance(output_tokens_per_call, int) and output_tokens_per_call > 0
        else _HEURISTIC_OUTPUT_TOKENS_PER_CALL
    )

    n_calls = n_cases * n_samples
    total_input = n_calls * in_per_call
    total_output = n_calls * out_per_call

    resolved_model = model or judge_model()
    usage = {
        "input_tokens": total_input,
        "output_tokens": total_output,
        "reasoning_tokens": 0,
        "cached_input_tokens": 0,
    }
    estimated_usd = estimate_llm_usage_cost_usd(resolved_model, usage)

    fallback_used = False
    fallback_in = None
    fallback_out = None
    if estimated_usd is None:
        # Documented fallback: gpt-5.4-mini list price ($0.75 / $4.5 per Mtok).
        # Source: backend/app/utils/llm_usage_cost.py::_DEFAULT_LLM_PRICE_CATALOG.
        fallback_in = 0.75
        fallback_out = 4.5
        estimated_usd = (
            (total_input / 1_000_000.0) * fallback_in
            + (total_output / 1_000_000.0) * fallback_out
        )
        fallback_used = True

    return {
        "model": resolved_model,
        "n_calls": n_calls,
        "input_tokens": total_input,
        "output_tokens": total_output,
        "total_tokens": total_input + total_output,
        "estimated_usd": estimated_usd,
        "axes_per_case": axes_per_case,
        "assumptions": {
            "input_tokens_per_call": in_per_call,
            "output_tokens_per_call": out_per_call,
            "fallback_pricing_used": fallback_used,
            "fallback_input_per_mtok_usd": fallback_in,
            "fallback_output_per_mtok_usd": fallback_out,
        },
    }


__all__ = [
    "run_judge_pointwise_n",
    "run_judge_pairwise_ab_ba",
    "estimate_pointwise_cost",
]
