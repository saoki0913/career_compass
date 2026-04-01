from __future__ import annotations

import pytest

from app.prompts.es_templates import (
    _format_target_char_window,
    build_template_fallback_rewrite_prompt,
    build_template_length_fix_prompt,
    build_template_rewrite_prompt,
)


@pytest.mark.parametrize(
    ("template_type", "question", "answer", "company_name", "role_name", "intern_name"),
    [
        (
            "company_motivation",
            "三菱商事を志望する理由を教えてください。",
            "研究で仮説検証を重ねた経験を、事業を動かす仕事で生かしたい。",
            "三菱商事",
            "総合職",
            None,
        ),
        (
            "role_course_reason",
            "デジタル企画コースを選んだ理由を教えてください。",
            "研究で培った分析力を、事業と技術をつなぐ役割で生かしたい。",
            "三菱商事",
            "デジタル企画",
            None,
        ),
    ],
)
def test_required_medium_long_rewrite_prompt_includes_structure_and_examples(
    template_type: str,
    question: str,
    answer: str,
    company_name: str,
    role_name: str | None,
    intern_name: str | None,
) -> None:
    system_prompt, user_prompt = build_template_rewrite_prompt(
        template_type=template_type,
        company_name=company_name,
        industry="総合商社",
        question=question,
        answer=answer,
        char_min=180,
        char_max=260,
        company_evidence_cards=[
            {
                "theme": "事業理解",
                "claim": "成長領域への投資を進める",
                "excerpt": "新たな事業機会を広げる",
            }
        ],
        has_rag=True,
        allowed_user_facts=[
            {"source": "current_answer", "text": answer},
            {"source": "gakuchika_summary", "text": "研究室で論点整理を担った。"},
        ],
        role_name=role_name,
        intern_name=intern_name,
        grounding_mode="company_general",
        reference_quality_block="【参考ESから抽出した品質ヒント】\n- 参考件数: 1件",
    )

    assert "<task>" in system_prompt
    assert "<length_policy>" in system_prompt
    assert "【requiredテンプレの型】" in system_prompt
    assert "4文前後" in system_prompt
    assert "【書き出し例】" in system_prompt
    assert "【避ける例】" in system_prompt
    assert "設問文の言い換え" in system_prompt
    assert "【改善ポイント】" not in system_prompt
    assert "研究" in user_prompt


@pytest.mark.parametrize(
    ("template_type", "question", "answer", "company_name", "role_name"),
    [
        (
            "company_motivation",
            "三菱商事を志望する理由を教えてください。",
            "研究で仮説検証を重ねた経験を、事業を動かす仕事で生かしたい。",
            "三菱商事",
            "総合職",
        ),
        (
            "role_course_reason",
            "デジタル企画コースを選んだ理由を教えてください。",
            "研究で培った分析力を、事業と技術をつなぐ役割で生かしたい。",
            "三菱商事",
            "デジタル企画",
        ),
    ],
)
def test_required_medium_long_fallback_prompt_includes_same_structure(
    template_type: str,
    question: str,
    answer: str,
    company_name: str,
    role_name: str,
) -> None:
    system_prompt, user_prompt = build_template_fallback_rewrite_prompt(
        template_type=template_type,
        company_name=company_name,
        industry="総合商社",
        question=question,
        answer=answer,
        char_min=180,
        char_max=260,
        company_evidence_cards=[
            {
                "theme": "事業理解",
                "claim": "成長領域への投資を進める",
                "excerpt": "新たな事業機会を広げる",
            }
        ],
        has_rag=True,
        allowed_user_facts=[
            {"source": "current_answer", "text": answer},
            {"source": "gakuchika_summary", "text": "研究室で論点整理を担った。"},
        ],
        role_name=role_name,
        grounding_mode="company_general",
        reference_quality_block="【参考ESから抽出した品質ヒント】\n- 参考件数: 1件",
    )

    assert "<task>" in system_prompt
    assert "<length_policy>" in system_prompt
    assert "【requiredテンプレの型】" in system_prompt
    assert "【書き出し例】" in system_prompt
    assert "【避ける例】" in system_prompt
    assert "【最低限反映する改善点】" not in user_prompt
    assert "研究" in user_prompt


def test_intern_reason_rewrite_prompt_includes_three_part_guidance_for_multipart_question() -> None:
    system_prompt, _ = build_template_rewrite_prompt(
        template_type="intern_reason",
        company_name="三井物産",
        industry="総合商社",
        question="インターンに参加したい理由と、これまでの経験をどう活かせるか、そして持ち帰りたい学びを教えてください。",
        answer="研究で仮説検証を重ね、論点整理を担ってきた。この経験を実務でも試したい。",
        char_min=150,
        char_max=220,
        company_evidence_cards=[
            {
                "theme": "インターン機会",
                "claim": "実務に近い課題を扱う",
                "excerpt": "意思決定に近い分析を体感できる",
            }
        ],
        has_rag=True,
        allowed_user_facts=[{"source": "current_answer", "text": "研究で仮説検証を重ねた。"}],
        role_name="Business Intelligence",
        intern_name="Business Intelligence Internship",
        grounding_mode="role_grounded",
    )

    assert "【この設問で落としてはいけない3要素】" in system_prompt
    assert "参加したい理由" in system_prompt
    assert "活かせる経験" in system_prompt
    assert "持ち帰りたい学び" in system_prompt


def test_self_pr_rewrite_prompt_includes_negative_reframe_guidance() -> None:
    system_prompt, _ = build_template_rewrite_prompt(
        template_type="self_pr",
        company_name=None,
        industry=None,
        question="自己PRを220字以内で教えてください。",
        answer="経験不足だが、最後までやり切る。自信がない場面でも準備を重ねる。",
        char_min=150,
        char_max=220,
        company_evidence_cards=[],
        has_rag=False,
        allowed_user_facts=[{"source": "current_answer", "text": "ゼミで論点整理を担った。"}],
        role_name=None,
        grounding_mode="none",
    )

    assert "【自己PRで避ける表現】" in system_prompt
    assert "「経験不足」「自信がない」" in system_prompt
    assert "準備・責任感・学習姿勢・確認力" in system_prompt


def test_required_length_fix_prompt_stays_minimal_and_bridge_only() -> None:
    system_prompt, user_prompt = build_template_length_fix_prompt(
        template_type="role_course_reason",
        current_text="研究で培った分析力を生かしたい。",
        char_min=120,
        char_max=140,
        fix_mode="under_min",
        length_control_mode="under_min_recovery",
    )

    assert "既にある経験・職種・企業接点" in system_prompt
    assert "1文まで足し" in system_prompt
    assert "新しい経験・役割・成果・数字・企業施策を足さない" in system_prompt
    assert "研究で培った分析力を生かしたい。" in user_prompt


def test_required_length_fix_prompt_allows_two_short_bridges_for_large_medium_shortfall() -> None:
    system_prompt, _ = build_template_length_fix_prompt(
        template_type="role_course_reason",
        current_text="研究で培った分析力を生かしたい。",
        char_min=170,
        char_max=220,
        fix_mode="under_min",
        length_control_mode="under_min_recovery",
    )

    assert "1〜2文まで足し" in system_prompt


def test_length_fix_prompt_allows_extra_bridge_when_large_under_shortfall() -> None:
    system_prompt, _ = build_template_length_fix_prompt(
        template_type="self_pr",
        current_text="短い。",
        char_min=200,
        char_max=400,
        fix_mode="under_min",
        length_control_mode="default",
    )

    assert "1〜2か所足し" in system_prompt


def test_self_pr_length_fix_prompt_includes_negative_reframe_guidance() -> None:
    system_prompt, _ = build_template_length_fix_prompt(
        template_type="self_pr",
        current_text="経験不足だが、最後までやり切る。",
        char_min=150,
        char_max=220,
        fix_mode="under_min",
        length_control_mode="under_min_recovery",
    )

    assert "【自己PRで避ける表現】" in system_prompt
    assert "自己否定語をそのまま残さない" in system_prompt


def test_required_short_prompt_includes_required_playbook_and_min_guard() -> None:
    system_prompt, _ = build_template_rewrite_prompt(
        template_type="company_motivation",
        company_name="三菱商事",
        industry="総合商社",
        question="三菱商事を志望する理由を150字以内で教えてください。",
        answer="研究で仮説検証を重ねた経験を、事業を動かす仕事で生かしたい。",
        char_min=120,
        char_max=150,
        company_evidence_cards=[
            {"theme": "事業理解", "claim": "成長領域への投資を進める", "excerpt": "新たな事業機会を広げる"}
        ],
        has_rag=True,
        allowed_user_facts=[{"source": "current_answer", "text": "研究で仮説検証を重ねた。"}],
        role_name="総合職",
        grounding_mode="company_general",
    )

    assert "【requiredテンプレの型】" in system_prompt
    assert "120字未満で終えない" in system_prompt
    assert "1文目で貴社を志望する理由の核を言い切る" in system_prompt


def test_rewrite_prompt_uses_400_char_target_window() -> None:
    answer = "研究で培った分析力を、事業と技術をつなぐ役割で生かしたい。"
    system_prompt, _ = build_template_rewrite_prompt(
        template_type="role_course_reason",
        company_name="三菱商事",
        industry="総合商社",
        question="デジタル企画コースを選んだ理由を400字以内で教えてください。",
        answer=answer,
        char_min=390,
        char_max=400,
        company_evidence_cards=[
            {"theme": "役割理解", "claim": "事業と実装をつなぐ", "excerpt": "構想を前に進める"}
        ],
        has_rag=True,
        allowed_user_facts=[{"source": "current_answer", "text": "研究で培った分析力を生かしたい。"}],
        role_name="デジタル企画",
        grounding_mode="role_grounded",
    )

    expected_window = _format_target_char_window(
        390,
        400,
        original_len=len(answer),
    )
    assert "strict受理帯: 390字〜400字" in system_prompt
    assert f"今回の内部目標帯: {expected_window}" in system_prompt


def test_rewrite_prompt_uses_tighter_target_window_on_under_min_recovery() -> None:
    answer = "研究で培った分析力を、事業と技術をつなぐ役割で生かしたい。"
    system_prompt, _ = build_template_rewrite_prompt(
        template_type="role_course_reason",
        company_name="三菱商事",
        industry="総合商社",
        question="デジタル企画コースを選んだ理由を400字以内で教えてください。",
        answer=answer,
        char_min=390,
        char_max=400,
        company_evidence_cards=[
            {"theme": "役割理解", "claim": "事業と実装をつなぐ", "excerpt": "構想を前に進める"}
        ],
        has_rag=True,
        allowed_user_facts=[{"source": "current_answer", "text": "研究で培った分析力を生かしたい。"}],
        role_name="デジタル企画",
        grounding_mode="role_grounded",
        length_control_mode="under_min_recovery",
        length_shortfall=22,
    )

    expected_window = _format_target_char_window(
        390,
        400,
        stage="under_min_recovery",
        original_len=len(answer),
        llm_model=None,
    )
    assert f"今回の内部目標帯: {expected_window}" in system_prompt


def test_target_window_biases_openai_mini_higher_for_short_answers() -> None:
    answer = "幅広い事業に関わり、自分の視野を広げたい。"

    mini_window = _format_target_char_window(
        72,
        140,
        original_len=len(answer),
        llm_model="gpt-5.4-mini",
    )
    full_window = _format_target_char_window(
        72,
        140,
        original_len=len(answer),
        llm_model="gpt-5.4",
    )
    claude_window = _format_target_char_window(
        72,
        140,
        original_len=len(answer),
        llm_model="claude-sonnet-4-6",
    )

    assert mini_window == "137字〜140字"
    assert full_window == "134字〜140字"
    assert claude_window == "132字〜140字"


def test_rewrite_prompt_includes_length_focus_max_guidance() -> None:
    system_prompt, _ = build_template_rewrite_prompt(
        template_type="company_motivation",
        company_name="KPMG",
        industry="コンサル",
        question="志望理由を400字以内で教えてください。",
        answer="研究経験を価値へつなげたい。",
        char_min=390,
        char_max=400,
        company_evidence_cards=[
            {"theme": "事業理解", "claim": "変革支援を重視する", "excerpt": "価値変革を支援する"}
        ],
        has_rag=True,
        allowed_user_facts=[{"source": "current_answer", "text": "研究経験を価値へつなげたい。"}],
        grounding_mode="company_general",
        focus_mode="length_focus_max",
    )

    assert "【今回の修正フォーカス】" in system_prompt
    assert "削る" in system_prompt
    assert "最大字数" in system_prompt


def test_short_answer_guidance_covers_self_pr_structure() -> None:
    system_prompt, _ = build_template_rewrite_prompt(
        template_type="self_pr",
        company_name="三菱商事",
        industry="総合商社",
        question="あなたの強みを180字以内で教えてください。",
        answer="複雑な状況でも論点を整理し、周囲を巻き込みながら前に進める力がある。",
        char_min=160,
        char_max=180,
        company_evidence_cards=[
            {"theme": "働き方", "claim": "周囲を巻き込みながら前進させる", "excerpt": "現場で価値を生む"}
        ],
        has_rag=True,
        allowed_user_facts=[{"source": "current_answer", "text": "論点整理と巻き込みが強み。"}],
        grounding_mode="company_general",
    )

    assert "1文目で強みの核" in system_prompt
    assert "2文目で根拠経験" in system_prompt
    assert "3文目で仕事や企業との接点" in system_prompt


def test_required_short_answer_guidance_avoids_over_compression_in_150_to_220_band() -> None:
    system_prompt, _ = build_template_rewrite_prompt(
        template_type="company_motivation",
        company_name="三菱商事",
        industry="総合商社",
        question="三菱商事を志望する理由を200字以内で教えてください。",
        answer="研究で複数の仮説を比較し、価値につながる打ち手を考えてきた。",
        char_min=150,
        char_max=200,
        company_evidence_cards=[
            {
                "theme": "事業理解",
                "claim": "幅広い事業領域で価値創出を進める",
                "excerpt": "現場で学びながら社会課題に向き合う",
            }
        ],
        has_rag=True,
        allowed_user_facts=[{"source": "current_answer", "text": "研究で複数の仮説を比較した。"}],
        role_name="総合職",
        grounding_mode="company_general",
    )

    assert "3〜4文で構成する" in system_prompt
    assert "1〜2文まで補う" in system_prompt
    assert "企業接点と貢献の両方を残す" in system_prompt
