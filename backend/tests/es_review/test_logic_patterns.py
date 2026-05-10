from __future__ import annotations

from pathlib import Path

import pytest

from app.prompts import logic_patterns


def _write_patterns(
    root: Path,
    question_type: str = "gakuchika",
    *,
    source_count: int = 11,
    description: str = "結論で経験の核を示し、課題と行動を因果でつなぐ",
) -> Path:
    target = root / question_type
    target.mkdir(parents=True)
    path = target / "patterns.json"
    payload = {
        "question_type": question_type,
        "source_count": source_count,
        "extraction_version": 1,
        "extracted_at": "2026-05-07T00:00:00+09:00",
        "model": "gpt-5.5",
        "human_reviewed": True,
        "copy_safety_hash": "test",
        "patterns": [
            {
                "approach_label": "課題起点型",
                "approach_description": description,
                "frequency_count": 8,
                "persuasion_key": "行動の理由と成果を近くに置く",
            },
            {
                "approach_label": "役割起点型",
                "approach_description": "役割から入り、再現性へ接続する",
                "frequency_count": 3,
                "persuasion_key": "役割の固有性を示す",
            },
        ],
        "section_balance": "冒頭短め・中盤厚め・締め短め",
        "opening_pattern": {"structure": "経験の核を一文で置く"},
        "closing_pattern": {"structure": "成果から学びへ接続する"},
    }
    path.write_text(logic_patterns.json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    logic_patterns.get_logic_patterns.cache_clear()
    return path


@pytest.fixture()
def patterns_root(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setattr(logic_patterns, "LOGIC_PATTERNS_DIR", tmp_path)
    logic_patterns.get_logic_patterns.cache_clear()
    return tmp_path


def test_get_logic_patterns_loads_valid_patterns_json(patterns_root: Path) -> None:
    _write_patterns(patterns_root)

    data = logic_patterns.get_logic_patterns("gakuchika")

    assert data is not None
    assert data["question_type"] == "gakuchika"


def test_get_logic_patterns_rejects_missing_schema_fields(patterns_root: Path) -> None:
    target = patterns_root / "gakuchika"
    target.mkdir()
    (target / "patterns.json").write_text(
        logic_patterns.json.dumps({"question_type": "gakuchika"}, ensure_ascii=False),
        encoding="utf-8",
    )
    logic_patterns.get_logic_patterns.cache_clear()

    assert logic_patterns.get_logic_patterns("gakuchika") is None


def test_get_logic_patterns_rejects_company_name_in_description(patterns_root: Path) -> None:
    _write_patterns(patterns_root, description="KPMGでの経験のように結論を置く")

    assert logic_patterns.get_logic_patterns("gakuchika") is None


def test_get_logic_patterns_returns_none_for_missing_file(patterns_root: Path) -> None:
    assert logic_patterns.get_logic_patterns("gakuchika") is None


def test_build_logic_patterns_block_gates_low_confidence(patterns_root: Path) -> None:
    _write_patterns(patterns_root, "unknown_type", source_count=6)

    assert logic_patterns.build_logic_patterns_block("unknown_type", char_max=400) == ""


def test_build_logic_patterns_block_gates_small_char_max(patterns_root: Path) -> None:
    _write_patterns(patterns_root)

    assert logic_patterns.build_logic_patterns_block("gakuchika", char_max=200) == ""


def test_build_logic_patterns_block_allows_char_max_none(patterns_root: Path) -> None:
    _write_patterns(patterns_root)

    assert "論理アプローチ" in logic_patterns.build_logic_patterns_block("gakuchika")


def test_validate_schema_rejects_unreviewed_patterns(patterns_root: Path) -> None:
    target = patterns_root / "gakuchika"
    target.mkdir(parents=True)
    path = target / "patterns.json"
    payload = {
        "question_type": "gakuchika",
        "source_count": 11,
        "extraction_version": 1,
        "extracted_at": "2026-05-07T00:00:00+09:00",
        "model": "test",
        "human_reviewed": False,
        "copy_safety_hash": "",
        "patterns": [
            {
                "approach_label": "テスト型",
                "approach_description": "テスト用の説明",
                "frequency_count": 5,
                "persuasion_key": "テスト",
            },
        ],
        "section_balance": "テスト",
        "opening_pattern": {"structure": "テスト"},
        "closing_pattern": {"structure": "テスト"},
    }
    path.write_text(logic_patterns.json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    logic_patterns.get_logic_patterns.cache_clear()

    assert logic_patterns.get_logic_patterns("gakuchika") is None


def test_build_logic_patterns_block_formats_primary_and_secondary(patterns_root: Path) -> None:
    _write_patterns(patterns_root)

    block = logic_patterns.build_logic_patterns_block("gakuchika", char_max=400)

    assert "主な論理アプローチ: 課題起点型 (11件中8件)" in block
    assert "補助アプローチ: 役割起点型 (3件)" in block


def test_build_logic_patterns_block_adds_medium_confidence_note(patterns_root: Path) -> None:
    _write_patterns(patterns_root, "self_pr", source_count=5)

    block = logic_patterns.build_logic_patterns_block("self_pr", char_max=400)

    assert "件数が少ない設問タイプのため" in block


def test_build_logic_patterns_block_omits_medium_note_for_high_confidence(patterns_root: Path) -> None:
    _write_patterns(patterns_root)

    block = logic_patterns.build_logic_patterns_block("gakuchika", char_max=400)

    assert "件数が少ない設問タイプのため" not in block


def test_build_logic_patterns_block_includes_opening_and_closing(patterns_root: Path) -> None:
    _write_patterns(patterns_root)

    block = logic_patterns.build_logic_patterns_block("gakuchika", char_max=400)

    assert "冒頭の型: 経験の核を一文で置く" in block
    assert "締めの型: 成果から学びへ接続する" in block


def test_build_logic_patterns_block_includes_safety_note(patterns_root: Path) -> None:
    _write_patterns(patterns_root)

    block = logic_patterns.build_logic_patterns_block("gakuchika", char_max=400)

    assert "既存の骨子や事実より優先しない" in block


def test_build_logic_patterns_block_stays_under_500_chars(patterns_root: Path) -> None:
    _write_patterns(patterns_root)

    block = logic_patterns.build_logic_patterns_block("gakuchika", char_max=400)

    assert len(block) < 500
