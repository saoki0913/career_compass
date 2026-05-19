from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
RUNTIME_DIRS = (
    ROOT / "backend" / "app" / "prompts",
    ROOT / "backend" / "app" / "services" / "es_review",
)
FORBIDDEN_PATTERNS = (
    "backend/app/reference/es_review",
    "REFERENCE_ES_CORPUS_DIR",
    "LOGIC_PATTERNS_DIR",
    "REFERENCE_ES_RAG_ENABLED",
    "reference_es_rag_enabled",
    "retrieve_reference_es_semantic",
    "references.jsonl",
    "patterns.json",
)


def test_reference_es_runtime_boundaries_do_not_depend_on_raw_corpus() -> None:
    offenders: list[str] = []
    for directory in RUNTIME_DIRS:
        for path in directory.rglob("*.py"):
            relative = path.relative_to(ROOT)
            text = path.read_text(encoding="utf-8")
            for pattern in FORBIDDEN_PATTERNS:
                if pattern in text:
                    offenders.append(f"{relative}: {pattern}")

    assert offenders == []
