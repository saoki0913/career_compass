from app.prompts.reference_interview_importer import (
    build_reference_entries,
    classify_section_type,
    extract_outline_sections,
)


def test_extract_outline_sections_reads_headings_and_summaries() -> None:
    content = """
### ガクチカ
ベンチャー企業の長期インターンで...
<details>
<summary>課題に対してなにを行ったのか</summary>
\t- エラー解決マニュアルの作成
</details>
### 逆質問
- この会社を選んだ理由は何ですか？
"""

    sections = extract_outline_sections(content)

    assert [section["title"] for section in sections] == [
        "ガクチカ",
        "課題に対してなにを行ったのか",
        "逆質問",
    ]
    assert sections[0]["text"].startswith("ベンチャー企業の長期インターン")
    assert "エラー解決マニュアル" in sections[1]["text"]
    assert "この会社を選んだ理由" in sections[2]["text"]


def test_classify_section_type_maps_interview_focused_labels() -> None:
    assert classify_section_type("自己紹介") == "self_intro"
    assert classify_section_type("ガクチカ深堀") == "gakuchika_followup"
    assert classify_section_type("研究について") == "research"
    assert classify_section_type("逆質問") == "reverse_questions"


def test_build_reference_entries_uses_page_fallback_when_no_outline_exists() -> None:
    page = {
        "source_page_id": "page-1",
        "source_page_title": "面接対策",
        "source_url": "https://example.com/page-1",
        "note_type": "面接準備",
        "company_name": "SMBC",
        "generic": False,
        "matched_signals": ["面接", "志望理由"],
        "content": "Oliveで何ができるか、改善案や新企画まで語れるようにする。",
    }

    entries = build_reference_entries(page)

    assert len(entries) == 1
    assert entries[0]["section_type"] == "interview_tips"
    assert entries[0]["company_name"] == "SMBC"
    assert entries[0]["is_company_specific"] is True
    assert "Olive" in entries[0]["text"]
