"""Smoke tests: ES draft generation prompts align with TEMPLATE_DEFS (same source as ES review)."""

from app.prompts.es_templates import (
    DRAFT_SYNTHETIC_QUESTION_GAKUCHIKA,
    build_template_draft_generation_prompt,
    draft_synthetic_question_company_motivation,
    get_company_honorific,
)
from app.prompts.reference_es import build_reference_quality_block


def test_gakuchika_draft_prompt_includes_template_rubric_and_json() -> None:
    system, user = build_template_draft_generation_prompt(
        "gakuchika",
        company_name=None,
        industry=None,
        question=DRAFT_SYNTHETIC_QUESTION_GAKUCHIKA,
        char_min=270,
        char_max=300,
        primary_material_heading="【テーマと会話】",
        primary_material_body="テーマ: テスト\n\n質問: 回答: あり",
        output_json_kind="gakuchika",
    )
    assert "就活ESのガクチカ作成のプロフェッショナル" in system
    assert "学生時代に力を入れた" in system or "ガクチカ" in system
    assert "【設問で落としてはいけない要素】" in system
    assert "だ・である" in system
    assert "ドラフト内で実在の個人名を使用しない" in system
    assert "Aさん" in system
    assert "学校名・企業名は文脈上必要な場合のみ残す" in system
    assert '"draft"' in system
    assert '"followup_suggestion"' in system
    assert "【テーマと会話】" in user
    assert DRAFT_SYNTHETIC_QUESTION_GAKUCHIKA in user


def test_gakuchika_draft_prompt_warns_against_critic_closing() -> None:
    system, _ = build_template_draft_generation_prompt(
        "gakuchika",
        company_name=None,
        industry=None,
        question=DRAFT_SYNTHETIC_QUESTION_GAKUCHIKA,
        char_min=360,
        char_max=400,
        primary_material_heading="【テーマと会話】",
        primary_material_body="テーマ: テスト\n\n回答: 私はレビュー基準を整理した。",
        output_json_kind="gakuchika",
    )

    assert "評論調" in system
    assert "抽象名詞を主語" in system
    assert "直結する" in system
    assert "結果、OOした" in system
    assert "学び・身についた能力だけで終えない" in system


def test_motivation_draft_prompt_includes_company_motivation_and_json() -> None:
    honorific = get_company_honorific("IT")
    q = draft_synthetic_question_company_motivation(honorific)
    system, user = build_template_draft_generation_prompt(
        "company_motivation",
        company_name="テスト株式会社",
        industry="IT",
        question=q,
        char_min=360,
        char_max=400,
        primary_material_heading="【会話ログ】",
        primary_material_body="回答: サンプル",
        company_reference_body="企業の特徴の要約",
        output_json_kind="motivation",
        role_name="エンジニア",
    )
    assert "就活ESの志望理由作成のプロフェッショナル" in system
    assert honorific in system
    assert "【設問で落としてはいけない要素】" in system
    assert "志望理由の核" in system
    assert '"key_points"' in system
    assert '"company_keywords"' in system
    assert "【企業参考情報（要約）】" in user
    assert "テスト株式会社" in user
    assert "【志望職種・コース】" in user


def test_motivation_draft_prompt_includes_phase4_quality_guidance() -> None:
    honorific = get_company_honorific("IT")
    q = draft_synthetic_question_company_motivation(honorific)
    system, _ = build_template_draft_generation_prompt(
        "company_motivation",
        company_name="テスト株式会社",
        industry="IT",
        question=q,
        char_min=360,
        char_max=400,
        primary_material_heading="【一次材料】",
        primary_material_body="研究で3人のチームをまとめ、顧客課題を整理した。",
        company_reference_body="Woven City のような街づくりと移動を一体で設計する取り組み。",
        output_json_kind="motivation",
        role_name="事業開発",
        company_evidence_cards=[
            {
                "theme": "事業理解",
                "normalized_axis": "街づくり",
                "normalized_summary": "Woven City のような統合的な街づくり",
                "excerpt": "街づくりと移動を一体で設計する",
            }
        ],
        has_rag=True,
        grounding_mode="company_general",
        reference_quality_block=build_reference_quality_block(
            "company_motivation",
            char_max=400,
            company_name="テスト株式会社",
        ),
        evidence_coverage_level="partial",
        student_expressions=["3人のチームをまとめた", "顧客課題を整理した"],
    )
    assert "<prose_style>" in system
    assert "【参考ESから抽出した品質ヒント】" in system
    assert "根拠が限定的な場合は" in system
    assert "1文目でその企業を志望する理由の核を20〜45字で言い切る" in system
