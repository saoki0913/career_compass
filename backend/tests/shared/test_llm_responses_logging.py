from app.utils import llm_responses


def test_empty_json_logging_does_not_include_candidate_preview(monkeypatch) -> None:
    messages = []

    monkeypatch.setattr(
        llm_responses,
        "_log",
        lambda feature, message, level: messages.append(message),
    )

    llm_responses._log_openai_empty_json_attempt(
        "es_review",
        response=None,
        candidates=["学生時代にサークル運営で成果を出しました"],
    )

    serialized = "\n".join(messages)
    assert "学生時代" not in serialized
    assert "プレビュー" not in serialized
    assert "type=str" in serialized
    assert "length=20" in serialized
    assert "sha256=" in serialized


def test_empty_json_logging_does_not_include_output_text(monkeypatch) -> None:
    messages = []
    response = type(
        "Response",
        (),
        {"output_text": "志望動機の本文が混ざりました"},
    )()

    monkeypatch.setattr(
        llm_responses,
        "_log",
        lambda feature, message, level: messages.append(message),
    )

    llm_responses._log_openai_empty_json_attempt(
        "motivation",
        response=response,
        candidates=[],
    )

    serialized = "\n".join(messages)
    assert "志望動機" not in serialized
    assert "type=str" in serialized
    assert "sha256=" in serialized
