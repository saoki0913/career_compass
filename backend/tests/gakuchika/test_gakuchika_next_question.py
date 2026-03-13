import pytest

from app.routers.gakuchika import (
    STARScores,
    _build_next_question_prompt,
    _normalize_next_question_payload,
)
from app.utils.llm import call_llm_streaming_fields


def test_build_next_question_prompt_includes_quality_guardrails() -> None:
    prompt = _build_next_question_prompt(
        gakuchika_title="塾講師のアルバイト",
        conversation_text="質問: どんな課題がありましたか。\n\n回答: メンバーごとの差がありました。",
        question_count=4,
    )

    assert "派手な結果より" in prompt
    assert "1問で広く浅く聞かず" in prompt
    assert "役割・裁量・他者との分担" in prompt
    assert "学びが次に再現できる形" in prompt
    assert "面接官の懐疑心を生まないよう" in prompt
    assert "scene / root_cause / decision_reason" in prompt


def test_normalize_next_question_payload_uses_fallback_scores() -> None:
    question, star_eval, target_element, source = _normalize_next_question_payload(
        {"question": "何が一番難しかったですか。"},
        fallback_scores=STARScores(situation=62, task=38, action=71, result=54),
        question_count=4,
    )

    assert question == "何が一番難しかったですか。"
    assert star_eval["scores"] == {
        "situation": 62,
        "task": 38,
        "action": 71,
        "result": 54,
    }
    assert target_element == "task"
    assert source == "partial_json"


def test_normalize_next_question_payload_falls_back_to_rule_question() -> None:
    question, star_eval, target_element, source = _normalize_next_question_payload(
        {},
        fallback_scores=STARScores(situation=74, task=76, action=71, result=28),
        question_count=10,
    )

    assert source == "rule_fallback"
    assert target_element == "result"
    assert star_eval["scores"]["result"] == 28
    assert "学び" in question
    assert "教えてください" not in question
    assert "詳しく" not in question


@pytest.mark.asyncio
async def test_call_llm_streaming_fields_uses_partial_success_without_repair(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_stream(*args, **kwargs):
        yield '{"question":"何が一番難しかったですか","star_scores":{"situation":"4'

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
