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
        improvement_points=[
            {
                "issue": "企業接続が浅い",
                "suggestion": "事業理解と自分の経験を一本でつなぐ",
            }
        ],
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
        improvement_points=[
            {
                "issue": "企業接続が浅い",
                "suggestion": "事業理解と自分の経験を一本でつなぐ",
            }
        ],
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
    assert "研究" in user_prompt


def test_required_length_fix_prompt_stays_minimal_and_bridge_only() -> None:
    system_prompt, user_prompt = build_template_length_fix_prompt(
        template_type="role_course_reason",
        current_text="研究で培った分析力を生かしたい。",
        char_min=180,
        char_max=260,
        fix_mode="under_min",
        length_control_mode="under_min_recovery",
    )

    assert "既にある経験・職種・企業接点" in system_prompt
    assert "1文まで足し" in system_prompt
    assert "新しい経験・役割・成果・数字・企業施策を足さない" in system_prompt
    assert "研究で培った分析力を生かしたい。" in user_prompt


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
        improvement_points=[{"issue": "企業接続が浅い", "suggestion": "事業理解と自分の経験を一本でつなぐ"}],
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
        improvement_points=[{"issue": "職種接続が浅い", "suggestion": "役割理解を最後までつなぐ"}],
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
    system_prompt, _ = build_template_rewrite_prompt(
        template_type="role_course_reason",
        company_name="三菱商事",
        industry="総合商社",
        question="デジタル企画コースを選んだ理由を400字以内で教えてください。",
        answer="研究で培った分析力を、事業と技術をつなぐ役割で生かしたい。",
        char_min=390,
        char_max=400,
        company_evidence_cards=[
            {"theme": "役割理解", "claim": "事業と実装をつなぐ", "excerpt": "構想を前に進める"}
        ],
        has_rag=True,
        improvement_points=[{"issue": "職種接続が浅い", "suggestion": "役割理解を最後までつなぐ"}],
        allowed_user_facts=[{"source": "current_answer", "text": "研究で培った分析力を生かしたい。"}],
        role_name="デジタル企画",
        grounding_mode="role_grounded",
        length_control_mode="under_min_recovery",
        length_shortfall=22,
    )

    assert "今回の内部目標帯: 397字〜400字" in system_prompt


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
        improvement_points=[{"issue": "強みの活かし方が浅い", "suggestion": "仕事での活かし方を最後に置く"}],
        allowed_user_facts=[{"source": "current_answer", "text": "論点整理と巻き込みが強み。"}],
        grounding_mode="company_general",
    )

    assert "1文目で強みの核" in system_prompt
    assert "2文目で根拠経験" in system_prompt
    assert "3文目で仕事や企業との接点" in system_prompt
