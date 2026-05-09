from pathlib import Path

import pytest

from app.prompts import reference_es
from app.prompts import logic_patterns


@pytest.fixture()
def reference_payload(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    payload = {
        "version": 1,
        "references": [
            {
                "id": "ref_001",
                "question_type": "company_motivation",
                "company_name": "KPMG",
                "char_max": 400,
                "title": "志望理由 400字",
                "text": (
                    "私が貴社を志望する理由は二つある。"
                    "第一に、AI研究と長期インターンで培った課題解決力を生かし、"
                    "顧客の業務変革に貢献したいからだ。"
                    "第二に、多様な業界の課題解決に挑戦したいからだ。"
                ),
            }
        ],
    }
    path = tmp_path / "es_references.json"
    path.write_text(reference_es.json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr(reference_es, "REFERENCE_ES_PATH", path)


def test_build_reference_quality_block_uses_quality_summary(reference_payload: None) -> None:
    block = reference_es.build_reference_quality_block(
        "company_motivation",
        char_max=400,
        company_name="KPMG",
        current_answer="貴社を志望するのは、研究経験を生かして課題解決に挑みたいからだ。",
    )

    assert "参考ESから抽出した品質ヒント" in block
    assert "目安文字数" in block
    assert "今回の回答に対する追加ヒント" in block
    assert "参考ESの本文・語句・特徴的な言い回し・細かな構成順を再利用しない" in block
    assert "参考ESから抽出した骨子" in block
    assert "私が貴社を志望する理由は二つある" not in block


def test_load_reference_examples_uses_template_jsonl_corpus(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    corpus_dir = tmp_path / "reference" / "es_review"
    target_dir = corpus_dir / "company_motivation"
    target_dir.mkdir(parents=True)
    distinctive_sentence = "私が貴社を志望する理由は二つある。"
    records = [
        {
            "id": "jsonl_ref_001",
            "question_type": "company_motivation",
            "company_name": "KPMG",
            "char_max": 400,
            "title": "jsonl",
            "capture_kind": "full_text",
            "text": distinctive_sentence + "研究経験を生かして課題解決に貢献したい。",
            "source_provenance": "self_owned_reference_es",
            "usage_consent": True,
            "anonymized": True,
            "anonymization_level": "self_owned",
        }
    ]
    (target_dir / "references.jsonl").write_text(
        "\n".join(reference_es.json.dumps(record, ensure_ascii=False) for record in records) + "\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(reference_es, "REFERENCE_ES_CORPUS_DIR", corpus_dir)
    monkeypatch.setattr(reference_es, "REFERENCE_ES_PATH", reference_es.DEFAULT_REFERENCE_ES_PATH)

    examples = reference_es.load_reference_examples(
        "company_motivation",
        char_max=400,
        company_name="KPMG",
    )
    block = reference_es.build_reference_quality_block(
        "company_motivation",
        char_max=400,
        company_name="KPMG",
    )

    assert [example["id"] for example in examples] == ["jsonl_ref_001"]
    assert "参考件数: 1件" in block
    assert distinctive_sentence not in block


def test_load_reference_examples_ignores_unconsented_jsonl_records(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    corpus_dir = tmp_path / "reference" / "es_review"
    target_dir = corpus_dir / "gakuchika"
    target_dir.mkdir(parents=True)
    records = [
        {
            "id": "missing_consent",
            "question_type": "gakuchika",
            "char_max": 400,
            "capture_kind": "full_text",
            "text": "学園祭で課題を整理し、参加率を20%改善した。",
            "source_provenance": "self_owned_reference_es",
            "usage_consent": False,
            "anonymized": True,
            "anonymization_level": "self_owned",
        },
        {
            "id": "usable",
            "question_type": "gakuchika",
            "char_max": 400,
            "capture_kind": "full_text",
            "text": "私は学園祭で課題を整理し、参加率を20%改善した。",
            "source_provenance": "self_owned_reference_es",
            "usage_consent": True,
            "anonymized": True,
            "anonymization_level": "self_owned",
        },
    ]
    (target_dir / "references.jsonl").write_text(
        "\n".join(reference_es.json.dumps(record, ensure_ascii=False) for record in records) + "\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(reference_es, "REFERENCE_ES_CORPUS_DIR", corpus_dir)
    monkeypatch.setattr(reference_es, "REFERENCE_ES_PATH", reference_es.DEFAULT_REFERENCE_ES_PATH)

    examples = reference_es.load_reference_examples("gakuchika", char_max=400)

    assert [example["id"] for example in examples] == ["usable"]


def test_load_reference_examples_does_not_fallback_to_private_json_when_corpus_empty(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    corpus_dir = tmp_path / "reference" / "es_review"
    (corpus_dir / "company_motivation").mkdir(parents=True)
    (corpus_dir / "company_motivation" / "references.jsonl").write_text("", encoding="utf-8")
    legacy_path = tmp_path / "private_reference.json"
    legacy_path.write_text(
        reference_es.json.dumps(
            {
                "references": [
                    {
                        "id": "legacy_ref",
                        "question_type": "company_motivation",
                        "char_max": 400,
                        "text": "この旧ローカル参考ESはproduction corpusが空でも使わない。",
                    }
                ]
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(reference_es, "REFERENCE_ES_CORPUS_DIR", corpus_dir)
    monkeypatch.setattr(reference_es, "DEFAULT_REFERENCE_ES_PATH", legacy_path)
    monkeypatch.setattr(reference_es, "REFERENCE_ES_PATH", legacy_path)

    assert reference_es.load_reference_examples("company_motivation", char_max=400) == []


def test_build_reference_quality_profile_summarizes_reference_stats(reference_payload: None) -> None:
    profile = reference_es.build_reference_quality_profile(
        "company_motivation",
        char_max=400,
        company_name="KPMG",
        current_answer="貴社を志望するのは、研究経験を生かして課題解決に挑みたいからだ。",
    )

    assert profile is not None
    assert profile["reference_count"] == 1
    assert profile["average_chars"] > 0
    assert profile["char_stddev"] == 0.0
    assert profile["sentence_stddev"] == 0.0
    assert profile["conclusion_first_rate"] >= 0
    assert profile["variance_band"] == "low"
    assert profile["quality_hints"]
    assert profile["skeleton"]
    assert profile["conditional_hints_applied"] is True
    assert profile["conditional_hints"]


def test_build_reference_quality_profile_falls_back_to_static_guidance_without_corpus(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    corpus_dir = tmp_path / "reference" / "es_review"
    (corpus_dir / "self_pr").mkdir(parents=True)
    (corpus_dir / "self_pr" / "references.jsonl").write_text("", encoding="utf-8")
    monkeypatch.setattr(reference_es, "REFERENCE_ES_CORPUS_DIR", corpus_dir)
    monkeypatch.setattr(reference_es, "REFERENCE_ES_PATH", reference_es.DEFAULT_REFERENCE_ES_PATH)

    profile = reference_es.build_reference_quality_profile("self_pr", char_max=400)
    block = reference_es.build_reference_quality_block("self_pr", char_max=400)

    assert profile is not None
    assert profile["reference_count"] == 0
    assert profile["quality_hints"] == reference_es.QUESTION_TYPE_QUALITY_HINTS["self_pr"]
    assert profile["skeleton"] == reference_es.QUESTION_TYPE_SKELETONS["self_pr"]
    assert "参考件数: 0件" in block
    assert "1文目で強みの核を結論として言い切る" in block


def test_build_reference_quality_profile_adds_length_guidance_only_for_large_gap(
    reference_payload: None,
) -> None:
    profile = reference_es.build_reference_quality_profile(
        "company_motivation",
        char_max=400,
        company_name="KPMG",
        current_answer="貴社を志望する。",
    )

    assert profile is not None
    assert any("かなり短い" in hint for hint in profile["conditional_hints"])


def _write_logic_patterns(root: Path, question_type: str, *, source_count: int = 11) -> None:
    target = root / question_type
    target.mkdir(parents=True, exist_ok=True)
    (target / "patterns.json").write_text(
        reference_es.json.dumps(
            {
                "question_type": question_type,
                "source_count": source_count,
                "human_reviewed": True,
                "patterns": [
                    {
                        "approach_label": "課題起点型",
                        "approach_description": "結論で経験の核を示し、課題と行動を因果でつなぐ",
                        "frequency_count": 8,
                        "persuasion_key": "行動理由と成果を近くに置く",
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


def test_reference_quality_block_uses_logic_patterns_when_available(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(logic_patterns, "LOGIC_PATTERNS_DIR", tmp_path)
    _write_logic_patterns(tmp_path, "gakuchika")

    block = reference_es.build_reference_quality_block("gakuchika", char_max=400)

    assert "主な論理アプローチ" in block
    assert "冒頭パターン:" not in block


def test_reference_quality_block_omits_structural_block_when_patterns_missing(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    corpus_dir = tmp_path / "reference" / "es_review"
    target_dir = corpus_dir / "gakuchika"
    target_dir.mkdir(parents=True)
    records = [
        {
            "id": f"ref_{index}",
            "question_type": "gakuchika",
            "char_max": 400,
            "capture_kind": "full_text",
            "text": f"私はゼミで課題を整理した。行動を改善した結果、提出遅延を{index + 1}件減らした。",
            "source_provenance": "self_owned_reference_es",
            "usage_consent": True,
            "anonymized": True,
        }
        for index in range(3)
    ]
    (target_dir / "references.jsonl").write_text(
        "\n".join(reference_es.json.dumps(record, ensure_ascii=False) for record in records) + "\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(reference_es, "REFERENCE_ES_CORPUS_DIR", corpus_dir)
    monkeypatch.setattr(reference_es, "REFERENCE_ES_PATH", reference_es.DEFAULT_REFERENCE_ES_PATH)
    monkeypatch.setattr(logic_patterns, "LOGIC_PATTERNS_DIR", tmp_path / "missing")
    logic_patterns.get_logic_patterns.cache_clear()

    block = reference_es.build_reference_quality_block("gakuchika", char_max=400)

    assert "主な論理アプローチ" not in block
    assert "【参考ESから抽出した構成パターン】" not in block


def test_reference_quality_block_gates_logic_patterns_by_char_max(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(logic_patterns, "LOGIC_PATTERNS_DIR", tmp_path)
    _write_logic_patterns(tmp_path, "gakuchika")

    block = reference_es.build_reference_quality_block("gakuchika", char_max=200)

    assert "主な論理アプローチ" not in block


def test_reference_quality_block_medium_confidence_type_shows_patterns(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(logic_patterns, "LOGIC_PATTERNS_DIR", tmp_path)
    _write_logic_patterns(tmp_path, "work_values", source_count=4)

    block = reference_es.build_reference_quality_block("work_values", char_max=400)

    assert "主な論理アプローチ" in block
    assert "件数が少ない設問タイプのため" in block


def test_build_reference_quality_profile_adds_variance_hint_for_high_variance(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = {
        "version": 1,
        "references": [
            {
                "id": "ref_001",
                "question_type": "basic",
                "company_name": "",
                "char_max": 400,
                "title": "basic-1",
                "text": "私はゼミ活動で企画運営に取り組み、課題の整理と実行を担った。",
            },
            {
                "id": "ref_002",
                "question_type": "basic",
                "company_name": "",
                "char_max": 400,
                "title": "basic-2",
                "text": (
                    "私はアルバイト先の改善提案に注力した。"
                    "課題を洗い出し、関係者へのヒアリングを重ね、運用ルールを見直した結果、待ち時間を三割削減した。"
                    "さらに新メンバー向けの共有資料も整備し、引き継ぎの負荷も下げた。"
                ),
            },
            {
                "id": "ref_003",
                "question_type": "basic",
                "company_name": "",
                "char_max": 400,
                "title": "basic-3",
                "text": (
                    "私は学生団体で広報を担当し、SNS運用の改善に取り組んだ。"
                    "分析結果を踏まえて投稿時間帯や訴求軸を見直し、応募者数を増やした。"
                ),
            },
        ],
    }
    path = tmp_path / "es_references.json"
    path.write_text(reference_es.json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr(reference_es, "REFERENCE_ES_PATH", path)

    profile = reference_es.build_reference_quality_profile(
        "basic",
        char_max=400,
        current_answer="私は学園祭の運営で周囲を巻き込みながら改善を進めた。",
    )

    assert profile is not None
    assert profile["variance_band"] == "high"
    assert any("型にはめすぎず" in hint for hint in profile["conditional_hints"])


def test_build_reference_quality_profile_excludes_notes_and_summary_entries_from_stats(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = {
        "version": 1,
        "references": [
            {
                "id": "notes_self_pr_001",
                "question_type": "self_pr",
                "company_name": "",
                "char_max": 400,
                "title": "notes",
                "text": "継続力を軸に話す。",
                "capture_kind": "summary",
            },
            {
                "id": "ref_self_pr_001",
                "question_type": "self_pr",
                "company_name": "",
                "char_max": 400,
                "title": "self_pr-1",
                "text": "私の強みは、課題を分解し、周囲を巻き込みながら最後までやり切る力だ。ゼミでは議論が停滞した際に論点を整理し、役割分担を見直した結果、発表準備を予定より1週間早く完了させた。入社後も関係者を巻き込みながら業務を前進させたい。",
                "capture_kind": "full_text",
            },
        ],
    }
    path = tmp_path / "es_references.json"
    path.write_text(reference_es.json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr(reference_es, "REFERENCE_ES_PATH", path)

    profile = reference_es.build_reference_quality_profile(
        "self_pr",
        char_max=400,
        current_answer="私の強みは、最後までやり切る力だ。",
    )

    assert profile is not None
    assert profile["reference_count"] == 1
    assert profile["average_chars"] > 50


def test_build_reference_quality_profile_adds_conclusion_and_digit_hints(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = {
        "version": 1,
        "references": [
            {
                "id": "ref_gakuchika_001",
                "question_type": "gakuchika",
                "company_name": "",
                "char_max": 400,
                "title": "gakuchika-1",
                "text": "私が学生時代に力を入れたのは学園祭運営の改善だ。来場者導線を見直し、担当を再配置した結果、待ち時間を30%削減した。",
                "capture_kind": "full_text",
            },
            {
                "id": "ref_gakuchika_002",
                "question_type": "gakuchika",
                "company_name": "",
                "char_max": 400,
                "title": "gakuchika-2",
                "text": "私が力を入れたのはゼミ運営の立て直しだ。議論の進め方を見直し、参加率を20人から28人へ伸ばした。",
                "capture_kind": "full_text",
            },
            {
                "id": "ref_gakuchika_003",
                "question_type": "gakuchika",
                "company_name": "",
                "char_max": 400,
                "title": "gakuchika-3",
                "text": "私が最も力を入れたのは研究室の情報共有改善だ。記録方法を統一し、確認工数を2割減らした。",
                "capture_kind": "full_text",
            },
        ],
    }
    path = tmp_path / "es_references.json"
    path.write_text(reference_es.json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr(reference_es, "REFERENCE_ES_PATH", path)

    profile = reference_es.build_reference_quality_profile(
        "gakuchika",
        char_max=400,
        current_answer="学園祭運営で情報共有を改善した。周囲と協力しながら進めた。",
    )

    assert profile is not None
    assert any("冒頭1文で取り組みの核を置き" in hint for hint in profile["conditional_hints"])
    assert any("数字や比較" in hint for hint in profile["conditional_hints"])


@pytest.mark.parametrize(
    ("question_type", "expected_hint"),
    [
        ("basic", "結論として"),
        ("company_motivation", "結論として"),
        ("intern_reason", "結論として"),
        ("intern_goals", "結論として"),
        ("gakuchika", "結論として"),
        ("self_pr", "結論として"),
        ("post_join_goals", "結論として"),
        ("role_course_reason", "結論として"),
        ("work_values", "結論として"),
    ],
)
def test_quality_hints_require_short_opening_conclusion(
    question_type: str,
    expected_hint: str,
) -> None:
    assert any(expected_hint in hint for hint in reference_es.QUESTION_TYPE_QUALITY_HINTS[question_type])


def test_company_motivation_quality_hints_warn_on_repeating_company_name() -> None:
    assert any(
        "企業固有情報" in hint and "1軸" in hint
        for hint in reference_es.QUESTION_TYPE_QUALITY_HINTS["company_motivation"]
    )


@pytest.mark.parametrize("question_type", ["intern_reason", "intern_goals", "role_course_reason"])
def test_intern_and_role_quality_hints_include_proper_noun_generalization(question_type: str) -> None:
    assert any(
        "本インターンシップ" in hint or "本コース" in hint or "本プログラム" in hint
        for hint in reference_es.QUESTION_TYPE_QUALITY_HINTS[question_type]
    )


@pytest.mark.parametrize("question_type", ["self_pr", "work_values"])
def test_self_pr_and_work_values_quality_hints_require_numbers_and_actions(question_type: str) -> None:
    hints = reference_es.QUESTION_TYPE_QUALITY_HINTS[question_type]
    assert any("数値" in hint or "人数" in hint or "期間" in hint for hint in hints)
    assert any("行動動詞" in hint or "具体例" in hint for hint in hints)


def test_gakuchika_quality_hints_warn_against_listing_without_order() -> None:
    assert any(
        "また" in hint or "さらに" in hint or "順序" in hint
        for hint in reference_es.QUESTION_TYPE_QUALITY_HINTS["gakuchika"]
    )


def test_quality_hints_do_not_include_ng_prefix_anymore() -> None:
    for hints in reference_es.QUESTION_TYPE_QUALITY_HINTS.values():
        assert all(not hint.startswith("NG:") for hint in hints)


def test_build_reference_quality_block_includes_sentence_flow_when_available(
    reference_payload: None,
) -> None:
    block = reference_es.build_reference_quality_block(
        "company_motivation",
        char_max=400,
        company_name="KPMG",
    )

    assert "【文レベルの流れ】" in block
    assert "なぜその企業かの核心を言い切る" in block
    assert "接続:" in block


def test_build_reference_quality_block_uses_logic_patterns_for_work_values(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(logic_patterns, "LOGIC_PATTERNS_DIR", tmp_path)
    _write_logic_patterns(tmp_path, "work_values", source_count=4)

    block = reference_es.build_reference_quality_block(
        "work_values",
        char_max=300,
        current_answer="周囲と協力しながら進める姿勢を大切にしている。",
    )

    assert "【参考ESから抽出した構成パターン】" in block
    assert "主な論理アプローチ" in block


def test_build_reference_quality_profile_omits_structural_patterns_v2(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = {
        "version": 1,
        "references": [
            {
                "id": "ref_g1",
                "question_type": "gakuchika",
                "char_max": 400,
                "text": "私が学生時代に力を入れたのは学園祭運営の改善だ。来場者の待ち時間が長い課題に対し、導線と担当配置を見直した。結果として待ち時間を30%削減し、来場者満足度を高めた。",
                "capture_kind": "full_text",
            },
            {
                "id": "ref_g2",
                "question_type": "gakuchika",
                "char_max": 400,
                "text": "私が力を入れたのはゼミ運営の立て直しだ。議論が停滞する課題に対して論点整理の型を導入し、役割分担も見直した。結果、準備期間を1週間短縮した。",
                "capture_kind": "full_text",
            },
            {
                "id": "ref_g3",
                "question_type": "gakuchika",
                "char_max": 400,
                "text": "私が最も力を入れたのは研究室の共有改善だ。記録の粒度がばらつく課題に対し、議事録テンプレートを統一した。結果として確認工数を2割減らした。",
                "capture_kind": "full_text",
            },
        ],
    }
    path = tmp_path / "es_references.json"
    path.write_text(reference_es.json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr(reference_es, "REFERENCE_ES_PATH", path)

    profile = reference_es.build_reference_quality_profile("gakuchika", char_max=400)

    assert profile is not None
    assert "structural_patterns_v2" not in profile
