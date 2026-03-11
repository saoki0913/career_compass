from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import pytest

from app.prompts import reference_es
from app.routers.es_review import (
    _assess_company_evidence_coverage,
    _build_company_evidence_cards,
    _select_prompt_user_facts,
)


@dataclass(frozen=True)
class ESReviewRubricCase:
    name: str
    template_type: str
    question: str
    answer: str
    company_name: str | None
    role_name: str | None
    user_facts: list[dict[str, str]]
    rag_sources: list[dict[str, str]]
    expected_themes: set[str]
    required_user_sources: set[str]
    min_coverage_level: str
    expected_weak_notice: bool


def _coverage_rank(level: str) -> int:
    return {
        "none": 0,
        "weak": 1,
        "partial": 2,
        "strong": 3,
    }.get(level, 0)


def _theme_score(expected: set[str], actual: set[str]) -> float:
    if not expected:
        return 1.0
    return len(expected & actual) / len(expected)


def _source_score(required: set[str], actual: set[str]) -> float:
    if not required:
        return 1.0
    return len(required & actual) / len(required)


def _reference_score(profile: dict | None) -> float:
    if not profile:
        return 0.0
    if not profile.get("quality_hints") or not profile.get("skeleton"):
        return 0.0
    return 1.0


def _evaluate_case(case: ESReviewRubricCase) -> dict[str, float | str | bool]:
    selected_user_facts = _select_prompt_user_facts(
        case.user_facts,
        template_type=case.template_type,
        question=case.question,
        answer=case.answer,
        role_name=case.role_name,
        intern_name=None,
        company_name=case.company_name,
    )
    cards = _build_company_evidence_cards(
        case.rag_sources,
        template_type=case.template_type,
        question=case.question,
        answer=case.answer,
        role_name=case.role_name,
        intern_name=None,
        grounding_mode="company_general",
    )
    coverage_level, weak_notice = _assess_company_evidence_coverage(
        template_type=case.template_type,
        role_name=case.role_name,
        company_rag_available=bool(case.rag_sources),
        company_evidence_cards=cards,
        grounding_mode="company_general",
    )
    reference_profile = reference_es.build_reference_quality_profile(
        case.template_type,
        char_max=400 if case.template_type != "intern_reason" else 200,
        company_name=case.company_name,
    )

    card_themes = {
        str(card.get("theme") or "").strip()
        for card in cards
        if str(card.get("theme") or "").strip()
    }
    selected_sources = {
        str(fact.get("source") or "").strip()
        for fact in selected_user_facts
        if str(fact.get("source") or "").strip()
    }
    scores = {
        "question_axes": _theme_score(case.expected_themes, card_themes),
        "user_fact_anchors": _source_score(case.required_user_sources, selected_sources),
        "reference_outline": _reference_score(reference_profile),
        "coverage_level": 1.0
        if _coverage_rank(coverage_level) >= _coverage_rank(case.min_coverage_level)
        else 0.0,
        "weak_notice": 1.0 if weak_notice is case.expected_weak_notice else 0.0,
    }
    overall = sum(scores.values()) / len(scores)
    return {
        "overall": overall,
        "coverage_level": coverage_level,
        "weak_notice": weak_notice,
    }


@pytest.fixture()
def reference_payload(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    payload = {
        "version": 1,
        "references": [
            {
                "id": "ref_company",
                "question_type": "post_join_goals",
                "company_name": "三菱商事",
                "char_max": 400,
                "title": "入社後やりたいこと",
                "text": "貴社で手掛けたい領域を述べ、自分が得たい経験を具体化し、中長期の姿につなげる。",
            },
            {
                "id": "ref_motivation",
                "question_type": "company_motivation",
                "company_name": "三菱商事",
                "char_max": 400,
                "title": "志望理由",
                "text": "志望理由を冒頭で示し、企業理解と自分の経験を接続し、入社後の貢献で締める。",
            },
            {
                "id": "ref_gakuchika",
                "question_type": "gakuchika",
                "company_name": None,
                "char_max": 400,
                "title": "ガクチカ",
                "text": "課題、行動、成果、学びの順で具体的に述べる。",
            },
        ],
    }
    path = tmp_path / "es_references.json"
    path.write_text(reference_es.json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr(reference_es, "REFERENCE_ES_PATH", path)


def test_es_review_quality_rubric_cases(reference_payload: None) -> None:
    cases = [
        ESReviewRubricCase(
            name="generic_role_post_join_goals",
            template_type="post_join_goals",
            question="三菱商事で手掛けてみたいビジネスや、三菱商事で働く中で獲得したい経験・スキルについて、教えてください。",
            answer="事業を通じて価値を生み、現場で必要な力を磨きたいです。",
            company_name="三菱商事",
            role_name="総合職",
            user_facts=[
                {"source": "current_answer", "text": "事業を通じて価値を生み、現場で必要な力を磨きたい。"},
                {"source": "gakuchika_summary", "text": "研究室PJで複数人を巻き込み、進行改善を行った。"},
                {"source": "profile", "text": "志望業界: 総合商社"},
            ],
            rag_sources=[
                {"content_type": "corporate_site", "title": "注力事業", "excerpt": "成長領域への投資を進める"},
                {"content_type": "midterm_plan", "title": "中期戦略", "excerpt": "新たな事業機会を広げる"},
                {"content_type": "new_grad_recruitment", "title": "新卒採用", "excerpt": "若手に挑戦機会を与える"},
                {"content_type": "employee_interviews", "title": "社員インタビュー", "excerpt": "現場で経験を積みながら学ぶ"},
            ],
            expected_themes={"事業理解", "成長機会"},
            required_user_sources={"current_answer", "gakuchika_summary"},
            min_coverage_level="strong",
            expected_weak_notice=False,
        ),
        ESReviewRubricCase(
            name="weak_company_motivation",
            template_type="company_motivation",
            question="三菱商事を志望する理由を教えてください。",
            answer="幅広い事業に関わりたいです。",
            company_name="三菱商事",
            role_name="総合職",
            user_facts=[
                {"source": "current_answer", "text": "幅広い事業に関わりたい。"},
                {"source": "profile", "text": "志望業界: 総合商社"},
            ],
            rag_sources=[
                {"content_type": "corporate_site", "title": "企業概要", "excerpt": "多様な事業を展開する"},
            ],
            expected_themes={"事業理解"},
            required_user_sources={"current_answer"},
            min_coverage_level="weak",
            expected_weak_notice=True,
        ),
        ESReviewRubricCase(
            name="companyless_gakuchika",
            template_type="gakuchika",
            question="学生時代に力を入れたことを教えてください。",
            answer="研究室で進捗管理の型を見直し、共有を改善しました。",
            company_name=None,
            role_name=None,
            user_facts=[
                {"source": "current_answer", "text": "研究室で進捗管理の型を見直し、共有を改善した。"},
                {"source": "gakuchika_raw_material", "text": "議事録フォーマットを見直し、情報共有を改善した。"},
            ],
            rag_sources=[],
            expected_themes=set(),
            required_user_sources={"current_answer", "gakuchika_raw_material"},
            min_coverage_level="none",
            expected_weak_notice=False,
        ),
        ESReviewRubricCase(
            name="company_selected_gakuchika_assistive_fit",
            template_type="gakuchika",
            question="学生時代に力を入れたことを教えてください。仕事でどう活かせるかも簡潔に述べてください。",
            answer="研究室で進捗管理の型を見直し、共有を改善した。",
            company_name="三菱商事",
            role_name=None,
            user_facts=[
                {"source": "current_answer", "text": "研究室で進捗管理の型を見直し、共有を改善した。"},
                {"source": "gakuchika_raw_material", "text": "議事録フォーマットを見直し、情報共有を改善した。"},
            ],
            rag_sources=[
                {"content_type": "employee_interviews", "title": "社員インタビュー", "excerpt": "現場で周囲を巻き込みながら価値を出す"},
            ],
            expected_themes={"現場期待"},
            required_user_sources={"current_answer", "gakuchika_raw_material"},
            min_coverage_level="partial",
            expected_weak_notice=False,
        ),
    ]

    for case in cases:
        result = _evaluate_case(case)
        assert result["overall"] >= 0.8, case.name
