"""
Template-formatting layer for Gakuchika prompts.

These functions take already-normalised primitives (strings, ints, tags)
and produce the final LLM prompt strings.  They do *not* inspect the
``NextQuestionRequest`` object directly and do *not* contain phase-detection
or diagnostic-tagging orchestration logic — those responsibilities live in
``app.routers.gakuchika`` and must be passed in via keyword arguments.

Phase B.2: builders return ``(system_prompt, user_message)`` tuples so
that the static persona / rules / few-shot block can be cached across
turns while only the dynamic (conversation, known_facts, blocked /
asked focuses, task instructions) part varies per request.

M2 (2026-04-17): this module is template-only. LLM calls and normalization
live in ``app.routers.gakuchika`` so that prompts have no side effects and
no reverse import into ``app.normalization``.

Public entry points:
- ``build_es_prompt_text`` — ES-build question (system, user)
- ``build_deepdive_prompt_text`` — deep-dive question (system, user)

Router-visible constants / helpers:
- ``INITIAL_QUESTION_MAX_TOKENS``
- ``_render_initial_question_system_prompt``
"""

from __future__ import annotations

import json

from app.prompts.gakuchika_prompts import (
    APPROVAL_AND_QUESTION_PATTERN,
    COACH_PERSONA,
    DEEPDIVE_QUESTION_PRINCIPLES,
    ES_BUILD_QUESTION_PRINCIPLES,
    ES_BUILD_SYSTEM_PROMPT,
    ES_BUILD_USER_MESSAGE,
    INITIAL_QUESTION_SYSTEM_PROMPT,
    PROHIBITED_EXPRESSIONS as _PROHIBITED_EXPRESSIONS,
    QUESTION_TONE_AND_ALIGNMENT_RULES,
    REFERENCE_GUIDE_RUBRIC,
    STAR_EVALUATE_SYSTEM_PROMPT,
    STAR_EVALUATE_USER_MESSAGE,
    question_few_shot_for,
)
from app.utils.llm import sanitize_prompt_input

INITIAL_QUESTION_MAX_TOKENS = 220


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _format_focus_list(focuses: list[str] | None, *, empty_label: str) -> str:
    """Render asked/blocked focuses as a bullet line for the user message.

    The caller passes a plain list of focus keys; we render a compact
    comma-joined bullet for the LLM.  If the list is empty we emit a
    neutral placeholder so the section doesn't look like missing data.
    """
    if not focuses:
        return f"- {empty_label}"
    cleaned = [f for f in dict.fromkeys(focuses) if isinstance(f, str) and f.strip()]
    if not cleaned:
        return f"- {empty_label}"
    return "- " + ", ".join(cleaned)


def _render_initial_question_system_prompt(*, input_richness_mode: str) -> str:
    return INITIAL_QUESTION_SYSTEM_PROMPT.format(
        coach_persona=COACH_PERSONA,
        question_tone_and_alignment_rules=QUESTION_TONE_AND_ALIGNMENT_RULES,
        approval_and_question_pattern=APPROVAL_AND_QUESTION_PATTERN,
        es_build_question_principles=ES_BUILD_QUESTION_PRINCIPLES,
        reference_guide_rubric=REFERENCE_GUIDE_RUBRIC,
        prohibited_expressions=_PROHIBITED_EXPRESSIONS,
        question_few_shot=question_few_shot_for(input_richness_mode),
    )


def _render_es_build_system_prompt(*, input_richness_mode: str) -> str:
    return ES_BUILD_SYSTEM_PROMPT.format(
        coach_persona=COACH_PERSONA,
        question_tone_and_alignment_rules=QUESTION_TONE_AND_ALIGNMENT_RULES,
        approval_and_question_pattern=APPROVAL_AND_QUESTION_PATTERN,
        es_build_question_principles=ES_BUILD_QUESTION_PRINCIPLES,
        reference_guide_rubric=REFERENCE_GUIDE_RUBRIC,
        prohibited_expressions=_PROHIBITED_EXPRESSIONS,
        question_few_shot=question_few_shot_for(input_richness_mode),
    )


def _render_deepdive_system_prompt() -> str:
    return STAR_EVALUATE_SYSTEM_PROMPT.format(
        coach_persona=COACH_PERSONA,
        question_tone_and_alignment_rules=QUESTION_TONE_AND_ALIGNMENT_RULES,
        approval_and_question_pattern=APPROVAL_AND_QUESTION_PATTERN,
        deepdive_question_principles=DEEPDIVE_QUESTION_PRINCIPLES,
        reference_guide_rubric=REFERENCE_GUIDE_RUBRIC,
        prohibited_expressions=_PROHIBITED_EXPRESSIONS,
    )


# ---------------------------------------------------------------------------
# Public builders (return (system_prompt, user_message) tuples)
# ---------------------------------------------------------------------------

def build_es_prompt_text(
    *,
    gakuchika_title: str,
    conversation_text: str,
    known_facts: str,
    input_richness_mode: str,
    asked_focuses: list[str] | None = None,
    blocked_focuses: list[str] | None = None,
) -> tuple[str, str]:
    """Render the ES-build question prompt as (system, user).

    ``asked_focuses`` / ``blocked_focuses`` are second-line-of-defence
    hints to the LLM; the primary STAR re-alignment guard lives in
    ``normalization.gakuchika_payload``.
    """
    system_prompt = _render_es_build_system_prompt(
        input_richness_mode=input_richness_mode,
    )
    user_message = ES_BUILD_USER_MESSAGE.format(
        gakuchika_title=sanitize_prompt_input(gakuchika_title, max_length=200),
        conversation=conversation_text,
        known_facts=known_facts,
        input_richness_mode=input_richness_mode,
        asked_focuses_section=_format_focus_list(
            asked_focuses,
            empty_label="まだ聞いた要素はありません",
        ),
        blocked_focuses_section=_format_focus_list(
            blocked_focuses,
            empty_label="ブロックされた要素はありません",
        ),
    )
    return system_prompt, user_message


def build_deepdive_prompt_text(
    *,
    gakuchika_title: str,
    draft_text: str,
    conversation_text: str,
    phase_name: str,
    phase_description: str,
    preferred_focuses: list[str],
    extended_deep_dive_round: int,
    strength_tags: list[str],
    issue_tags: list[str],
    deepdive_recommendation_tags: list[str],
    credibility_risk_tags: list[str],
    asked_focuses: list[str] | None = None,
    blocked_focuses: list[str] | None = None,
) -> tuple[str, str]:
    """Render the STAR-evaluation / deep-dive question prompt as (system, user).

    ``phase_name`` / ``phase_description`` / ``preferred_focuses`` are
    expected to come from the router-level ``_determine_deepdive_phase``
    call — this function does not re-derive them.
    """
    system_prompt = _render_deepdive_system_prompt()

    draft_diagnostics_json = json.dumps(
        {
            "strength_tags": strength_tags,
            "issue_tags": issue_tags,
            "deepdive_recommendation_tags": deepdive_recommendation_tags,
            "credibility_risk_tags": credibility_risk_tags,
        },
        ensure_ascii=False,
    )
    user_message = STAR_EVALUATE_USER_MESSAGE.format(
        gakuchika_title=sanitize_prompt_input(gakuchika_title, max_length=200),
        draft_text=sanitize_prompt_input(draft_text or "記載なし", max_length=1800),
        conversation=conversation_text,
        phase_name=phase_name,
        phase_description=phase_description,
        preferred_focuses=", ".join(preferred_focuses),
        draft_diagnostics_json=draft_diagnostics_json,
        asked_focuses_section=_format_focus_list(
            asked_focuses,
            empty_label="まだ聞いた要素はありません",
        ),
        blocked_focuses_section=_format_focus_list(
            blocked_focuses,
            empty_label="ブロックされた要素はありません",
        ),
    )
    if extended_deep_dive_round > 0:
        user_message = (
            f"{user_message}\n\n"
            f"## 継続深掘り（{extended_deep_dive_round} 回目）\n"
            "- ユーザーは面接準備完了のあとも、さらに細かく詰めたいと依頼している。\n"
            "- 仮説の裏取り・数値の分解・逆質問に備えた答え・一段狭い論点に絞った 1 問にする。\n"
        )
    return system_prompt, user_message
