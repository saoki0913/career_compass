from __future__ import annotations

import json
from pathlib import Path

import pytest


def _write_bm25(path: Path, *, company_id: str, source_url: str) -> None:
    payload = {
        "version": 1,
        "company_id": company_id,
        "documents": [
            {
                "doc_id": f"{company_id}-1",
                "text": "採用情報と企業情報を含む評価用テキストです。",
                "metadata": {
                    "company_id": company_id,
                    "company_name": "評価株式会社",
                    "source_url": source_url,
                    "content_type": "new_grad_recruitment",
                    "chunk_type": "full_text",
                },
            },
            {
                "doc_id": f"{company_id}-2",
                "text": "評価対象外のソースです。",
                "metadata": {
                    "company_id": company_id,
                    "company_name": "評価株式会社",
                    "source_url": "https://example.com/other",
                    "content_type": "corporate_site",
                },
            },
        ],
    }
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


def test_prepare_seed_companies_prefers_tenant_aware_bm25(tmp_path: Path) -> None:
    from evals.rag.seed_eval_corpus import prepare_seed_companies

    tenant_key = "a" * 32
    company_id = "company-1"
    source_url = "https://example.com/recruit"
    bm25_dir = tmp_path / "bm25"
    bm25_dir.mkdir()
    _write_bm25(
        bm25_dir / f"{tenant_key}__{company_id}.json",
        company_id=company_id,
        source_url=source_url,
    )

    companies = prepare_seed_companies(
        [
            {
                "company_id": company_id,
                "tenant_key": tenant_key,
                "gold_sources": [f"{source_url}/"],
                "metadata": {"company_name": "評価株式会社"},
            }
        ],
        bm25_dir=bm25_dir,
        strict_missing=True,
    )

    assert len(companies) == 1
    assert companies[0].bm25_path.name == f"{tenant_key}__{company_id}.json"
    assert companies[0].tenant_key == tenant_key
    assert len(companies[0].chunks) == 1
    assert companies[0].chunks[0]["metadata"]["source_url"] == source_url
    assert companies[0].chunks[0]["metadata"]["tenant_key"] == tenant_key


def test_prepare_seed_companies_rejects_legacy_bm25_by_default(tmp_path: Path) -> None:
    from evals.rag.seed_eval_corpus import SeedCorpusError, prepare_seed_companies

    tenant_key = "b" * 32
    company_id = "company-legacy"
    source_url = "https://example.com/recruit"
    bm25_dir = tmp_path / "bm25"
    bm25_dir.mkdir()
    _write_bm25(bm25_dir / f"{company_id}.json", company_id=company_id, source_url=source_url)

    with pytest.raises(SeedCorpusError, match="tenant-aware BM25 file not found"):
        prepare_seed_companies(
            [
                {
                    "company_id": company_id,
                    "tenant_key": tenant_key,
                    "gold_sources": [source_url],
                    "metadata": {"company_name": "評価株式会社"},
                }
            ],
            bm25_dir=bm25_dir,
            strict_missing=True,
        )


def test_prepare_seed_companies_can_read_legacy_bm25_when_explicit(tmp_path: Path) -> None:
    from evals.rag.seed_eval_corpus import prepare_seed_companies

    tenant_key = "b" * 32
    company_id = "company-legacy"
    source_url = "https://example.com/recruit"
    bm25_dir = tmp_path / "bm25"
    bm25_dir.mkdir()
    _write_bm25(bm25_dir / f"{company_id}.json", company_id=company_id, source_url=source_url)

    companies = prepare_seed_companies(
        [
            {
                "company_id": company_id,
                "tenant_key": tenant_key,
                "gold_sources": [source_url],
                "metadata": {"company_name": "評価株式会社"},
            }
        ],
        bm25_dir=bm25_dir,
        strict_missing=True,
        allow_legacy_bm25=True,
    )

    assert len(companies) == 1
    assert companies[0].bm25_path.name == f"{company_id}.json"
    assert companies[0].legacy_bm25 is True
    assert companies[0].chunks[0]["metadata"]["tenant_key"] == tenant_key


def test_prepare_seed_companies_fails_on_missing_source_when_strict(tmp_path: Path) -> None:
    from evals.rag.seed_eval_corpus import SeedCorpusError, prepare_seed_companies

    company_id = "company-1"
    bm25_dir = tmp_path / "bm25"
    bm25_dir.mkdir()
    tenant_key = "c" * 32
    _write_bm25(
        bm25_dir / f"{tenant_key}__{company_id}.json",
        company_id=company_id,
        source_url="https://example.com/recruit",
    )

    with pytest.raises(SeedCorpusError, match="no matching BM25 documents"):
        prepare_seed_companies(
            [
                {
                    "company_id": company_id,
                    "tenant_key": tenant_key,
                    "gold_sources": ["https://example.com/missing"],
                    "metadata": {"company_name": "評価株式会社"},
                }
            ],
            bm25_dir=bm25_dir,
            strict_missing=True,
        )


def test_prepare_seed_companies_groups_by_tenant_and_company(tmp_path: Path) -> None:
    from evals.rag.seed_eval_corpus import prepare_seed_companies

    company_id = "company-shared"
    tenant_a = "a" * 32
    tenant_b = "b" * 32
    source_url = "https://example.com/recruit"
    bm25_dir = tmp_path / "bm25"
    bm25_dir.mkdir()
    _write_bm25(
        bm25_dir / f"{tenant_a}__{company_id}.json",
        company_id=company_id,
        source_url=source_url,
    )
    _write_bm25(
        bm25_dir / f"{tenant_b}__{company_id}.json",
        company_id=company_id,
        source_url=source_url,
    )

    companies = prepare_seed_companies(
        [
            {
                "company_id": company_id,
                "tenant_key": tenant_a,
                "gold_sources": [source_url],
                "metadata": {"company_name": "評価株式会社"},
            },
            {
                "company_id": company_id,
                "tenant_key": tenant_b,
                "gold_sources": [source_url],
                "metadata": {"company_name": "評価株式会社"},
            },
        ],
        bm25_dir=bm25_dir,
        strict_missing=True,
    )

    assert [(company.tenant_key, company.company_id) for company in companies] == [
        (tenant_a, company_id),
        (tenant_b, company_id),
    ]


@pytest.mark.asyncio
async def test_seed_companies_updates_bm25_synchronously(monkeypatch, tmp_path: Path) -> None:
    from app.rag import vector_store
    from app.utils import bm25_store
    from evals.rag.seed_eval_corpus import SeedCompany, seed_companies

    tenant_key = "d" * 32
    company_id = "company-seed"
    calls: list[str] = []
    company = SeedCompany(
        company_id=company_id,
        tenant_key=tenant_key,
        company_name="評価株式会社",
        bm25_path=tmp_path / f"{tenant_key}__{company_id}.json",
        legacy_bm25=False,
        source_urls=("https://example.com/recruit",),
        chunks=(
            {
                "text": "採用情報と企業情報を含む評価用テキストです。",
                "type": "full_text",
                "metadata": {
                    "company_id": company_id,
                    "tenant_key": tenant_key,
                    "source_url": "https://example.com/recruit",
                },
            },
        ),
    )

    async def fake_store_company_info(**kwargs) -> bool:
        calls.append("store")
        assert kwargs["company_id"] == company_id
        assert kwargs["tenant_key"] == tenant_key
        return True

    def fake_update_bm25_index(update_company_id: str, *, tenant_key: str) -> bool:
        calls.append("update_bm25")
        assert update_company_id == company_id
        path = tmp_path / f"{tenant_key}__{update_company_id}.json"
        path.write_text(
            json.dumps(
                {
                    "version": 1,
                    "company_id": update_company_id,
                    "documents": [
                        {
                            "doc_id": "doc-1",
                            "text": company.chunks[0]["text"],
                            "metadata": company.chunks[0]["metadata"],
                        }
                    ],
                },
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
        return True

    monkeypatch.setattr(vector_store, "store_company_info", fake_store_company_info)
    monkeypatch.setattr(vector_store, "update_bm25_index", fake_update_bm25_index)
    monkeypatch.setattr(bm25_store, "BM25_PERSIST_DIR", tmp_path)

    assert await seed_companies([company]) == 1
    assert calls == ["store", "update_bm25"]
