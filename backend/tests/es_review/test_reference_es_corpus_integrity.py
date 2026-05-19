from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
RUNTIME_REFERENCE_DIR = ROOT / "backend" / "app" / "reference" / "es_review"
DOCS_REFERENCE_DIR = ROOT / "docs" / "reference" / "es-review"

_PRIVATE_SOURCE_MARKDOWN = "references_reclassified_by_original_label_types_pruned.md"


def test_reference_es_runtime_corpus_files_are_removed() -> None:
    assert not list(RUNTIME_REFERENCE_DIR.glob("*/references.jsonl"))
    assert not list(RUNTIME_REFERENCE_DIR.glob("*/patterns.json"))


def test_reference_es_offline_source_markdown_is_not_committed() -> None:
    assert not (DOCS_REFERENCE_DIR / _PRIVATE_SOURCE_MARKDOWN).exists()
    assert (DOCS_REFERENCE_DIR / "README.md").exists()
