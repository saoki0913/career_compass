from pathlib import Path

import pytest

from app.prompts import reference_es


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
    )

    assert "参考ESから抽出した品質ヒント" in block
    assert "目安文字数" in block
    assert "参考ESの本文・語句・特徴的な言い回し・細かな構成順を再利用しない" in block
    assert "参考ESから抽出した骨子" in block
    assert "私が貴社を志望する理由は二つある" not in block


def test_build_reference_quality_profile_summarizes_reference_stats(reference_payload: None) -> None:
    profile = reference_es.build_reference_quality_profile(
        "company_motivation",
        char_max=400,
        company_name="KPMG",
    )

    assert profile is not None
    assert profile["reference_count"] == 1
    assert profile["average_chars"] > 0
    assert profile["conclusion_first_rate"] >= 0
    assert profile["quality_hints"]
    assert profile["skeleton"]


def test_detect_reference_text_overlap_flags_close_copy(reference_payload: None) -> None:
    is_overlap, reason = reference_es.detect_reference_text_overlap(
        "私が貴社を志望する理由は二つある。第一に、AI研究と長期インターンで培った課題解決力を生かし、顧客の業務変革に貢献したいからだ。",
        "company_motivation",
        char_max=400,
        company_name="KPMG",
    )

    assert is_overlap is True
    assert reason is not None


def test_detect_reference_text_overlap_allows_rewritten_output(reference_payload: None) -> None:
    is_overlap, reason = reference_es.detect_reference_text_overlap(
        "貴社を志望するのは、研究と開発実務で培った仮説検証力を、企業変革の支援に広げたいからだ。"
        "幅広い業界課題に向き合いながら、技術を価値創出へつなげたい。",
        "company_motivation",
        char_max=400,
        company_name="KPMG",
    )

    assert is_overlap is False
    assert reason is None
