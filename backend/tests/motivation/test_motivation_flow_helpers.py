from app.routers.motivation import (
    _build_evidence_cards_from_sources,
    _build_question_messages,
    _build_stage_specific_suggestion_options,
    _build_stage_status,
    _capture_answer_into_context,
    _ensure_distinct_question,
    _get_next_stage,
    _repair_generated_question_for_response,
    _rotate_question_focus_for_reask,
    _validate_or_repair_question,
)


def test_stage_specific_options_for_company_reason_anchor_to_company_and_role():
    options = _build_stage_specific_suggestion_options(
        stage="company_reason",
        question="この企業のどこに魅力を感じますか？",
        company_name="株式会社テスト",
        company_context="顧客課題に向き合うDX支援と業務改革を進める。企画職や営業職が連携して提案する。",
        company_sources=[
            {
                "source_id": "S1",
                "source_url": "https://example.com/jobs",
                "content_type": "new_grad_recruitment",
                "title": "募集職種",
                "excerpt": "企画職や営業職が連携して提案する",
            }
        ],
        gakuchika_context=[
            {
                "title": "学生団体の運営",
                "strengths": ["巻き込み力"],
                "action_text": "企画を主導",
                "result_text": "参加率向上",
                "numbers": ["30%改善"],
            }
        ],
        profile_context={
            "target_job_types": ["企画職"],
            "target_industries": ["IT・通信"],
        },
        application_job_candidates=["企画職"],
        company_role_candidates=["企画職", "営業職"],
        company_work_candidates=["DX支援", "業務改革の提案"],
        conversation_context={"selectedRole": "企画職", "questionStage": "company_reason"},
    )

    assert 2 <= len(options) <= 4
    assert any("企画職" in option.label for option in options)
    assert all("Q4" not in option.label for option in options)
    assert len({option.label for option in options}) == len(options)
    assert all(option.intent == "company_reason" for option in options)


def test_stage_specific_options_for_industry_reason_return_direct_reason_sentences():
    options = _build_stage_specific_suggestion_options(
        stage="industry_reason",
        question="IT・通信業界を志望する理由を1つ教えてください。",
        company_name="株式会社テスト",
        company_context="顧客課題に向き合うDX支援と業務改革を進める。",
        company_sources=[{"source_id": "S1", "source_url": "https://example.com/jobs"}],
        gakuchika_context=[{"title": "学生団体の運営", "strengths": ["巻き込み力"]}],
        profile_context={"target_job_types": ["企画職"], "target_industries": ["IT・通信", "金融"]},
        application_job_candidates=["企画職"],
        company_role_candidates=["企画職"],
        company_work_candidates=["DX支援", "業務改革の提案"],
        conversation_context={
            "selectedIndustry": "IT・通信",
            "selectedRole": "企画職",
            "questionStage": "industry_reason",
        },
        question_focus="industry_axis",
    )

    assert 1 <= len(options) <= 4
    assert all("業界" in option.label or "IT・通信" in option.label or "産業" in option.label for option in options)
    assert all(option.intent == "industry_reason" for option in options)


def test_stage_specific_options_for_desired_work_prioritize_selected_role():
    options = _build_stage_specific_suggestion_options(
        stage="desired_work",
        question="入社後にどんな仕事に挑戦したいですか？",
        company_name="株式会社テスト",
        company_context="顧客課題に向き合うDX支援と業務改革を進める。",
        company_sources=None,
        gakuchika_context=[
            {
                "title": "学生団体の運営",
                "strengths": ["巻き込み力"],
            }
        ],
        profile_context={"target_job_types": ["企画職"], "target_industries": ["IT・通信"]},
        application_job_candidates=["企画職"],
        company_role_candidates=["企画職"],
        company_work_candidates=["DX支援", "業務改革の提案"],
        conversation_context={"selectedRole": "企画職", "questionStage": "desired_work"},
    )

    assert 2 <= len(options) <= 4
    assert any(option.label.startswith("入社後は企画職として") for option in options)
    assert all("DX支援" not in option.label and "業務改革" not in option.label for option in options)
    assert all(option.isTentative for option in options)


def test_stage_specific_options_for_company_reason_why_now_avoid_generic_labels():
    options = _build_stage_specific_suggestion_options(
        stage="company_reason",
        question="なぜ今その関心が高まったのですか？",
        company_name="株式会社テスト",
        company_context="顧客課題に向き合うDX支援と業務改革を進める。",
        company_sources=[{"source_id": "S1", "source_url": "https://example.com/jobs"}],
        gakuchika_context=[{"title": "学生団体の運営", "strengths": ["巻き込み力"]}],
        profile_context={"target_job_types": ["企画職"]},
        application_job_candidates=["企画職"],
        company_role_candidates=["企画職"],
        company_work_candidates=["DX支援", "業務改革の提案"],
        conversation_context={"selectedRole": "企画職", "questionStage": "company_reason"},
    )

    assert 2 <= len(options) <= 4
    assert any("関心が強まり" in option.label or "志望度が高まった" in option.label or "惹かれたため" in option.label for option in options)
    assert all("成長したい" not in option.label for option in options)


def test_stage_specific_options_for_company_reason_return_up_to_four_distinct_answers():
    options = _build_stage_specific_suggestion_options(
        stage="company_reason",
        question="東京海上日動のどんな点が、ご自身の就活軸と重なると感じますか？",
        company_name="東京海上日動火災保険",
        company_context="企業や社会の挑戦を支えるリスクソリューションを提供する。営業職やコンサルティング営業が顧客に伴走する。",
        company_sources=[{"source_id": "S1", "source_url": "https://example.com/jobs"}],
        gakuchika_context=[{"title": "学生団体の運営", "strengths": ["巻き込み力"]}],
        profile_context={"target_job_types": ["営業 / コンサルティング営業"], "target_industries": ["保険", "金融"]},
        application_job_candidates=["営業 / コンサルティング営業"],
        company_role_candidates=["営業 / コンサルティング営業"],
        company_work_candidates=["リスクソリューションの提案"],
        conversation_context={
            "selectedIndustry": "保険",
            "industryReason": "不確実性を捉えて意思決定を支えたいからです。",
            "selectedRole": "営業 / コンサルティング営業",
            "questionStage": "company_reason",
            "confirmedFacts": {
                "industry_reason_confirmed": True,
                "company_reason_confirmed": False,
                "desired_work_confirmed": False,
                "origin_experience_confirmed": False,
                "fit_connection_confirmed": False,
                "differentiation_confirmed": False,
            },
        },
        question_focus="axis_match",
    )

    assert 2 <= len(options) <= 4
    assert len({option.label for option in options}) == len(options)
    assert all("1文で答える" not in option.label for option in options)


def test_stage_specific_options_for_industry_choice_question_stay_on_question():
    options = _build_stage_specific_suggestion_options(
        stage="company_reason",
        question="なぜ商社という選択肢が出てきたのですか？",
        company_name="三菱商事",
        company_context="複数の産業を横断しながら事業投資とDX支援を進める。",
        company_sources=[{"source_id": "S1", "source_url": "https://example.com/recruit"}],
        gakuchika_context=[{"title": "サークル運営", "strengths": ["巻き込み力"]}],
        profile_context={"target_job_types": ["総合職"], "target_industries": ["IT・通信", "金融"]},
        application_job_candidates=["総合職"],
        company_role_candidates=["総合職"],
        company_work_candidates=["事業投資", "DX支援"],
        conversation_context={"selectedRole": "総合職", "questionStage": "company_reason"},
        question_focus="industry_axis",
    )

    assert 2 <= len(options) <= 4
    assert all(any(keyword in option.label for keyword in ("産業", "横断", "事業", "選択肢", "商社")) for option in options)
    assert all("入社後は" not in option.label for option in options)


def test_stage_specific_options_for_fit_connection_use_captured_desired_work():
    options = _build_stage_specific_suggestion_options(
        stage="fit_connection",
        question="これまでの経験は、その仕事にどうつながりますか？",
        company_name="株式会社テスト",
        company_context="顧客課題に向き合うDX支援と業務改革を進める。",
        company_sources=[{"source_id": "S1", "source_url": "https://example.com/jobs"}],
        gakuchika_context=[{"title": "学生団体の運営", "strengths": ["巻き込み力"]}],
        profile_context={"target_job_types": ["企画職"]},
        application_job_candidates=["企画職"],
        company_role_candidates=["企画職"],
        company_work_candidates=["DX支援", "業務改革の提案"],
        conversation_context={
            "selectedRole": "企画職",
            "desiredWork": "法人顧客への改善提案",
            "questionStage": "fit_connection",
        },
    )

    assert 2 <= len(options) <= 4
    assert any("法人顧客への改善提案" in option.label for option in options)


def test_stage_specific_options_for_desired_work_return_direct_answer_sentences():
    options = _build_stage_specific_suggestion_options(
        stage="desired_work",
        question="入社後にどんな仕事に挑戦したいですか？",
        company_name="株式会社テスト",
        company_context="顧客課題に向き合うDX支援と業務改革を進める。",
        company_sources=[{"source_id": "S1", "source_url": "https://example.com/jobs"}],
        gakuchika_context=[{"title": "学生団体の運営", "strengths": ["巻き込み力"]}],
        profile_context={"target_job_types": ["企画職"]},
        application_job_candidates=["企画職"],
        company_role_candidates=["企画職"],
        company_work_candidates=["DX支援", "業務改革の提案"],
        conversation_context={"selectedRole": "企画職", "questionStage": "desired_work"},
    )

    assert 2 <= len(options) <= 4
    assert all(option.label.startswith("入社後は") for option in options)
    assert all(any(term in option.label for term in ("したい", "挑戦", "担いたい", "向き合いたい", "取り組みたい")) for option in options)
    assert all(option.isTentative for option in options)


def test_stage_specific_options_for_desired_work_can_return_four_distinct_answers():
    options = _build_stage_specific_suggestion_options(
        stage="desired_work",
        question="入社後は、どんな相手や課題に向き合う仕事がしたいですか？",
        company_name="株式会社テスト",
        company_context="顧客課題に向き合うDX支援と業務改革を進める。",
        company_sources=[{"source_id": "S1", "source_url": "https://example.com/jobs"}],
        gakuchika_context=[{"title": "学生団体の運営", "strengths": ["巻き込み力"]}],
        profile_context={"target_job_types": ["企画職"]},
        application_job_candidates=["企画職"],
        company_role_candidates=["企画職"],
        company_work_candidates=["DX支援", "業務改革の提案"],
        conversation_context={"selectedRole": "企画職", "questionStage": "desired_work"},
        question_focus="work_image",
    )

    assert 2 <= len(options) <= 4
    assert len({option.label for option in options}) == len(options)
    assert all(option.label.startswith("入社後は") for option in options)


def test_stage_specific_options_filter_out_raw_company_headings_and_copy():
    options = _build_stage_specific_suggestion_options(
        stage="company_reason",
        question="この企業を志望するきっかけは何ですか？",
        company_name="三菱商事",
        company_context=(
            "MCの事業を支え、これからの未来を創る多才・多彩な社員をご紹介します。\n"
            "三菱商事の見出し：Q4：コングロマリットバリュー実現への意気込み\n"
            "総合職として事業投資やDX支援に関われる。"
        ),
        company_sources=[
            {
                "source_id": "S1",
                "source_url": "https://example.com/recruit",
                "content_type": "new_grad_recruitment",
                "title": "社員紹介",
                "excerpt": "MCの事業を支え、これからの未来を創る多才・多彩な社員をご紹介します。",
            }
        ],
        gakuchika_context=[{"title": "サークル活動", "strengths": ["巻き込み力"]}],
        profile_context={"target_job_types": ["総合職"], "target_industries": ["IT・通信", "金融"]},
        application_job_candidates=["総合職"],
        company_role_candidates=["総合職"],
        company_work_candidates=["事業投資", "DX支援"],
        conversation_context={"selectedRole": "総合職", "questionStage": "company_reason"},
    )

    assert 2 <= len(options) <= 4
    assert all("Q4" not in option.label for option in options)
    assert all("ご紹介します" not in option.label for option in options)
    assert all("見出し" not in option.label for option in options)


def test_stage_specific_options_do_not_force_four_when_grounding_is_thin():
    options = _build_stage_specific_suggestion_options(
        stage="company_reason",
        question="この企業を志望する理由は何ですか？",
        company_name="株式会社テスト",
        company_context="（企業情報なし）",
        company_sources=None,
        gakuchika_context=None,
        profile_context={"target_job_types": ["企画職"]},
        application_job_candidates=["企画職"],
        company_role_candidates=None,
        company_work_candidates=None,
        conversation_context={"selectedRole": "企画職", "questionStage": "company_reason"},
    )

    assert 2 <= len(options) <= 4
    assert len({option.label for option in options}) == len(options)


def test_get_next_stage_moves_to_differentiation_for_weakest_element():
    assert _get_next_stage(
        {
            "selectedIndustry": "IT・通信",
            "industryReason": "複数産業の課題に関われるため",
            "selectedRole": "企画職",
            "companyReason": "理由",
            "desiredWork": "やりたい仕事",
            "originExperience": "学生時代に課題整理へ手応えを感じた経験",
        },
        weakest_element="differentiation",
        is_complete=False,
    ) == "fit_connection"


def test_get_next_stage_keeps_fit_connection_when_not_complete():
    assert _get_next_stage(
        {
            "selectedIndustry": "IT・通信",
            "industryReason": "複数産業の課題に関われるため",
            "selectedRole": "企画職",
            "companyReason": "理由",
            "desiredWork": "やりたい仕事",
            "originExperience": "学生時代に課題整理へ手応えを感じた経験",
        },
        weakest_element="self_analysis",
        is_complete=False,
    ) == "fit_connection"


def test_get_next_stage_moves_to_differentiation_after_fit_connection_confirmed():
    assert _get_next_stage(
        {
            "selectedIndustry": "IT・通信",
            "industryReason": "複数産業の課題に関われるため",
            "selectedRole": "企画職",
            "companyReason": "理由",
            "desiredWork": "やりたい仕事",
            "originExperience": "学生時代に課題整理へ手応えを感じた経験",
            "fitConnection": "経験を入社後の課題整理に活かせると考えています。",
        },
        weakest_element="differentiation",
        is_complete=False,
    ) == "differentiation"


def test_get_next_stage_reasks_same_stage_only_once_then_advances():
    assert _get_next_stage(
        {
            "selectedIndustry": "IT・通信",
            "industryReason": "複数産業の課題に関われるため",
            "selectedRole": "企画職",
            "companyReason": "気になります。",
            "questionStage": "company_reason",
            "stageAttemptCount": 0,
            "confirmedFacts": {
                "industry_reason_confirmed": True,
                "company_reason_confirmed": False,
                "desired_work_confirmed": False,
                "origin_experience_confirmed": False,
                "fit_connection_confirmed": False,
                "differentiation_confirmed": False,
            },
        },
        weakest_element="company_understanding",
        is_complete=False,
    ) == "company_reason"

    assert _get_next_stage(
        {
            "selectedIndustry": "IT・通信",
            "industryReason": "複数産業の課題に関われるため",
            "selectedRole": "企画職",
            "companyReason": "気になります。",
            "questionStage": "company_reason",
            "stageAttemptCount": 1,
            "confirmedFacts": {
                "industry_reason_confirmed": True,
                "company_reason_confirmed": False,
                "desired_work_confirmed": False,
                "origin_experience_confirmed": False,
                "fit_connection_confirmed": False,
                "differentiation_confirmed": False,
            },
        },
        weakest_element="company_understanding",
        is_complete=False,
    ) == "desired_work"


def test_get_next_stage_moves_to_origin_experience_before_fit_connection():
    assert _get_next_stage(
        {
            "selectedIndustry": "IT・通信",
            "industryReason": "複数産業の課題に関われるため",
            "selectedRole": "企画職",
            "companyReason": "理由",
            "desiredWork": "法人顧客の業務改善に挑戦したい",
        },
        weakest_element="self_analysis",
        is_complete=False,
    ) == "origin_experience"


def test_get_next_stage_starts_with_industry_reason_when_missing() -> None:
    assert _get_next_stage(
        {"selectedIndustry": "IT・通信", "selectedRole": "企画職"},
        weakest_element="company_understanding",
        is_complete=False,
    ) == "industry_reason"


def test_get_next_stage_reasks_once_before_advancing() -> None:
    assert _get_next_stage(
        {
            "selectedIndustry": "IT・通信",
            "selectedRole": "企画職",
            "questionStage": "company_reason",
            "stageAttemptCount": 0,
            "confirmedFacts": {
                "industry_reason_confirmed": True,
                "company_reason_confirmed": False,
                "desired_work_confirmed": False,
                "origin_experience_confirmed": False,
                "fit_connection_confirmed": False,
                "differentiation_confirmed": False,
            },
        },
        weakest_element="company_understanding",
        is_complete=False,
    ) == "company_reason"


def test_get_next_stage_advances_after_one_reask_when_still_unconfirmed() -> None:
    assert _get_next_stage(
        {
            "selectedIndustry": "IT・通信",
            "selectedRole": "企画職",
            "questionStage": "company_reason",
            "stageAttemptCount": 1,
            "confirmedFacts": {
                "industry_reason_confirmed": True,
                "company_reason_confirmed": False,
                "desired_work_confirmed": False,
                "origin_experience_confirmed": False,
                "fit_connection_confirmed": False,
                "differentiation_confirmed": False,
            },
        },
        weakest_element="company_understanding",
        is_complete=False,
    ) == "desired_work"


def test_build_question_messages_returns_none_for_initial_turn():
    assert _build_question_messages([]) is None


def test_build_evidence_cards_from_sources_includes_links_and_labels():
    cards = _build_evidence_cards_from_sources(
        [
            {
                "source_id": "S1",
                "source_url": "https://example.com/recruit",
                "content_type": "new_grad_recruitment",
                "title": "募集要項",
                "excerpt": "営業職・企画職を募集しています。",
            }
        ]
    )

    assert len(cards) == 1
    assert cards[0].sourceId == "S1"
    assert cards[0].sourceUrl == "https://example.com/recruit"
    assert cards[0].title == "募集要項"
    assert cards[0].relevanceLabel


def test_build_evidence_cards_from_sources_limits_count_and_excerpt_length():
    cards = _build_evidence_cards_from_sources(
        [
            {
                "source_id": f"S{i}",
                "source_url": f"https://example.com/source-{i}",
                "content_type": "new_grad_recruitment",
                "title": f"募集要項 {i}",
                "excerpt": "営業職・企画職を募集しています。" * 8,
            }
            for i in range(1, 6)
        ]
    )

    assert len(cards) == 3
    assert all(len(card.excerpt) <= 84 for card in cards)


def test_validate_or_repair_question_replaces_multi_part_question():
    repaired = _validate_or_repair_question(
        question="なぜこの企業に興味を持ったのですか？また、入社後に何をしたいですか？",
        stage="company_reason",
        company_name="株式会社テスト",
        selected_role="企画職",
        desired_work="DX支援",
        grounded_company_anchor="業務改革",
        gakuchika_episode="学生団体の運営",
        gakuchika_strength="巻き込み力",
    )

    assert repaired == "株式会社テストの業務改革に惹かれた理由を1つ教えてください。"


def test_validate_or_repair_question_replaces_instructional_copy():
    repaired = _validate_or_repair_question(
        question="この企業のどこに惹かれたかを1文で答える",
        stage="company_reason",
        company_name="株式会社テスト",
        selected_role="企画職",
        desired_work="DX支援",
        grounded_company_anchor="業務改革",
        gakuchika_episode="学生団体の運営",
        gakuchika_strength="巻き込み力",
    )

    assert repaired == "株式会社テストの業務改革に惹かれた理由を1つ教えてください。"


def test_validate_or_repair_question_replaces_stage_misaligned_question():
    repaired = _validate_or_repair_question(
        question="この企業の魅力は何ですか？",
        stage="desired_work",
        company_name="株式会社テスト",
        selected_role="企画職",
        desired_work="DX支援",
        grounded_company_anchor="業務改革",
        gakuchika_episode="学生団体の運営",
        gakuchika_strength="巻き込み力",
    )

    assert repaired == "入社後、企画職としてDX支援の中で特に挑戦したいことは何ですか？"


def test_validate_or_repair_question_replaces_instruction_like_copy():
    repaired = _validate_or_repair_question(
        question="この企業のどこに惹かれたかを1文で答える",
        stage="company_reason",
        company_name="株式会社テスト",
        selected_role="企画職",
        desired_work="DX支援",
        grounded_company_anchor="業務改革",
        gakuchika_episode="学生団体の運営",
        gakuchika_strength="巻き込み力",
    )

    assert repaired == "株式会社テストの業務改革に惹かれた理由を1つ教えてください。"


def test_repair_generated_question_rejects_other_company_name():
    repaired = _repair_generated_question_for_response(
        question="堀江篤マテリアルソリューションのDX支援に惹かれた理由を1つ教えてください。",
        stage="company_reason",
        company_name="株式会社テスト",
        company_context="顧客課題に向き合うDX支援と業務改革を進める。",
        company_sources=[{"source_id": "S1", "source_url": "https://example.com/recruit"}],
        gakuchika_context=[{"title": "学生団体の運営", "strengths": ["巻き込み力"]}],
        profile_context={"target_job_types": ["企画職"], "target_industries": ["IT・通信"]},
        application_job_candidates=["企画職"],
        company_role_candidates=["企画職"],
        company_work_candidates=["DX支援"],
        conversation_context={"selectedIndustry": "IT・通信", "selectedRole": "企画職", "questionStage": "company_reason"},
    )

    assert "堀江篤マテリアルソリューション" not in repaired
    assert "株式会社テスト" in repaired


def test_repair_generated_question_rejects_unconfirmed_role_premise():
    repaired = _repair_generated_question_for_response(
        question="弊社の企画職を志望しているのはなんでですか？",
        stage="company_reason",
        company_name="株式会社テスト",
        company_context="顧客課題に向き合うDX支援と業務改革を進める。",
        company_sources=[{"source_id": "S1", "source_url": "https://example.com/recruit"}],
        gakuchika_context=[{"title": "学生団体の運営", "strengths": ["巻き込み力"]}],
        profile_context={"target_job_types": ["企画職"], "target_industries": ["IT・通信"]},
        application_job_candidates=["企画職"],
        company_role_candidates=["企画職"],
        company_work_candidates=["DX支援"],
        conversation_context={
            "selectedIndustry": "IT・通信",
            "selectedRole": "企画職",
            "questionStage": "company_reason",
            "confirmedFacts": {
                "industry_reason_confirmed": True,
                "company_reason_confirmed": False,
                "desired_work_confirmed": False,
                "origin_experience_confirmed": False,
            },
        },
    )

    assert "志望している" not in repaired
    assert "興味を持つとしたら" in repaired


def test_stage_specific_options_do_not_introduce_unconfirmed_role():
    options = _build_stage_specific_suggestion_options(
        stage="desired_work",
        question="入社後にどんな仕事に挑戦したいですか？",
        company_name="株式会社テスト",
        company_context="顧客課題に向き合うDX支援と業務改革を進める。営業職や企画職が連携する。",
        company_sources=[{"source_id": "S1", "source_url": "https://example.com/jobs"}],
        gakuchika_context=[{"title": "学生団体の運営", "strengths": ["巻き込み力"]}],
        profile_context={"target_industries": ["IT・通信"]},
        application_job_candidates=None,
        company_role_candidates=["営業職", "企画職"],
        company_work_candidates=["DX支援"],
        conversation_context={"selectedIndustry": "IT・通信", "questionStage": "desired_work"},
    )

    assert options
    assert all("営業職" not in option.label and "企画職" not in option.label for option in options)


def test_stage_specific_options_do_not_introduce_unconfirmed_work_candidates():
    options = _build_stage_specific_suggestion_options(
        stage="desired_work",
        question="入社後にどんな仕事に挑戦したいですか？",
        company_name="株式会社テスト",
        company_context="顧客課題に向き合うDX支援と業務改革を進める。営業職や企画職が連携する。",
        company_sources=[{"source_id": "S1", "source_url": "https://example.com/jobs"}],
        gakuchika_context=[{"title": "学生団体の運営", "strengths": ["巻き込み力"]}],
        profile_context={"target_industries": ["IT・通信"]},
        application_job_candidates=["企画職"],
        company_role_candidates=["企画職"],
        company_work_candidates=["DX支援", "業務改革の提案"],
        conversation_context={
            "selectedIndustry": "IT・通信",
            "selectedRole": "企画職",
            "questionStage": "desired_work",
            "confirmedFacts": {
                "industry_reason_confirmed": True,
                "company_reason_confirmed": False,
                "desired_work_confirmed": False,
                "origin_experience_confirmed": False,
            },
        },
    )

    assert options
    assert all("DX支援" not in option.label and "業務改革" not in option.label for option in options)


def test_rotate_question_focus_for_reask_changes_focus_after_previous_attempt():
    focus = _rotate_question_focus_for_reask(
        stage="company_reason",
        question_focus="feature_appeal",
        conversation_context={
            "questionStage": "company_reason",
            "stageAttemptCount": 1,
            "lastQuestionMeta": {
                "question_stage": "company_reason",
                "question_focus": "feature_appeal",
            },
        },
    )

    assert focus != "feature_appeal"


def test_ensure_distinct_question_replaces_duplicate_with_fallback():
    distinct = _ensure_distinct_question(
        question="株式会社テストのDX支援に惹かれた理由を1つ教えてください。",
        stage="company_reason",
        conversation_history=[
            {"role": "assistant", "content": "株式会社テストのDX支援に惹かれた理由を1つ教えてください。"},
            {"role": "user", "content": "顧客課題を解決できるからです。"},
        ],
        company_name="株式会社テスト",
        selected_industry="IT・通信",
        selected_role="企画職",
        desired_work="DX支援",
        grounded_company_anchor="業務改革",
        gakuchika_episode="学生団体の運営",
        gakuchika_strength="巻き込み力",
    )

    assert distinct == "株式会社テストの業務改革に惹かれた理由を1つ教えてください。"


def test_ensure_distinct_question_replaces_duplicate_seen_earlier_in_history():
    distinct = _ensure_distinct_question(
        question="株式会社テストのDX支援に惹かれた理由を1つ教えてください。",
        stage="company_reason",
        conversation_history=[
            {"role": "assistant", "content": "株式会社テストのDX支援に惹かれた理由を1つ教えてください。"},
            {"role": "user", "content": "顧客課題を解決できる点に惹かれます。"},
            {"role": "assistant", "content": "入社後にどんな仕事へ挑戦したいですか？"},
            {"role": "user", "content": "企画職として業務改善に関わりたいです。"},
        ],
        company_name="株式会社テスト",
        selected_industry="IT・通信",
        selected_role="企画職",
        desired_work="DX支援",
        grounded_company_anchor="業務改革",
        gakuchika_episode="学生団体の運営",
        gakuchika_strength="巻き込み力",
    )

    assert distinct == "株式会社テストの業務改革に惹かれた理由を1つ教えてください。"


def test_build_stage_status_marks_company_reason_as_completed():
    status = _build_stage_status(
        {
            "selectedIndustry": "IT・通信",
            "industryReason": "複数産業の課題に関われるため",
            "selectedRole": "企画職",
            "companyReason": "事業の幅に惹かれる",
            "desiredWork": None,
            "questionStage": "desired_work",
        },
        "desired_work",
    )

    assert status.current == "desired_work"
    assert "industry_reason" in status.completed
    assert "company_reason" in status.completed
    assert "desired_work" not in status.completed


def test_build_stage_status_keeps_unconfirmed_required_stages_pending():
    status = _build_stage_status(
        {
            "selectedIndustry": "IT・通信",
            "industryReason": "複数産業の課題に関われるため",
            "selectedRole": "企画職",
            "companyReason": "業務の幅に惹かれます。",
            "desiredWork": "顧客の業務改善に関わりたいです。",
            "questionStage": "origin_experience",
            "confirmedFacts": {
                "industry_reason_confirmed": True,
                "company_reason_confirmed": True,
                "desired_work_confirmed": True,
                "origin_experience_confirmed": False,
                "fit_connection_confirmed": False,
                "differentiation_confirmed": False,
            },
        },
        "origin_experience",
    )

    assert "origin_experience" not in status.completed
    assert "fit_connection" in status.pending
    assert "differentiation" in status.pending


def test_capture_answer_into_context_updates_company_reason_for_current_stage():
    captured = _capture_answer_into_context(
        {
            "selectedIndustry": "IT・通信",
            "selectedRole": "企画職",
            "questionStage": "company_reason",
        },
        "業務改革を通じて顧客課題を解決できる点に惹かれます。",
    )

    assert captured["companyReason"] == "業務改革を通じて顧客課題を解決できる点に惹かれます。"
    assert captured["questionStage"] == "company_reason"
    assert captured["confirmedFacts"]["company_reason_confirmed"] is True


def test_capture_answer_into_context_updates_desired_work_for_current_stage():
    captured = _capture_answer_into_context(
        {
            "selectedIndustry": "IT・通信",
            "selectedRole": "企画職",
            "companyReason": "業務改革に惹かれます。",
            "questionStage": "desired_work",
        },
        "入社後は企画職として顧客の業務改善に挑戦したいです。",
    )

    assert captured["desiredWork"] == "入社後は企画職として顧客の業務改善に挑戦したいです。"
    assert captured["confirmedFacts"]["desired_work_confirmed"] is True


def test_capture_answer_into_context_updates_fit_connection_for_current_stage():
    captured = _capture_answer_into_context(
        {
            "selectedIndustry": "IT・通信",
            "selectedRole": "企画職",
            "questionStage": "fit_connection",
        },
        "学生団体で培った巻き込み力を、顧客課題の整理や提案に活かせると考えています。",
    )

    assert captured["fitConnection"] == "学生団体で培った巻き込み力を、顧客課題の整理や提案に活かせると考えています。"
    assert captured["confirmedFacts"]["fit_connection_confirmed"] is True


def test_capture_answer_into_context_updates_differentiation_for_current_stage():
    captured = _capture_answer_into_context(
        {
            "selectedIndustry": "IT・通信",
            "selectedRole": "企画職",
            "questionStage": "differentiation",
        },
        "他社よりも顧客課題に長く向き合える点が、自分の軸に最も合うためです。",
    )

    assert captured["differentiationReason"] == "他社よりも顧客課題に長く向き合える点が、自分の軸に最も合うためです。"
    assert captured["confirmedFacts"]["differentiation_confirmed"] is True


def test_capture_answer_into_context_marks_shallow_company_reason_as_unconfirmed():
    captured = _capture_answer_into_context(
        {
            "selectedIndustry": "IT・通信",
            "selectedRole": "企画職",
            "questionStage": "company_reason",
        },
        "気になります。",
    )

    assert captured["companyReason"] == "気になります。"
    assert captured["confirmedFacts"]["company_reason_confirmed"] is False
