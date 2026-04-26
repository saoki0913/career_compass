from app.utils.llm_providers import _normalize_chat_messages


def test_normalize_chat_messages_treats_empty_list_as_user_message():
    messages, used_user_message = _normalize_chat_messages([], "初回質問を生成してください")

    assert used_user_message is True
    assert messages == [{"role": "user", "content": "初回質問を生成してください"}]


def test_normalize_chat_messages_preserves_non_empty_history():
    history = [{"role": "assistant", "content": "前の質問"}]

    messages, used_user_message = _normalize_chat_messages(history, "ignored")

    assert used_user_message is False
    assert messages == history
