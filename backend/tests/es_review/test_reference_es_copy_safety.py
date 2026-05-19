from __future__ import annotations

import pytest

from app.prompts import es_reference_guidance, logic_patterns, reference_es
from app.prompts.es_templates import build_template_rewrite_prompt
from app.prompts.es_templates._prompt_builder import _format_reference_copy_safety_rules


RAW_REFERENCE_SENTENCE = "私が貴社を志望する理由は二つある。"


def test_reference_quality_block_never_contains_raw_reference_sentence() -> None:
    block = reference_es.build_reference_quality_block(
        "company_motivation",
        char_max=400,
        company_name="KPMG",
        current_answer="研究経験を生かして課題解決に挑みたい。",
    )
    system_prompt, _ = build_template_rewrite_prompt(
        template_type="company_motivation",
        company_name="KPMG",
        industry="コンサル",
        question="KPMGを志望する理由を教えてください。",
        answer="研究経験を生かして課題解決に挑みたい。",
        char_min=360,
        char_max=400,
        company_evidence_cards=[],
        has_rag=False,
        allowed_user_facts=[{"source": "current_answer", "text": "研究経験を生かしたい。"}],
        grounding_mode="none",
        reference_quality_block=block,
    )

    assert RAW_REFERENCE_SENTENCE not in block
    assert RAW_REFERENCE_SENTENCE not in system_prompt
    assert "参考ESは品質傾向だけを参考にし" in system_prompt


def test_logic_patterns_copy_safety_rejects_company_names(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    guidance = {key: dict(value) for key, value in es_reference_guidance.QUESTION_TYPE_GUIDANCE.items()}
    # Preserve the real curated quality_hints/skeleton so the block renders;
    # inject only a company-tainted logic_patterns payload (single schema).
    guidance["gakuchika"] = {
        **es_reference_guidance.QUESTION_TYPE_GUIDANCE["gakuchika"],
        "logic_patterns": {
            "question_type": "gakuchika",
            "human_reviewed": True,
            "patterns": [
                {
                    "approach_label": "課題起点型",
                    "approach_description": "KPMGでの経験のように結論を置く",
                    "persuasion_key": "成果と学びを近くに置く",
                }
            ],
            "section_balance": "冒頭短め",
            "opening_pattern": {"structure": "経験の核を一文で置く"},
            "closing_pattern": {"structure": "成果から学びへ接続する"},
        },
    }
    monkeypatch.setattr(es_reference_guidance, "QUESTION_TYPE_GUIDANCE", guidance)
    logic_patterns.get_logic_patterns.cache_clear()

    block = reference_es.build_reference_quality_block("gakuchika", char_max=400)
    assert block != ""  # curated quality_hints/skeleton still render
    assert block.count("KPMG") == 0
    assert "主な論理アプローチ" not in block  # tainted logic pattern excluded


def test_reference_copy_safety_rules_include_logic_pattern_rule() -> None:
    rules = _format_reference_copy_safety_rules()

    assert "論理構成パターンは構成の参考に留め" in rules
    assert "パターン内の例示表現や語句をそのまま使わない" in rules
