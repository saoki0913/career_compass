from __future__ import annotations

import pytest

from app.prompts import es_reference_guidance, logic_patterns


def _set_logic(
    monkeypatch: pytest.MonkeyPatch,
    question_type: str = "gakuchika",
    *,
    payload: dict | None = None,
) -> None:
    base = {
        "question_type": question_type,
        "human_reviewed": True,
        "patterns": [
            {
                "approach_label": "課題構造化型",
                "approach_description": "経験の核を冒頭で示し、課題と行動を因果でつなぐ",
                "persuasion_key": "行動の理由と成果を近くに置く",
                "structural_blueprint": "概要→課題→原因→施策→成果→学び",
                "evidence_strategy": "課題は定量化し成果は前後比較で示す",
                "transition_logic": "課題→そこで施策→その結果成果でつなぐ",
            }
        ],
        "section_balance": "冒頭短め・中盤厚め・締め短め",
        "opening_pattern": {"structure": "経験の核を一文で置く"},
        "closing_pattern": {"structure": "成果から学びへ接続する"},
        "quality_markers": ["課題が具体的である", "成果が数値で示されている"],
        "common_weaknesses": ["思考プロセスが見えない"],
    }
    guidance = {
        key: dict(value)
        for key, value in es_reference_guidance.QUESTION_TYPE_GUIDANCE.items()
    }
    guidance[question_type] = {"logic_patterns": payload if payload is not None else base}
    monkeypatch.setattr(es_reference_guidance, "QUESTION_TYPE_GUIDANCE", guidance)
    logic_patterns.get_logic_patterns.cache_clear()


def test_get_logic_patterns_uses_single_schema(monkeypatch: pytest.MonkeyPatch) -> None:
    _set_logic(monkeypatch)
    data = logic_patterns.get_logic_patterns("gakuchika")
    assert data is not None
    assert data["question_type"] == "gakuchika"


def test_block_has_no_statistical_counts(monkeypatch: pytest.MonkeyPatch) -> None:
    _set_logic(monkeypatch)
    block = logic_patterns.build_logic_patterns_block("gakuchika", char_max=400)
    assert "主な論理アプローチ: 課題構造化型" in block
    assert "件中" not in block
    assert "件)" not in block
    assert "構成設計:" in block
    assert "根拠提示:" in block
    assert "接続パターン:" in block
    assert "品質指標:" in block
    assert "よくある弱点:" in block
    assert "構成パターンは論点順の参考に留め" in block


def test_block_gated_for_small_char_max(monkeypatch: pytest.MonkeyPatch) -> None:
    _set_logic(monkeypatch)
    assert logic_patterns.build_logic_patterns_block("gakuchika", char_max=200) == ""


def test_block_adds_medium_confidence_note(monkeypatch: pytest.MonkeyPatch) -> None:
    _set_logic(monkeypatch, "self_pr")
    block = logic_patterns.build_logic_patterns_block("self_pr", char_max=400)
    assert "件数が少ない設問タイプのため" in block


def test_low_confidence_type_not_displayed(monkeypatch: pytest.MonkeyPatch) -> None:
    _set_logic(monkeypatch)
    assert logic_patterns.build_logic_patterns_block("unknown_type", char_max=400) == ""


def test_copy_safety_rejects_company_names(monkeypatch: pytest.MonkeyPatch) -> None:
    tainted = {
        "question_type": "gakuchika",
        "human_reviewed": True,
        "patterns": [
            {
                "approach_label": "課題型",
                "approach_description": "KPMGでの経験のように結論を置く",
                "persuasion_key": "成果と学びを近くに置く",
            }
        ],
    }
    _set_logic(monkeypatch, payload=tainted)
    assert logic_patterns.get_logic_patterns("gakuchika") is None
    assert logic_patterns.build_logic_patterns_block("gakuchika", char_max=400) == ""


def test_block_stays_within_char_budget(monkeypatch: pytest.MonkeyPatch) -> None:
    _set_logic(monkeypatch)
    block = logic_patterns.build_logic_patterns_block("gakuchika", char_max=400)
    assert len(block) <= logic_patterns._BLOCK_CHAR_BUDGET


def test_compound_adds_capped_secondary_supplement(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Compound ES surfaces a capped secondary supplement (uses real curated data)."""
    logic_patterns.get_logic_patterns.cache_clear()
    compound = logic_patterns.build_logic_patterns_block(
        "gakuchika", char_max=400, component_types=["gakuchika", "self_pr"]
    )
    single = logic_patterns.build_logic_patterns_block("gakuchika", char_max=400)
    assert "補助アプローチ（複合）" in compound
    assert "補助アプローチ（複合）" not in single
    assert compound.count("補助アプローチ（複合）") <= 2
