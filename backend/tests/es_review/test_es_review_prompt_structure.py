from __future__ import annotations

import pytest

from app.prompts.es_templates import (
    TEMPLATE_DEFS,
    _GLOBAL_CONCLUSION_FIRST_RULES,
    _GLOBAL_CONCLUSION_FIRST_RULES_FALLBACK,
    _build_contextual_rules,
    _format_company_guidance,
    _format_user_fact_guidance,
    _format_target_char_window,
    build_template_fallback_rewrite_prompt,
    build_template_length_fix_prompt,
    build_template_rewrite_prompt,
)


@pytest.mark.parametrize("template_type", sorted(TEMPLATE_DEFS.keys()))
def test_template_defs_expose_common_spec_fields(template_type: str) -> None:
    template_def = TEMPLATE_DEFS[template_type]

    for key in (
        "purpose",
        "required_elements",
        "anti_patterns",
        "recommended_structure",
        "evaluation_checks",
        "retry_guidance",
        "company_usage",
        "fact_priority",
    ):
        assert key in template_def

    assert template_def["required_elements"]
    assert template_def["anti_patterns"]
    assert template_def["recommended_structure"]
    assert template_def["evaluation_checks"]


def test_rewrite_prompt_renders_required_elements_and_anti_patterns_from_template_spec(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    company_spec = dict(TEMPLATE_DEFS["company_motivation"])
    monkeypatch.setitem(
        TEMPLATE_DEFS,
        "company_motivation",
        {
            **company_spec,
            "required_elements": ["検証用必須要素", *list(company_spec.get("required_elements", []))],
            "anti_patterns": ["検証用禁止表現", *list(company_spec.get("anti_patterns", []))],
        },
    )

    system_prompt, _ = build_template_rewrite_prompt(
        template_type="company_motivation",
        company_name="三菱商事",
        industry="総合商社",
        question="三菱商事を志望する理由を教えてください。",
        answer="研究で仮説検証を重ねた経験を、事業を動かす仕事で生かしたい。",
        char_min=180,
        char_max=260,
        company_evidence_cards=[
            {"theme": "事業理解", "claim": "成長領域への投資を進める", "excerpt": "新たな事業機会を広げる"}
        ],
        has_rag=True,
        allowed_user_facts=[{"source": "current_answer", "text": "研究で仮説検証を重ねた。"}],
        role_name="総合職",
        grounding_mode="company_general",
    )

    assert "【設問で落としてはいけない要素】" in system_prompt
    assert "- 検証用必須要素" in system_prompt
    assert "【避けるパターン】" in system_prompt
    assert "- 検証用禁止表現" in system_prompt


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


def test_contextual_rules_are_grouped_by_priority() -> None:
    rules = _build_contextual_rules(
        template_type="company_motivation",
        char_max=260,
        grounding_mode="company_general",
    )

    assert "【MUST（絶対守る）】" in rules
    assert "【SHOULD（できる限り）】" in rules
    assert "【WATCH（注意）】" in rules
    assert "ユーザーの元回答に含まれる数値・固有名詞" in rules
    assert "関係者を巻き込みながら" in rules
    assert "- 指定の字数下限を下回る改善案は再検証で弾かれる" in rules


def test_user_fact_guidance_uses_fact_weaving_rules() -> None:
    guidance = _format_user_fact_guidance(
        [{"source": "current_answer", "text": "3人チームで整理した"}],
        template_type="self_pr",
        char_max=260,
    )

    assert "<fact_weaving_rules>" in guidance
    assert "数値・固有名詞" in guidance
    assert "2文目または3文目の主語・目的語として使う" in guidance
    assert "推定や敷衍をしない" in guidance
    assert "情報が足りない場合は一般化して書く" not in guidance


def test_company_guidance_marks_primary_card_and_reference_cards() -> None:
    guidance = _format_company_guidance(
        company_evidence_cards=[
            {
                "theme": "事業理解",
                "normalized_axis": "business_characteristics",
                "normalized_summary": "事業や提供価値の特徴としては、成長領域への投資を進める",
                "claim": "成長領域への投資を進める",
                "excerpt": "新たな事業機会を広げる",
                "is_primary": True,
            },
            {
                "theme": "価値観",
                "normalized_axis": "value_orientation",
                "normalized_summary": "価値観・重視姿勢としては、顧客起点を重視する",
                "claim": "顧客起点を重視する",
                "excerpt": "意思決定の軸に据える",
            },
        ],
        has_rag=True,
        grounding_mode="company_general",
        requires_company_rag=True,
        company_grounding="required",
        generic_role_mode=False,
        evidence_coverage_level="partial",
        template_type="company_motivation",
    )

    assert "PRIMARY" in guidance
    assert "参考" in guidance
    assert "PRIMARY カードの方向性だけを1文で使い" in guidance
    assert "企業接点の書き方" in guidance


@pytest.mark.parametrize(
    ("template_type", "question", "answer", "expected_line"),
    [
        (
            "gakuchika",
            "学生時代に力を入れたことを教えてください。",
            "ゼミで進行改善に取り組んだ。",
            "取り組みの核",
        ),
        (
            "self_pr",
            "自己PRを教えてください。",
            "私の強みは、周囲を巻き込みながらやり切る力だ。",
            "強みの核",
        ),
        (
            "work_values",
            "働くうえで大切にしている価値観を教えてください。",
            "私が大切にしているのは、相手の状況を踏まえて動く姿勢だ。",
            "価値観の核",
        ),
    ],
)
def test_rewrite_prompt_includes_new_playbooks_for_core_self_templates(
    template_type: str,
    question: str,
    answer: str,
    expected_line: str,
) -> None:
    system_prompt, _ = build_template_rewrite_prompt(
        template_type=template_type,
        company_name=None,
        industry=None,
        question=question,
        answer=answer,
        char_min=180,
        char_max=240,
        company_evidence_cards=[],
        has_rag=False,
        allowed_user_facts=[{"source": "current_answer", "text": answer}],
        grounding_mode="none",
    )

    assert expected_line in system_prompt


def test_rewrite_prompt_keeps_core_constraints_when_structural_patterns_v2_are_present() -> None:
    system_prompt, _ = build_template_rewrite_prompt(
        template_type="gakuchika",
        company_name=None,
        industry=None,
        question="学生時代に力を入れたことを教えてください。",
        answer="ゼミで進行改善に取り組み、共有の型を見直した。",
        char_min=250,
        char_max=320,
        company_evidence_cards=[],
        has_rag=False,
        allowed_user_facts=[{"source": "current_answer", "text": "ゼミで進行改善に取り組んだ。"}],
        grounding_mode="none",
        reference_quality_block=(
            "【参考ESから抽出した構成パターン】\n"
            "- 冒頭傾向: 結論先行が多い（75%）\n"
            "- 構成タイプ: STAR順が多い（75%）\n"
            "- 締め傾向: 成果で終える例が多い（75%）\n"
            "- 配分傾向: 冒頭短め・中盤厚め・締め短め\n"
            "- 構成パターンは論点順の参考に留め、既存の骨子や事実より優先しない"
        ),
    )

    assert "<constraints>" in system_prompt
    assert "<length_policy>" in system_prompt
    assert "【参考ESから抽出した構成パターン】" in system_prompt
    assert "【設問で落としてはいけない要素】" in system_prompt


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

    assert mini_window == "135字〜140字"  # gap拡大 (short:2→4) により目標下限が下がった
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


# ---------------------------------------------------------------------------
# 施策 8: Contextual style rules tests
# ---------------------------------------------------------------------------


def test_contextual_rules_gakuchika_excludes_company_rules() -> None:
    """Gakuchika (grounding_mode=none) should have the fewest rules."""
    system_prompt, _ = build_template_rewrite_prompt(
        template_type="gakuchika",
        company_name=None,
        industry=None,
        question="学生時代に力を入れたことを教えてください。",
        answer="ゼミで進行改善に取り組んだ。",
        char_min=180,
        char_max=240,
        company_evidence_cards=[],
        has_rag=False,
        allowed_user_facts=[{"source": "current_answer", "text": "ゼミで進行改善に取り組んだ。"}],
        grounding_mode="none",
    )
    # core_style block should exist
    assert "<core_style>" in system_prompt
    assert "結論ファースト" in system_prompt


def test_contextual_rules_short_band_includes_short_rule() -> None:
    """Short band (char_max<=220) should include short-specific rule."""
    system_prompt, _ = build_template_rewrite_prompt(
        template_type="basic",
        company_name="テスト株式会社",
        industry=None,
        question="志望動機を教えてください。",
        answer="事業に関心がある。",
        char_min=100,
        char_max=200,
        company_evidence_cards=[],
        has_rag=False,
        allowed_user_facts=[{"source": "current_answer", "text": "事業に関心がある。"}],
        grounding_mode="company_general",
    )
    assert "短い字数制限" in system_prompt or "凝縮" in system_prompt


def test_contextual_rules_basic_medium_excludes_short_rule() -> None:
    """Medium band should NOT include short-only rules."""
    system_prompt, _ = build_template_rewrite_prompt(
        template_type="basic",
        company_name="テスト株式会社",
        industry=None,
        question="志望動機を教えてください。",
        answer="事業に関心がある。",
        char_min=250,
        char_max=400,
        company_evidence_cards=[],
        has_rag=False,
        allowed_user_facts=[{"source": "current_answer", "text": "事業に関心がある。"}],
        grounding_mode="company_general",
    )
    # Should have mid_long rules but NOT short_only
    assert "要約しすぎず" in system_prompt
    assert "短い字数制限" not in system_prompt


def test_prose_style_present_for_long_answer() -> None:
    """char_max=400 should include <prose_style> block."""
    system_prompt, _ = build_template_rewrite_prompt(
        template_type="company_motivation",
        company_name="三菱商事",
        industry="総合商社",
        question="志望理由を400字以内で教えてください。",
        answer="事業を動かす仕事がしたい。",
        char_min=300,
        char_max=400,
        company_evidence_cards=[],
        has_rag=False,
        allowed_user_facts=[{"source": "current_answer", "text": "事業を動かす仕事がしたい。"}],
        grounding_mode="company_general",
    )
    assert "<prose_style>" in system_prompt


def test_prose_style_absent_for_short_answer() -> None:
    """char_max=200 should NOT include <prose_style> block."""
    system_prompt, _ = build_template_rewrite_prompt(
        template_type="company_motivation",
        company_name="三菱商事",
        industry="総合商社",
        question="志望理由を200字以内で教えてください。",
        answer="事業を動かす仕事がしたい。",
        char_min=100,
        char_max=200,
        company_evidence_cards=[],
        has_rag=False,
        allowed_user_facts=[{"source": "current_answer", "text": "事業を動かす仕事がしたい。"}],
        grounding_mode="company_general",
    )
    assert "<prose_style>" not in system_prompt


def test_output_contract_contains_no_linebreak_rule() -> None:
    """Output contract should prohibit line breaks."""
    for builder_fn in [build_template_rewrite_prompt, build_template_fallback_rewrite_prompt]:
        system_prompt, _ = builder_fn(
            template_type="company_motivation",
            company_name="三菱商事",
            industry="総合商社",
            question="志望理由を教えてください。",
            answer="事業を動かす仕事がしたい。",
            char_min=200,
            char_max=400,
            company_evidence_cards=[],
            has_rag=False,
            allowed_user_facts=[{"source": "current_answer", "text": "事業を動かす仕事がしたい。"}],
            grounding_mode="company_general",
        )
        assert "改行" in system_prompt or "空行" in system_prompt


def test_constraints_ending_variety() -> None:
    """Constraints should include the 2-sentence consecutive ending prohibition."""
    system_prompt, _ = build_template_rewrite_prompt(
        template_type="basic",
        company_name="テスト株式会社",
        industry=None,
        question="志望動機を教えてください。",
        answer="事業に関心がある。",
        char_min=200,
        char_max=400,
        company_evidence_cards=[],
        has_rag=False,
        allowed_user_facts=[{"source": "current_answer", "text": "事業に関心がある。"}],
        grounding_mode="company_general",
    )
    assert "2文連続" in system_prompt


def test_global_rules_include_flow_and_linebreak() -> None:
    """_GLOBAL_CONCLUSION_FIRST_RULES should contain line-break prohibition, ending variety, and flow rules."""
    assert "結論ファースト" in _GLOBAL_CONCLUSION_FIRST_RULES
    assert "抽象動詞" in _GLOBAL_CONCLUSION_FIRST_RULES
    assert "LLM特有フレーズ" in _GLOBAL_CONCLUSION_FIRST_RULES


@pytest.mark.parametrize(
    "builder_fn",
    [build_template_rewrite_prompt, build_template_fallback_rewrite_prompt],
)
def test_constraints_require_opening_conclusion_with_20_to_45_chars(builder_fn) -> None:
    system_prompt, _ = builder_fn(
        template_type="company_motivation",
        company_name="三菱商事",
        industry="総合商社",
        question="三菱商事を志望する理由を教えてください。",
        answer="研究で仮説検証を重ねた経験を、事業を動かす仕事で生かしたい。",
        char_min=220,
        char_max=280,
        company_evidence_cards=[],
        has_rag=False,
        allowed_user_facts=[{"source": "current_answer", "text": "研究で仮説検証を重ねた。"}],
        grounding_mode="company_general",
    )
    assert "20〜45字" in system_prompt


def test_global_fallback_rules_require_opening_conclusion_with_20_to_45_chars() -> None:
    assert "20〜45字" in _GLOBAL_CONCLUSION_FIRST_RULES_FALLBACK


def test_assistive_grounding_limits_company_name_mentions() -> None:
    system_prompt, _ = build_template_rewrite_prompt(
        template_type="self_pr",
        company_name="三菱商事",
        industry="総合商社",
        question="自己PRを教えてください。",
        answer="研究で仮説検証を重ねた経験を、仕事で生かしたい。",
        char_min=220,
        char_max=280,
        company_evidence_cards=[],
        has_rag=False,
        allowed_user_facts=[{"source": "current_answer", "text": "研究で仮説検証を重ねた。"}],
        grounding_mode="company_light",
        company_grounding_override="assistive",
    )
    assert "本文全体で2回まで" in system_prompt
    assert "貴社・御社" in system_prompt


def test_required_grounding_limits_company_name_to_once_then_honorific() -> None:
    system_prompt, _ = build_template_rewrite_prompt(
        template_type="company_motivation",
        company_name="三菱商事",
        industry="総合商社",
        question="三菱商事を志望する理由を教えてください。",
        answer="研究で仮説検証を重ねた経験を、事業を動かす仕事で生かしたい。",
        char_min=220,
        char_max=280,
        company_evidence_cards=[],
        has_rag=False,
        allowed_user_facts=[{"source": "current_answer", "text": "研究で仮説検証を重ねた。"}],
        grounding_mode="company_general",
    )
    assert "本文中で1回まで" in system_prompt
    assert "2回目以降は「貴社」" in system_prompt


def test_intern_reason_prompt_includes_proper_noun_policy() -> None:
    system_prompt, _ = build_template_rewrite_prompt(
        template_type="intern_reason",
        company_name="三井物産",
        industry="総合商社",
        question="インターンに参加したい理由を教えてください。",
        answer="研究で培った分析力を実務で試したい。",
        char_min=160,
        char_max=220,
        company_evidence_cards=[],
        has_rag=False,
        allowed_user_facts=[{"source": "current_answer", "text": "研究で培った分析力を実務で試したい。"}],
        role_name="Business Intelligence",
        intern_name="Business Intelligence Internship",
        grounding_mode="role_grounded",
    )
    assert "<proper_noun_policy>" in system_prompt
    assert "本インターンシップ" in system_prompt


def test_gakuchika_prompt_does_not_include_proper_noun_policy() -> None:
    system_prompt, _ = build_template_rewrite_prompt(
        template_type="gakuchika",
        company_name=None,
        industry=None,
        question="学生時代に力を入れたことを教えてください。",
        answer="学園祭運営の改善に取り組んだ。",
        char_min=220,
        char_max=320,
        company_evidence_cards=[],
        has_rag=False,
        allowed_user_facts=[{"source": "current_answer", "text": "学園祭運営の改善に取り組んだ。"}],
        grounding_mode="none",
    )
    assert "<proper_noun_policy>" not in system_prompt


@pytest.mark.parametrize("template_type", ["self_pr", "work_values"])
def test_template_specific_quantify_rules_are_only_in_self_pr_and_work_values(
    template_type: str,
) -> None:
    system_prompt, _ = build_template_rewrite_prompt(
        template_type=template_type,
        company_name=None,
        industry=None,
        question="設問に回答してください。",
        answer="周囲を巻き込みながら改善を進めた。",
        char_min=220,
        char_max=320,
        company_evidence_cards=[],
        has_rag=False,
        allowed_user_facts=[{"source": "current_answer", "text": "周囲を巻き込みながら改善を進めた。"}],
        grounding_mode="none",
    )
    assert "行動の対象・範囲・頻度・比較を具体化" in system_prompt
    assert "元回答にない数字は作らない" in system_prompt


def test_basic_prompt_does_not_include_quantify_rule() -> None:
    system_prompt, _ = build_template_rewrite_prompt(
        template_type="basic",
        company_name=None,
        industry=None,
        question="設問に回答してください。",
        answer="周囲を巻き込みながら改善を進めた。",
        char_min=220,
        char_max=320,
        company_evidence_cards=[],
        has_rag=False,
        allowed_user_facts=[{"source": "current_answer", "text": "周囲を巻き込みながら改善を進めた。"}],
        grounding_mode="none",
    )
    assert "行動の対象・範囲・頻度・比較を具体化" not in system_prompt


def test_gakuchika_prompt_includes_structure_rule_and_playbook() -> None:
    system_prompt, _ = build_template_rewrite_prompt(
        template_type="gakuchika",
        company_name=None,
        industry=None,
        question="学生時代に力を入れたことを教えてください。",
        answer="学園祭運営の改善に取り組んだ。",
        char_min=250,
        char_max=320,
        company_evidence_cards=[],
        has_rag=False,
        allowed_user_facts=[{"source": "current_answer", "text": "学園祭運営の改善に取り組んだ。"}],
        grounding_mode="none",
    )
    assert "まず / 次に" in system_prompt or "(1)(2)" in system_prompt
    assert "【requiredテンプレの型】" in system_prompt


def test_retry_guidance_has_quantify_and_structure_entries() -> None:
    assert "quantify" in TEMPLATE_DEFS["self_pr"]["retry_guidance"]
    assert "quantify" in TEMPLATE_DEFS["work_values"]["retry_guidance"]
    assert "structure" in TEMPLATE_DEFS["gakuchika"]["retry_guidance"]


def test_length_fix_prompt_supports_quantify_focus() -> None:
    system_prompt, _ = build_template_length_fix_prompt(
        template_type="self_pr",
        current_text="周囲を巻き込みながら改善を進めた。",
        char_min=220,
        char_max=320,
        fix_mode="under_min",
        focus_modes=["quantify_focus"],
    )
    assert "人数・期間・件数・比率" in system_prompt or "数値" in system_prompt


# ---------------------------------------------------------------------------
# 施策 7: CAPEL-inspired self-count instruction tests
# ---------------------------------------------------------------------------


def test_self_count_instruction_present() -> None:
    """Self-count instruction should appear when char limits are specified."""
    system_prompt, _ = build_template_rewrite_prompt(
        template_type="basic",
        company_name="テスト株式会社",
        industry=None,
        question="志望動機を教えてください。",
        answer="事業に関心がある。",
        char_min=200,
        char_max=400,
        company_evidence_cards=[],
        has_rag=False,
        allowed_user_facts=[{"source": "current_answer", "text": "事業に関心がある。"}],
        grounding_mode="company_general",
    )
    assert "文字数" in system_prompt and (
        "セルフチェック" in system_prompt or "数え" in system_prompt
    )


def test_self_count_absent_without_limits() -> None:
    """Self-count should NOT appear when no char limits specified."""
    system_prompt, _ = build_template_rewrite_prompt(
        template_type="basic",
        company_name="テスト株式会社",
        industry=None,
        question="志望動機を教えてください。",
        answer="事業に関心がある。",
        char_min=None,
        char_max=None,
        company_evidence_cards=[],
        has_rag=False,
        allowed_user_facts=[{"source": "current_answer", "text": "事業に関心がある。"}],
        grounding_mode="company_general",
    )
    assert "セルフチェック" not in system_prompt


def test_length_fix_includes_count_adjust() -> None:
    """Length-fix prompt with GPT model should include Draft->Count->Adjust pattern."""
    system_prompt, _ = build_template_length_fix_prompt(
        template_type="basic",
        current_text="短い回答。",
        char_min=200,
        char_max=400,
        fix_mode="under_min",
        llm_model="gpt-4o",
    )
    assert "Draft" in system_prompt and "Adjust" in system_prompt


def test_gemini_paragraph_allocation() -> None:
    """Gemini model with medium+ band should include paragraph allocation."""
    system_prompt, _ = build_template_rewrite_prompt(
        template_type="basic",
        company_name="テスト株式会社",
        industry=None,
        question="志望動機を教えてください。",
        answer="事業に関心がある。",
        char_min=300,
        char_max=400,
        company_evidence_cards=[],
        has_rag=False,
        allowed_user_facts=[{"source": "current_answer", "text": "事業に関心がある。"}],
        grounding_mode="company_general",
        llm_model="gemini-2.0-flash",
    )
    assert "段落配分" in system_prompt
