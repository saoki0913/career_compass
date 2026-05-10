from pathlib import Path

from app.prompts import reference_es
from app.prompts import logic_patterns
from app.prompts.es_templates._prompt_builder import _format_reference_copy_safety_rules
from app.prompts.es_templates import build_template_rewrite_prompt


def _write_logic_patterns(root: Path, question_type: str = "gakuchika") -> None:
    target = root / question_type
    target.mkdir(parents=True, exist_ok=True)
    (target / "patterns.json").write_text(
        reference_es.json.dumps(
            {
                "question_type": question_type,
                "source_count": 11,
                "human_reviewed": True,
                "patterns": [
                    {
                        "approach_label": "課題起点型",
                        "approach_description": "結論で経験の核を示し、課題と行動を因果でつなぐ",
                        "frequency_count": 8,
                        "persuasion_key": "成果と学びを近くに置く",
                    }
                ],
                "section_balance": "冒頭短め・中盤厚め・締め短め",
                "opening_pattern": {"structure": "経験の核を一文で置く"},
                "closing_pattern": {"structure": "成果から学びへ接続する"},
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    logic_patterns.get_logic_patterns.cache_clear()


def test_reference_quality_block_never_contains_raw_reference_sentence(
    tmp_path: Path,
    monkeypatch,
) -> None:
    corpus_dir = tmp_path / "reference" / "es_review"
    target_dir = corpus_dir / "company_motivation"
    target_dir.mkdir(parents=True)
    raw_sentence = "私が貴社を志望する理由は二つある。"
    record = {
        "id": "copy_safety_001",
        "question_type": "company_motivation",
        "company_name": "KPMG",
        "char_max": 400,
        "capture_kind": "full_text",
        "text": raw_sentence + "第一に、研究経験を通じて課題解決力を磨いたからだ。",
        "source_provenance": "self_owned_reference_es",
        "usage_consent": True,
        "anonymized": True,
        "anonymization_level": "self_owned",
    }
    (target_dir / "references.jsonl").write_text(
        reference_es.json.dumps(record, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(reference_es, "REFERENCE_ES_CORPUS_DIR", corpus_dir)
    monkeypatch.setattr(reference_es, "REFERENCE_ES_PATH", reference_es.DEFAULT_REFERENCE_ES_PATH)

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

    assert raw_sentence not in block
    assert raw_sentence not in system_prompt
    assert "参考ESは品質傾向だけを参考にし" in system_prompt


def test_reference_quality_block_allows_generic_structure_words(
    tmp_path: Path,
    monkeypatch,
) -> None:
    corpus_dir = tmp_path / "reference" / "es_review"
    target_dir = corpus_dir / "gakuchika"
    target_dir.mkdir(parents=True)
    records = [
        {
            "id": f"generic_{index}",
            "question_type": "gakuchika",
            "char_max": 400,
            "capture_kind": "full_text",
            "text": text,
            "source_provenance": "self_owned_reference_es",
            "usage_consent": True,
            "anonymized": True,
            "anonymization_level": "self_owned",
        }
        for index, text in enumerate(
            [
                "私は学園祭で課題を整理し、施策を実行した結果、参加率を20%改善した。",
                "私はゼミで課題を分析し、役割分担を見直した結果、提出遅延を30%減らした。",
                "私は長期インターンで課題を特定し、改善案を実行した結果、対応時間を25%短縮した。",
            ]
        )
    ]
    (target_dir / "references.jsonl").write_text(
        "\n".join(reference_es.json.dumps(record, ensure_ascii=False) for record in records) + "\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(reference_es, "REFERENCE_ES_CORPUS_DIR", corpus_dir)
    monkeypatch.setattr(reference_es, "REFERENCE_ES_PATH", reference_es.DEFAULT_REFERENCE_ES_PATH)

    block = reference_es.build_reference_quality_block(
        "gakuchika",
        char_max=400,
        current_answer="私は運営で改善に取り組んだ。",
    )

    # When a real v2 patterns.json exists for gakuchika, the v2 logic patterns
    # block is rendered instead of the v1 fallback _SP_DESCRIPTIONS.
    # Either the v1 text or the v2 structural terms should appear.
    assert "課題→行動→成果" in block or "課題解決型" in block
    assert records[0]["text"] not in block


def test_logic_patterns_block_never_exposes_raw_text(
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(logic_patterns, "LOGIC_PATTERNS_DIR", tmp_path)
    _write_logic_patterns(tmp_path)
    raw_sentence = "私はゼミで課題を整理し、参加率を改善した。"

    block = reference_es.build_reference_quality_block("gakuchika", char_max=400)

    assert "主な論理アプローチ" in block
    assert raw_sentence not in block


def test_logic_patterns_copy_safety_allows_generic_terms(
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(logic_patterns, "LOGIC_PATTERNS_DIR", tmp_path)
    _write_logic_patterns(tmp_path)

    block = reference_es.build_reference_quality_block("gakuchika", char_max=400)

    assert "課題" in block
    assert "成果" in block


def test_reference_copy_safety_rules_include_logic_pattern_rule() -> None:
    rules = _format_reference_copy_safety_rules()

    assert "論理構成パターンは構成の参考に留め" in rules
    assert "パターン内の例示表現や語句をそのまま使わない" in rules
