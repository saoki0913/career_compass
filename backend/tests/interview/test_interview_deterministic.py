"""
test_interview_deterministic.py — Stage C1 決定論テスト群

構造差分を主軸に検証。文言アサーションは補助のみ。
全テストは独立。LLM 呼出しは行わない。
"""

import asyncio
import json
from types import SimpleNamespace
from typing import Any

import pytest

from app.routers.interview import (
    ROLE_TRACKS,
    CaseBrief,
    InterviewFeedbackRequest,
    InterviewStartRequest,
    InterviewTurnRequest,
    _build_fallback_continue_payload,
    _build_fallback_turn_payload,
    _build_feedback_prompt,
    _build_opening_prompt,
    _build_plan_prompt,
    _build_setup,
    _build_turn_prompt,
    _extract_case_seed_version,
    _fallback_plan,
    _fallback_turn_meta,
    _infer_role_track,
    _infer_stage_from_topic,
    _load_case_brief_preset,
    _question_stage_from_turn_meta,
    _select_case_brief,
    InterviewContinueRequest,
)
from app.prompts.interview_prompts import INTERVIEW_GROUNDING_RULES, build_behavioral_block


# ---------------------------------------------------------------------------
# 共通フィクスチャ
# ---------------------------------------------------------------------------


def _make_start_payload(**kwargs) -> InterviewStartRequest:
    defaults = dict(
        company_name="テスト株式会社",
        company_summary="DX 支援を行う企業。",
        motivation_summary="顧客課題の解像度を上げたい。",
        gakuchika_summary="学園祭運営で進行管理を担当。",
        academic_summary="ゼミで消費者行動を分析した。",
        es_summary="ES で課題整理力を訴求。",
        selected_industry="コンサルティング",
        selected_role="コンサルタント",
        role_track="consulting",
        interview_format="standard_behavioral",
        selection_type="fulltime",
        interview_stage="mid",
        interviewer_type="hr",
        strictness_mode="standard",
    )
    defaults.update(kwargs)
    return InterviewStartRequest(**defaults)


def _make_turn_payload(**kwargs) -> InterviewTurnRequest:
    defaults = dict(
        company_name="テスト株式会社",
        company_summary="DX 支援を行う企業。",
        motivation_summary="顧客課題の解像度を上げたい。",
        gakuchika_summary="学園祭運営で進行管理を担当。",
        academic_summary="ゼミで消費者行動を分析した。",
        es_summary="ES で課題整理力を訴求。",
        selected_industry="コンサルティング",
        selected_role="コンサルタント",
        role_track="consulting",
        interview_format="standard_behavioral",
        selection_type="fulltime",
        interview_stage="mid",
        interviewer_type="hr",
        strictness_mode="standard",
        conversation_history=[
            {"role": "assistant", "content": "志望理由を教えてください。"},
            {"role": "user", "content": "顧客課題に近い立場で働きたいです。"},
        ],
        turn_state={
            "currentStage": "opening",
            "totalQuestionCount": 1,
            "stageQuestionCounts": {
                "industry_reason": 0,
                "role_reason": 0,
                "opening": 1,
                "experience": 0,
                "company_understanding": 0,
                "motivation_fit": 0,
            },
            "completedStages": [],
            "lastQuestionFocus": "志望動機の核",
            "nextAction": "ask",
            "phase": "turn",
            "formatPhase": "standard_main",
            "coveredTopics": ["motivation_fit"],
            "remainingTopics": ["role_understanding"],
            "coverageState": [
                {
                    "topic": "motivation_fit",
                    "status": "covered",
                    "requiredChecklist": ["company_reason"],
                    "passedChecklistKeys": ["company_reason"],
                    "deterministicCoveragePassed": True,
                    "llmCoverageHint": "strong",
                    "deepeningCount": 1,
                    "lastCoveredTurnId": "turn-1",
                },
            ],
            "recentQuestionSummariesV2": [],
            "interviewPlan": {
                "interview_type": "new_grad_behavioral",
                "priority_topics": ["motivation_fit"],
                "opening_topic": "motivation_fit",
                "must_cover_topics": ["motivation_fit", "role_understanding"],
                "risk_topics": ["credibility_check"],
                "suggested_timeflow": ["導入", "志望動機", "企業理解", "締め"],
            },
        },
    )
    defaults.update(kwargs)
    return InterviewTurnRequest(**defaults)


def _make_feedback_payload(**kwargs) -> InterviewFeedbackRequest:
    defaults = dict(
        company_name="テスト株式会社",
        company_summary="DX 支援を行う企業。",
        motivation_summary="顧客課題の解像度を上げたい。",
        gakuchika_summary="学園祭運営で進行管理を担当。",
        academic_summary="ゼミで消費者行動を分析した。",
        es_summary="ES で課題整理力を訴求。",
        selected_industry="コンサルティング",
        selected_role="コンサルタント",
        role_track="consulting",
        interview_format="standard_behavioral",
        selection_type="fulltime",
        interview_stage="mid",
        interviewer_type="hr",
        strictness_mode="standard",
        conversation_history=[
            {"role": "assistant", "content": "志望理由を教えてください。"},
            {"role": "user", "content": "顧客課題に近い立場で働きたいです。"},
        ],
    )
    defaults.update(kwargs)
    return InterviewFeedbackRequest(**defaults)


def _make_continue_payload(**kwargs) -> InterviewContinueRequest:
    defaults = dict(
        company_name="テスト株式会社",
        company_summary="DX 支援を行う企業。",
        motivation_summary="顧客課題の解像度を上げたい。",
        gakuchika_summary="学園祭運営で進行管理を担当。",
        academic_summary="ゼミで消費者行動を分析した。",
        es_summary="ES で課題整理力を訴求。",
        selected_industry="コンサルティング",
        selected_role="コンサルタント",
        role_track="consulting",
        interview_format="standard_behavioral",
        selection_type="fulltime",
        interview_stage="mid",
        interviewer_type="hr",
        strictness_mode="standard",
        conversation_history=[
            {"role": "assistant", "content": "志望理由を教えてください。"},
            {"role": "user", "content": "顧客課題に近い立場で働きたいです。"},
        ],
    )
    defaults.update(kwargs)
    return InterviewContinueRequest(**defaults)


def _minimal_interview_plan(opening_topic: str = "motivation_fit") -> dict:
    return {
        "interview_type": "new_grad_behavioral",
        "priority_topics": [opening_topic],
        "opening_topic": opening_topic,
        "must_cover_topics": [opening_topic, "role_understanding"],
        "risk_topics": ["credibility_check"],
        "suggested_timeflow": ["導入", "志望動機", "企業理解", "締め"],
    }


# ---------------------------------------------------------------------------
# カテゴリ 1: ROLE_TRACK negative test (5 件)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "selected_role,company_summary,selected_industry,expected",
    [
        # 会社説明由来の誤推論防止: selected_role="営業" が優先されて biz_general になる
        ("営業", "Reactで EC 構築", "小売", "biz_general"),
        # selected_role に "フロントエンドエンジニア" が含まれるので正しく分類される
        ("フロントエンドエンジニア", None, None, "frontend_engineer"),
        # PdM は product_manager (it_product ではない)
        ("PdM", None, None, "product_manager"),
        # IT コンサル は consulting (it_product ではない)
        ("IT コンサル", None, None, "consulting"),
        # selected_role=None の場合は company_summary を参照; "PMO" が word-boundary で "PM" にマッチしない
        (None, "PMOコンサル", None, "consulting"),
    ],
)
def test_infer_role_track_priority_and_negative(
    selected_role: str | None,
    company_summary: str | None,
    selected_industry: str | None,
    expected: str,
) -> None:
    result = _infer_role_track(selected_role, company_summary, selected_industry)
    assert result == expected, (
        f"_infer_role_track({selected_role!r}, {company_summary!r}, {selected_industry!r}) "
        f"=> {result!r}, want {expected!r}"
    )


def test_fallback_plan_covers_all_10_role_tracks() -> None:
    """ROLE_TRACKS 全 10 種で must_cover_topics が 3 件以上になることを確認。"""
    assert len(ROLE_TRACKS) == 10, f"ROLE_TRACKS should have 10 entries, got {len(ROLE_TRACKS)}"

    for role_track in ROLE_TRACKS:
        payload = _make_start_payload(role_track=role_track)
        setup = _build_setup(payload)
        plan = _fallback_plan(payload, setup)
        must_cover = plan.get("must_cover_topics", [])
        assert len(must_cover) >= 3, (
            f"role_track={role_track!r}: must_cover_topics has only {len(must_cover)} items: {must_cover}"
        )


# ---------------------------------------------------------------------------
# カテゴリ 2: topic → stage 推論 parametrize (12 件)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "topic,expected_stage",
    [
        ("system_design", "role_reason"),
        ("design_decision", "role_reason"),
        ("analytical_approach", "role_reason"),
        ("data_handling", "role_reason"),
        ("reliability", "role_reason"),
        ("user_understanding", "role_reason"),
        ("prioritization", "role_reason"),
        ("structured_thinking", "experience"),
        ("life_narrative_core", "experience"),
        ("turning_point_values", "experience"),
        ("motivation_fit", "motivation_fit"),
        ("company_compare_check", "company_understanding"),
    ],
)
def test_infer_stage_from_new_topics(topic: str, expected_stage: str) -> None:
    stage_direct = _infer_stage_from_topic(topic)
    assert stage_direct == expected_stage, (
        f"_infer_stage_from_topic({topic!r}) => {stage_direct!r}, want {expected_stage!r}"
    )
    stage_from_meta = _question_stage_from_turn_meta({"topic": topic})
    assert stage_from_meta == expected_stage, (
        f"_question_stage_from_turn_meta({{topic: {topic!r}}}) => {stage_from_meta!r}, want {expected_stage!r}"
    )


# ---------------------------------------------------------------------------
# カテゴリ 3: strictness 決定論差分 (3 件)
# ---------------------------------------------------------------------------


def _turn_state_with_covered(covered: list[str], remaining: list[str]) -> dict:
    return {
        "coveredTopics": covered,
        "remainingTopics": remaining,
        "turnCount": 1,
    }


def test_fallback_turn_meta_strict_prefers_deepen() -> None:
    """strict モードでは covered なトピックでも turn_action=deepen を優先する。"""
    turn_state = _turn_state_with_covered(["motivation_fit"], ["role_understanding"])
    interview_plan = _minimal_interview_plan("motivation_fit")

    setup_strict = {"strictness_mode": "strict", "interviewer_type": "hr"}
    meta_strict = _fallback_turn_meta(turn_state, interview_plan, setup=setup_strict)
    assert meta_strict["turn_action"] == "deepen", (
        f"strict should prefer deepen, got {meta_strict['turn_action']!r}"
    )


def test_fallback_turn_meta_supportive_prefers_shift() -> None:
    """supportive モードでは covered 有無にかかわらず turn_action=shift を優先する。"""
    turn_state = _turn_state_with_covered(["motivation_fit"], ["role_understanding"])
    interview_plan = _minimal_interview_plan("motivation_fit")

    setup_supportive = {"strictness_mode": "supportive", "interviewer_type": "hr"}
    meta_supportive = _fallback_turn_meta(turn_state, interview_plan, setup=setup_supportive)
    assert meta_supportive["turn_action"] == "shift", (
        f"supportive should prefer shift, got {meta_supportive['turn_action']!r}"
    )


def test_fallback_turn_meta_standard_uses_coverage_based_action() -> None:
    """standard モードでは covered=True なら deepen、False なら shift の既存ロジックを維持する。"""
    interview_plan = _minimal_interview_plan("motivation_fit")
    setup_standard = {"strictness_mode": "standard", "interviewer_type": "hr"}

    # covered → remaining の次のトピックへ shift する場合
    turn_state_not_covered = _turn_state_with_covered([], ["motivation_fit"])
    meta_not_covered = _fallback_turn_meta(turn_state_not_covered, interview_plan, setup=setup_standard)
    # remaining の先頭 motivation_fit が covered に入っていないので shift
    assert meta_not_covered["turn_action"] == "shift"

    # covered に入っている → deepen
    turn_state_covered = _turn_state_with_covered(["motivation_fit"], [])
    # remaining が空のときは opening_topic にフォールバック
    meta_covered = _fallback_turn_meta(turn_state_covered, interview_plan, setup=setup_standard)
    assert meta_covered["turn_action"] == "deepen"


# ---------------------------------------------------------------------------
# カテゴリ 4: interviewer 差分 (3 件)
# ---------------------------------------------------------------------------


def test_fallback_plan_executive_includes_career_alignment() -> None:
    """executive 面接官では priority_topics の先頭に career_alignment が含まれる。"""
    payload = _make_start_payload(interviewer_type="executive")
    setup = _build_setup(payload)
    plan = _fallback_plan(payload, setup)
    assert "career_alignment" in plan["priority_topics"], (
        f"executive plan should include career_alignment in priority_topics: {plan['priority_topics']}"
    )


def test_fallback_turn_meta_line_manager_prefers_specificity_depth_focus() -> None:
    """line_manager では depth_focus が specificity / logic に寄る。"""
    turn_state = _turn_state_with_covered([], ["motivation_fit"])
    interview_plan = _minimal_interview_plan("motivation_fit")
    setup = {"strictness_mode": "standard", "interviewer_type": "line_manager"}

    meta = _fallback_turn_meta(turn_state, interview_plan, setup=setup)
    assert meta["depth_focus"] in {"specificity", "logic"}, (
        f"line_manager should prefer specificity/logic depth_focus, got {meta['depth_focus']!r}"
    )


def test_fallback_turn_meta_mixed_panel_prefers_consistency() -> None:
    """mixed_panel では depth_focus が consistency になる。"""
    turn_state = _turn_state_with_covered([], ["motivation_fit"])
    interview_plan = _minimal_interview_plan("motivation_fit")
    setup = {"strictness_mode": "standard", "interviewer_type": "mixed_panel"}

    meta = _fallback_turn_meta(turn_state, interview_plan, setup=setup)
    assert meta["depth_focus"] == "consistency", (
        f"mixed_panel should prefer consistency depth_focus, got {meta['depth_focus']!r}"
    )


# ---------------------------------------------------------------------------
# カテゴリ 5: グラウンディングルール存在 parametrize (4 builder)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "builder_name",
    ["_build_plan_prompt", "_build_opening_prompt", "_build_turn_prompt", "_build_feedback_prompt"],
)
def test_grounding_rules_present_in_builders(builder_name: str) -> None:
    """各 builder の出力に INTERVIEW_GROUNDING_RULES の見出し '## 安全・グラウンディング' が含まれる。"""
    grounding_heading = "## 安全・グラウンディング"
    assert grounding_heading in INTERVIEW_GROUNDING_RULES, (
        "INTERVIEW_GROUNDING_RULES に見出しが含まれていない (定数の変更を確認してください)"
    )

    payload_start = _make_start_payload()
    interview_plan = _minimal_interview_plan()
    turn_state = {
        "currentStage": "opening",
        "totalQuestionCount": 1,
        "stageQuestionCounts": {
            "industry_reason": 0,
            "role_reason": 0,
            "opening": 1,
            "experience": 0,
            "company_understanding": 0,
            "motivation_fit": 0,
        },
        "completedStages": [],
        "lastQuestionFocus": "志望動機の核",
        "nextAction": "ask",
        "phase": "turn",
        "formatPhase": "standard_main",
        "coveredTopics": [],
        "remainingTopics": ["motivation_fit"],
        "coverageState": [],
        "recentQuestionSummariesV2": [],
        "interviewPlan": interview_plan,
    }
    turn_meta = {
        "topic": "motivation_fit",
        "turn_action": "ask",
        "focus_reason": "初回導入",
        "depth_focus": "company_fit",
        "followup_style": "reason_check",
        "should_move_next": False,
    }

    if builder_name == "_build_plan_prompt":
        prompt = _build_plan_prompt(payload_start)
    elif builder_name == "_build_opening_prompt":
        prompt = _build_opening_prompt(payload_start, interview_plan)
    elif builder_name == "_build_turn_prompt":
        payload_turn = _make_turn_payload()
        prompt = _build_turn_prompt(payload_turn, interview_plan, turn_state, turn_meta)
    elif builder_name == "_build_feedback_prompt":
        payload_feedback = _make_feedback_payload()
        prompt = _build_feedback_prompt(payload_feedback)
    else:
        raise ValueError(f"Unknown builder: {builder_name}")

    assert grounding_heading in prompt, (
        f"{builder_name} の出力に '{grounding_heading}' が含まれていません"
    )


# ---------------------------------------------------------------------------
# カテゴリ 6: behavioral_block 戻り値包含 (5 builder)
# ---------------------------------------------------------------------------


def test_behavioral_block_included_in_plan_prompt() -> None:
    """Phase 2 Stage 1-3: plan は質問生成しないので grounding_legal / strictness /
    interviewer / repetition を除外。include={grounding_core, format, stage}。"""
    payload = _make_start_payload()
    setup = _build_setup(payload)
    expected_block = build_behavioral_block(
        setup, include={"grounding_core", "format", "stage"}
    )
    prompt = _build_plan_prompt(payload)
    assert expected_block in prompt, (
        "_build_plan_prompt の出力に build_behavioral_block の戻り値が含まれていません"
    )


def test_behavioral_block_included_in_opening_prompt() -> None:
    """Phase 2 Stage 1-3: opening は新規質問生成のため grounding_legal 必須、
    1 問目なので repetition は不要。"""
    payload = _make_start_payload()
    setup = _build_setup(payload)
    interview_plan = _minimal_interview_plan()
    expected_block = build_behavioral_block(
        setup,
        include={
            "grounding_core",
            "grounding_legal",
            "strictness",
            "interviewer",
            "stage",
            "format",
            "question_design",
        },
    )
    prompt = _build_opening_prompt(payload, interview_plan)
    assert expected_block in prompt, (
        "_build_opening_prompt の出力に build_behavioral_block の戻り値が含まれていません"
    )


def test_behavioral_block_included_in_turn_prompt() -> None:
    """Phase 2 Stage 1-3: turn は hot path。grounding_core + grounding_legal +
    深掘り系を全て含める。"""
    payload = _make_turn_payload()
    setup = _build_setup(payload)
    interview_plan = _minimal_interview_plan()
    turn_state = payload.turn_state or {}
    turn_meta = {
        "topic": "motivation_fit",
        "turn_action": "deepen",
        "focus_reason": "深掘りするため",
        "depth_focus": "logic",
        "followup_style": "reason_check",
        "should_move_next": False,
    }
    expected_block = build_behavioral_block(
        setup,
        include={
            "grounding_core",
            "grounding_legal",
            "strictness",
            "interviewer",
            "stage",
            "deepening",
            "format",
            "question_design",
            "repetition",
        },
    )
    prompt = _build_turn_prompt(payload, interview_plan, turn_state, turn_meta)
    assert expected_block in prompt, (
        "_build_turn_prompt の出力に build_behavioral_block の戻り値が含まれていません"
    )


def test_behavioral_block_included_in_feedback_prompt() -> None:
    """Phase 2 Stage 1-3: feedback は既存発言の採点のみなので grounding_legal 不要。"""
    payload = _make_feedback_payload()
    setup = _build_setup(payload)
    expected_block = build_behavioral_block(setup, include={"grounding_core", "rubric"})
    prompt = _build_feedback_prompt(payload)
    assert expected_block in prompt, (
        "_build_feedback_prompt の出力に build_behavioral_block の戻り値が含まれていません"
    )


# ---------------------------------------------------------------------------
# カテゴリ 7: question_stage outward contract — allowlist で丸められないこと (3 件)
# ---------------------------------------------------------------------------


def _stream_event(payload: dict) -> SimpleNamespace:
    return SimpleNamespace(
        type="complete",
        result=SimpleNamespace(success=True, data=payload, error=None),
    )


@pytest.mark.asyncio
async def test_turn_allows_role_reason_question_stage(monkeypatch: pytest.MonkeyPatch) -> None:
    """LLM が question_stage='role_reason' を返したとき、allowlist で弾かれずに complete.data に届く。"""
    from app.routers.interview import _generate_turn_progress

    async def fake_stream(*args, **kwargs):
        yield _stream_event(
            {
                "question": "システム設計の判断プロセスを教えてください。",
                "question_stage": "role_reason",
                "focus": "設計判断",
                "turn_meta": {
                    "topic": "system_design",
                    "turn_action": "deepen",
                    "focus_reason": "役割理解の確認",
                    "depth_focus": "logic",
                    "followup_style": "reason_check",
                    "intent_key": "system_design:reason_check",
                    "should_move_next": False,
                },
                "plan_progress": {
                    "covered_topics": ["motivation_fit"],
                    "remaining_topics": ["system_design"],
                },
            }
        )

    monkeypatch.setattr("app.routers._interview.generators.call_llm_streaming_fields", fake_stream)

    request = _make_turn_payload(
        role_track="infra_platform",
        interview_format="technical",
        selected_role="SRE",
    )

    events = []
    async for payload in _generate_turn_progress(request):
        events.append(json.loads(payload.removeprefix("data: ").strip()))

    complete_event = next(e for e in events if e["type"] == "complete")
    assert complete_event["data"]["question_stage"] == "role_reason", (
        f"role_reason should pass the allowlist, got: {complete_event['data']['question_stage']!r}"
    )


@pytest.mark.asyncio
async def test_continue_allows_role_reason_question_stage(monkeypatch: pytest.MonkeyPatch) -> None:
    """continue generator で LLM が role_reason を返したとき、allowlist で弾かれない。"""
    from app.routers.interview import _generate_continue_progress

    async def fake_stream(*args, **kwargs):
        yield _stream_event(
            {
                "question": "役職理解について、もう少し深掘りしましょう。",
                "question_stage": "role_reason",
                "focus": "役職理解",
                "transition_line": "講評を踏まえて続けましょう。",
                "turn_meta": {
                    "topic": "role_reason",
                    "turn_action": "shift",
                    "focus_reason": "役割理解の確認",
                    "depth_focus": "role_fit",
                    "followup_style": "role_reason_check",
                    "intent_key": "role_reason:role_reason_check",
                    "should_move_next": False,
                },
            }
        )

    monkeypatch.setattr("app.routers._interview.generators.call_llm_streaming_fields", fake_stream)

    request = _make_continue_payload()

    events = []
    async for payload in _generate_continue_progress(request):
        events.append(json.loads(payload.removeprefix("data: ").strip()))

    complete_event = next(e for e in events if e["type"] == "complete")
    assert complete_event["data"]["question_stage"] == "role_reason", (
        f"role_reason should pass allowlist in continue, got: {complete_event['data']['question_stage']!r}"
    )


@pytest.mark.asyncio
async def test_turn_allows_turn_question_stage(monkeypatch: pytest.MonkeyPatch) -> None:
    """turn generator で question_stage='turn' は allowlist を通過する (既存動作の確認)。"""
    from app.routers.interview import _generate_turn_progress

    async def fake_stream(*args, **kwargs):
        yield _stream_event(
            {
                "question": "その判断をした理由を教えてください。",
                "question_stage": "turn",
                "focus": "判断理由",
                "turn_meta": {
                    "topic": "motivation_fit",
                    "turn_action": "deepen",
                    "focus_reason": "継続深掘り",
                    "depth_focus": "logic",
                    "followup_style": "reason_check",
                    "intent_key": "motivation_fit:reason_check",
                    "should_move_next": False,
                },
                "plan_progress": {
                    "covered_topics": [],
                    "remaining_topics": ["motivation_fit"],
                },
            }
        )

    monkeypatch.setattr("app.routers._interview.generators.call_llm_streaming_fields", fake_stream)

    request = _make_turn_payload()

    events = []
    async for payload in _generate_turn_progress(request):
        events.append(json.loads(payload.removeprefix("data: ").strip()))

    complete_event = next(e for e in events if e["type"] == "complete")
    assert complete_event["data"]["question_stage"] == "turn"


# ---------------------------------------------------------------------------
# カテゴリ追加: _build_fallback_turn_payload / _build_fallback_continue_payload
# の shape を確認 (degraded helper shape)
# ---------------------------------------------------------------------------


def test_fallback_turn_payload_shape() -> None:
    """_build_fallback_turn_payload が必要なフィールドを持つことを確認。"""
    payload = _make_turn_payload()
    setup = _build_setup(payload)
    interview_plan = _minimal_interview_plan()
    turn_state = {"coveredTopics": [], "turnCount": 0}

    result = _build_fallback_turn_payload(payload, interview_plan, setup, turn_state)

    assert "question" in result and result["question"]
    assert result["question_stage"] == "turn"
    assert "turn_meta" in result
    assert "plan_progress" in result
    assert "covered_topics" in result["plan_progress"]
    assert "remaining_topics" in result["plan_progress"]
    # intent_key が topic:followup_style 形式
    intent_key = result["turn_meta"].get("intent_key", "")
    assert ":" in intent_key, f"intent_key should be topic:followup_style, got: {intent_key!r}"


def test_fallback_continue_payload_shape() -> None:
    """_build_fallback_continue_payload が必要なフィールドを持つことを確認。"""
    payload = _make_continue_payload()
    setup = _build_setup(payload)
    interview_plan = _minimal_interview_plan()
    turn_state = {}

    result = _build_fallback_continue_payload(payload, interview_plan, setup, turn_state)

    assert "question" in result and result["question"]
    assert "transition_line" in result and result["transition_line"]
    assert "turn_meta" in result
    intent_key = result["turn_meta"].get("intent_key", "")
    assert ":" in intent_key, f"intent_key should be topic:followup_style, got: {intent_key!r}"


# ---------------------------------------------------------------------------
# カテゴリ 8: Phase 2 Stage 4 — FOLLOWUP_STYLE_POLICY / detect_answer_gap
# ---------------------------------------------------------------------------


def test_followup_style_policy_allowed_for_known_keys() -> None:
    """policy に登録された (format, stage, gap) キーは期待通りの allowed set を返す。"""
    from app.prompts.interview_prompts import choose_followup_style

    # 登録済みキーの代表例を数パターン検証
    assert choose_followup_style("standard_behavioral", "mid", "abstract") == (
        "specificity_check",
        "theme_choice_check",
        "counter_hypothesis",
    )
    assert choose_followup_style("case", "mid", "missing_hypothesis") == (
        "counter_hypothesis",
        "theme_choice_check",
    )
    assert choose_followup_style("technical", "early", "lacks_tradeoff") == (
        "technical_difficulty_check",
        "specificity_check",
    )
    assert choose_followup_style("life_history", "final", "low_commitment") == (
        "future_vision_check",
        "value_change_check",
    )


def test_followup_style_policy_fallback_for_unknown_key() -> None:
    """policy に未登録の (format, stage, gap) は generic fallback を返す。"""
    from app.prompts.interview_prompts import (
        GENERIC_STYLES_BY_FORMAT,
        choose_followup_style,
    )

    # standard_behavioral の未登録 gap は generic fallback
    assert choose_followup_style(
        "standard_behavioral", "mid", "unknown_gap"
    ) == GENERIC_STYLES_BY_FORMAT["standard_behavioral"]

    # 未知 format の場合は最終フォールバック (reason_check, specificity_check)
    assert choose_followup_style("unknown_format", "mid", "abstract") == (
        "reason_check",
        "specificity_check",
    )


def test_followup_style_policy_coverage_all_formats() -> None:
    """4 format 全てが FOLLOWUP_STYLE_POLICY の key に含まれている。"""
    from app.prompts.interview_prompts import FOLLOWUP_STYLE_POLICY

    formats_in_policy = {key[0] for key in FOLLOWUP_STYLE_POLICY.keys()}
    assert formats_in_policy == {
        "standard_behavioral",
        "case",
        "technical",
        "life_history",
    }
    # 30+ 組合せあることを確認
    assert len(FOLLOWUP_STYLE_POLICY) >= 30


def test_detect_answer_gap_abstract() -> None:
    """数字・固有名詞なし短文 → abstract。"""
    from app.routers._interview.planning import detect_answer_gap

    setup = {"interview_format": "standard_behavioral", "interview_stage": "mid"}
    # 10 文字以上 + 数字/カタカナなし + 150 字未満
    gap = detect_answer_gap(
        "よく頑張りました。成長できたと考えます。", "なぜ?", setup
    )
    assert gap == "abstract", f"expected 'abstract', got {gap!r}"


def test_detect_answer_gap_empty_is_abstract() -> None:
    """空文字 / 短すぎる回答 → abstract。"""
    from app.routers._interview.planning import detect_answer_gap

    setup = {"interview_format": "standard_behavioral", "interview_stage": "mid"}
    assert detect_answer_gap(None, None, setup) == "abstract"
    assert detect_answer_gap("", None, setup) == "abstract"
    assert detect_answer_gap("短い", None, setup) == "abstract"


def test_detect_answer_gap_low_ownership() -> None:
    """チーム主語のみで一人称なし → low_ownership。"""
    from app.routers._interview.planning import detect_answer_gap

    setup = {"interview_format": "standard_behavioral", "interview_stage": "mid"}
    # 数字ありで abstract ではなく、チーム主語のみで個人行動が見えない
    gap = detect_answer_gap(
        "チームで10名のメンバーと連携し、プロジェクトを進めました。みんなで意見を出し合いました。",
        None,
        setup,
    )
    assert gap == "low_ownership", f"expected 'low_ownership', got {gap!r}"


def test_detect_answer_gap_missing_hypothesis_case() -> None:
    """case format で 仮説/理由/根拠 のシグナルなし → missing_hypothesis。"""
    from app.routers._interview.planning import detect_answer_gap

    setup = {"interview_format": "case", "interview_stage": "mid"}
    # 数字あり (150 未満でも abstract にならない条件を満たす)、仮説/理由/根拠 のシグナルなし
    gap = detect_answer_gap(
        "売上が10%下がっています。私が対応策を3つ提案しました。",
        None,
        setup,
    )
    assert gap == "missing_hypothesis", (
        f"expected 'missing_hypothesis', got {gap!r}"
    )


def test_detect_answer_gap_lacks_tradeoff_technical() -> None:
    """technical format で トレードオフ議論なし → lacks_tradeoff。"""
    from app.routers._interview.planning import detect_answer_gap

    setup = {"interview_format": "technical", "interview_stage": "mid"}
    # 数字/固有名詞あり、一人称あり、トレードオフ/代替案/比較 のシグナルなし
    gap = detect_answer_gap(
        "私はバックエンドを Go で実装しました。API を 3 本作り、DB は PostgreSQL を使いました。",
        None,
        setup,
    )
    assert gap == "lacks_tradeoff", f"expected 'lacks_tradeoff', got {gap!r}"


def test_detect_answer_gap_thin_narrative_life_history() -> None:
    """life_history format で 変化/学び のシグナルなし → thin_narrative。"""
    from app.routers._interview.planning import detect_answer_gap

    setup = {"interview_format": "life_history", "interview_stage": "mid"}
    # 数字あり、一人称あり、転機/学んだ/気づいた のシグナルなし
    gap = detect_answer_gap(
        "私は中学3年生の頃に部活のキャプテンを担当しました。練習を5倍に増やしました。",
        None,
        setup,
    )
    assert gap == "thin_narrative", f"expected 'thin_narrative', got {gap!r}"


def test_detect_answer_gap_low_commitment_final() -> None:
    """final stage で企業言及なし → low_commitment。"""
    from app.routers._interview.planning import detect_answer_gap

    setup = {"interview_format": "standard_behavioral", "interview_stage": "final"}
    # 数字/固有名詞あり、一人称あり、他 format 判定に引っかからない、企業言及なし
    gap = detect_answer_gap(
        "私は将来、エンジニアとして 5 年でシニアレベルに到達したいと考えています。"
        "マネジメントも視野に入れ、価値観や行動の一貫性を大事にしたいです。",
        None,
        setup,
    )
    assert gap == "low_commitment", f"expected 'low_commitment', got {gap!r}"


def test_detect_answer_gap_sufficient() -> None:
    """抽象でなく一人称あり、format 固有 gap も該当しない → sufficient。"""
    from app.routers._interview.planning import detect_answer_gap

    setup = {"interview_format": "standard_behavioral", "interview_stage": "mid"}
    # 数字・カタカナあり、一人称あり → どの gap にも該当せず sufficient
    gap = detect_answer_gap(
        "私はプロジェクトリーダーとして 10 名のチームをまとめ、スケジュール遅延を 30% 短縮しました。"
        "具体的には週次レビューを導入し、ブロッカーを早期に発見できる体制を作りました。",
        None,
        setup,
    )
    assert gap == "sufficient", f"expected 'sufficient', got {gap!r}"


def test_fallback_turn_meta_includes_answer_gap_and_allowed_styles() -> None:
    """setup 付き呼び出しで _fallback_turn_meta が answer_gap / allowed_followup_styles / intent_key を返す。"""
    setup = {
        "interview_format": "technical",
        "interview_stage": "mid",
        "strictness_mode": "standard",
        "interviewer_type": "line_manager",
    }
    turn_state = {
        "lastAnswer": "バックエンドを Go で実装しました。",
        "remainingTopics": ["technical_depth"],
        "coveredTopics": [],
    }
    interview_plan = {
        "opening_topic": "technical_depth",
        "must_cover_topics": ["technical_depth"],
    }

    meta = _fallback_turn_meta(turn_state, interview_plan, setup=setup)

    assert "answer_gap" in meta, f"answer_gap missing from {meta.keys()}"
    assert "allowed_followup_styles" in meta, (
        f"allowed_followup_styles missing from {meta.keys()}"
    )
    assert isinstance(meta["allowed_followup_styles"], list)
    assert len(meta["allowed_followup_styles"]) >= 1
    assert meta["followup_style"] in meta["allowed_followup_styles"], (
        f"followup_style {meta['followup_style']!r} not in allowed "
        f"{meta['allowed_followup_styles']!r}"
    )
    # intent_key が topic:followup_style 規約に従う
    assert meta["intent_key"] == f"{meta['topic']}:{meta['followup_style']}"


def test_fallback_turn_meta_without_setup_omits_stage4_fields() -> None:
    """setup=None の後方互換経路では answer_gap / allowed_followup_styles を返さない。"""
    turn_state = {"remainingTopics": ["motivation_fit"], "coveredTopics": []}
    interview_plan = _minimal_interview_plan("motivation_fit")

    meta = _fallback_turn_meta(turn_state, interview_plan, setup=None)

    assert "answer_gap" not in meta
    assert "allowed_followup_styles" not in meta
    # 既存必須フィールドは揃っている
    assert "topic" in meta and meta["topic"] == "motivation_fit"
    assert "turn_action" in meta
    assert "followup_style" in meta


def test_turn_prompt_renders_allowed_styles_section_when_present() -> None:
    """turn_meta に allowed_followup_styles があれば、turn prompt に深掘りポリシーが含まれる。"""
    payload = _make_turn_payload()
    interview_plan = _minimal_interview_plan("motivation_fit")
    turn_state = payload.turn_state or {}
    turn_meta = {
        "topic": "motivation_fit",
        "turn_action": "deepen",
        "focus_reason": "深掘り",
        "depth_focus": "logic",
        "followup_style": "specificity_check",
        "intent_key": "motivation_fit:specificity_check",
        "should_move_next": False,
        "answer_gap": "abstract",
        "allowed_followup_styles": [
            "specificity_check",
            "theme_choice_check",
            "counter_hypothesis",
        ],
    }

    prompt = _build_turn_prompt(payload, interview_plan, turn_state, turn_meta)
    # Phase 2 Stage 4: 単一行ディレクティブ `followup_policy gap=xxx: [...]`
    assert "followup_policy" in prompt, (
        "turn prompt に followup_policy ディレクティブが含まれていない"
    )
    # gap key (英語) を直接埋め込む仕様
    assert "gap=abstract" in prompt
    # 候補は [...] 形式で列挙される (comma separator, no space)
    assert "[specificity_check,theme_choice_check,counter_hypothesis]" in prompt


def test_turn_prompt_omits_allowed_styles_section_when_absent() -> None:
    """turn_meta に allowed_followup_styles が無ければ、followup_policy ディレクティブは出ない。"""
    payload = _make_turn_payload()
    interview_plan = _minimal_interview_plan("motivation_fit")
    turn_state = payload.turn_state or {}
    turn_meta = {
        "topic": "motivation_fit",
        "turn_action": "deepen",
        "focus_reason": "深掘り",
        "depth_focus": "logic",
        "followup_style": "reason_check",
        "intent_key": "motivation_fit:reason_check",
        "should_move_next": False,
    }

    prompt = _build_turn_prompt(payload, interview_plan, turn_state, turn_meta)
    # ディレクティブ (`followup_policy gap=...`) は turn_meta.allowed_followup_styles が
    # ある時だけ挿入される。
    assert "followup_policy" not in prompt
    assert "gap=" not in prompt


# ---------------------------------------------------------------------------
# カテゴリ 9: Phase 2 Stage 3 — CaseBrief / _select_case_brief
# ---------------------------------------------------------------------------


def _make_case_start_payload(**kwargs) -> InterviewStartRequest:
    """case format の start payload を簡便に生成する。"""
    return _make_start_payload(
        interview_format="case",
        **kwargs,
    )


def test_case_brief_pydantic_schema_validates_preset() -> None:
    """7 業界の preset JSON が CaseBrief pydantic model でバリデーションできる。"""
    industries = [
        "finance",
        "saas",
        "retail",
        "manufacturing",
        "consulting",
        "media",
        "infrastructure",
    ]
    for industry in industries:
        data = _load_case_brief_preset(industry)
        assert data is not None, f"preset {industry}.json が load できない"
        # CaseBrief() バリデーション
        cb = CaseBrief(**data)
        assert cb.industry == industry
        assert cb.business_context
        assert cb.target_metric
        assert cb.candidate_task
        assert cb.why_this_company
        assert len(cb.constraints) >= 1
        assert cb.case_seed_version == "v1.0"


def test_case_brief_selected_from_seed_summary_finance() -> None:
    """seed_summary に '金融' が含まれる場合、finance preset が選ばれる。"""
    payload = _make_case_start_payload(
        company_name="サンプル銀行",
        company_summary="金融機関",
        selected_industry="IT",  # industry 側はミスマッチ
        seed_summary="金融スタートアップの四半期手数料収益分析",
    )
    setup = _build_setup(payload)
    plan = _fallback_plan(payload, setup)
    case_brief = plan.get("case_brief")

    assert case_brief is not None, "case_brief が plan に含まれていない"
    assert case_brief["industry"] == "finance"
    assert "business_context" in case_brief
    assert case_brief["case_seed_version"] == "v1.0"


def test_case_brief_selected_from_selected_industry_consulting() -> None:
    """seed_summary が無くても selected_industry='コンサルティング' で consulting preset が選ばれる。"""
    payload = _make_case_start_payload(
        selected_industry="コンサルティング",
        seed_summary=None,
    )
    setup = _build_setup(payload)
    plan = _fallback_plan(payload, setup)
    case_brief = plan.get("case_brief")

    assert case_brief is not None
    assert case_brief["industry"] == "consulting"


def test_case_brief_is_deterministic() -> None:
    """同じ payload で 3 回呼んでも同じ CaseBrief が選ばれる (再現性)。"""
    payload = _make_case_start_payload(
        selected_industry="金融",
        seed_summary="金融スタートアップの手数料収益",
    )
    setup = _build_setup(payload)
    results = [_fallback_plan(payload, setup).get("case_brief") for _ in range(3)]

    assert all(r is not None for r in results)
    # 全て同じ dict
    assert results[0] == results[1] == results[2]


def test_case_brief_fallback_to_none_if_no_industry_match() -> None:
    """seed / industry がどの preset にもマッチしない場合、case_brief は plan に含まれない。"""
    payload = _make_case_start_payload(
        selected_industry="不動産",  # preset に無い業界
        seed_summary="住宅開発の新規事業",
    )
    setup = _build_setup(payload)
    plan = _fallback_plan(payload, setup)

    # case_brief キー自体が存在しない (または None)
    assert plan.get("case_brief") is None


def test_case_brief_none_for_non_case_format() -> None:
    """interview_format != 'case' の場合、case_brief は plan に含まれない (technical でも)。"""
    payload = _make_start_payload(
        interview_format="technical",
        selected_industry="金融",  # 金融 keyword があっても
        seed_summary="金融スタートアップの手数料",
    )
    setup = _build_setup(payload)
    plan = _fallback_plan(payload, setup)

    assert plan.get("case_brief") is None, "技術面接では case_brief が入らないはず"


def test_select_case_brief_returns_none_for_unknown_industry() -> None:
    """_select_case_brief の低レイヤ API を直接テスト。"""
    setup = {"selected_industry": "未知業界"}
    result = _select_case_brief(setup, None)
    assert result is None


@pytest.mark.parametrize("builder", ["opening", "turn"])
def test_prompt_includes_case_brief_section_when_case_format(builder: str) -> None:
    """case format かつ case_brief がある場合、prompt に 'CASE BRIEF' セクションが含まれる。"""
    start = _make_case_start_payload(
        selected_industry="金融",
        seed_summary="金融スタートアップの分析",
    )
    setup = _build_setup(start)
    plan = _fallback_plan(start, setup)

    if builder == "opening":
        prompt = _build_opening_prompt(start, plan)
    else:
        # turn builder needs InterviewTurnRequest + turn_meta
        turn_payload = _make_turn_payload(
            interview_format="case",
            selected_industry="金融",
            seed_summary="金融スタートアップの分析",
        )
        turn_state = turn_payload.turn_state or {}
        turn_meta = _fallback_turn_meta(turn_state, plan, setup)
        prompt = _build_turn_prompt(turn_payload, plan, turn_state, turn_meta)

    assert "## CASE BRIEF" in prompt, f"{builder} prompt に CASE BRIEF セクションが無い"
    # 題材文脈がプロンプトに入っていることを確認
    assert "- 文脈:" in prompt
    assert "- 問い:" in prompt


def test_prompt_omits_case_brief_section_when_non_case_format() -> None:
    """non-case format では CASE BRIEF セクションを出力しない。"""
    start = _make_start_payload(
        interview_format="standard_behavioral",
        selected_industry="金融",  # industry match しても
    )
    setup = _build_setup(start)
    plan = _fallback_plan(start, setup)
    prompt = _build_opening_prompt(start, plan)

    assert "## CASE BRIEF" not in prompt


def test_prompt_omits_case_brief_section_when_no_preset_match() -> None:
    """case format でも preset にマッチしなければ CASE BRIEF セクションを出力しない。"""
    start = _make_case_start_payload(
        selected_industry="不動産",  # preset 無し
        seed_summary=None,
    )
    setup = _build_setup(start)
    plan = _fallback_plan(start, setup)
    prompt = _build_opening_prompt(start, plan)

    assert "## CASE BRIEF" not in prompt


def test_extract_case_seed_version_returns_value_when_case_brief_present() -> None:
    """_extract_case_seed_version は plan.case_brief.case_seed_version を返す。"""
    start = _make_case_start_payload(selected_industry="金融")
    setup = _build_setup(start)
    plan = _fallback_plan(start, setup)

    assert _extract_case_seed_version(setup, plan) == "v1.0"


def test_extract_case_seed_version_returns_none_for_non_case_format() -> None:
    """case 以外の format では case_seed_version は None。"""
    start = _make_start_payload(interview_format="technical")
    setup = _build_setup(start)
    plan = _fallback_plan(start, setup)

    assert _extract_case_seed_version(setup, plan) is None


def test_extract_case_seed_version_returns_none_when_no_preset_match() -> None:
    """case format でも preset マッチしない場合 None。"""
    start = _make_case_start_payload(
        selected_industry="不動産",
        seed_summary=None,
    )
    setup = _build_setup(start)
    plan = _fallback_plan(start, setup)

    assert _extract_case_seed_version(setup, plan) is None


@pytest.mark.parametrize(
    "keyword,expected_industry",
    [
        ("金融", "finance"),
        ("銀行", "finance"),
        ("fintech", "finance"),
        ("SaaS", "saas"),
        ("小売", "retail"),
        ("EC", "retail"),
        ("製造", "manufacturing"),
        ("メーカー", "manufacturing"),
        ("コンサル", "consulting"),
        ("広告", "media"),
        ("メディア", "media"),
        ("インフラ", "infrastructure"),
        ("通信", "infrastructure"),
    ],
)
def test_case_brief_industry_keyword_mapping(keyword: str, expected_industry: str) -> None:
    """各業界キーワード → preset industry の対応が正しい。"""
    start = _make_case_start_payload(
        selected_industry=None,
        seed_summary=f"{keyword}分野の事業",
    )
    setup = _build_setup(start)
    case_brief = _select_case_brief(setup, start.seed_summary)

    assert case_brief is not None
    assert case_brief["industry"] == expected_industry


# ===========================================================================
# カテゴリ 9 (Phase 2 Stage 5): Evidence-Linked Rubric
# ===========================================================================

_SEVEN_AXES = (
    "company_fit",
    "role_fit",
    "specificity",
    "logic",
    "persuasiveness",
    "consistency",
    "credibility",
)


def test_feedback_schema_has_evidence_rationale_confidence_fields() -> None:
    """INTERVIEW_FEEDBACK_SCHEMA に Stage 5 の 3 field が定義されている。"""
    from app.routers.interview import INTERVIEW_FEEDBACK_SCHEMA

    # Schema は {"name": ..., "schema": {"properties": ...}} の構造
    schema_body = INTERVIEW_FEEDBACK_SCHEMA.get("schema") or INTERVIEW_FEEDBACK_SCHEMA
    properties = schema_body.get("properties", {})
    assert "score_evidence_by_axis" in properties
    assert "score_rationale_by_axis" in properties
    assert "confidence_by_axis" in properties

    # OpenAI structured outputs strict: properties の全キーが required に含まれる
    required = schema_body.get("required", [])
    assert "score_evidence_by_axis" in required
    assert "score_rationale_by_axis" in required
    assert "confidence_by_axis" in required


def test_normalize_feedback_fills_evidence_fields_for_all_axes() -> None:
    """_normalize_feedback が 7 軸全てで 3 field を埋める (部分入力でも補完)。"""
    from app.routers.interview import _normalize_feedback

    data = {
        "overall_comment": "total",
        "scores": {axis: 3 for axis in _SEVEN_AXES},
        "score_evidence_by_axis": {"company_fit": ["IPに関心"]},
        "score_rationale_by_axis": {"role_fit": "職種理解が浅い"},
        "confidence_by_axis": {"specificity": "high"},
    }
    result = _normalize_feedback(data)

    # 3 field 全てが 7 軸を埋めている
    assert set(result["score_evidence_by_axis"].keys()) == set(_SEVEN_AXES)
    assert set(result["score_rationale_by_axis"].keys()) == set(_SEVEN_AXES)
    assert set(result["confidence_by_axis"].keys()) == set(_SEVEN_AXES)

    # 明示入力は保持
    assert result["score_evidence_by_axis"]["company_fit"] == ["IPに関心"]
    assert result["score_rationale_by_axis"]["role_fit"] == "職種理解が浅い"
    assert result["confidence_by_axis"]["specificity"] == "high"

    # 未入力は defaults (evidence 空 / rationale 空 / confidence=low)
    assert result["score_evidence_by_axis"]["logic"] == []
    assert result["confidence_by_axis"]["logic"] == "low"


def test_normalize_feedback_coerces_invalid_confidence_to_low() -> None:
    """confidence で 'high'/'medium'/'low' 以外の値は 'low' に寄せる。"""
    from app.routers.interview import _normalize_feedback

    data = {
        "scores": {axis: 0 for axis in _SEVEN_AXES},
        "confidence_by_axis": {
            "company_fit": "super_high",  # 無効値
            "role_fit": "",  # 空文字
            "specificity": None,  # None
            "logic": "medium",  # 有効値
        },
    }
    result = _normalize_feedback(data)
    assert result["confidence_by_axis"]["company_fit"] == "low"
    assert result["confidence_by_axis"]["role_fit"] == "low"
    assert result["confidence_by_axis"]["specificity"] == "low"
    assert result["confidence_by_axis"]["logic"] == "medium"


def test_enrich_feedback_sets_low_confidence_for_empty_evidence() -> None:
    """evidence が空の軸は confidence=low に補完、rationale に score 依存 default を入れる。"""
    from app.routers.interview import _enrich_feedback_defaults, _normalize_feedback, _build_setup

    payload = InterviewStartRequest(
        company_name="サンプル株式会社",
        company_summary="テスト企業",
        motivation_summary="志望動機",
        gakuchika_summary="ガクチカ",
        academic_summary="学業",
        es_summary="ES",
        selected_industry="IT",
        selected_role="エンジニア",
        role_track="it_product",
        interview_format="standard_behavioral",
        selection_type="fulltime",
        interview_stage="mid",
        interviewer_type="hr",
        strictness_mode="standard",
    )
    setup = _build_setup(payload)

    # scores は埋まっているが evidence は空
    feedback = _normalize_feedback(
        {
            "overall_comment": "",
            "scores": {
                "company_fit": 4,
                "role_fit": 2,
                "specificity": 0,
                "logic": 3,
                "persuasiveness": 3,
                "consistency": 3,
                "credibility": 3,
            },
            "strengths": [],
            "improvements": [],
            "consistency_risks": [],
            "weakest_question_type": "motivation",
            "weakest_question_snapshot": "",
            "weakest_answer_snapshot": "",
            "improved_answer": "",
            "next_preparation": [],
        }
    )
    enriched = _enrich_feedback_defaults(feedback, setup=setup)

    # evidence 空の軸は confidence=low
    for axis in _SEVEN_AXES:
        assert enriched["confidence_by_axis"][axis] == "low"

    # rationale は score に応じた default
    assert "評価不能" in enriched["score_rationale_by_axis"]["specificity"]  # score=0
    assert "根拠が薄く" in enriched["score_rationale_by_axis"]["role_fit"]  # score<=2
    assert "深掘り余地" in enriched["score_rationale_by_axis"]["company_fit"]  # score>=3


def test_feedback_prompt_includes_bars_anchor_and_evidence_rules() -> None:
    """_build_feedback_prompt が BARS anchor + evidence 指示を含む。"""
    from app.routers.interview import _build_feedback_prompt, InterviewFeedbackRequest

    payload = InterviewFeedbackRequest(
        company_name="任天堂",
        company_summary="ゲームとIPで世界展開する企業。",
        motivation_summary="IPの価値を生かしたい。",
        gakuchika_summary="塾バイトで改善",
        academic_summary="ゼミで分析",
        es_summary="学生団体で企画改善",
        selected_industry="メーカー",
        selected_role="企画",
        role_track="biz_general",
        interview_format="standard_behavioral",
        selection_type="fulltime",
        interview_stage="final",
        interviewer_type="executive",
        strictness_mode="strict",
        conversation_history=[
            {"role": "assistant", "content": "志望理由は?"},
            {"role": "user", "content": "IPに関心があります。"},
        ],
        turn_state={"recentQuestionSummariesV2": []},
        turn_events=[],
    )
    prompt = _build_feedback_prompt(payload)

    assert "BARS" in prompt
    assert "score_evidence_by_axis" in prompt
    assert "confidence_by_axis" in prompt
    assert "evidence" in prompt.lower() or "引用" in prompt


# ---------------------------------------------------------------------------
# カテゴリ 11: Phase 2 Stage 6 — Per-turn short coaching
# ---------------------------------------------------------------------------


def test_turn_schema_has_short_coaching_field() -> None:
    """INTERVIEW_TURN_SCHEMA に short_coaching が定義され、3 サブフィールドが必須。"""
    from app.routers.interview import INTERVIEW_TURN_SCHEMA

    body = INTERVIEW_TURN_SCHEMA.get("schema", INTERVIEW_TURN_SCHEMA)
    props = body.get("properties", {})
    assert "short_coaching" in props, f"short_coaching missing from properties: {list(props.keys())}"

    sc = props["short_coaching"]
    # nullable object (CASE_BRIEF_SCHEMA と同じ pattern)
    sc_type = sc.get("type")
    assert sc_type == ["object", "null"] or sc_type == "object", (
        f"short_coaching.type must be object or [object, null], got {sc_type!r}"
    )

    # 3 サブフィールドが揃っている
    sub_props = sc.get("properties", {})
    assert set(sub_props.keys()) == {"good", "missing", "next_edit"}, (
        f"short_coaching sub-properties mismatch: {list(sub_props.keys())}"
    )

    # サブフィールドは 3 つとも required
    assert set(sc.get("required", [])) == {"good", "missing", "next_edit"}, (
        f"short_coaching.required must list all 3 sub-fields: {sc.get('required')!r}"
    )

    # OpenAI strict: ルート required に short_coaching を含める（値は null 可、fallback で補完）
    turn_required = set(body.get("required", []))
    assert "short_coaching" in turn_required, "short_coaching must be in TURN_SCHEMA.required"


def test_fallback_short_coaching_for_abstract_gap() -> None:
    """answer_gap=abstract で good / missing / next_edit の 3 field が埋まる。"""
    from app.routers.interview import _fallback_short_coaching

    turn_state = {"lastAnswer": "顧客課題に近い立場で働きたいです。"}
    turn_meta = {"answer_gap": "abstract"}

    result = _fallback_short_coaching(turn_state, turn_meta, setup=None)

    assert set(result.keys()) == {"good", "missing", "next_edit"}
    for k in ("good", "missing", "next_edit"):
        assert isinstance(result[k], str)
        assert result[k], f"{k} is empty for abstract gap"
    # abstract の missing は具体性不足を示す内容
    assert "具体" in result["missing"] or "固有" in result["missing"] or "数字" in result["missing"]


def test_fallback_short_coaching_for_empty_last_answer() -> None:
    """lastAnswer が空のとき 3 field は空文字 (初回ターン扱い)。"""
    from app.routers.interview import _fallback_short_coaching

    # lastAnswer 欠落
    result = _fallback_short_coaching({}, {"answer_gap": "abstract"})
    assert result == {"good": "", "missing": "", "next_edit": ""}

    # lastAnswer が空文字
    result = _fallback_short_coaching({"lastAnswer": ""}, {"answer_gap": "sufficient"})
    assert result == {"good": "", "missing": "", "next_edit": ""}

    # lastAnswer が空白のみ
    result = _fallback_short_coaching({"lastAnswer": "   "}, {"answer_gap": "abstract"})
    assert result == {"good": "", "missing": "", "next_edit": ""}


def test_fallback_short_coaching_covers_all_answer_gaps() -> None:
    """detect_answer_gap の全 9 種で 3 field が埋まる。"""
    from app.routers.interview import _fallback_short_coaching

    all_gaps = [
        "abstract",
        "consistent_gap",
        "missing_hypothesis",
        "surface_analysis",
        "lacks_tradeoff",
        "low_ownership",
        "low_commitment",
        "thin_narrative",
        "sufficient",
    ]
    turn_state = {"lastAnswer": "テスト用の回答です。具体的な数字 10 件と Python の経験があります。"}

    for gap in all_gaps:
        result = _fallback_short_coaching(turn_state, {"answer_gap": gap})
        assert set(result.keys()) == {"good", "missing", "next_edit"}, (
            f"gap={gap!r}: keys mismatch {list(result.keys())}"
        )
        for k in ("good", "missing", "next_edit"):
            assert isinstance(result[k], str) and result[k], (
                f"gap={gap!r}: {k} is empty"
            )


def test_fallback_short_coaching_unknown_gap_falls_back_to_sufficient() -> None:
    """answer_gap が未知値 / None / 欠落のとき sufficient の coaching を返す。"""
    from app.routers.interview import _fallback_short_coaching

    turn_state = {"lastAnswer": "10 名のチームをまとめました。"}
    expected = _fallback_short_coaching(turn_state, {"answer_gap": "sufficient"})

    # 未知の gap key
    assert _fallback_short_coaching(turn_state, {"answer_gap": "unknown_gap_xyz"}) == expected
    # answer_gap 欠落
    assert _fallback_short_coaching(turn_state, {}) == expected
    # answer_gap が None
    assert _fallback_short_coaching(turn_state, {"answer_gap": None}) == expected


def test_turn_prompt_includes_short_coaching_reference() -> None:
    """_TURN_FALLBACK テンプレが short_coaching の存在を LLM に伝達する。

    prompt token budget (2500) のため rule 本文は schema description へ委譲し、
    テンプレ側では JSON schema を再掲しない設計。
    そのかわり INTERVIEW_TURN_SCHEMA.properties.short_coaching の description が
    OpenAI strict mode で LLM に届く (tiktoken 換算外)。
    ここでは schema に short_coaching のヒントが残っていることを確認する。
    """
    from app.routers.interview import INTERVIEW_TURN_SCHEMA

    body = INTERVIEW_TURN_SCHEMA.get("schema", INTERVIEW_TURN_SCHEMA)
    sc = body["properties"]["short_coaching"]

    # トップレベル description (役割) + 3 サブフィールドの description
    assert sc.get("description"), "short_coaching top-level description is empty"
    for key in ("good", "missing", "next_edit"):
        sub_desc = sc["properties"][key].get("description", "")
        assert "30-60" in sub_desc, (
            f"short_coaching.{key}.description should hint 30-60 字 guidance, got {sub_desc!r}"
        )


# ---------------------------------------------------------------------------
# カテゴリ C: Phase C — fallback turn payload / opening helpers
# ---------------------------------------------------------------------------


def test_fallback_turn_payload_strict_vs_supportive() -> None:
    """fallback turn payload の質問文が strictness_mode によって異なる。

    strict では反論・代替案を問う質問文、supportive では肯定的なうまくいった点を
    問う質問文になる。standard はどちらでもない中立的な質問文になる。
    """
    from app.routers._interview.planning import _fallback_question_by_strictness

    strict_q = _fallback_question_by_strictness({"strictness_mode": "strict"})
    supportive_q = _fallback_question_by_strictness({"strictness_mode": "supportive"})
    standard_q = _fallback_question_by_strictness({"strictness_mode": "standard"})

    # strict は全体の質問文から見て対立可能性 / 別解を示唆するキーワードを含む
    assert "別の可能性" in strict_q or "判断" in strict_q, (
        f"strict question should probe alternative judgment, got: {strict_q!r}"
    )
    # supportive はうまくいった点・肯定的な掘り下げを示すキーワードを含む
    assert "うまくいった" in supportive_q or "詳しく" in supportive_q, (
        f"supportive question should be affirming, got: {supportive_q!r}"
    )
    # 3 種のテキストは全て異なる (strictness ごとに分岐している)
    assert strict_q != supportive_q, "strict and supportive questions must differ"
    assert strict_q != standard_q, "strict and standard questions must differ"
    assert supportive_q != standard_q, "supportive and standard questions must differ"

    # _build_fallback_turn_payload を通じても strictness が伝搬することを確認
    interview_plan = _minimal_interview_plan("motivation_fit")
    turn_state: dict = {}

    payload_strict = _make_turn_payload(strictness_mode="strict")
    setup_strict = _build_setup(payload_strict)
    result_strict = _build_fallback_turn_payload(payload_strict, interview_plan, setup_strict, turn_state)

    payload_supportive = _make_turn_payload(strictness_mode="supportive")
    setup_supportive = _build_setup(payload_supportive)
    result_supportive = _build_fallback_turn_payload(payload_supportive, interview_plan, setup_supportive, turn_state)

    assert result_strict["question"] != result_supportive["question"], (
        "fallback turn payload question must differ between strict and supportive modes"
    )


def test_fallback_opening_uses_case_brief_when_available() -> None:
    """case_brief が interview_plan に存在する場合、fallback opening の質問文がそれを参照する。

    _build_case_scenario_from_plan は case_brief.business_context と
    case_brief.candidate_task を結合したシナリオ文を返す。
    case_brief がない場合は seed_summary / selected_industry による固定文にフォールバックする。
    """
    from app.routers._interview.planning import _build_case_scenario_from_plan

    # case_brief あり: business_context と candidate_task が結合される
    plan_with_brief = {
        "interview_type": "new_grad_behavioral",
        "priority_topics": ["structured_thinking"],
        "opening_topic": "structured_thinking",
        "must_cover_topics": ["structured_thinking"],
        "risk_topics": [],
        "suggested_timeflow": ["導入", "ケース"],
        "case_brief": {
            "industry": "finance",
            "business_context": "ある地方銀行の個人向け新規口座開設数が前年同期比で12%下がっている",
            "target_metric": "新規口座開設数",
            "candidate_task": "売上回復に向けた施策を提案する",
            "why_this_company": "地域密着型の戦略を強化したい",
            "constraints": ["予算 5,000 万円以内", "3 ヶ月以内に実施可能"],
            "case_seed_version": "v1.0",
        },
    }
    payload = _make_start_payload(interview_format="case", selected_industry="金融")
    setup = _build_setup(payload)

    scenario = _build_case_scenario_from_plan(plan_with_brief, payload, setup)

    # business_context と candidate_task が結合されたシナリオ文になる
    assert "地方銀行" in scenario, (
        f"scenario should reference business_context, got: {scenario!r}"
    )
    assert "施策を提案する" in scenario, (
        f"scenario should reference candidate_task, got: {scenario!r}"
    )

    # case_brief なし: seed_summary も business_context キーワードも持たない payload で
    # 固定シナリオ (小売チェーン) にフォールバックすることを確認する。
    # selected_industry="コンサルティング" は fallback branch のどの条件にも一致しないため
    # 汎用の小売シナリオが返る。
    plan_without_brief = {
        "interview_type": "new_grad_behavioral",
        "priority_topics": ["structured_thinking"],
        "opening_topic": "structured_thinking",
        "must_cover_topics": ["structured_thinking"],
        "risk_topics": [],
        "suggested_timeflow": ["導入", "ケース"],
    }
    payload_no_match = _make_start_payload(
        interview_format="case",
        selected_industry="コンサルティング",
        seed_summary=None,
    )
    setup_no_match = _build_setup(payload_no_match)
    scenario_fallback = _build_case_scenario_from_plan(plan_without_brief, payload_no_match, setup_no_match)

    # フォールバックは case_brief の business_context テキストを含まない
    assert "地方銀行" not in scenario_fallback, (
        f"fallback scenario should not reference case_brief content, got: {scenario_fallback!r}"
    )
    # フォールバックシナリオは空でない
    assert scenario_fallback.strip(), "fallback scenario must not be empty"
    # 汎用の小売シナリオが選ばれる
    assert "小売" in scenario_fallback, (
        f"fallback scenario should use the generic retail template, got: {scenario_fallback!r}"
    )
