"""
Question-planning helpers for the Gakuchika normalization layer.

Extracted from ``gakuchika_payload.py`` to keep question planning logic
separate from payload assembly.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.utils.gakuchika_text import (
    BUILD_ELEMENTS,
    CORE_BUILD_ELEMENTS,
    DEEPDIVE_FOCUSES,
    DEEPDIVE_QUESTION_GROUPS,
    RESULT_SOFT_MARKERS,
    _clean_string,
    _clean_string_list,
    _contains_any,
    _contains_digit,
    _context_core_satisfied,
    _normalize_text,
)

if TYPE_CHECKING:  # pragma: no cover - typing only
    from app.routers.gakuchika import ConversationStateInput


# ---------------------------------------------------------------------------
# Group coverage helpers (Phase 7-C)
# ---------------------------------------------------------------------------

def _compute_group_coverage(
    asked_focuses: list[str],
    resolved_focuses: list[str],
    blocked_focuses: list[str],
    loop_blocked_focuses: list[str],
) -> dict[str, dict[str, object]]:
    all_blocked = set(blocked_focuses) | set(loop_blocked_focuses)
    result: dict[str, dict[str, object]] = {}
    for group_name, group_def in DEEPDIVE_QUESTION_GROUPS.items():
        focuses: list[str] = group_def["focuses"]  # type: ignore[assignment]
        asked = [f for f in focuses if f in asked_focuses]
        resolved = [f for f in focuses if f in resolved_focuses]
        blocked = [f for f in focuses if f in all_blocked]
        available = [f for f in focuses if f not in all_blocked and f not in asked_focuses]
        satisfied = len(resolved) > 0 or len(asked) >= len(focuses)
        result[group_name] = {
            "label": group_def["label"],
            "required": group_def["required"],
            "focuses": focuses,
            "asked": asked,
            "resolved": resolved,
            "blocked": blocked,
            "available": available,
            "satisfied": satisfied,
        }
    return result


def _select_next_deepdive_focus_by_coverage(
    coverage: dict[str, dict[str, object]],
    current_focus: str | None,
    question_count: int,
) -> str | None:
    for group_name in ("foundation", "reasoning"):
        group = coverage.get(group_name)
        if group and not group["satisfied"] and group["available"]:
            candidate = group["available"][0]  # type: ignore[index]
            if candidate != current_focus:
                return candidate
    if question_count > 3:
        for group_name in ("evidence", "narrative"):
            group = coverage.get(group_name)
            if group and not group["satisfied"] and group["available"]:
                candidate = group["available"][0]  # type: ignore[index]
                if candidate != current_focus:
                    return candidate
    return None


def _render_coverage_summary(coverage: dict[str, dict[str, object]]) -> str:
    lines = ["## 深掘りカバレッジ状況"]
    for _group_name, group_info in coverage.items():
        status = "到達済み" if group_info["satisfied"] else "未到達"
        focus_names = ", ".join(group_info["focuses"])  # type: ignore[arg-type]
        req_marker = "【必須】" if group_info["required"] else ""
        lines.append(f"- {group_info['label']}{req_marker}: {status}（{focus_names}）")
    lines.append("注意: 「未到達」のグループの観点を最優先で質問すること。")
    return "\n".join(lines)


_RESULT_PRESENCE_MARKERS: tuple[str, ...] = (
    *RESULT_SOFT_MARKERS,
    "短縮",
    "達成",
    "任され",
)


def _build_core_missing_elements(text: str, quality_checks: dict[str, bool]) -> list[str]:
    normalized = _normalize_text(text)
    missing: list[str] = []
    if not _context_core_satisfied(normalized):
        missing.append("context")
    if not quality_checks.get("task_clarity"):
        missing.append("task")
    if not quality_checks.get("action_ownership"):
        missing.append("action")
    result_present = _contains_digit(normalized) or _contains_any(normalized, _RESULT_PRESENCE_MARKERS)
    if not result_present:
        missing.append("result")
    return missing


def _critical_causal_gaps(causal_gaps: list[str]) -> list[str]:
    return [gap for gap in causal_gaps if gap in {"causal_gap_action_result", "role_scope_missing"}]


def _detect_es_focus_from_missing(
    missing_elements: list[str],
    blocked: set[str] | None = None,
) -> str:
    blocked_set = blocked or set()
    for key in CORE_BUILD_ELEMENTS:
        if key in missing_elements and key not in blocked_set:
            return key
    return "result"


def _normalize_focus_list(value: object) -> list[str]:
    return [item for item in _clean_string_list(value, max_items=12) if item in (*BUILD_ELEMENTS, *DEEPDIVE_FOCUSES)]


def _normalize_focus_attempt_counts(value: object) -> dict[str, int]:
    if not isinstance(value, dict):
        return {}
    counts: dict[str, int] = {}
    for key, raw in value.items():
        if key not in (*BUILD_ELEMENTS, *DEEPDIVE_FOCUSES):
            continue
        try:
            count = int(raw)
        except (TypeError, ValueError):
            continue
        if count > 0:
            counts[key] = count
    return counts


def _sanitize_blocked_focuses(
    blocked_focuses: object,
    *,
    stage: str | None,
    missing_elements: list[str],
) -> list[str]:
    blocked = _normalize_focus_list(blocked_focuses)
    if stage != "es_building":
        return blocked
    required_core = {item for item in missing_elements if item in CORE_BUILD_ELEMENTS}
    if not required_core:
        return blocked
    return [item for item in blocked if item not in required_core]


def _estimate_remaining_questions(
    *,
    stage: str,
    question_count: int,
    missing_elements: list[str],
    quality_checks: dict[str, bool],
    causal_gaps: list[str],
    ready_for_draft: bool,
    role_required: bool,
) -> int:
    """Return a deterministic estimate of questions left until draft-ready."""
    if stage in ("interview_ready", "deep_dive_active", "draft_ready"):
        return 0
    if ready_for_draft:
        return 0

    from app.normalization.gakuchika_payload import (
        _es_build_question_cap_threshold,
        _min_user_answers_for_es_draft_ready,
    )

    min_gate = max(0, _min_user_answers_for_es_draft_ready() - question_count)
    missing_core = sum(1 for m in missing_elements if m in CORE_BUILD_ELEMENTS)
    quality_gaps = sum(
        1
        for key in ("task_clarity", "action_ownership", "result_traceability")
        if not quality_checks.get(key, False)
    )
    if role_required and not quality_checks.get("role_clarity", False):
        quality_gaps += 1
    if "causal_gap_action_result" in causal_gaps:
        quality_gaps += 1

    remaining = max(min_gate, missing_core, quality_gaps)
    cap_room = max(0, _es_build_question_cap_threshold() - question_count)
    return max(0, min(remaining, cap_room))


def _derive_focus_tracking(
    fallback_state: "ConversationStateInput | None",
    *,
    stage: str,
    focus_key: str | None,
    missing_elements: list[str],
    quality_checks: dict[str, bool],
    should_record_focus: bool,
) -> tuple[list[str], list[str], list[str], list[str], dict[str, int], str | None]:
    prior_asked = _normalize_focus_list(fallback_state.asked_focuses if fallback_state else [])
    prior_resolved = _normalize_focus_list(fallback_state.resolved_focuses if fallback_state else [])
    prior_deferred = _normalize_focus_list(fallback_state.deferred_focuses if fallback_state else [])
    prior_blocked = _sanitize_blocked_focuses(
        fallback_state.blocked_focuses if fallback_state else [],
        stage=fallback_state.stage if fallback_state else stage,
        missing_elements=missing_elements,
    )
    prior_attempts = _normalize_focus_attempt_counts(fallback_state.focus_attempt_counts if fallback_state else {})
    last_signature = _clean_string(fallback_state.last_question_signature if fallback_state else None)

    asked = list(dict.fromkeys(prior_asked + ([focus_key] if should_record_focus and focus_key else [])))
    resolved = list(dict.fromkeys([
        *prior_resolved,
        *[key for key in CORE_BUILD_ELEMENTS if key not in missing_elements],
        *(["learning"] if quality_checks.get("learning_reusability") else []),
    ]))
    deferred = list(dict.fromkeys([
        *prior_deferred,
        *(["learning"] if stage == "draft_ready" and not quality_checks.get("learning_reusability") else []),
    ]))

    attempts = dict(prior_attempts)
    blocked = list(prior_blocked)
    if should_record_focus and focus_key:
        attempts[focus_key] = attempts.get(focus_key, 0) + 1
        should_block_focus = (
            focus_key not in resolved
            and attempts[focus_key] >= 2
            and focus_key not in blocked
            and not (stage == "es_building" and focus_key in missing_elements)
        )
        if should_block_focus:
            blocked.append(focus_key)

    return asked, resolved, deferred, blocked, attempts, last_signature
