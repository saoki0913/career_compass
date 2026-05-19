"""Smoke tests: ES draft generation prompts align with TEMPLATE_DEFS (same source as ES review)."""

import pytest

from app.prompts import es_reference_guidance, logic_patterns
from app.prompts.es_templates import (
    DRAFT_SYNTHETIC_QUESTION_GAKUCHIKA,
    build_template_draft_generation_prompt,
    draft_synthetic_question_company_motivation,
    get_company_honorific,
)
from app.prompts.reference_es import build_reference_quality_block


def _set_logic_patterns(monkeypatch: pytest.MonkeyPatch, question_type: str) -> None:
    guidance = {key: dict(value) for key, value in es_reference_guidance.QUESTION_TYPE_GUIDANCE.items()}
    # Preserve the real curated entry (quality_hints/skeleton) so the reference
    # quality block renders, and override only logic_patterns (single schema).
    guidance[question_type] = {
        **es_reference_guidance.QUESTION_TYPE_GUIDANCE[question_type],
        "logic_patterns": {
            "question_type": question_type,
            "human_reviewed": True,
            "patterns": [
                {
                    "approach_label": "課題起点型",
                    "approach_description": "結論で核を示し、背景と行動を因果でつなぐ",
                    "persuasion_key": "事実の順序を崩さない",
                }
            ],
            "section_balance": "冒頭短め・中盤厚め・締め短め",
            "opening_pattern": {"structure": "核を一文で置く"},
            "closing_pattern": {"structure": "成果から接続する"},
        },
    }
    monkeypatch.setattr(es_reference_guidance, "QUESTION_TYPE_GUIDANCE", guidance)
    logic_patterns.get_logic_patterns.cache_clear()


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


def test_gakuchika_draft_prompt_includes_reference_copy_safety_even_without_reference_block() -> None:
    system, _ = build_template_draft_generation_prompt(
        "gakuchika",
        company_name=None,
        industry=None,
        question=DRAFT_SYNTHETIC_QUESTION_GAKUCHIKA,
        char_min=270,
        char_max=300,
        primary_material_heading="【テーマと会話】",
        primary_material_body="テーマ: テスト\n\n回答: 私は改善に取り組んだ。",
        output_json_kind="gakuchika",
    )

    assert "参考ESは品質傾向だけを参考にし" in system
    assert "参考ES由来の事実をユーザー事実や企業根拠として扱わない" in system


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


def test_gakuchika_draft_prompt_prefers_cultivated_closing_verb() -> None:
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
    assert "培った" in system
    assert "身につけた" in system


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
    assert "【この設問で意識する品質】" in system
    assert "根拠が限定的な場合は" in system
    assert "（志望理由の核）を言い切る" in system


def test_gakuchika_draft_includes_logic_patterns(monkeypatch: pytest.MonkeyPatch) -> None:
    _set_logic_patterns(monkeypatch, "gakuchika")

    system, _ = build_template_draft_generation_prompt(
        "gakuchika",
        company_name=None,
        industry=None,
        question=DRAFT_SYNTHETIC_QUESTION_GAKUCHIKA,
        char_min=270,
        char_max=300,
        primary_material_heading="【テーマと会話】",
        primary_material_body="テーマ: テスト\n\n回答: 私は改善に取り組んだ。",
        output_json_kind="gakuchika",
        reference_quality_block=build_reference_quality_block("gakuchika", char_max=300),
    )

    assert "主な論理アプローチ" in system


def test_motivation_draft_includes_logic_patterns(monkeypatch: pytest.MonkeyPatch) -> None:
    _set_logic_patterns(monkeypatch, "company_motivation")
    honorific = get_company_honorific("IT")

    system, _ = build_template_draft_generation_prompt(
        "company_motivation",
        company_name="テスト株式会社",
        industry="IT",
        question=draft_synthetic_question_company_motivation(honorific),
        char_min=360,
        char_max=400,
        primary_material_heading="【会話ログ】",
        primary_material_body="回答: サンプル",
        company_reference_body="企業の特徴の要約",
        output_json_kind="motivation",
        role_name="エンジニア",
        reference_quality_block=build_reference_quality_block(
            "company_motivation",
            char_max=400,
        ),
    )

    assert "主な論理アプローチ" in system


def test_draft_copy_safety_includes_logic_pattern_rule() -> None:
    system, _ = build_template_draft_generation_prompt(
        "gakuchika",
        company_name=None,
        industry=None,
        question=DRAFT_SYNTHETIC_QUESTION_GAKUCHIKA,
        char_min=270,
        char_max=300,
        primary_material_heading="【テーマと会話】",
        primary_material_body="テーマ: テスト\n\n回答: 私は改善に取り組んだ。",
        output_json_kind="gakuchika",
    )

    assert "論理構成パターンは構成の参考に留め" in system
