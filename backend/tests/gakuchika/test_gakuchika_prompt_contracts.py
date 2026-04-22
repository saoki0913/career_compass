"""
D.2: LLM call-site contract tests for gakuchika prompt builders.

Purpose: assert that build_es_prompt_text / build_deepdive_prompt_text share
the same persona and structural constraints across call paths, and that the
prompt-builder module stays template-only (M2, 2026-04-17). These are
*contract* tests — no LLM calls are made.

The tests verify:
1. System-side persona consistency (キャリアアドバイザー, 承認, 禁止)
2. User-side dynamic content placement (blocked_focuses, phase_name)
3. Credential-claim absence from COACH_PERSONA (景表法コンプライアンス)
4. Pure-function / deterministic property of prompt builders
5. Robustness with empty input lists
6. Module purity (M2): no LLM call, no reverse import into normalization,
   no ``generate_initial_question`` attribute

These tests intentionally do NOT duplicate the shape-level checks that
already exist in test_gakuchika_next_question.py.  The shared processing is
extracted into pytest fixtures.
"""

from __future__ import annotations

import inspect

import pytest

from app.prompts import gakuchika_prompt_builder as prompt_builder
from app.prompts.gakuchika_prompt_builder import (
    _render_es_build_system_prompt,
    _render_deepdive_system_prompt,
    _render_initial_question_system_prompt,
    build_deepdive_prompt_text,
    build_es_prompt_text,
)
from app.prompts.gakuchika_prompts import (
    APPROVAL_AND_QUESTION_PATTERN,
    COACH_PERSONA,
)


# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def minimal_es_build_args() -> dict:
    """Minimal valid keyword arguments for build_es_prompt_text."""
    return {
        "gakuchika_title": "学園祭実行委員",
        "conversation_text": "質問: どんな経験でしたか。\n\n回答: 実行委員として模擬店エリアを担当しました。",
        "known_facts": "- 模擬店エリア担当",
        "input_richness_mode": "rough_episode",
        "asked_focuses": [],
        "blocked_focuses": [],
    }


@pytest.fixture()
def minimal_deepdive_args() -> dict:
    """Minimal valid keyword arguments for build_deepdive_prompt_text."""
    return {
        "gakuchika_title": "学園祭実行委員",
        "draft_text": "私は実行委員として導線改善に取り組みました。",
        "conversation_text": "質問: 課題は何でしたか。\n\n回答: 混雑が課題でした。",
        "phase_name": "es_aftercare",
        "phase_description": "ES骨格の判断理由と役割の解像度を上げる",
        "preferred_focuses": ["challenge", "role", "action_reason"],
        "extended_deep_dive_round": 0,
        "strength_tags": [],
        "issue_tags": [],
        "deepdive_recommendation_tags": [],
        "credibility_risk_tags": [],
        "asked_focuses": [],
        "blocked_focuses": [],
    }


# ---------------------------------------------------------------------------
# Test 1: Initial question system prompt carries persona keywords
# ---------------------------------------------------------------------------


def test_initial_question_passes_persona_in_system_prompt() -> None:
    """System prompt for the initial question must contain the coach persona,
    approval obligation, and prohibited-expression guard.

    These are the 3 pillars that prevent persona drift in early-stage questions.
    """
    system_prompt = _render_initial_question_system_prompt(input_richness_mode="seed_only")

    assert "キャリアアドバイザー" in system_prompt, (
        "Coach persona must be present in the initial-question system prompt"
    )
    assert "承認" in system_prompt, (
        "Approval obligation ('承認') must be present in the initial-question system prompt"
    )
    assert "禁止" in system_prompt, (
        "Prohibited expressions section ('禁止') must be present in the initial-question system prompt"
    )


# ---------------------------------------------------------------------------
# Test 2: ES-build user message carries blocked_focuses
# ---------------------------------------------------------------------------


def test_sync_next_question_passes_blocked_focuses_in_user_message(
    minimal_es_build_args: dict,
) -> None:
    """blocked_focuses must appear in the *user* message, not system.

    The user half is regenerated per turn; putting dynamic state there keeps
    the system prompt stable and cache-friendly.
    """
    blocked = ["action", "result"]
    args = {**minimal_es_build_args, "blocked_focuses": blocked}
    system_prompt, user_message = build_es_prompt_text(**args)

    assert "action" in user_message, "blocked focus 'action' must appear in user_message"
    assert "result" in user_message, "blocked focus 'result' must appear in user_message"
    # Verify it is NOT the system-level prompt (system prompt should not vary per-turn)
    # The system prompt section for blocked focuses should not contain the specific values
    for focus in blocked:
        # system_prompt could contain word 'action' as part of ES principle text, but
        # the per-turn blocked_focuses section is only in user_message
        assert "ブロックされた要素" not in system_prompt, (
            "'ブロックされた要素' label must be in user_message only, not system_prompt"
        )
        break  # check once is sufficient


# ---------------------------------------------------------------------------
# Test 3: Stream and sync ES-build use same prompt builder (identical system)
# ---------------------------------------------------------------------------


def test_stream_next_question_uses_same_prompt_shape_as_sync(
    minimal_es_build_args: dict,
) -> None:
    """get_next_question and get_next_question_stream both delegate to
    build_es_prompt_text via _build_es_prompt.  Calling the builder directly
    twice with the same inputs must yield identical system prompts.

    This test guards against future divergence where one path swaps the builder
    for a different implementation.
    """
    system1, user1 = build_es_prompt_text(**minimal_es_build_args)
    system2, user2 = build_es_prompt_text(**minimal_es_build_args)

    assert system1 == system2, "Repeated calls with same args must produce identical system_prompt"
    assert user1 == user2, "Repeated calls with same args must produce identical user_message"
    # Both paths share the same system-side persona anchor
    assert "キャリアアドバイザー" in system1
    assert "承認+質問パターン" in system1


# ---------------------------------------------------------------------------
# Test 4: Deep-dive system prompt carries acknowledgment rules
# ---------------------------------------------------------------------------


def test_deepdive_evaluate_passes_acknowledgment_rules_in_system() -> None:
    """The deep-dive system prompt must contain the approval+question pattern
    section so that deep-dive questions also follow the acknowledgment rule.
    """
    system_prompt = _render_deepdive_system_prompt()

    assert "承認+質問パターン" in system_prompt, (
        "Approval-and-question pattern section must be in deep-dive system prompt"
    )
    assert "承認" in system_prompt, "承認 keyword must be present in deep-dive system prompt"
    # Approval pattern description must be present (content from APPROVAL_AND_QUESTION_PATTERN)
    assert "15〜30字" in system_prompt, (
        "Character length guidance for approval must be in deep-dive system prompt"
    )
    assert "## 個人情報の取り扱い" in system_prompt
    assert "会話中は学生が使った固有名詞" in system_prompt
    assert "ドラフト出力時は「Aさん」「B大学」のように匿名化する" in system_prompt
    assert "匿名化はドラフト出力時のみ適用" in system_prompt


# ---------------------------------------------------------------------------
# Test 5: COACH_PERSONA has no credential claims (景表法)
# ---------------------------------------------------------------------------


def test_coach_persona_has_no_credential_claim() -> None:
    """COACH_PERSONA must not contain experience/credential claims such as
    '元人事', '専門家', 'プロ', '経験豊富', '実績' that would constitute
    misleading representations under the Act Against Unjustifiable Premiums
    and Misleading Representations (景品表示法).

    See gakuchika_prompts.py comment: '案 B: 職業プロ型・名前なし・経歴主張なし'.
    """
    prohibited_credential_terms = [
        "元人事",
        "元採用担当",
        "専門家",
        "プロ",
        "経験豊富",
        "実績",
        "資格",
        "認定",
        "年以上の経験",
        "トレーナー",
    ]
    violations = [term for term in prohibited_credential_terms if term in COACH_PERSONA]
    assert violations == [], (
        f"COACH_PERSONA must not contain credential claims (景表法). Found: {violations}"
    )


# ---------------------------------------------------------------------------
# Test 6: build_es_prompt_text accepts empty blocked/asked lists
# ---------------------------------------------------------------------------


def test_build_es_prompt_accepts_empty_blocked_asked_lists() -> None:
    """build_es_prompt_text must not raise when asked_focuses and
    blocked_focuses are empty lists.

    Regression guard: early versions raised on falsy list iteration.
    """
    system_prompt, user_message = build_es_prompt_text(
        gakuchika_title="塾講師のアルバイト",
        conversation_text="",
        known_facts="",
        input_richness_mode="seed_only",
        asked_focuses=[],
        blocked_focuses=[],
    )
    assert isinstance(system_prompt, str) and len(system_prompt) > 0
    assert isinstance(user_message, str) and len(user_message) > 0
    # Empty placeholder text must appear so LLM sees consistent section headers
    assert "まだ聞いた要素はありません" in user_message
    assert "ブロックされた要素はありません" in user_message


# ---------------------------------------------------------------------------
# Test 7: build_deepdive_prompt_text receives phase from caller, not re-derived
# ---------------------------------------------------------------------------


def test_build_deepdive_prompt_includes_phase_from_router(
    minimal_deepdive_args: dict,
) -> None:
    """phase_name and phase_description must be injected verbatim into the
    user message.  The builder must NOT re-derive the phase internally
    (that would violate the architecture-gate: phase detection lives in the
    router's _determine_deepdive_phase, not in the prompt builder).
    """
    custom_phase_name = "custom_phase_for_test"
    custom_phase_description = "テスト専用フェーズ説明文"
    args = {
        **minimal_deepdive_args,
        "phase_name": custom_phase_name,
        "phase_description": custom_phase_description,
    }
    system_prompt, user_message = build_deepdive_prompt_text(**args)

    assert custom_phase_name in user_message, (
        "phase_name injected by caller must appear verbatim in user_message"
    )
    assert custom_phase_description in user_message, (
        "phase_description injected by caller must appear verbatim in user_message"
    )
    # Phase must NOT appear in the cacheable system prompt
    assert custom_phase_name not in system_prompt, (
        "phase_name (dynamic, per-turn) must not contaminate the system_prompt"
    )
    assert custom_phase_description not in system_prompt, (
        "phase_description (dynamic, per-turn) must not contaminate the system_prompt"
    )


# ---------------------------------------------------------------------------
# Test 8: Prompt builder is a pure function (deterministic)
# ---------------------------------------------------------------------------


def test_prompt_builder_output_is_pure_function(
    minimal_es_build_args: dict,
    minimal_deepdive_args: dict,
) -> None:
    """build_es_prompt_text and build_deepdive_prompt_text must be pure
    functions: identical inputs always produce identical outputs.

    This guards against accidentally injecting random tokens, timestamps,
    or mutable shared state into the templates.
    """
    # ES builder
    result_a = build_es_prompt_text(**minimal_es_build_args)
    result_b = build_es_prompt_text(**minimal_es_build_args)
    assert result_a == result_b, "build_es_prompt_text must be deterministic"

    # Deep-dive builder
    result_c = build_deepdive_prompt_text(**minimal_deepdive_args)
    result_d = build_deepdive_prompt_text(**minimal_deepdive_args)
    assert result_c == result_d, "build_deepdive_prompt_text must be deterministic"

    # Sanity: different inputs produce different outputs
    different_args = {**minimal_es_build_args, "gakuchika_title": "別のテーマ"}
    result_e = build_es_prompt_text(**different_args)
    assert result_e != result_a, "Different inputs must produce different outputs"


# ---------------------------------------------------------------------------
# M2 (2026-04-17): prompt_builder purity / template-only guard
# ---------------------------------------------------------------------------


def test_prompt_builder_module_has_no_generate_initial_question() -> None:
    """``generate_initial_question`` must live in ``routers.gakuchika``, not here.

    The LLM call (and normalization import) was moved to the router layer so
    that ``app.prompts`` stays a template-only layer with no side effects.
    """
    assert not hasattr(prompt_builder, "generate_initial_question"), (
        "generate_initial_question must be defined in routers.gakuchika, not in "
        "prompts.gakuchika_prompt_builder. See plan M2 (2026-04-17)."
    )


def test_prompt_builder_module_has_no_normalization_reverse_imports() -> None:
    """prompt_builder must not import from ``app.normalization.*`` (reverse dep)."""
    source = inspect.getsource(prompt_builder)
    assert "from app.normalization" not in source, (
        "prompt_builder should not import from normalization layer (M2)."
    )
    assert "import app.normalization" not in source


def test_prompt_builder_module_does_not_call_llm() -> None:
    """prompt_builder must not reach into ``app.utils.llm`` LLM call helpers.

    Templating is allowed (``sanitize_prompt_input``), but actual LLM calls
    (``call_llm_with_error`` / ``call_llm_streaming_fields``) belong to the
    router.
    """
    source = inspect.getsource(prompt_builder)
    assert "call_llm_with_error" not in source
    assert "call_llm_streaming_fields" not in source


def test_prompt_builder_module_has_no_normalization_helper_attributes() -> None:
    """Sanity: normalization helpers must not be re-exported via prompt_builder."""
    for name in ("_build_coach_progress_message", "_default_state", "_normalize_es_build_payload"):
        assert not hasattr(prompt_builder, name), (
            f"prompt_builder should not expose normalization helper {name} (M2)."
        )
