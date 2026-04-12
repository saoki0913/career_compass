from app.routers.gakuchika import (
    Message,
    _build_causal_gaps,
    _build_draft_quality_checks,
    _build_known_facts,
    _classify_input_richness,
    _evaluate_deepdive_completion,
    _should_retry_gakuchika_draft,
)


def test_classify_input_richness_detects_seed_only() -> None:
    assert _classify_input_richness("学園祭") == "seed_only"


def test_classify_input_richness_detects_almost_draftable() -> None:
    text = (
        "学園祭実行委員として、来場者の待ち時間が長い課題に向き合った。"
        "導線を見直して担当配置を変えた結果、待機列が大幅に短くなった。"
    )
    assert _classify_input_richness(text) == "almost_draftable"


def test_build_draft_quality_requires_role_for_group_activity() -> None:
    messages = [
        Message(role="user", content="サークルの新歓運営に取り組みました。"),
        Message(role="user", content="参加者が前年より減っていたことが課題でした。"),
        Message(role="user", content="SNS告知と体験会の導線を見直しました。"),
        Message(role="user", content="参加者が増えて雰囲気も良くなりました。"),
        Message(role="user", content="相手目線で設計する大切さを学びました。"),
    ]

    conversation_text = "\n".join(m.content for m in messages if m.role == "user")
    checks = _build_draft_quality_checks(conversation_text)
    gaps = _build_causal_gaps(conversation_text, checks)

    assert checks["role_required"] is True
    assert checks["role_clarity"] is False
    assert "role_scope_missing" in gaps


def test_build_known_facts_keeps_early_context_when_conversation_is_long() -> None:
    messages = [
        Message(role="assistant", content="どんな経験ですか。"),
        Message(role="user", content="大学3年の学園祭実行委員として模擬店エリア運営を担当しました。"),
        Message(role="assistant", content="課題は何でしたか。"),
        Message(role="user", content="昼のピーク時に待機列が交差し、回遊しにくい状態が続いていました。"),
        Message(role="assistant", content="何をしましたか。"),
        Message(role="user", content="私は会場図を見直し、待機列の配置と案内役の立ち位置を再設計しました。"),
        Message(role="assistant", content="結果はどうでしたか。"),
        Message(role="user", content="ピーク時間帯の詰まりが減り、参加団体から回りやすくなったと言われました。"),
        Message(role="assistant", content="学びはありましたか。"),
        Message(role="user", content="現場観察をもとにボトルネックを言語化してから動く大切さを学びました。"),
        Message(role="assistant", content="他に補足はありますか。"),
        Message(role="user", content="判断理由として、最短で混雑を減らせる手が導線変更だと考えました。"),
    ]

    facts = _build_known_facts(messages)

    assert "大学3年の学園祭実行委員" in facts
    assert "ピーク時間帯の詰まり" in facts
    assert facts.count("\n- ") <= 5


def test_build_draft_quality_does_not_treat_passive_mentions_as_owned_action() -> None:
    text = (
        "学園祭運営で混雑が課題でした。私は先輩の提案を聞き、指示された対応を手伝いました。"
        "その結果、流れは良くなりました。"
    )

    checks = _build_draft_quality_checks(text)

    assert checks["task_clarity"] is True
    assert checks["action_ownership"] is False
    assert checks["result_traceability"] is False


def test_evaluate_deepdive_completion_is_server_side_and_requires_evidence() -> None:
    draft_text = "私は学園祭実行委員として受付導線を改善し、待機列の混雑緩和に取り組んだ。"
    messages = [
        Message(role="user", content="50人規模の受付班で導線設計を担当しました。"),
        Message(role="user", content="開始直後に受付が詰まり、入場待ちが長くなる点を重要課題だと考えました。"),
        Message(role="user", content="会場図を見直し、受付と誘導の役割分担を変更しました。"),
        Message(role="user", content="混雑が15分以内に収まり、案内の問い合わせも減りました。"),
        Message(role="user", content="状況を見て役割を切り直す判断が再現可能な学びだと感じました。"),
        Message(role="user", content="最初に会場図を直したのは、受付停止時間を最短で減らせると判断したためです。"),
    ]

    evaluation = _evaluate_deepdive_completion(_format_user_turns(messages), draft_text)

    assert evaluation["complete"] is True
    assert isinstance(evaluation.get("completion_reasons"), list)


def test_evaluate_deepdive_completion_rejects_keyword_only_shallow_followup() -> None:
    draft_text = "私は学園祭実行委員として受付導線を改善し、待機列の混雑緩和に取り組みました。"
    conversation_text = (
        "なぜと聞かれると大事だと思ったからです。"
        "今後にも活かしたいです。"
        "判断したつもりですが、数字までは分かりません。"
    )

    evaluation = _evaluate_deepdive_completion(conversation_text, draft_text, "action_reason")

    assert evaluation["complete"] is False
    assert "action_reason_missing" in evaluation["missing_reasons"]
    assert "learning_transfer_missing" in evaluation["missing_reasons"]


def test_should_retry_gakuchika_draft_for_short_and_shallow_output() -> None:
    draft = "私は学園祭運営で工夫しました。結果として良くなりました。"

    assert _should_retry_gakuchika_draft(draft, 400) is True


def _format_user_turns(messages: list[Message]) -> str:
    return "\n".join(m.content for m in messages if m.role == "user")
