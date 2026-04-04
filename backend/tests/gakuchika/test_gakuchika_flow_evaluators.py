from app.routers.gakuchika import (
    Message,
    _classify_input_richness_mode,
    _evaluate_build_readiness,
    _evaluate_deepdive_completion,
)


def test_classify_input_richness_mode_detects_seed_only() -> None:
    assert _classify_input_richness_mode("学園祭") == "seed_only"


def test_classify_input_richness_mode_detects_almost_draftable() -> None:
    text = (
        "学園祭実行委員として、来場者の待ち時間が長い課題に向き合った。"
        "導線を見直して担当配置を変えた結果、待機列が大幅に短くなった。"
    )
    assert _classify_input_richness_mode(text) == "almost_draftable"


def test_evaluate_build_readiness_requires_role_for_group_activity() -> None:
    messages = [
        Message(role="user", content="サークルの新歓運営に取り組みました。"),
        Message(role="user", content="参加者が前年より減っていたことが課題でした。"),
        Message(role="user", content="SNS告知と体験会の導線を見直しました。"),
        Message(role="user", content="参加者が増えて雰囲気も良くなりました。"),
        Message(role="user", content="相手目線で設計する大切さを学びました。"),
    ]

    evaluation = _evaluate_build_readiness(messages)

    assert evaluation["role_required"] is True
    assert evaluation["draft_quality_checks"]["role_scope"] is False
    assert evaluation["ready_for_draft"] is False
    assert evaluation["recommended_focus"] == "role"


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

    evaluation = _evaluate_deepdive_completion(draft_text, messages)

    assert evaluation["deepdive_complete"] is True
    assert evaluation["completion_reasons"] == []
