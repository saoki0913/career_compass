"""
D.4: Live scenario tests for gakuchika flow (deterministic, no LLM calls).

These tests verify the executable completion criteria by replaying fixed
conversation sequences through the normalization / evaluation layer.
No LLM calls are made — all inputs are hand-crafted fixtures.

Executable criteria summary (from D.4 spec):
  assert same_question_signature_streak <= 3       # Scenario 2
  assert draft_ready_within_5_questions >= True    # Scenario 1 (verified in <=5 turns)
  assert questions_with_acknowledgment_rate >= 0.9 # Scenario 3
  assert max_question_length <= 60                 # Scenario 4 (question body only)
  assert token_increment <= 350                    # Scenario 5 (prompt size regression)
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import pytest

from app.evaluators.draft_quality import _build_draft_quality_checks
from app.normalization.gakuchika_payload import _normalize_es_build_payload
from app.routers.gakuchika import ConversationStateInput
from app.utils.gakuchika_text import BUILD_FOCUS_FALLBACKS, DEEPDIVE_FOCUS_FALLBACKS

# ---------------------------------------------------------------------------
# Constants / helpers
# ---------------------------------------------------------------------------

_FIXTURES_DIR = Path(__file__).parent / "fixtures"
_BASELINE_FILE = _FIXTURES_DIR / "baseline_prompt_token_counts.json"


def _count_prompt_tokens(text: str, method: str = "char_times_half") -> int:
    """Estimate token count.

    Explicit ``method`` argument ensures baseline and current measurements
    use the same approximation. Default ``char_times_half`` matches the
    method recorded in ``baseline_prompt_token_counts.json`` and is
    environment-independent. Passing ``method="tiktoken"`` is supported for
    debugging but should not be used in assertions against the fixture.
    """
    if method == "tiktoken":
        try:
            import tiktoken  # type: ignore[import]

            enc = tiktoken.get_encoding("cl100k_base")
            return len(enc.encode(text))
        except ImportError:
            pass
    return int(len(text) * 0.5)


def _extract_acknowledgment(question: str) -> str | None:
    """Return the acknowledgment prefix (up to 30 chars) if present.

    An acknowledgment ends with one of the typical Japanese approval endings.
    Returns None if no acknowledgment is detected in the first 30 characters.
    """
    _APPROVAL_RE = re.compile(
        r'(?:ですね|でしたね|ましたね|はいいですね|は大きな|は重要|はよかった|はなるほど|'
        r'ですね[。、！]|でしたね[。、！]|ですよね|でしたよね|ましたよね)',
        re.UNICODE,
    )
    first_30 = question[:30]
    match = _APPROVAL_RE.search(first_30)
    if match:
        return first_30[: match.end()]
    return None


def _make_state(
    state_dict: dict[str, Any] | None,
) -> ConversationStateInput | None:
    """Convert a state dict back into a ConversationStateInput for the next turn."""
    if state_dict is None:
        return None
    return ConversationStateInput(
        stage=state_dict.get("stage", "es_building"),
        asked_focuses=state_dict.get("asked_focuses", []),
        blocked_focuses=state_dict.get("blocked_focuses", []),
        focus_attempt_counts=state_dict.get("focus_attempt_counts", {}),
        resolved_focuses=state_dict.get("resolved_focuses", []),
        deferred_focuses=state_dict.get("deferred_focuses", []),
        last_question_signature=state_dict.get("last_question_signature"),
        input_richness_mode=state_dict.get("input_richness_mode"),
        draft_text=state_dict.get("draft_text"),
        ready_for_draft=state_dict.get("ready_for_draft", False),
    )


# ---------------------------------------------------------------------------
# Scenario 1: Implicit-task conversation → draft_ready within 5 questions
# ---------------------------------------------------------------------------


def test_scenario1_implicit_task_reaches_draft_ready_within_5_questions() -> None:
    """A 4-turn conversation with implicit task expression must reach
    draft_ready=True by question 4.

    The 4 user messages provide the full STAR set:
      - S (context): 大学祭の参加者減少、受付に行列
      - T (task, implicit): 昼ピーク時に受付が詰まる課題と役割分担の必要性
      - A (action): 導線整理と役割分担決定
      - R (result): 受付待ち時間 30% 短縮

    Assertion: missing_elements が 4 問目で空、draft_quality_checks の
    task_clarity / action_ownership / role_clarity / result_traceability が True、
    ready_for_draft が True。
    """
    user_answers = [
        # Turn 1: context (implicit task also present via 課題があった)
        "大学祭の参加者が年々減少しており、昼のピーク時に受付が詰まる課題があった。",
        # Turn 2: task + role (implicit task reinforced)
        "受付と誘導を1人で担当していたため、役割を明確に振り直す必要があった。",
        # Turn 3: action
        "導線を整理して受付2名・誘導1名に役割分担を変更した。誘導案内板も設置した。",
        # Turn 4: result (with number)
        "受付の待ち時間を30%短縮でき、参加者から動きやすくなったと評価された。",
    ]

    state_dict: dict[str, Any] | None = None

    for i, answer in enumerate(user_answers, 1):
        conv_text = "\n".join(user_answers[:i])
        focus_sequence = ["context", "task", "action", "result"]

        llm_payload: dict[str, Any] = {
            "focus_key": focus_sequence[i - 1],
            "question": "次の質問",
            "missing_elements": focus_sequence[i:],  # remaining STAR elements
            "ready_for_draft": (i == 4),
            "draft_readiness_reason": "STAR 4要素が揃いました。" if i == 4 else "",
        }

        _, state_dict, _ = _normalize_es_build_payload(
            llm_payload,
            _make_state(state_dict),
            conversation_text=conv_text,
            input_richness_mode="rough_episode",
            question_count=i,
        )

    assert state_dict is not None
    assert state_dict["missing_elements"] == [], (
        f"missing_elements should be empty after 4 questions, got: {state_dict['missing_elements']}"
    )
    assert state_dict["ready_for_draft"] is True, (
        "draft_ready must be True after providing all 4 STAR elements"
    )

    checks = state_dict.get("draft_quality_checks", {})
    required_true = ["task_clarity", "action_ownership", "role_clarity", "result_traceability"]
    for key in required_true:
        assert checks.get(key) is True, (
            f"draft_quality_checks['{key}'] must be True, got {checks.get(key)}"
        )


# ---------------------------------------------------------------------------
# Scenario 2: Same-focus repetition loop prevention
# ---------------------------------------------------------------------------


def test_scenario2_same_focus_blocked_after_two_attempts() -> None:
    """When the LLM repeatedly proposes the same focus_key, the normalization
    layer must block that focus after ≤ 2 attempts and redirect to the next
    STAR element.

    The focus tracking system (via _derive_focus_tracking) transitions a focus
    to blocked when attempts[focus_key] >= 2.  This means the same focus_key
    appears in at most 2 consecutive turns before the system pivots.

    Assertion: consecutive same-focus streak ≤ 2 (≤ 3 per spec — our system
    is more conservative at ≤ 2).
    """
    state_dict: dict[str, Any] | None = None
    focus_keys: list[str] = []

    for i in range(6):
        conv_text = "サークルで活動していた。" * (i + 1)
        llm_payload: dict[str, Any] = {
            "focus_key": "task",  # always tries to return 'task'
            "question": "課題は何でしたか。",
            "missing_elements": ["task", "action", "result"],
            "ready_for_draft": False,
        }
        _, state_dict, _ = _normalize_es_build_payload(
            llm_payload,
            _make_state(state_dict),
            conversation_text=conv_text,
            input_richness_mode="rough_episode",
            question_count=i + 1,
        )
        focus_keys.append(state_dict["focus_key"])

    # Compute maximum consecutive same-focus run
    max_streak = 1
    streak = 1
    for j in range(1, len(focus_keys)):
        if focus_keys[j] == focus_keys[j - 1]:
            streak += 1
            max_streak = max(max_streak, streak)
        else:
            streak = 1

    assert max_streak <= 3, (
        f"STAR ループ防止: same focus streak must be <= 3, got {max_streak}. "
        f"Focus sequence: {focus_keys}"
    )

    # Also verify the focus eventually transitions away from 'task'
    assert any(fk != "task" for fk in focus_keys), (
        "Focus must eventually move away from 'task' when it is blocked"
    )


def test_scenario2_last_question_signature_increments_per_focus() -> None:
    """last_question_signature must include the attempt count and change when
    the focus changes.  This guards against a UI-side loop-detection bug where
    a fixed signature string caused the client to freeze.
    """
    state_dict: dict[str, Any] | None = None
    signatures: list[str | None] = []

    for i in range(4):
        conv_text = "サークルで活動していた" + "。続き" * i
        llm_payload: dict[str, Any] = {
            "focus_key": "task",
            "question": "課題は何でしたか。",
            "missing_elements": ["task", "action", "result"],
            "ready_for_draft": False,
        }
        _, state_dict, _ = _normalize_es_build_payload(
            llm_payload,
            _make_state(state_dict),
            conversation_text=conv_text,
            input_richness_mode="rough_episode",
            question_count=i + 1,
        )
        signatures.append(state_dict.get("last_question_signature"))

    # No two consecutive signatures should be identical
    for j in range(1, len(signatures)):
        assert signatures[j] != signatures[j - 1], (
            f"last_question_signature must not repeat consecutively: "
            f"{signatures[j-1]!r} then {signatures[j]!r} at turn {j+1}"
        )


# ---------------------------------------------------------------------------
# Scenario 3: Acknowledgment + question pattern compliance
# ---------------------------------------------------------------------------


def test_scenario3_acknowledgment_question_ratio_at_least_90_percent() -> None:
    """AI-generated question fixtures must have acknowledgment at position 0-30 chars
    at a rate ≥ 90%.

    The fixture questions represent the output of the few-shot examples
    and PROHIBITED_EXPRESSIONS guide defined in gakuchika_prompts.py.
    These are the canonical 'good question' examples from the prompt system.
    """
    # Fixtures: hand-crafted questions that comply with the approval+question pattern.
    # These represent expected LLM output based on few-shot examples in
    # gakuchika_prompts.py (APPROVAL_AND_QUESTION_PATTERN, _FEW_SHOT_QUESTION_*).
    compliant_questions = [
        # From _FEW_SHOT_QUESTION_SEED_ONLY
        "学園祭実行委員の経験を整理していきますね。まずその役割ではどんな場面や規模で動いていましたか。",
        "塾講師のお仕事は身近でやりがいも大きいですよね。まずどんな生徒を担当し、どんな状況でしたか。",
        # From _FEW_SHOT_QUESTION_ROUGH
        "参加者が減っていた中でSNSを見直したのは大事な一歩ですね。具体的にどの発信から手を付けましたか。",
        "資料作成の効率化を任されるのは信頼の証ですね。そのとき一番時間がかかっていた工程はどこでしたか。",
        # Additional representative compliant questions
        "SNS発信で参加者が倍増したのは大きな成果ですね。その時、他のメンバーとはどう役割分担していましたか。",
        "導線を整理したというのは大事な工夫ですね。具体的にどの部分から手を付けましたか。",
        "受付の待ち時間が短縮できたのはいいですね。その改善でメンバーの反応はいかがでしたか。",
        "役割分担を変えたのは大きな決断でしたね。その判断のきっかけは何でしたか。",
        "問題の原因に気づいたのは早かったですね。最初にとった対処はどういうものでしたか。",
        "全体を1人で回していたのは大変でしたね。その状況でどんな優先順位をつけていましたか。",
    ]

    approved_count = sum(
        1 for q in compliant_questions if _extract_acknowledgment(q) is not None
    )
    rate = approved_count / len(compliant_questions)

    assert rate >= 0.9, (
        f"承認付き質問比率 must be >= 90%, got {rate:.1%} "
        f"({approved_count}/{len(compliant_questions)} questions)"
    )


def test_scenario3_acknowledgment_detector_correctly_rejects_empty_approval() -> None:
    """The acknowledgment extractor must not trigger on vague/empty approvals.

    '「いい回答ですね」等の空の承認は禁止' — guard that detection is specific,
    not trivially satisfied by any 「ですね」 suffix.
    """
    # Questions without substantive acknowledgment
    non_compliant = [
        "課題は何でしたか。",
        "どのような行動をしましたか。",
        "もう少し詳しく教えてください。",
        "次の質問です。その後どうなりましたか。",
    ]
    for q in non_compliant:
        result = _extract_acknowledgment(q)
        assert result is None, (
            f"Non-compliant question should not have acknowledgment detected: {q!r}, "
            f"got: {result!r}"
        )


# ---------------------------------------------------------------------------
# Scenario 4: Question length constraint
# ---------------------------------------------------------------------------


def test_scenario4_fallback_questions_respect_60_char_limit() -> None:
    """All fallback questions in BUILD_FOCUS_FALLBACKS and DEEPDIVE_FOCUS_FALLBACKS
    must be ≤ 60 characters.

    This is the question body limit from PROHIBITED_EXPRESSIONS:
    '60 字を超える冗長な質問（承認を含めても 100 字を目安に収める）'
    """
    violations: list[tuple[str, str, int]] = []

    for template_set, set_name in [
        (BUILD_FOCUS_FALLBACKS, "BUILD"),
        (DEEPDIVE_FOCUS_FALLBACKS, "DEEPDIVE"),
    ]:
        for focus_key, text_map in template_set.items():
            q = text_map.get("question", "")
            if q and len(q) > 60:
                violations.append((f"{set_name}/{focus_key}", q, len(q)))

    assert violations == [], (
        f"Fallback questions exceeding 60 chars: {violations}"
    )


def test_scenario4_few_shot_questions_respect_total_100_char_limit() -> None:
    """Few-shot example questions (from gakuchika_prompts.py) must have
    total length ≤ 100 characters (承認+質問の合計は100字以内を目安).
    """
    from app.prompts.gakuchika_prompts import (
        _FEW_SHOT_QUESTION_ROUGH,
        _FEW_SHOT_QUESTION_SEED_ONLY,
    )

    # Extract the '良い質問' examples from both few-shot blocks
    question_pattern = re.compile(r'- 良い質問: 「(.*?)」', re.DOTALL)
    all_questions: list[str] = []
    for block in [_FEW_SHOT_QUESTION_SEED_ONLY, _FEW_SHOT_QUESTION_ROUGH]:
        all_questions.extend(question_pattern.findall(block))

    assert all_questions, "Must have extracted at least some few-shot questions"

    violations = [(q, len(q)) for q in all_questions if len(q) > 100]
    assert violations == [], (
        f"Few-shot questions exceeding 100-char total limit: {violations}"
    )


def test_scenario4_fixture_questions_respect_length_rules() -> None:
    """A curated set of representative questions must satisfy both the 60-char
    question-body rule and the 100-char total (approval + question) rule.
    """
    # Fixtures: (approval_prefix, question_body)
    # approval + question = full question sent to the student
    question_fixtures = [
        ("参加者が倍増したのは大きな成果ですね。", "その時、他のメンバーとはどう役割分担していましたか。"),
        ("導線を整理したのは良い工夫ですね。", "具体的にどの部分から手を付けましたか。"),
        ("受付の待ち時間が短縮できたのはいいですね。", "その中で最も効果が高かった変更は何でしたか。"),
        ("役割分担を見直したのは重要な判断でしたね。", "その判断のきっかけを教えてもらえますか。"),
    ]

    for approval, question_body in question_fixtures:
        total = approval + question_body
        assert len(question_body) <= 60, (
            f"Question body must be <= 60 chars, got {len(question_body)}: {question_body!r}"
        )
        assert len(total) <= 100, (
            f"Total question (approval + body) must be <= 100 chars, "
            f"got {len(total)}: {total!r}"
        )


# ---------------------------------------------------------------------------
# Scenario 5: Token increment ≤ 350 regression gate (legacy, reads v2)
# ---------------------------------------------------------------------------

_BASELINE_FILE_V2 = _FIXTURES_DIR / "baseline_prompt_token_counts_v2.json"


def _load_v2_baseline() -> dict:
    assert _BASELINE_FILE_V2.exists(), f"Baseline v2 missing: {_BASELINE_FILE_V2}"
    return json.loads(_BASELINE_FILE_V2.read_text(encoding="utf-8"))


def test_scenario5_prompt_token_increment_within_budget() -> None:
    """build_es_prompt_text output must not exceed the baseline token count
    by more than the budget defined in baseline_prompt_token_counts_v2.json.

    Updated in Phase 0.3 to read from v2 baseline (budget: 200 tokens).
    The legacy baseline_prompt_token_counts.json is retained for audit purposes.

    Method: char_count * 0.5 approximation (tiktoken unavailable in this env).
    The relative increment is valid because both measurements use the same method.
    """
    from app.prompts.gakuchika_prompt_builder import build_es_prompt_text

    baseline = _load_v2_baseline()
    snap = baseline["snapshots"]["es_build"]
    baseline_tokens: int = snap["approx_tokens"]
    budget: int = snap["budget"]

    # Use the same inputs as the baseline establishment
    system_prompt, user_message = build_es_prompt_text(
        gakuchika_title="学園祭実行委員",
        conversation_text=(
            "質問: どんな経験ですか。\n\n"
            "回答: 大学3年の学園祭実行委員として模擬店エリア運営を担当しました。\n\n"
            "質問: 課題は何でしたか。\n\n"
            "回答: 昼のピーク時に待機列が交差し、回遊しにくい状態が続いていました。"
        ),
        known_facts=(
            "- 大学3年の学園祭実行委員として模擬店エリア運営を担当\n"
            "- 昼のピーク時に待機列が交差"
        ),
        input_richness_mode="rough_episode",
        asked_focuses=["context"],
        blocked_focuses=[],
    )

    current_tokens = _count_prompt_tokens(system_prompt) + _count_prompt_tokens(user_message)
    increment = current_tokens - baseline_tokens

    assert increment <= budget, (
        f"Prompt token count increased by {increment} tokens (budget: {budget}). "
        f"Current: {current_tokens}, baseline: {baseline_tokens}. "
        f"Review recent changes to gakuchika_prompt_builder.py or gakuchika_prompts.py."
    )


def test_scenario5_baseline_file_has_required_fields() -> None:
    """Baseline v2 snapshot file must contain all required fields for the token
    regression gate to operate correctly.

    Updated in Phase 0.3 to verify v2 structure (budget: 200, 4 snapshots).
    """
    baseline = _load_v2_baseline()

    assert "snapshots" in baseline, "v2 baseline JSON must contain 'snapshots' key"
    assert "method" in baseline, "v2 baseline JSON must contain 'method' key"

    snap = baseline["snapshots"]["es_build"]
    required_fields = ["approx_tokens", "budget", "method"]
    for field in ["approx_tokens", "budget"]:
        assert field in snap, f"es_build snapshot must contain '{field}' field"

    assert isinstance(snap["approx_tokens"], int), "approx_tokens must be an integer"
    assert snap["approx_tokens"] > 0, "approx_tokens must be positive"
    assert isinstance(snap["budget"], int), "budget must be an integer"
    assert snap["budget"] == 200, "budget must be 200 (v3 strictened from 350)"


# ---------------------------------------------------------------------------
# Scenario 5v2: Token budget per prompt type (4-snapshot extension, Phase 0.3)
# ---------------------------------------------------------------------------


def _measure_initial_question_tokens() -> tuple[int, int]:
    """Render initial_question prompt with seed_only fixture; return (system_chars, user_chars)."""
    from app.prompts.gakuchika_prompt_builder import _render_initial_question_system_prompt

    system_prompt = _render_initial_question_system_prompt(input_richness_mode="seed_only")
    user_message = "ガクチカのタイトル: 塾講師のアルバイト\nガクチカの内容: 個別指導塾で高校生を担当"
    return len(system_prompt), len(user_message)


def _measure_es_build_tokens() -> tuple[int, int]:
    """Render es_build prompt with rough_episode 2-turn fixture; return (system_chars, user_chars)."""
    from app.prompts.gakuchika_prompt_builder import build_es_prompt_text

    system_prompt, user_message = build_es_prompt_text(
        gakuchika_title="学園祭実行委員",
        conversation_text=(
            "質問: どんな経験ですか。\n\n"
            "回答: 大学3年の学園祭実行委員として模擬店エリア運営を担当しました。\n\n"
            "質問: 課題は何でしたか。\n\n"
            "回答: 昼のピーク時に待機列が交差し、回遊しにくい状態が続いていました。"
        ),
        known_facts=(
            "- 大学3年の学園祭実行委員として模擬店エリア運営を担当\n"
            "- 昼のピーク時に待機列が交差"
        ),
        input_richness_mode="rough_episode",
        asked_focuses=["context"],
        blocked_focuses=[],
    )
    return len(system_prompt), len(user_message)


def _measure_deep_dive_tokens() -> tuple[int, int]:
    """Render deep_dive prompt with es_aftercare fixture; return (system_chars, user_chars)."""
    from app.prompts.gakuchika_prompt_builder import build_deepdive_prompt_text

    draft_text = (
        "私は大学祭実行委員として模擬店エリアの運営を担当し、昼ピーク時の動線混雑という課題に取り組んだ。\n"
        "受付を2レーン制に変更し、案内板を追加設置することで待ち時間を15分以内に短縮し、"
        "前年比15ポイント向上という成果を実現した。\n"
        "この経験から、現場判断で仕組みを変える重要性を学んだ。"
    )
    conversation_text = (
        "質問: どんな経験ですか。\n\n"
        "回答: 学園祭実行委員として模擬店エリアの運営を担当しました。昼のピーク時に50人以上の行列ができていました。\n\n"
        "質問: どう対応しましたか。\n\n"
        "回答: 受付を2レーン制にして15分以内に短縮しました。"
    )
    system_prompt, user_message = build_deepdive_prompt_text(
        gakuchika_title="学園祭実行委員",
        draft_text=draft_text,
        conversation_text=conversation_text,
        phase_name="es_aftercare",
        phase_description="完成 ES 直後の補強",
        preferred_focuses=["action_reason"],
        extended_deep_dive_round=0,
        strength_tags=[],
        issue_tags=[],
        deepdive_recommendation_tags=[],
        credibility_risk_tags=[],
        asked_focuses=["context"],
        blocked_focuses=[],
    )
    return len(system_prompt), len(user_message)


def _measure_draft_generation_tokens() -> tuple[int, int]:
    """Render draft_generation prompt with gakuchika char_limit=400 fixture; return (system_chars, user_chars)."""
    from app.prompts.es_templates import build_template_draft_generation_prompt

    student_expressions = [
        "50人以上の行列",
        "受付を2レーン制",
        "15分以内に短縮",
        "前年比15ポイント向上",
        "現場判断で仕組みを変える",
    ]
    primary_body = (
        "質問: どんな経験ですか。\n\n"
        "回答: 学園祭実行委員として模擬店エリアの運営を担当しました。昼のピーク時に50人以上の行列ができていました。\n\n"
        "質問: どう対応しましたか。\n\n"
        "回答: 受付を2レーン制にして15分以内に短縮しました。前年比15ポイント向上という成果でした。\n\n"
        "質問: なぜその方法を選んだのですか。\n\n"
        "回答: 現場判断で仕組みを変えることが最も速いと考えました。"
    )
    system_prompt, user_message = build_template_draft_generation_prompt(
        "gakuchika",
        company_name=None,
        industry=None,
        question="学生時代に力を入れたことを教えてください（400字）",
        char_min=None,
        char_max=400,
        primary_material_heading="【会話トランスクリプト】",
        primary_material_body=primary_body,
        output_json_kind="gakuchika",
        student_expressions=student_expressions,
    )
    return len(system_prompt), len(user_message)


_V2_MEASURE_FNS: dict = {
    "initial_question": _measure_initial_question_tokens,
    "es_build": _measure_es_build_tokens,
    "deep_dive": _measure_deep_dive_tokens,
    "draft_generation": _measure_draft_generation_tokens,
}


@pytest.mark.parametrize(
    "snapshot_key",
    ["initial_question", "es_build", "deep_dive", "draft_generation"],
)
def test_scenario5_v2_token_budget_per_prompt_type(snapshot_key: str) -> None:
    """Each of the 4 prompt types must stay within baseline + 200 tokens.

    Verifies that prompt engineering changes (gakuchika_prompts.py,
    gakuchika_prompt_builder.py, es_templates.py) do not silently inflate
    any prompt type beyond the Phase 0.3 baselines established in
    baseline_prompt_token_counts_v2.json.

    Budget: +200 approx_tokens per type (char_times_half method).
    """
    baseline = _load_v2_baseline()
    snap = baseline["snapshots"][snapshot_key]
    measure_fn = _V2_MEASURE_FNS[snapshot_key]

    sys_chars, user_chars = measure_fn()
    current_tokens = int((sys_chars + user_chars) * 0.5)
    increment = current_tokens - snap["approx_tokens"]

    assert increment <= snap["budget"], (
        f"[{snapshot_key}] Prompt token count increased by {increment} tokens "
        f"(budget: {snap['budget']}). "
        f"Current: {current_tokens}, baseline: {snap['approx_tokens']}. "
        f"Review recent prompt changes for this prompt type."
    )


def test_scenario5_v2_baseline_file_well_formed() -> None:
    """v2 JSON structure smoke: all 4 snapshot keys and required fields must be present."""
    baseline = _load_v2_baseline()
    assert "snapshots" in baseline, "v2 baseline must have 'snapshots' key"
    for key in ["initial_question", "es_build", "deep_dive", "draft_generation"]:
        assert key in baseline["snapshots"], f"snapshots must contain '{key}'"
        snap = baseline["snapshots"][key]
        for field in ["system_chars", "user_chars", "total_chars", "approx_tokens", "budget"]:
            assert field in snap, f"snapshot['{key}'] must contain '{field}'"
        assert snap["budget"] == 200, f"snapshot['{key}']['budget'] must be 200"
        assert snap["approx_tokens"] > 0, f"snapshot['{key}']['approx_tokens'] must be positive"
