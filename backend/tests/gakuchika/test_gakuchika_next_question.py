import pytest

from app.routers.gakuchika import (
    BUILD_FOCUS_FALLBACKS,
    ConversationStateInput,
    DEEPDIVE_FOCUS_FALLBACKS,
    NextQuestionRequest,
    _build_deepdive_prompt,
    _build_es_prompt,
    _normalize_deepdive_payload,
    _normalize_es_build_payload,
)
from app.utils.llm import call_llm_streaming_fields


def test_build_es_prompt_includes_readiness_guardrails() -> None:
    prompt = _build_es_prompt(
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

    assert "ready_for_draft=true" in prompt
    assert "6要素があるだけではなく" in prompt
    assert "task と action が ES として読んで弱くない最低限の具体性" in prompt
    assert "抽象語だけで終わっていない" in prompt
    assert "自然な丁寧語" in prompt
    assert '"answer_hint"' in prompt
    assert '"progress_label"' in prompt


def test_build_deepdive_prompt_includes_future_and_backstory() -> None:
    prompt = _build_deepdive_prompt(
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

    assert "future" in prompt
    assert "backstory" in prompt
    assert "将来展望" in prompt
    assert "原体験" in prompt
    assert "STAR の点数評価は不要です" in prompt


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
    assert state["missing_elements"] == ["task", "result", "learning"]


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
    assert state["progress_label"] == "ES作成可"
    assert state["ready_for_draft"] is True
    assert state["draft_text"] == "既存の下書き"


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
    )

    assert question == ""
    assert source == "interview_ready"
    assert state["stage"] == "interview_ready"
    assert state["progress_label"] == "面接準備完了"
    assert state["focus_key"] == "future"
    assert state["draft_text"] == "下書き本文"


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
