from app.prompts.reference_notes_importer import (
    build_corpus_entries,
    build_es_view_entries,
    infer_feature_targets,
)


def test_build_corpus_entries_extracts_explicit_qa_pair() -> None:
    page = {
        "source_page_id": "page-1",
        "source_page_title": "三菱UFJ ES",
        "source_url": "https://example.com/page-1",
        "note_type": "ES",
        "company_name": "三菱UFJ",
        "is_company_specific": True,
        "matched_signals": ["志望動機", "ES"],
        "capture_kind": "full_excerpt",
        "content": """
### 志望動機
Q: なぜ当社を志望するのですか？
A: 研究で培ったAIの知見を金融の実課題に社会実装したいからです。
""",
    }

    entries = build_corpus_entries(page)

    assert len(entries) == 1
    assert entries[0]["question_text"] == "なぜ当社を志望するのですか？"
    assert entries[0]["answer_text"] == "研究で培ったAIの知見を金融の実課題に社会実装したいからです。"
    assert entries[0]["extraction_unit"] == "qa_pair"
    assert entries[0]["reference_kind"] == "company_motivation"
    assert "motivation" in entries[0]["feature_targets"]


def test_build_corpus_entries_extracts_standalone_answer_from_heading() -> None:
    page = {
        "source_page_id": "page-2",
        "source_page_title": "就活の軸",
        "source_url": "https://example.com/page-2",
        "note_type": "自己分析",
        "company_name": None,
        "is_company_specific": False,
        "matched_signals": ["就活の軸", "自己分析"],
        "capture_kind": "full_excerpt",
        "content": """
### 就活の軸
成長できる環境があるか。
社会課題を解決する仕事ができるか。
""",
    }

    entries = build_corpus_entries(page)

    assert len(entries) == 1
    assert entries[0]["question_text"] == "就活の軸"
    assert entries[0]["answer_text"] == "成長できる環境があるか。\n社会課題を解決する仕事ができるか。"
    assert entries[0]["extraction_unit"] == "standalone_answer"
    assert entries[0]["reference_kind"] == "work_values"
    assert "es_review" in entries[0]["feature_targets"]


def test_build_es_view_entries_only_keeps_es_compatible_records() -> None:
    corpus_entries = [
        {
            "id": "corp-1",
            "source_page_id": "page-1",
            "source_page_title": "三菱UFJ ES",
            "source_url": "https://example.com/page-1",
            "note_type": "ES",
            "company_name": "三菱UFJ",
            "is_company_specific": True,
            "question_text": "なぜ当社を志望するのですか？",
            "answer_text": "研究で培ったAIの知見を社会実装したいからです。",
            "extraction_unit": "qa_pair",
            "reference_kind": "company_motivation",
            "feature_targets": infer_feature_targets("company_motivation"),
            "matched_signals": ["志望動機"],
            "capture_kind": "full_excerpt",
        },
        {
            "id": "corp-2",
            "source_page_id": "page-2",
            "source_page_title": "OB訪問",
            "source_url": "https://example.com/page-2",
            "note_type": "企業分析",
            "company_name": "IBM",
            "is_company_specific": True,
            "question_text": "逆質問",
            "answer_text": "若手が挑戦できる機会はありますか？",
            "extraction_unit": "standalone_answer",
            "reference_kind": "reverse_questions",
            "feature_targets": infer_feature_targets("reverse_questions"),
            "matched_signals": ["逆質問"],
            "capture_kind": "full_excerpt",
        },
    ]

    es_entries = build_es_view_entries(corpus_entries)

    assert len(es_entries) == 1
    assert es_entries[0]["question_type"] == "company_motivation"
    assert es_entries[0]["company_name"] == "三菱UFJ"
    assert es_entries[0]["text"] == "研究で培ったAIの知見を社会実装したいからです。"
    assert es_entries[0]["source_question"] == "なぜ当社を志望するのですか？"
