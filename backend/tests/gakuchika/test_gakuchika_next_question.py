import pytest

from app.routers.gakuchika import (
    BUILD_FOCUS_FALLBACKS,
    ConversationStateInput,
    DEEPDIVE_FOCUS_FALLBACKS,
    NextQuestionRequest,
    _build_draft_diagnostics,
    _build_deepdive_prompt,
    _build_es_prompt,
    _classify_input_richness,
    _evaluate_deepdive_completion,
    _generate_initial_question,
    _is_deepdive_request,
    _normalize_deepdive_payload,
    _normalize_es_build_payload,
)
from app.utils.llm import LLMResult, call_llm_streaming_fields


def test_is_deepdive_request_true_for_draft_ready_without_draft_text() -> None:
    """Resume「もう少し整える」で draft_text が無くても深掘り分岐に入ること。"""
    req = NextQuestionRequest(
        gakuchika_title="テーマ",
        gakuchika_content="内容",
        conversation_history=[
            {"role": "assistant", "content": "質問"},
            {"role": "user", "content": "回答"},
        ],
        question_count=3,
        conversation_state=ConversationStateInput(
            stage="draft_ready",
            ready_for_draft=True,
            draft_text=None,
        ),
    )
    assert _is_deepdive_request(req) is True


def test_is_deepdive_request_false_for_es_building() -> None:
    req = NextQuestionRequest(
        gakuchika_title="テーマ",
        gakuchika_content="内容",
        conversation_history=[
            {"role": "assistant", "content": "質問"},
            {"role": "user", "content": "回答"},
        ],
        question_count=1,
        conversation_state=ConversationStateInput(stage="es_building"),
    )
    assert _is_deepdive_request(req) is False


def test_build_es_prompt_includes_readiness_guardrails() -> None:
    # Phase B.2: _build_es_prompt returns (system_prompt, user_message).
    system_prompt, user_message = _build_es_prompt(
        NextQuestionRequest(
            gakuchika_title="塾講師のアルバイト",
            gakuchika_content="高校生向け個別指導塾で講師を担当していました。",
            conversation_history=[
                {"role": "assistant", "content": "どのような経験でしたか。"},
                {"role": "user", "content": "塾講師として担当生徒の成績向上に取り組みました。"},
            ],
            question_count=2,
        )
    )
    prompt = system_prompt + "\n\n" + user_message

    assert "ready_for_draft=true" in prompt
    assert "4要素がそろい" in prompt
    assert "task と action が ES として読んで弱くない最低限の具体性" in prompt
    assert "抽象語だけで終わっていない" in prompt
    assert "自然な丁寧語" in prompt
    assert '"answer_hint"' in prompt
    assert '"progress_label"' in prompt
    # Persona + approval pattern should land in the system half (cacheable).
    assert "キャリアアドバイザー" in system_prompt
    assert "承認+質問パターン" in system_prompt
    # Blocked/asked focus placeholders should be in the user half (dynamic).
    assert "既に聞いた要素" in user_message
    assert "ブロックされた要素" in user_message


def test_build_deepdive_prompt_includes_future_and_backstory() -> None:
    system_prompt, user_message = _build_deepdive_prompt(
        NextQuestionRequest(
            gakuchika_title="塾講師のアルバイト",
            conversation_history=[
                {"role": "assistant", "content": "その課題に対して何をしましたか。"},
                {"role": "user", "content": "面談の頻度を増やし、宿題管理表を導入しました。"},
            ],
            question_count=6,
            conversation_state=ConversationStateInput(
                stage="draft_ready",
                draft_text="私は個別指導塾で担当生徒の学習継続率改善に取り組みました。",
                ready_for_draft=True,
            ),
        )
    )
    prompt = system_prompt + "\n\n" + user_message

    assert "future" in prompt
    assert "backstory" in prompt
    assert "将来展望" in prompt
    assert "原体験" in prompt
    assert "STAR の点数評価は不要です" in prompt


def test_build_deepdive_prompt_tightens_continuation_focus_by_round() -> None:
    system_prompt, user_message = _build_deepdive_prompt(
        NextQuestionRequest(
            gakuchika_title="塾講師のアルバイト",
            conversation_history=[
                {"role": "assistant", "content": "その方法を選んだ理由は何ですか。"},
                {"role": "user", "content": "面談頻度を増やし、宿題管理表を導入しました。"},
            ],
            question_count=9,
            conversation_state=ConversationStateInput(
                stage="interview_ready",
                draft_text="私は個別指導塾で担当生徒の学習継続率改善に取り組みました。",
                ready_for_draft=True,
                extended_deep_dive_round=3,
            ),
        )
    )
    # Continuation note is appended to the user half (it references dynamic round info).
    assert "継続深掘り（3 回目）" in user_message
    assert "仮説の裏取り" in user_message
    assert "数値の分解" in user_message
    assert "逆質問に備えた答え" in user_message


def test_fallback_questions_avoid_prohibited_phrases() -> None:
    banned = (
        "教えてください",
        "聞かせてください",
        "説明してください",
        "詳しく",
        "もう少し",
        "他にありますか",
        "何かありますか",
        "いかがでしたか",
        "どうでしたか",
    )

    for templates in (BUILD_FOCUS_FALLBACKS, DEEPDIVE_FOCUS_FALLBACKS):
        for text_map in templates.values():
            for text in text_map.values():
                for fragment in banned:
                    assert fragment not in text, (fragment, text)


def test_normalize_es_build_payload_aligns_focus_to_first_missing_star() -> None:
    """LLM が後段だけ focus にしても、missing の先頭（STAR 順）に寄せる。"""
    _question, state, _source = _normalize_es_build_payload(
        {
            "question": "どのような行動をしましたか。",
            "focus_key": "action",
            "missing_elements": ["task", "action"],
            "ready_for_draft": False,
        },
        fallback_state=None,
    )
    assert state["focus_key"] == "task"


def test_normalize_es_build_payload_releases_blocked_focus_when_core_gap_remains() -> None:
    """core 要素が未充足なら blocked_focuses より STAR 補完を優先する。"""
    _question, state, _source = _normalize_es_build_payload(
        {
            "question": "次の焦点を教えてください。",
            "focus_key": "action",
            "missing_elements": ["task", "action"],
            "ready_for_draft": False,
        },
        fallback_state=ConversationStateInput(
            stage="es_building",
            blocked_focuses=["task"],
        ),
    )
    assert state["focus_key"] == "task"
    assert "task" not in state["blocked_focuses"]


def test_normalize_es_build_payload_releases_stale_blocked_focus_for_missing_core_element() -> None:
    """古い blocked_focuses で core 要素が永久にスキップされないこと。"""
    _question, state, _source = _normalize_es_build_payload(
        {
            "question": "どの課題に向き合ったのですか。",
            "focus_key": "action",
            "missing_elements": ["task", "action"],
            "ready_for_draft": False,
        },
        fallback_state=ConversationStateInput(
            stage="es_building",
            missing_elements=["task", "action"],
            blocked_focuses=["task"],
        ),
    )

    assert state["focus_key"] == "task"
    assert "task" not in state["blocked_focuses"]


def test_build_es_prompt_ignores_stale_blocked_focuses_for_missing_core_element() -> None:
    system_prompt, user_message = _build_es_prompt(
        NextQuestionRequest(
            gakuchika_title="塾講師のアルバイト",
            gakuchika_content="高校生向け個別指導塾で講師を担当していました。",
            conversation_history=[
                {"role": "assistant", "content": "どのような経験でしたか。"},
                {"role": "user", "content": "塾講師として担当生徒の成績向上に取り組みました。"},
            ],
            question_count=2,
            conversation_state=ConversationStateInput(
                stage="es_building",
                missing_elements=["task", "action"],
                blocked_focuses=["task"],
            ),
        )
    )

    assert "ブロックされた要素" in user_message
    assert "ブロックされた要素はありません" in user_message
    assert "承認+質問パターン" in system_prompt


def test_normalize_es_build_payload_keeps_building_until_quality_threshold() -> None:
    question, state, source = _normalize_es_build_payload(
        {
            "question": "その課題を、なぜ優先すべきだと考えたのですか。",
            "focus_key": "task",
            "answer_hint": "課題だと判断した根拠を書くと強くなります。",
            "progress_label": "課題を整理中",
            "missing_elements": ["task", "result", "learning"],
            "ready_for_draft": False,
            "draft_readiness_reason": "task と action の具体性がまだ弱いです。",
        },
        fallback_state=None,
    )

    assert question == "その課題を、なぜ優先すべきだと考えたのですか。"
    assert source == "full_json"
    assert state["stage"] == "es_building"
    assert state["focus_key"] == "task"
    assert state["ready_for_draft"] is False
    assert state["missing_elements"] == ["task", "result"]


def test_normalize_es_build_payload_marks_draft_ready() -> None:
    question, state, source = _normalize_es_build_payload(
        {
            "focus_key": "action",
            "ready_for_draft": True,
            "missing_elements": [],
            "draft_readiness_reason": "task と action に ES 本文へ落とせる具体性があります。",
        },
        fallback_state=ConversationStateInput(draft_text="既存の下書き"),
    )

    assert question == ""
    assert source == "draft_ready"
    assert state["stage"] == "draft_ready"
    assert state["progress_label"] == "ESを作成できます"
    assert state["ready_for_draft"] is True
    assert state["draft_text"] == "既存の下書き"


def test_normalize_es_build_payload_drops_context_when_short_but_situational() -> None:
    """12文字未満でも状況語があれば context を欠落扱いにしない（進捗が「状況」で止まる回帰防止）。"""
    text = "大学のサークルで広報を担当した。"
    _, state, _ = _normalize_es_build_payload(
        {
            "question": "課題は何でしたか。",
            "focus_key": "context",
            "ready_for_draft": False,
        },
        fallback_state=None,
        conversation_text=text,
    )
    assert "context" not in state["missing_elements"]


def test_normalize_es_build_payload_keeps_context_when_tiny_and_vague() -> None:
    _, state, _ = _normalize_es_build_payload(
        {
            "question": "もう少し教えてください。",
            "focus_key": "context",
            "ready_for_draft": False,
        },
        fallback_state=None,
        conversation_text="がんばった",
    )
    assert "context" in state["missing_elements"]


def test_normalize_es_build_payload_allows_draft_ready_without_learning_when_core_four_are_clear() -> None:
    _, state, source = _normalize_es_build_payload(
        {
            "focus_key": "result",
            "missing_elements": [],
            "ready_for_draft": False,
        },
        fallback_state=None,
        question_count=4,
        conversation_text=(
            "大学3年の学園祭実行委員として模擬店エリアの導線改善に取り組んだ。"
            "昼のピーク時に列が交差して売上機会を逃していたため、"
            "私は会場図を見直して待機列の配置と案内役の立ち位置を変更した。"
            "その結果、混雑の偏りが減り、参加団体から回遊しやすくなったと言われた。"
        ),
        input_richness_mode="almost_draftable",
    )

    assert source == "draft_ready"
    assert state["stage"] == "draft_ready"
    assert state["ready_for_draft"] is True
    assert state["focus_key"] == "result"


def test_normalize_deepdive_payload_marks_interview_ready() -> None:
    question, state, source = _normalize_deepdive_payload(
        {
            "focus_key": "future",
            "deepdive_stage": "interview_ready",
        },
        fallback_state=ConversationStateInput(
            missing_elements=[],
            ready_for_draft=True,
            draft_readiness_reason="ES本文の材料は十分です。",
            draft_text="下書き本文",
        ),
        question_count=8,
    )

    assert question == ""
    assert source == "interview_ready"
    assert state["stage"] == "interview_ready"
    assert state["progress_label"] == "面接準備完了"
    assert state["focus_key"] == "future"
    assert state["draft_text"] == "下書き本文"


def test_classify_input_richness_distinguishes_sparse_and_dense_inputs() -> None:
    assert _classify_input_richness("学園祭実行委員") == "seed_only"
    assert _classify_input_richness("学園祭実行委員として参加率向上に取り組んだ。") == "rough_episode"
    assert (
        _classify_input_richness(
            "学園祭実行委員として来場者導線の混雑改善に取り組んだ。"
            "模擬店エリアで待機列が滞留し売上機会を逃していたため、"
            "導線を再設計して当日の案内運営も見直した。"
        )
        == "almost_draftable"
    )


def test_build_draft_diagnostics_flags_issue_and_recommendation_tags() -> None:
    diagnostics = _build_draft_diagnostics(
        "サークルの新歓改善に取り組んだ。課題は参加者が少ないことだった。"
        "私は工夫して頑張った。結果として雰囲気が良くなった。"
        "学びは協力の大切さである。"
    )

    assert "action_specificity_weak" in diagnostics["issue_tags"]
    assert "learning_generic" in diagnostics["issue_tags"]
    assert "deepen_action_reason" in diagnostics["deepdive_recommendation_tags"]
    assert "result_traceability_check" in diagnostics["deepdive_recommendation_tags"]


def test_evaluate_deepdive_completion_requires_credibility_and_transfer() -> None:
    incomplete = _evaluate_deepdive_completion(
        conversation_text=(
            "質問: その成果の中で、ご自身が担った部分はどこでしたか。\n"
            "回答: 提案はしたが、実行は主に先輩が担当した。"
        ),
        draft_text="私は学園祭運営で導線改善に取り組んだ。",
        focus_key="credibility",
    )
    complete = _evaluate_deepdive_completion(
        conversation_text=(
            "質問: その成果の中で、ご自身が担った部分はどこでしたか。\n"
            "回答: 私は導線案の作成と当日の案内配置を主担当として担った。\n"
            "質問: なぜその方法を選んだのですか。\n"
            "回答: 来場者の詰まりが模擬店前に集中していたため、入口側で分散誘導する方が効果的だと判断した。\n"
            "質問: その工夫が効いたと判断したのはなぜですか。\n"
            "回答: 待機列が短くなり、参加者から移動しやすくなったという声も増えた。\n"
            "質問: その学びは次にどう活かせますか。\n"
            "回答: 現場観察を先に置いて打ち手を決める姿勢として次の企画運営でも再現したい。"
        ),
        draft_text="私は学園祭運営で導線改善に取り組んだ。",
        focus_key="learning_transfer",
    )

    assert incomplete["complete"] is False
    assert "learning_transfer_missing" in incomplete["missing_reasons"]
    assert "credibility_risk" in incomplete["missing_reasons"]
    assert complete["complete"] is True
    assert complete["missing_reasons"] == []


@pytest.mark.asyncio
async def test_call_llm_streaming_fields_uses_partial_success_without_repair(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_stream(*args, **kwargs):
        yield '{"question":"何が一番難しかったですか","conversation_state":{"stage":"es_build'

    async def fail_repair(*args, **kwargs):
        raise AssertionError("JSON repair should not run for gakuchika partial success")

    monkeypatch.setattr("app.utils.llm._call_claude_raw_stream", fake_stream)
    monkeypatch.setattr("app.utils.llm._call_claude", fail_repair)

    events = []
    async for event in call_llm_streaming_fields(
        system_prompt="system",
        user_message="user",
        model="claude-haiku",
        feature="gakuchika",
        stream_string_fields=["question"],
        attempt_repair_on_parse_failure=False,
        partial_required_fields=("question",),
    ):
        events.append(event)

    complete_events = [event for event in events if event.type == "complete"]
    assert len(complete_events) == 1
    assert complete_events[0].result is not None
    assert complete_events[0].result.success is True
    assert complete_events[0].result.data == {
        "question": "何が一番難しかったですか",
    }


# ---------------------------------------------------------------------------
# M2 + M4 (2026-04-17): router-side _generate_initial_question
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_generate_initial_question_without_content_uses_fallback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """M2: empty content short-circuits to a deterministic fallback without
    hitting the LLM. M4: state carries remaining_questions_estimate."""

    async def fail_llm(*args, **kwargs):
        raise AssertionError("LLM must not be called for empty-content fallback")

    monkeypatch.setattr("app.routers.gakuchika.call_llm_with_error", fail_llm)

    req = NextQuestionRequest(
        gakuchika_title="学園祭",
        gakuchika_content=None,
        conversation_history=[],
        question_count=0,
    )
    question, state = await _generate_initial_question(req)

    assert isinstance(question, str) and question
    assert state["stage"] == "es_building"
    assert state["focus_key"] == "context"
    assert isinstance(state["remaining_questions_estimate"], int)
    assert state["remaining_questions_estimate"] >= 1
    assert state["coach_progress_message"]


@pytest.mark.asyncio
async def test_generate_initial_question_llm_failure_falls_back(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """When the LLM fails, we fall back to one of the canned focuses and still
    return a sensible state with remaining_questions_estimate set."""

    async def failing_llm(*args, **kwargs):
        return LLMResult(success=False, data=None, error=None)

    monkeypatch.setattr("app.routers.gakuchika.call_llm_with_error", failing_llm)

    req = NextQuestionRequest(
        gakuchika_title="学園祭",
        gakuchika_content="実行委員として受付を担当した。",
        conversation_history=[],
        question_count=0,
    )
    question, state = await _generate_initial_question(req)

    assert isinstance(question, str) and question
    assert state["stage"] == "es_building"
    assert state["focus_key"] in {"context", "task", "action"}
    assert isinstance(state["remaining_questions_estimate"], int)
    assert state["remaining_questions_estimate"] >= 1


@pytest.mark.asyncio
async def test_generate_initial_question_llm_success_carries_remaining_estimate(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """When the LLM returns a well-formed payload, the state carries an
    integer remaining_questions_estimate that is routed through the
    normalizer."""

    async def ok_llm(*args, **kwargs):
        return LLMResult(
            success=True,
            data={
                "question": "具体的にどんな場面でしたか？",
                "answer_hint": "状況を一文で。",
                "progress_label": "状況を整理中",
                "focus_key": "context",
                "missing_elements": ["context", "task", "action", "result"],
                "ready_for_draft": False,
                "draft_readiness_reason": "",
            },
        )

    monkeypatch.setattr("app.routers.gakuchika.call_llm_with_error", ok_llm)

    req = NextQuestionRequest(
        gakuchika_title="学園祭",
        gakuchika_content="実行委員として受付を担当した。",
        conversation_history=[],
        question_count=0,
    )
    question, state = await _generate_initial_question(req)

    assert isinstance(question, str) and question
    assert isinstance(state["remaining_questions_estimate"], int)
    assert state["remaining_questions_estimate"] >= 0
