import re

import pytest

from app.routers.es_review import ReviewRequest, TemplateRequest, review_section_with_template


class FakeJsonResult:
    def __init__(self, data=None, *, success: bool = True):
        self.success = success
        self.data = data
        self.error = None


class FakeTextResult:
    def __init__(self, text: str, *, success: bool = True):
        self.success = success
        self.data = {"text": text} if success else None
        self.error = None


def _assert_dearu_style(text: str) -> None:
    assert re.search(r"[。！？]$", text)
    assert re.search(r"(です|ます|でした|ました)", text) is None


def _repeat_sentence(sentence: str, count: int) -> str:
    return sentence * count


@pytest.mark.asyncio
async def test_final_quality_company_motivation_strong_evidence(monkeypatch: pytest.MonkeyPatch) -> None:
    captured_prompts: list[str] = []

    async def fake_json_caller(*args, **kwargs):
        return FakeJsonResult(
            {
                "top3": [
                    {
                        "category": "企業接続",
                        "issue": "企業理解の軸を冒頭で示せていない",
                        "suggestion": "事業理解と自分の経験の接点を冒頭で示す",
                    }
                ]
            }
        )

    async def fake_text_caller(*args, **kwargs):
        captured_prompts.append(kwargs.get("system_prompt", "") or (args[0] if args else ""))
        return FakeTextResult(
            "三菱商事を志望するのは、成長領域への投資を通じて社会課題を動かす現場で価値創出に挑みたいからだ。研究で仮説を立て検証を回した経験を土台に、若手から挑戦機会を得て事業理解を深め、具体的な成果へ着実につなげたい。"
        )

    monkeypatch.setattr("app.routers.es_review._validate_reference_distance", lambda *args, **kwargs: (True, None))

    result = await review_section_with_template(
        request=ReviewRequest(
            content="研究で仮説検証を重ねた。",
            section_title="三菱商事を志望する理由を教えてください。",
            template_request=TemplateRequest(
                template_type="company_motivation",
                question="三菱商事を志望する理由を教えてください。",
                answer="研究で仮説検証を重ねた。",
                company_name="三菱商事",
                role_name="総合職",
                char_min=90,
                char_max=120,
            ),
        ),
        rag_sources=[
            {
                "content_type": "new_grad_recruitment",
                "title": "新卒採用",
                "excerpt": "若手に挑戦機会を与える",
                "source_url": "https://www.mitsubishicorp.com/jp/ja/recruit/newgrad/",
            },
            {
                "content_type": "corporate_site",
                "title": "注力事業",
                "excerpt": "成長領域への投資を進める",
                "source_url": "https://www.mitsubishicorp.com/jp/ja/business/",
            },
            {
                "content_type": "employee_interviews",
                "title": "社員インタビュー",
                "excerpt": "現場で学びながら価値を広げる",
                "source_url": "https://www.mitsubishicorp.com/jp/ja/recruit/people/interview/",
            },
        ],
        company_rag_available=True,
        grounding_mode="company_general",
        json_caller=fake_json_caller,
        text_caller=fake_text_caller,
        progress_queue=None,
    )

    rewrite = result.rewrites[0]
    assert 90 <= len(rewrite) <= 120
    _assert_dearu_style(rewrite)
    assert "志望" in rewrite
    assert "価値創出" in rewrite
    assert any("【企業根拠カード】" in prompt for prompt in captured_prompts)
    assert result.review_meta is not None
    assert result.review_meta.company_evidence_count >= 2
    assert result.review_meta.evidence_coverage_level in {"partial", "strong"}
    assert result.review_meta.weak_evidence_notice is False


@pytest.mark.asyncio
async def test_final_quality_company_motivation_strong_evidence_for_cohere(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_json_caller(*args, **kwargs):
        return FakeJsonResult(
            {
                "top3": [
                    {
                        "category": "企業接続",
                        "issue": "企業理解の軸を冒頭で示せていない",
                        "suggestion": "事業理解と自分の経験の接点を冒頭で示す",
                    }
                ]
            }
        )

    async def fake_text_caller(*args, **kwargs):
        return FakeTextResult(
            "三菱商事を志望するのは、成長領域へ挑む事業の中で仮説検証力を価値へ変えたいからだ。研究で論点を整理し検証を回した経験を土台に、若手から挑戦機会を得て事業理解を深め、現場での成果へ着実につなげたい。"
        )

    monkeypatch.setattr("app.routers.es_review._validate_reference_distance", lambda *args, **kwargs: (True, None))

    result = await review_section_with_template(
        request=ReviewRequest(
            content="研究で仮説検証を重ねた。",
            section_title="三菱商事を志望する理由を教えてください。",
            template_request=TemplateRequest(
                template_type="company_motivation",
                question="三菱商事を志望する理由を教えてください。",
                answer="研究で仮説検証を重ねた。",
                company_name="三菱商事",
                role_name="総合職",
                char_min=90,
                char_max=120,
            ),
        ),
        rag_sources=[
            {
                "content_type": "new_grad_recruitment",
                "title": "新卒採用",
                "excerpt": "若手に挑戦機会を与える",
                "source_url": "https://www.mitsubishicorp.com/jp/ja/recruit/newgrad/",
            },
            {
                "content_type": "corporate_site",
                "title": "注力事業",
                "excerpt": "成長領域への投資を進める",
                "source_url": "https://www.mitsubishicorp.com/jp/ja/business/",
            },
            {
                "content_type": "employee_interviews",
                "title": "社員インタビュー",
                "excerpt": "現場で学びながら価値を広げる",
                "source_url": "https://www.mitsubishicorp.com/jp/ja/recruit/people/interview/",
            },
        ],
        company_rag_available=True,
        llm_provider="cohere",
        llm_model="command-a-03-2025",
        grounding_mode="company_general",
        json_caller=fake_json_caller,
        text_caller=fake_text_caller,
        progress_queue=None,
    )

    rewrite = result.rewrites[0]
    assert 90 <= len(rewrite) <= 120
    _assert_dearu_style(rewrite)
    assert "成長領域" in rewrite
    assert result.review_meta is not None
    assert result.review_meta.llm_provider == "cohere"
    assert result.review_meta.llm_model == "command-a-03-2025"
    assert result.review_meta.company_evidence_count >= 2


@pytest.mark.asyncio
async def test_final_quality_company_motivation_weak_evidence_safe_generalization(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured_prompts: list[str] = []

    async def fake_json_caller(*args, **kwargs):
        return FakeJsonResult(
            {
                "top3": [
                    {
                        "category": "企業接続",
                        "issue": "企業理解が一般化しやすい",
                        "suggestion": "企業理解を一軸に絞って接続する",
                    }
                ]
            }
        )

    async def fake_text_caller(*args, **kwargs):
        captured_prompts.append(kwargs.get("system_prompt", "") or (args[0] if args else ""))
        return FakeTextResult(
            "貴社を志望するのは、多様な事業に向き合う姿勢に引かれたからだ。研究で課題を構造化してきた経験を土台に、まずは事業理解を深めながら価値提供の幅を広げたい。現場に近い視点で学び、着実に貢献の解像度を高めたい。"
        )

    monkeypatch.setattr("app.routers.es_review._validate_reference_distance", lambda *args, **kwargs: (True, None))

    result = await review_section_with_template(
        request=ReviewRequest(
            content="幅広い事業に関わりたい。",
            section_title="志望理由を教えてください。",
            template_request=TemplateRequest(
                template_type="company_motivation",
                question="志望理由を教えてください。",
                answer="幅広い事業に関わりたい。",
                company_name="三菱商事",
                role_name="総合職",
                char_min=90,
                char_max=120,
            ),
        ),
        rag_sources=[
            {
                "content_type": "corporate_site",
                "title": "企業概要",
                "excerpt": "多様な事業を展開する",
                "source_url": "https://www.mitsubishicorp.com/jp/ja/about/",
            }
        ],
        company_rag_available=True,
        grounding_mode="company_general",
        json_caller=fake_json_caller,
        text_caller=fake_text_caller,
        progress_queue=None,
    )

    rewrite = result.rewrites[0]
    assert 90 <= len(rewrite) <= 120
    _assert_dearu_style(rewrite)
    assert "制度" not in rewrite
    assert "配属" not in rewrite
    assert any("企業理解を1軸に絞って一般化した表現を優先する" in prompt for prompt in captured_prompts)
    assert result.review_meta is not None
    assert result.review_meta.company_evidence_count == 1
    assert result.review_meta.evidence_coverage_level == "weak"
    assert result.review_meta.weak_evidence_notice is True


@pytest.mark.asyncio
async def test_final_quality_gakuchika_uses_assistive_company_grounding(monkeypatch: pytest.MonkeyPatch) -> None:
    captured_prompts: list[str] = []

    async def fake_json_caller(*args, **kwargs):
        return FakeJsonResult(success=False)

    async def fake_text_caller(*args, **kwargs):
        system = kwargs.get("system_prompt", "") or (args[0] if args else "")
        user = kwargs.get("user_message", "") or ""
        captured_prompts.append(f"{system}\n{user}")
        return FakeTextResult(
            "研究室で進捗管理の型を見直し、共有の遅れを減らした経験から、課題を構造化し周囲を巻き込んで改善を進める力を磨いた。状況を整理して役割分担を見直し、チーム全体の動きを前に進めたことが学びである。"
        )

    monkeypatch.setattr("app.routers.es_review._validate_reference_distance", lambda *args, **kwargs: (True, None))

    result = await review_section_with_template(
        request=ReviewRequest(
            content="研究室で進捗管理の型を見直した。",
            section_title="学生時代に力を入れたことを教えてください。",
            template_request=TemplateRequest(
                template_type="gakuchika",
                question="学生時代に力を入れたことを教えてください。",
                answer="研究室で進捗管理の型を見直した。",
                company_name="三菱商事",
                char_min=90,
                char_max=120,
            ),
        ),
        rag_sources=[
            {
                "content_type": "employee_interviews",
                "title": "社員インタビュー",
                "excerpt": "現場で挑戦を重ねる",
                "source_url": "https://www.mitsubishicorp.com/jp/ja/recruit/people/interview/",
            }
        ],
        company_rag_available=True,
        grounding_mode="company_general",
        json_caller=fake_json_caller,
        text_caller=fake_text_caller,
        progress_queue=None,
    )

    rewrite = result.rewrites[0]
    assert 90 <= len(rewrite) <= 120
    _assert_dearu_style(rewrite)
    assert all(issue.category != "企業接続" for issue in result.top3)
    assert any(
        ("本文の主軸は課題・行動・成果・学びに置く" in prompt)
        or ("本文の主軸は自分の経験・強み・価値観に置く" in prompt)
        or ("本文の主軸は自分の経験・行動・学び・価値観に置く" in prompt)
        for prompt in captured_prompts
    )
    assert result.review_meta is not None
    assert result.review_meta.company_grounding_policy == "assistive"
    assert result.review_meta.company_evidence_count == 1
    assert result.review_meta.evidence_coverage_level in {"weak", "partial"}
    assert result.review_meta.weak_evidence_notice is False


@pytest.mark.asyncio
async def test_final_quality_intern_reason_short_answer(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_json_caller(*args, **kwargs):
        return FakeJsonResult(
            {
                "top3": [
                    {
                        "category": "参加目的",
                        "issue": "学びたいことが抽象的である",
                        "suggestion": "経験との接点を一文で示す",
                    }
                ]
            }
        )

    async def fake_text_caller(*args, **kwargs):
        return FakeTextResult(
            "Business Intelligence Internshipに参加したい。研究で磨いた分析力を実務で試し、現場の意思決定に近い課題へ向き合いたい。参加後は、事実を整理して示唆へ変え、相手に伝わる形へ磨きたい。実務の視点も吸収したい。"
        )

    monkeypatch.setattr("app.routers.es_review._validate_reference_distance", lambda *args, **kwargs: (True, None))

    result = await review_section_with_template(
        request=ReviewRequest(
            content="研究で磨いた分析力を実務で試したい。",
            section_title="インターンの参加理由を教えてください。",
            template_request=TemplateRequest(
                template_type="intern_reason",
                question="インターンの参加理由を教えてください。",
                answer="研究で磨いた分析力を実務で試したい。",
                company_name="三井物産",
                role_name="Business Intelligence",
                intern_name="Business Intelligence Internship",
                char_min=110,
                char_max=120,
            ),
        ),
        rag_sources=[
            {
                "content_type": "new_grad_recruitment",
                "title": "Business Intelligence Internship",
                "excerpt": "実務に近いテーマを扱う",
                "source_url": "https://www.mitsui.com/jp/ja/recruit/internship/business-intelligence/",
            }
        ],
        company_rag_available=True,
        grounding_mode="role_grounded",
        json_caller=fake_json_caller,
        text_caller=fake_text_caller,
        progress_queue=None,
    )

    rewrite = result.rewrites[0]
    assert 110 <= len(rewrite) <= 120
    _assert_dearu_style(rewrite)
    assert "参加" in rewrite
    assert result.review_meta is not None
    assert result.review_meta.length_policy in {"strict", "soft_min_applied"}


@pytest.mark.asyncio
async def test_final_quality_over_max_retry_recovers_without_422(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = 0

    async def fake_json_caller(*args, **kwargs):
        return FakeJsonResult(
            {
                "top3": [
                    {
                        "category": "企業接続",
                        "issue": "企業理解の接点を冒頭で示したい",
                        "suggestion": "事業理解を結論と接続する",
                    }
                ]
            }
        )

    async def fake_text_caller(*args, **kwargs):
        nonlocal calls
        calls += 1
        if calls >= 2:
            return FakeTextResult(
                "KPMGを志望するのは、変革現場で研究経験を価値へ変えたいからだ。"
                + _repeat_sentence(
                    "研究経験を価値へ変える仕事に挑み、変革現場で成果へつなげたい。",
                    11,
                )
                + "研究経験を価値へ変える力を磨きたい。"
            )
        return FakeTextResult(
            _repeat_sentence(
                "研究経験を価値へ変える仕事に挑み、変革現場で成果へつなげたい。",
                13,
            )
        )

    monkeypatch.setattr("app.routers.es_review._validate_reference_distance", lambda *args, **kwargs: (True, None))

    result = await review_section_with_template(
        request=ReviewRequest(
            content="研究で培った仮説検証力を事業価値へつなげたい。",
            section_title="志望理由を教えてください。",
            template_request=TemplateRequest(
                template_type="company_motivation",
                question="志望理由を教えてください。",
                answer="研究で培った仮説検証力を事業価値へつなげたい。",
                company_name="KPMG",
                char_min=390,
                char_max=400,
            ),
        ),
        rag_sources=[
            {
                "content_type": "corporate_site",
                "title": "企業概要",
                "excerpt": "変革支援を重視する",
                "source_url": "https://kpmg.com/jp/ja/home/about.html",
            },
            {
                "content_type": "new_grad_recruitment",
                "title": "新卒採用",
                "excerpt": "若手から変革に挑む",
                "source_url": "https://kpmg.com/jp/ja/home/careers/new-graduate.html",
            },
        ],
        company_rag_available=True,
        grounding_mode="company_general",
        json_caller=fake_json_caller,
        text_caller=fake_text_caller,
        progress_queue=None,
    )

    rewrite = result.rewrites[0]
    assert calls >= 2
    assert 390 <= len(rewrite) <= 400
    _assert_dearu_style(rewrite)
    assert result.review_meta is not None
    assert result.review_meta.fallback_to_generic is False
    assert result.review_meta.length_fix_attempted is False


@pytest.mark.asyncio
async def test_final_quality_self_pr_uses_assistive_company_fit(monkeypatch: pytest.MonkeyPatch) -> None:
    captured_prompts: list[str] = []

    async def fake_json_caller(*args, **kwargs):
        return FakeJsonResult(
            {
                "top3": [
                    {
                        "category": "企業接続",
                        "issue": "強みの活かし方が会社との接点まで届いていない",
                        "suggestion": "価値観との接点を1文だけ補う",
                    }
                ]
            }
        )

    async def fake_text_caller(*args, **kwargs):
        captured_prompts.append(kwargs.get("system_prompt", "") or (args[0] if args else ""))
        return FakeTextResult(
            "私の強みは、課題を整理し周囲を巻き込みながら改善を前に進める点だ。研究室で進行の停滞要因を分解し共有方法を整えた経験を土台に、顧客起点で価値を磨く姿勢にもつなげていきたい。入社後も関係者の意図をそろえながら前進させたい。"
        )

    monkeypatch.setattr("app.routers.es_review._validate_reference_distance", lambda *args, **kwargs: (True, None))

    result = await review_section_with_template(
        request=ReviewRequest(
            content="課題を整理し周囲を巻き込みながら改善を前に進める点が強みだ。",
            section_title="あなたの強みを教えてください。",
            template_request=TemplateRequest(
                template_type="self_pr",
                question="あなたの強みを教えてください。",
                answer="課題を整理し周囲を巻き込みながら改善を前に進める点が強みだ。",
                company_name="三菱商事",
                char_min=100,
                char_max=120,
            ),
        ),
        rag_sources=[
            {
                "content_type": "employee_interviews",
                "title": "社員インタビュー",
                "excerpt": "顧客起点で価値を磨く",
                "source_url": "https://www.mitsubishicorp.com/jp/ja/recruit/people/interview/",
            }
        ],
        company_rag_available=True,
        grounding_mode="company_general",
        json_caller=fake_json_caller,
        text_caller=fake_text_caller,
        progress_queue=None,
    )

    rewrite = result.rewrites[0]
    assert 100 <= len(rewrite) <= 120
    _assert_dearu_style(rewrite)
    assert "顧客起点" in rewrite
    assert any("企業理解は 0〜1 文だけ補助的に使い" in prompt for prompt in captured_prompts)
    assert result.review_meta is not None
    assert result.review_meta.company_grounding_policy == "assistive"
    assert result.review_meta.company_evidence_count == 1
    assert result.review_meta.evidence_coverage_level in {"partial", "strong"}


@pytest.mark.asyncio
async def test_final_quality_role_course_reason_uses_role_and_company_axes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured_prompts: list[str] = []

    async def fake_json_caller(*args, **kwargs):
        return FakeJsonResult(
            {
                "top3": [
                    {
                        "category": "職種適合",
                        "issue": "職種を選ぶ理由と企業理解の接点が分かれています。",
                        "suggestion": "デジタル企画で価値を出したい理由を、企業の方向性と一文でつなぐ。",
                    }
                ]
            }
        )

    async def fake_text_caller(*args, **kwargs):
        captured_prompts.append(kwargs.get("system_prompt", "") or (args[0] if args else ""))
        return FakeTextResult(
            "デジタル企画コースを志望するのは、事業理解と技術理解をつなぎながら価値を形にしたいからだ。研究で関係者の意図を整理し前進させた経験を土台に、成長領域へ挑む貴社で事業と開発をつなぐ役割を担いたい。"
        )

    monkeypatch.setattr("app.routers.es_review._validate_reference_distance", lambda *args, **kwargs: (True, None))

    result = await review_section_with_template(
        request=ReviewRequest(
            content="事業理解と技術理解をつなぐ仕事に関心があります。",
            section_title="デジタル企画コースを選んだ理由を教えてください。",
            template_request=TemplateRequest(
                template_type="role_course_reason",
                question="デジタル企画コースを選んだ理由を教えてください。",
                answer="事業理解と技術理解をつなぐ仕事に関心があります。",
                company_name="三菱商事",
                role_name="デジタル企画",
                char_min=100,
                char_max=140,
            ),
        ),
        rag_sources=[
            {
                "content_type": "employee_interviews",
                "title": "デジタル企画の社員インタビュー",
                "excerpt": "事業部門と開発をつなぐ",
                "source_url": "https://www.mitsubishicorp.com/jp/ja/recruit/digital/interview/",
            },
            {
                "content_type": "corporate_site",
                "title": "事業戦略",
                "excerpt": "成長領域への投資を進める",
                "source_url": "https://www.mitsubishicorp.com/jp/ja/business/digital/",
            },
            {
                "content_type": "new_grad_recruitment",
                "title": "求める人物像",
                "excerpt": "若手の挑戦を後押しする",
                "source_url": "https://www.mitsubishicorp.com/jp/ja/recruit/newgrad/",
            },
        ],
        company_rag_available=True,
        grounding_mode="company_general",
        json_caller=fake_json_caller,
        text_caller=fake_text_caller,
        progress_queue=None,
    )

    rewrite = result.rewrites[0]
    assert 100 <= len(rewrite) <= 140
    _assert_dearu_style(rewrite)
    assert "デジタル企画" in rewrite
    assert "成長領域" in rewrite
    assert any("【企業根拠カード】" in prompt for prompt in captured_prompts)
    assert result.review_meta is not None
    assert result.review_meta.company_evidence_count >= 2
    assert result.review_meta.evidence_coverage_level in {"partial", "strong"}


@pytest.mark.asyncio
async def test_final_quality_intern_goals_anchors_program_and_growth(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured_prompts: list[str] = []

    async def fake_json_caller(*args, **kwargs):
        return FakeJsonResult(
            {
                "top3": [
                    {
                        "category": "参加目的",
                        "issue": "実務で何を学びたいかが抽象的です。",
                        "suggestion": "インターンで得たい視点と、今の経験との接点を明示する。",
                    }
                ]
            }
        )

    async def fake_text_caller(*args, **kwargs):
        captured_prompts.append(kwargs.get("system_prompt", "") or (args[0] if args else ""))
        return FakeTextResult(
            "Business Intelligence Internshipでは、分析結果を事業判断へつなげる視点を学びたい。研究で示し方を改善してきた経験を土台に、実務に近いテーマを通じて仮説を価値へ変える力を磨きたい。"
        )

    monkeypatch.setattr("app.routers.es_review._validate_reference_distance", lambda *args, **kwargs: (True, None))

    result = await review_section_with_template(
        request=ReviewRequest(
            content="データ分析を価値に変える視点を実務で磨きたいです。",
            section_title="Business Intelligence Internshipで学びたいことを教えてください。",
            template_request=TemplateRequest(
                template_type="intern_goals",
                question="Business Intelligence Internshipで学びたいことを教えてください。",
                answer="データ分析を価値に変える視点を実務で磨きたいです。",
                company_name="三井物産",
                role_name="Business Intelligence",
                intern_name="Business Intelligence Internship",
                char_min=100,
                char_max=140,
            ),
        ),
        rag_sources=[
            {
                "content_type": "new_grad_recruitment",
                "title": "Business Intelligence Internship",
                "excerpt": "実務に近いテーマを扱う",
                "source_url": "https://www.mitsui.com/jp/ja/recruit/internship/business-intelligence/",
            },
            {
                "content_type": "employee_interviews",
                "title": "社員インタビュー",
                "excerpt": "分析を事業判断につなげる",
                "source_url": "https://www.mitsui.com/jp/ja/recruit/people/interview/",
            },
            {
                "content_type": "corporate_site",
                "title": "事業紹介",
                "excerpt": "データ活用を通じて価値を広げる",
                "source_url": "https://www.mitsui.com/jp/ja/business/",
            },
        ],
        company_rag_available=True,
        grounding_mode="role_grounded",
        json_caller=fake_json_caller,
        text_caller=fake_text_caller,
        progress_queue=None,
    )

    rewrite = result.rewrites[0]
    assert 100 <= len(rewrite) <= 140
    _assert_dearu_style(rewrite)
    assert "Business Intelligence Internship" in rewrite
    assert "実務に近いテーマ" in rewrite
    assert any("【企業根拠カード】" in prompt for prompt in captured_prompts)
    assert result.review_meta is not None
    assert result.review_meta.company_evidence_count >= 2
    assert result.review_meta.evidence_coverage_level in {"strong", "partial"}
