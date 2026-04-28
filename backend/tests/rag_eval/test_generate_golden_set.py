from __future__ import annotations

import json
from pathlib import Path


def _write_bm25(path: Path, *, company_id: str, company_name: str, tenant_key: str, content_types: list[str]) -> None:
    documents = []
    for idx, content_type in enumerate(content_types):
        documents.append(
            {
                "text": f"{company_name} {content_type} document {idx}",
                "metadata": {
                    "company_name": company_name,
                    "content_type": content_type,
                    "source_url": f"https://example.com/{company_id}/{content_type}/{idx}",
                },
            }
        )
    payload = {
        "version": 2,
        "company_id": company_id,
        "documents": documents,
    }
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


def test_generate_queries_adds_stable_metadata_and_review_status(tmp_path: Path) -> None:
    from evals.rag import generate_golden_set

    tenant_key = "a" * 32
    bm25_dir = tmp_path / "bm25"
    bm25_dir.mkdir()

    content_types = [
        "new_grad_recruitment",
        "corporate_site",
        "employee_interviews",
        "ceo_message",
        "ir_materials",
        "midterm_plan",
    ]
    for idx in range(5):
        company_id = f"company-{idx}"
        _write_bm25(
            bm25_dir / f"{tenant_key}__{company_id}.json",
            company_id=company_id,
            company_name=f"企業{idx}",
            tenant_key=tenant_key,
            content_types=content_types,
        )

    companies = generate_golden_set.load_bm25_files(bm25_dir)
    items = generate_golden_set.generate_queries(companies, target_total=25, max_queries_per_company=5)

    assert len(items) == 25
    assert len({item["query_id"] for item in items}) == 25
    assert {item["metadata"]["review_status"] for item in items} == {"candidate"}
    assert {item["metadata"]["source"] for item in items} == {"auto_bm25"}
    assert all(item["query_type"] in generate_golden_set.QUERY_TYPES for item in items)
    assert all(item["difficulty"] in generate_golden_set.DIFFICULTIES for item in items)
    assert all(item["tenant_key"] == tenant_key for item in items)


def test_load_bm25_files_ignores_company_only_legacy_files(tmp_path: Path) -> None:
    from evals.rag import generate_golden_set

    bm25_dir = tmp_path / "bm25"
    bm25_dir.mkdir()

    _write_bm25(
        bm25_dir / "legacy-company.json",
        company_id="legacy-company",
        company_name="Legacy",
        tenant_key="",
        content_types=["corporate_site", "new_grad_recruitment", "employee_interviews", "ceo_message", "ir_materials"],
    )

    assert generate_golden_set.load_bm25_files(bm25_dir) == {}
