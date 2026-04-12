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


def test_build_reference_quality_block_includes_structural_patterns_only_when_enough_filtered_references(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = {
        "version": 1,
        "references": [
            {
                "id": "ref_work_values_001",
                "question_type": "work_values",
                "company_name": "",
                "char_max": 300,
                "title": "work-values-1",
                "text": "私が大切にしているのは、相手の状況を踏まえて動くことだ。アルバイトでは引き継ぎ方法を見直し、問い合わせ対応を15%減らした。今後も周囲の前提をそろえながら成果につなげたい。",
                "capture_kind": "full_text",
            },
            {
                "id": "ref_work_values_002",
                "question_type": "work_values",
                "company_name": "",
                "char_max": 300,
                "title": "work-values-2",
                "text": "私が働くうえで大切にしたいのは、最後まで責任を持つ姿勢だ。ゼミでは担当を超えて進行を補い、提出遅れを0件にした。仕事でも周囲を支えながら成果に責任を持ちたい。",
                "capture_kind": "full_text",
            },
            {
                "id": "ref_work_values_003",
                "question_type": "work_values",
                "company_name": "",
                "char_max": 300,
                "title": "work-values-3",
                "text": "私が重視するのは、課題を放置せず対話で前に進めることだ。サークルでは意見の違いを整理し、参加率を10ポイント高めた。今後も対話を通じて組織に貢献したい。",
                "capture_kind": "full_text",
            },
        ],
    }
    path = tmp_path / "es_references.json"
    path.write_text(reference_es.json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr(reference_es, "REFERENCE_ES_PATH", path)

    block = reference_es.build_reference_quality_block(
        "work_values",
        char_max=300,
        current_answer="周囲と協力しながら進める姿勢を大切にしている。",
    )

    assert "【参考ESから抽出した構成パターン】" in block
    assert "冒頭パターン" in block
    assert "締めパターン" in block
    assert "行動・成果" in block


def test_build_reference_quality_profile_extracts_v2_star_pattern_for_gakuchika(
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
            {
                "id": "ref_g4",
                "question_type": "gakuchika",
                "char_max": 400,
                "text": "私が学生時代に注力したのはサークル運営の改善だ。新入生対応が属人化していたため、担当表と連絡フローを再設計した。結果、参加率を15ポイント高めた。",
                "capture_kind": "full_text",
            },
        ],
    }
    path = tmp_path / "es_references.json"
    path.write_text(reference_es.json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr(reference_es, "REFERENCE_ES_PATH", path)

    profile = reference_es.build_reference_quality_profile("gakuchika", char_max=400)

    assert profile is not None
    assert profile["structural_patterns_v2"] is not None
    assert profile["structural_patterns_v2"]["composition_type"] == "star_sequential"
    assert "中盤" in profile["structural_patterns_v2"]["section_balance_label"]


def test_build_reference_quality_profile_extracts_v2_numbered_reasons_for_intern_reason(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = {
        "version": 1,
        "references": [
            {
                "id": "ref_i1",
                "question_type": "intern_reason",
                "char_max": 200,
                "text": "私が貴社インターンを志望する理由は二つある。第一に、研究で培った分析力を実務で試したいからだ。第二に、現場の意思決定に近い環境で学びたいからだ。",
                "capture_kind": "full_text",
            },
            {
                "id": "ref_i2",
                "question_type": "intern_reason",
                "char_max": 200,
                "text": "参加したい理由は二つある。第一に、仮説検証力を実務課題で試したい。第二に、社員の方の視点を吸収したい。",
                "capture_kind": "full_text",
            },
            {
                "id": "ref_i3",
                "question_type": "intern_reason",
                "char_max": 200,
                "text": "志望理由は二つある。第一に、顧客課題への向き合い方を学びたい。第二に、自分の強みが通用するか確かめたい。",
                "capture_kind": "full_text",
            },
            {
                "id": "ref_i4",
                "question_type": "intern_reason",
                "char_max": 200,
                "text": "参加理由は二点ある。第一に、実務のスピード感を体感したい。第二に、分析結果を施策に結び付ける視点を得たい。",
                "capture_kind": "full_text",
            },
        ],
    }
    path = tmp_path / "es_references.json"
    path.write_text(reference_es.json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr(reference_es, "REFERENCE_ES_PATH", path)

    profile = reference_es.build_reference_quality_profile("intern_reason", char_max=200)

    assert profile is not None
    assert profile["structural_patterns_v2"] is not None
    assert profile["structural_patterns_v2"]["composition_type"] == "numbered_reasons"


def test_build_reference_quality_profile_extracts_v2_single_thread_for_role_course_reason(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = {
        "version": 1,
        "references": [
            {
                "id": "ref_r1",
                "question_type": "role_course_reason",
                "char_max": 400,
                "text": "私がデジタル企画コースを志望するのは、事業理解と技術理解をつなぐ役割に魅力を感じるからだ。研究で論点整理を担った経験を生かし、現場で価値を出したい。",
                "capture_kind": "full_text",
            },
            {
                "id": "ref_r2",
                "question_type": "role_course_reason",
                "char_max": 400,
                "text": "志望理由は、複数の関係者をつなぎながら前に進める役割に適性を感じるからだ。ゼミでの進行設計経験を土台に、事業と実装を橋渡ししたい。",
                "capture_kind": "full_text",
            },
            {
                "id": "ref_r3",
                "question_type": "role_course_reason",
                "char_max": 400,
                "text": "このコースを志望するのは、顧客課題と技術の両方を理解しながら価値を形にしたいからだ。研究活動での整理力を業務で生かしたい。",
                "capture_kind": "full_text",
            },
            {
                "id": "ref_r4",
                "question_type": "role_course_reason",
                "char_max": 400,
                "text": "役割選択の理由は、事業に近い立場で課題解決に関わりたいからだ。関係者調整の経験を生かし、役割の中で価値を発揮したい。",
                "capture_kind": "full_text",
            },
        ],
    }
    path = tmp_path / "es_references.json"
    path.write_text(reference_es.json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr(reference_es, "REFERENCE_ES_PATH", path)

    profile = reference_es.build_reference_quality_profile("role_course_reason", char_max=400)

    assert profile is not None
    assert profile["structural_patterns_v2"] is not None
    assert profile["structural_patterns_v2"]["composition_type"] == "single_thread"


def test_build_reference_quality_profile_keeps_v2_disabled_for_sparse_or_unsupported_templates(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = {
        "version": 1,
        "references": [
            {
                "id": "ref_p1",
                "question_type": "post_join_goals",
                "char_max": 400,
                "text": "入社後は事業理解を深めながら価値を出したい。研究で培った整理力を生かしたい。",
                "capture_kind": "full_text",
            },
            {
                "id": "ref_p2",
                "question_type": "post_join_goals",
                "char_max": 400,
                "text": "将来は現場で経験を積み、事業を前進させたい。原体験を土台に成長したい。",
                "capture_kind": "full_text",
            },
            {
                "id": "ref_p3",
                "question_type": "post_join_goals",
                "char_max": 400,
                "text": "入社後に挑戦したいのは、課題整理を通じて価値創出に関わることだ。経験を積みながら貢献したい。",
                "capture_kind": "full_text",
            },
        ],
    }
    path = tmp_path / "es_references.json"
    path.write_text(reference_es.json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr(reference_es, "REFERENCE_ES_PATH", path)

    profile = reference_es.build_reference_quality_profile("post_join_goals", char_max=400)

    assert profile is not None
    assert profile["structural_patterns_v2"] is None
