from __future__ import annotations

from backend.scripts.extract_reference_patterns import ExtractionValidator


def test_bigram_similarity_rejects_high_overlap() -> None:
    validator = ExtractionValidator(["課題を整理して施策を実行した結果、参加率を改善した。"])

    result = validator.validate_pattern("課題を整理して施策を実行した")

    assert result["reject"] is True
    assert "bigram_similarity" in result["reasons"]


def test_trigram_similarity_rejects_high_overlap() -> None:
    validator = ExtractionValidator(["結論から課題を提示し行動と成果を順に述べる。"])

    result = validator.validate_pattern("結論から課題を提示し行動と成果")

    assert result["reject"] is True
    assert "trigram_similarity" in result["reasons"]


def test_abstract_description_passes() -> None:
    validator = ExtractionValidator(["学生団体で参加率を20%改善した。"])

    result = validator.validate_pattern("結論で論点を置き、背景と行動を因果でつなぐ")

    assert result["safe"] is True
    assert result["reject"] is False


def test_company_name_detection_rejects() -> None:
    validator = ExtractionValidator(["経験を述べた。"], known_company_names={"KPMG"})

    result = validator.validate_pattern("KPMGへの志望理由に接続する")

    assert "company_name" in result["reasons"]
    assert result["reject"] is True


def test_person_name_detection_rejects() -> None:
    validator = ExtractionValidator(["経験を述べた。"], person_names={"佐藤"})

    result = validator.validate_pattern("佐藤との関係性を冒頭に置く")

    assert "person_name" in result["reasons"]
    assert result["reject"] is True


def test_corpus_number_detection_rejects() -> None:
    validator = ExtractionValidator(["30名の組織で改善に取り組んだ。"])

    result = validator.validate_pattern("30名規模の成果を説得材料にする")

    assert "corpus_number" in result["reasons"]
    assert result["reject"] is True


def test_generic_number_passes() -> None:
    validator = ExtractionValidator(["30名の組織で改善に取り組んだ。"])

    result = validator.validate_pattern("複数の論点から1つを選び、行動へ接続する")

    assert "corpus_number" not in result["reasons"]
    assert result["reject"] is False


def test_verbatim_sentence_detection_rejects() -> None:
    sentence = "私はゼミで課題を整理し、提出遅延を減らした。"
    validator = ExtractionValidator([sentence])

    result = validator.validate_pattern(f"{sentence}という順で構成する")

    assert "verbatim_sentence" in result["reasons"]
    assert result["reject"] is True


def test_human_review_borderline_similarity() -> None:
    validator = ExtractionValidator(["課題を整理して担当者に共有し、改善を進めた。"])

    result = validator.validate_pattern("課題を整理して関係者に共有する")

    assert result["human_review"] is True
    assert result["reject"] is False


def test_too_long_description_rejects() -> None:
    validator = ExtractionValidator(["経験を述べた。"])

    result = validator.validate_pattern("あ" * 121)

    assert "description_too_long" in result["reasons"]
    assert result["reject"] is True
