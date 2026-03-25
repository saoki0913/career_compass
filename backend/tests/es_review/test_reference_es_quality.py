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
        current_answer="貴社を志望するのは、研究経験を生かして課題解決に挑みたいからだ。",
    )

    assert "参考ESから抽出した品質ヒント" in block
    assert "目安文字数" in block
    assert "今回の回答に対する追加ヒント" in block
    assert "参考ESの本文・語句・特徴的な言い回し・細かな構成順を再利用しない" in block
    assert "参考ESから抽出した骨子" in block
    assert "私が貴社を志望する理由は二つある" not in block


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
