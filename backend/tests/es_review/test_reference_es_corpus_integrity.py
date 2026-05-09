import json
from pathlib import Path

import pytest

from app.prompts import reference_es

BACKEND_PATTERNS_DIR = Path(__file__).resolve().parents[2] / "app" / "reference" / "es_review"
DOCS_PATTERNS_DIR = Path(__file__).resolve().parents[3] / "docs" / "prompts" / "es-review" / "logic-patterns"

_QUESTION_TYPES = [
    "basic",
    "company_motivation",
    "gakuchika",
    "intern_goals",
    "intern_reason",
    "post_join_goals",
    "role_course_reason",
    "self_pr",
    "work_values",
]


@pytest.mark.parametrize("question_type", _QUESTION_TYPES)
def test_docs_and_runtime_patterns_json_are_identical(question_type: str) -> None:
    backend_path = BACKEND_PATTERNS_DIR / question_type / "patterns.json"
    docs_path = DOCS_PATTERNS_DIR / f"{question_type}.json"

    assert backend_path.exists(), f"missing backend: {backend_path}"
    assert docs_path.exists(), f"missing docs: {docs_path}"

    backend_data = json.loads(backend_path.read_text(encoding="utf-8"))
    docs_data = json.loads(docs_path.read_text(encoding="utf-8"))

    assert backend_data == docs_data, f"{question_type}: docs and backend differ"


@pytest.mark.parametrize("question_type", _QUESTION_TYPES)
def test_patterns_json_is_human_reviewed(question_type: str) -> None:
    data = json.loads(
        (BACKEND_PATTERNS_DIR / question_type / "patterns.json")
        .read_text(encoding="utf-8")
    )
    assert data.get("human_reviewed") is True


def test_committed_reference_es_jsonl_corpus_is_prompt_safe() -> None:
    corpus_dir = reference_es.REFERENCE_ES_CORPUS_DIR
    files = sorted(corpus_dir.glob("*/references.jsonl"))

    assert files
    for path in files:
        question_type = path.parent.name
        for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
            if not line.strip():
                continue
            record = json.loads(line)

            assert record["question_type"] == question_type, (path, line_number)
            assert record["capture_kind"] == "full_text", (path, line_number, record.get("id"))
            assert record["usage_consent"] is True, (path, line_number, record.get("id"))
            assert record["anonymized"] is True, (path, line_number, record.get("id"))
            assert record["anonymization_level"] == "self_owned", (
                path,
                line_number,
                record.get("id"),
            )
            assert record.get("source_provenance") == "self_owned_reference_es", (
                path,
                line_number,
                record.get("id"),
            )
            assert reference_es._is_reference_text_usable(  # noqa: SLF001
                record.get("text") or "",
                record.get("char_max"),
            ), (path, line_number, record.get("id"))
