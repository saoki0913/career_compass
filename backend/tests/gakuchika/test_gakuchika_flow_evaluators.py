from app.normalization.gakuchika_payload import (
    _build_coach_progress_message,
    _estimate_remaining_questions,
    _extract_student_expressions,
)
from app.routers.gakuchika import (
    Message,
    _build_causal_gaps,
    _build_draft_quality_checks,
    _build_known_facts,
    _detect_gakuchika_critic_closing,
    _classify_input_richness,
    _evaluate_deepdive_completion,
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


def test_build_known_facts_truncates_when_exceeding_char_cap() -> None:
    long_answer = "あ" * 300
    messages = [
        Message(role="assistant", content="Q1"),
        Message(role="user", content=f"{long_answer} 冒頭の事実A"),
        Message(role="assistant", content="Q2"),
        Message(role="user", content=f"{long_answer} 冒頭の事実B"),
        Message(role="assistant", content="Q3"),
        Message(role="user", content=f"{long_answer} 中盤の事実C"),
        Message(role="assistant", content="Q4"),
        Message(role="user", content=f"{long_answer} 末尾の事実D"),
        Message(role="assistant", content="Q5"),
        Message(role="user", content=f"{long_answer} 末尾の事実E"),
        Message(role="assistant", content="Q6"),
        Message(role="user", content=f"{long_answer} 末尾の事実F"),
    ]

    facts = _build_known_facts(messages)

    # 各 bullet は 240 字で省略（… 1 文字追加で bullet の本文部分 240 以下）
    for line in facts.split("\n"):
        if line.startswith("- "):
            assert len(line[2:]) <= 240
    # 全体 1200 字キャップ
    assert len(facts) <= 1200
    # 省略が発生すると … が付く
    assert "…" in facts


def test_build_draft_quality_does_not_treat_passive_mentions_as_owned_action() -> None:
    text = (
        "学園祭運営で混雑が課題でした。私は先輩の提案を聞き、指示された対応を手伝いました。"
        "その結果、流れは良くなりました。"
    )

    checks = _build_draft_quality_checks(text)

    assert checks["task_clarity"] is True
    assert checks["action_ownership"] is False
    assert checks["result_traceability"] is False


def test_task_clarity_detects_implicit_task_with_connective() -> None:
    # 明示的な `課題` キーワードは無いが、暗黙タスク表現 `減らしたい` + 接続詞 `ため` で検出
    text = "新歓で参加者が少なく、もっと興味を持ってもらえる人を増やしたいと考えたため、告知方法を見直しました。"
    checks = _build_draft_quality_checks(text)
    assert checks["task_clarity"] is True


def test_task_clarity_detects_implicit_task_with_action() -> None:
    # 暗黙タスク表現 `改善したい` + ACTION `見直` で検出（接続詞なしでも可）
    text = "運営の非効率を改善したい気持ちがあり、会場図を見直しました。"
    checks = _build_draft_quality_checks(text)
    assert checks["task_clarity"] is True


def test_task_clarity_false_when_only_implicit_without_connective_or_action() -> None:
    # 暗黙タスクだけで、接続詞も ACTION も無い場合は false（判定緩和されすぎない安全網）
    text = "もっと良くしたい気持ちだけは強かったです。"
    checks = _build_draft_quality_checks(text)
    assert checks["task_clarity"] is False


def test_classify_input_richness_ignores_implicit_patterns() -> None:
    # _classify_input_richness は TASK_IMPLICIT_PATTERNS の影響を受けない
    # （初期ルーティングで暗黙表現だけで richness を上げない）
    text = "もっと良くしたい気持ちがありました。"
    assert _classify_input_richness(text) in {"seed_only", "rough_episode"}


def test_action_ownership_recognized_for_compound_actions_without_first_person() -> None:
    # `私` `自分` が無くても、複合 ACTION（>=2 ヒット）なら action_ownership を認める
    text = "学園祭で受付を再設計し、案内と誘導の役割も整理しました。"
    checks = _build_draft_quality_checks(text)
    assert checks["action_ownership"] is True


def test_action_ownership_true_when_first_person_present() -> None:
    # 従来経路: `私` + ACTION 1 件で action_ownership 認定、他者マーカー無し
    text = "私は会場図を見直しました。"
    checks = _build_draft_quality_checks(text)
    assert checks["action_ownership"] is True


def test_result_traceability_accepts_digit_alternative() -> None:
    # 数値があれば接続詞不在でも result_traceability を認める（action_specific は維持必須）
    text = "私は会場図を見直しました。待機列は15分短縮されました。"
    checks = _build_draft_quality_checks(text)
    assert checks["action_ownership"] is True
    assert checks["result_traceability"] is True


def test_result_traceability_still_requires_action_specific() -> None:
    # 他者主語マーカーで action_specific が False になると traceability も False に落ちる
    text = "先輩の提案を聞き、手伝いました。結果は15分短縮されました。"
    checks = _build_draft_quality_checks(text)
    assert checks["action_ownership"] is False
    assert checks["result_traceability"] is False


def test_detect_gakuchika_critic_closing_flags_abstract_generalization() -> None:
    draft = (
        "私は開発サークルでレビュー遅延の改善に取り組んだ。レビュー基準を整理し、担当者ごとの確認項目を明確にした。"
        "設計の強制力と段階的導入を組み合わせることで、チームに無理なく浸透させる手法は、複数人が関わるシステム開発の品質維持に直結する。"
    )

    result = _detect_gakuchika_critic_closing(draft, user_origin_text="レビュー基準を整理しました。")

    assert result["detected"] is True
    assert "abstract_generalization_closing" in result["codes"]


def test_detect_gakuchika_critic_closing_allows_owned_action_closing() -> None:
    draft = (
        "私は開発サークルでレビュー遅延の改善に取り組んだ。レビュー基準を整理し、担当者ごとの確認項目を明確にした。"
        "この経験から、複数人で開発する際に最初に判断基準をそろえる力を身につけた。"
    )

    result = _detect_gakuchika_critic_closing(draft, user_origin_text="判断基準をそろえる力を身につけた。")

    assert result["detected"] is False


def test_detect_gakuchika_critic_closing_does_not_ignore_assistant_origin_terms() -> None:
    draft = (
        "私はレビュー基準を整理し、チーム内で確認の観点をそろえた。"
        "設計の強制力と段階的導入を組み合わせることで、チームに無理なく浸透させる手法は、複数人が関わるシステム開発の品質維持に直結する。"
    )

    result = _detect_gakuchika_critic_closing(
        draft,
        user_origin_text="質問: どのような手法や重要性がありましたか。\n回答: レビュー基準を整理しました。",
    )

    assert result["detected"] is True
    assert "abstract_generalization_closing" in result["codes"]


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


def _format_user_turns(messages: list[Message]) -> str:
    return "\n".join(m.content for m in messages if m.role == "user")


# ---------------------------------------------------------------------------
# Phase B.5: _extract_student_expressions
# ---------------------------------------------------------------------------


def test_extract_student_expressions_picks_up_quoted_phrases() -> None:
    messages = [
        Message(role="assistant", content="学生からの一言は？"),
        Message(
            role="user",
            content="先輩から「最後まで諦めない姿勢がいい」と言われたのが嬉しかった。",
        ),
    ]
    result = _extract_student_expressions(messages)
    assert any("最後まで諦めない姿勢がいい" in expr for expr in result)


def test_extract_student_expressions_picks_up_digit_unit_phrases() -> None:
    messages = [
        Message(role="user", content="施策の結果、参加者が30%増え、待機時間も15分短縮した。"),
    ]
    result = _extract_student_expressions(messages)
    assert any("30%" in expr for expr in result)
    assert any("15分短縮" in expr for expr in result)


def test_extract_student_expressions_picks_up_first_person_actions() -> None:
    messages = [
        Message(role="user", content="私が会場図を見直した。自分で案内配置を決めた。"),
    ]
    result = _extract_student_expressions(messages)
    # 一人称アクションフレーズが最低1つは拾える
    assert any(("私" in expr or "自分" in expr) for expr in result)


def test_extract_student_expressions_caps_at_max_items() -> None:
    # 数字+単位が 7 件あっても max_items=5 で止まる
    messages = [
        Message(
            role="user",
            content=(
                "1人目は10分短縮、2人目は20%改善、3人目は3倍、"
                "4人目は5件対応、5人目は50人参加、"
                "6人目は8時間稼働、7人目は2年継続した。"
            ),
        ),
    ]
    result = _extract_student_expressions(messages, max_items=5)
    assert len(result) == 5


def test_extract_student_expressions_ignores_assistant_role() -> None:
    messages = [
        Message(role="assistant", content="「数字で示すと印象が変わります」と先輩に言われました。"),
        Message(role="user", content="はい、わかりました。"),
    ]
    result = _extract_student_expressions(messages)
    # assistant の引用句は拾わない
    assert not any("数字で示すと印象が変わります" in expr for expr in result)


def test_extract_student_expressions_deduplicates() -> None:
    messages = [
        Message(role="user", content="参加者が30%増えた。"),
        Message(role="user", content="結果として参加者が30%増えた。"),
    ]
    result = _extract_student_expressions(messages)
    thirty_pct = [expr for expr in result if "30%" in expr]
    # 同じ '30%' snippet が 2 件並ばないこと（登場順・重複除去）
    assert len({expr for expr in thirty_pct}) == len(thirty_pct)


def test_extract_student_expressions_returns_empty_for_no_user_turns() -> None:
    messages = [Message(role="assistant", content="最初の質問です。")]
    assert _extract_student_expressions(messages) == []


def test_extract_student_expressions_drops_too_short_fragments() -> None:
    # 「私が」単独のような 3 字未満断片は除外される
    messages = [Message(role="user", content="私。自分。")]
    result = _extract_student_expressions(messages)
    for expr in result:
        assert len(expr) >= 3


# ---------------------------------------------------------------------------
# Phase B.7: _build_coach_progress_message
# ---------------------------------------------------------------------------


def test_coach_progress_message_alignment_with_readiness_gate() -> None:
    # ready_for_draft=True → 「材料が揃いました」系
    ready_msg = _build_coach_progress_message(
        stage="draft_ready",
        resolved_focuses=["context", "task", "action", "result"],
        missing_elements=[],
        focus_key="result",
        ready_for_draft=True,
    )
    assert ready_msg is not None
    assert "揃い" in ready_msg

    # missing 1-2 件 → 「あと 1-2 問」系
    few_missing_msg = _build_coach_progress_message(
        stage="es_building",
        resolved_focuses=["context", "task"],
        missing_elements=["action", "result"],
        focus_key="action",
        ready_for_draft=False,
    )
    assert few_missing_msg is not None
    assert "1-2問" in few_missing_msg

    # deep_dive_active → 「深掘り」系
    deep_dive_msg = _build_coach_progress_message(
        stage="deep_dive_active",
        resolved_focuses=["context", "task", "action", "result", "learning"],
        missing_elements=[],
        focus_key="challenge",
        ready_for_draft=True,
    )
    assert deep_dive_msg is not None
    assert "深掘り" in deep_dive_msg

    # stage=es_building, resolved=0, missing includes context
    fresh_msg = _build_coach_progress_message(
        stage="es_building",
        resolved_focuses=[],
        missing_elements=["context", "task", "action", "result"],
        focus_key="context",
        ready_for_draft=False,
    )
    assert fresh_msg is not None
    assert "整理" in fresh_msg


def test_coach_progress_message_respects_30_char_cap() -> None:
    # 30 字以内の制約を全パターンで担保
    cases = [
        {
            "stage": "draft_ready",
            "resolved_focuses": ["context", "task", "action", "result"],
            "missing_elements": [],
            "focus_key": "result",
            "ready_for_draft": True,
        },
        {
            "stage": "es_building",
            "resolved_focuses": ["context"],
            "missing_elements": ["task", "action", "result"],
            "focus_key": "task",
            "ready_for_draft": False,
        },
        {
            "stage": "es_building",
            "resolved_focuses": [],
            "missing_elements": ["context", "task", "action", "result"],
            "focus_key": "context",
            "ready_for_draft": False,
        },
        {
            "stage": "deep_dive_active",
            "resolved_focuses": ["context", "task", "action", "result"],
            "missing_elements": [],
            "focus_key": "challenge",
            "ready_for_draft": True,
        },
        {
            "stage": "interview_ready",
            "resolved_focuses": ["context", "task", "action", "result", "learning"],
            "missing_elements": [],
            "focus_key": "future",
            "ready_for_draft": True,
        },
    ]
    for case in cases:
        msg = _build_coach_progress_message(**case)
        if msg is not None:
            assert len(msg) <= 30, (case, msg)


def test_coach_progress_message_returns_none_for_unknown_stage() -> None:
    result = _build_coach_progress_message(
        stage="unknown_stage",
        resolved_focuses=[],
        missing_elements=[],
        focus_key=None,
        ready_for_draft=False,
    )
    assert result is None


def test_coach_progress_message_extended_deep_dive_round() -> None:
    # 継続深掘り中は通常の深掘りメッセージと異なる表現
    msg = _build_coach_progress_message(
        stage="deep_dive_active",
        resolved_focuses=["context", "task", "action", "result"],
        missing_elements=[],
        focus_key="challenge",
        ready_for_draft=True,
        extended_deep_dive_round=2,
    )
    assert msg is not None
    assert "一段" in msg or "さらに" in msg


# ---------------------------------------------------------------------------
# M4 (2026-04-17): _estimate_remaining_questions
# ---------------------------------------------------------------------------


def test_estimate_remaining_questions_fresh_start_uses_min_gate() -> None:
    # 新規セッション: question_count=0, 全 STAR missing
    # min_gate=4, missing_core=4, quality_gaps 多め
    # cap_room = cap_threshold(6) - 0 = 6 でキャップされるが 4 が最大
    result = _estimate_remaining_questions(
        stage="es_building",
        question_count=0,
        missing_elements=["context", "task", "action", "result"],
        quality_checks={},
        causal_gaps=[],
        ready_for_draft=False,
        role_required=False,
    )
    assert result == 4


def test_estimate_remaining_questions_mid_flow() -> None:
    # question_count=2, missing=["action","result"] + ownership false
    # min_gate=2, missing_core=2, quality_gaps=1 (action_ownership false 1件)
    # → max = 2
    result = _estimate_remaining_questions(
        stage="es_building",
        question_count=2,
        missing_elements=["action", "result"],
        quality_checks={"task_clarity": True, "action_ownership": False, "result_traceability": False},
        causal_gaps=[],
        ready_for_draft=False,
        role_required=False,
    )
    # quality_gaps: action_ownership + result_traceability = 2, missing_core=2, min_gate=2 → max=2
    assert result == 2


def test_estimate_remaining_questions_ready_for_draft_returns_zero() -> None:
    # ready_for_draft=True のときは stage に関わらず 0
    result = _estimate_remaining_questions(
        stage="es_building",
        question_count=4,
        missing_elements=[],
        quality_checks={"task_clarity": True, "action_ownership": True, "result_traceability": True},
        causal_gaps=[],
        ready_for_draft=True,
        role_required=False,
    )
    assert result == 0


def test_estimate_remaining_questions_interview_ready_returns_zero() -> None:
    result = _estimate_remaining_questions(
        stage="interview_ready",
        question_count=10,
        missing_elements=["action"],
        quality_checks={},
        causal_gaps=["causal_gap_action_result"],
        ready_for_draft=False,
        role_required=True,
    )
    assert result == 0


def test_estimate_remaining_questions_deep_dive_active_returns_zero() -> None:
    result = _estimate_remaining_questions(
        stage="deep_dive_active",
        question_count=6,
        missing_elements=[],
        quality_checks={},
        causal_gaps=[],
        ready_for_draft=True,
        role_required=False,
    )
    assert result == 0


def test_estimate_remaining_questions_respects_cap_threshold() -> None:
    # question_count=5, missing=4 核要素、quality gaps 多数
    # cap_room = cap_threshold(6) - 5 = 1、内部 max は 4 だが cap で 1
    result = _estimate_remaining_questions(
        stage="es_building",
        question_count=5,
        missing_elements=["context", "task", "action", "result"],
        quality_checks={"task_clarity": False, "action_ownership": False, "result_traceability": False},
        causal_gaps=["causal_gap_action_result"],
        ready_for_draft=False,
        role_required=True,
    )
    assert result == 1


def test_estimate_remaining_questions_counts_role_and_causal_gaps() -> None:
    # role_required + role_clarity=False + causal_gap_action_result で quality_gaps +2
    # question_count=3, missing=[] (STAR 揃う), task/action/result_traceability は True
    # min_gate = 4-3 = 1, missing_core = 0, quality_gaps = 2 (role + causal)
    # → max = 2、cap_room = 6-3 = 3 でキャップされず 2
    result = _estimate_remaining_questions(
        stage="es_building",
        question_count=3,
        missing_elements=[],
        quality_checks={
            "task_clarity": True,
            "action_ownership": True,
            "result_traceability": True,
            "role_clarity": False,
        },
        causal_gaps=["causal_gap_action_result"],
        ready_for_draft=False,
        role_required=True,
    )
    assert result == 2


def test_estimate_remaining_questions_never_negative() -> None:
    # question_count がキャップ超過してもマイナスにならない
    result = _estimate_remaining_questions(
        stage="es_building",
        question_count=10,
        missing_elements=[],
        quality_checks={"task_clarity": True, "action_ownership": True, "result_traceability": True},
        causal_gaps=[],
        ready_for_draft=False,
        role_required=False,
    )
    assert result == 0


def test_estimate_remaining_questions_zero_implies_ready_consistency() -> None:
    """Integrity check: when remaining == 0 for ES building, the input shape
    should be consistent with ready_for_draft being achievable (no critical
    gaps, no missing elements) OR question_count >= MIN gate.
    """
    # All quality checks passed, missing empty, question_count >= MIN → remaining 0
    result = _estimate_remaining_questions(
        stage="es_building",
        question_count=4,
        missing_elements=[],
        quality_checks={
            "task_clarity": True,
            "action_ownership": True,
            "result_traceability": True,
        },
        causal_gaps=[],
        ready_for_draft=False,
        role_required=False,
    )
    assert result == 0
