#!/usr/bin/env python3
"""Seed tenant-aware RAG eval corpus from existing BM25 JSON documents."""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.append(str(ROOT))

DEFAULT_GOLDEN_PATH = Path(__file__).resolve().parent / "golden" / "company_info_v1.jsonl"
DEFAULT_BM25_DIR = ROOT / "data" / "bm25"


class SeedCorpusError(RuntimeError):
    """Raised when the eval corpus cannot be seeded safely."""


@dataclass(frozen=True)
class SeedCompany:
    company_id: str
    tenant_key: str
    company_name: str
    bm25_path: Path
    legacy_bm25: bool
    source_urls: tuple[str, ...]
    chunks: tuple[dict[str, Any], ...]


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                items.append(json.loads(line))
    return items


def _normalize_url(url: object) -> str:
    return str(url or "").strip().rstrip("/")


def _scalar_metadata(metadata: dict[str, Any]) -> dict[str, Any]:
    return {
        key: value
        for key, value in metadata.items()
        if isinstance(value, (str, int, float, bool))
    }


def _find_bm25_path(
    bm25_dir: Path,
    company_id: str,
    tenant_key: str,
    *,
    allow_legacy_bm25: bool,
) -> tuple[Path, bool] | None:
    tenant_path = bm25_dir / f"{tenant_key}__{company_id}.json"
    if tenant_path.exists():
        return tenant_path, False
    if not allow_legacy_bm25:
        return None
    legacy_path = bm25_dir / f"{company_id}.json"
    if legacy_path.exists():
        return legacy_path, True
    return None


def _company_groups(items: list[dict[str, Any]]) -> dict[tuple[str, str], dict[str, Any]]:
    groups: dict[tuple[str, str], dict[str, Any]] = {}
    for item in items:
        company_id = item.get("company_id")
        tenant_key = item.get("tenant_key")
        if not isinstance(company_id, str) or not company_id:
            raise SeedCorpusError("golden item is missing company_id")
        if not isinstance(tenant_key, str) or not tenant_key:
            raise SeedCorpusError(f"golden item is missing tenant_key: {company_id}")

        key = (tenant_key, company_id)
        group = groups.setdefault(
            key,
            {
                "company_id": company_id,
                "tenant_key": tenant_key,
                "company_name": "",
                "source_urls": set(),
            },
        )

        metadata = item.get("metadata") or {}
        if not group["company_name"] and isinstance(metadata.get("company_name"), str):
            group["company_name"] = metadata["company_name"]
        for url in item.get("gold_sources") or []:
            normalized = _normalize_url(url)
            if normalized:
                group["source_urls"].add(normalized)
    return groups


def _load_bm25_payload(path: Path, expected_company_id: str) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if payload.get("company_id") != expected_company_id:
        raise SeedCorpusError(
            f"BM25 company_id mismatch: path={path} "
            f"expected={expected_company_id} actual={payload.get('company_id')}"
        )
    if not isinstance(payload.get("documents"), list):
        raise SeedCorpusError(f"BM25 documents are missing: {path}")
    return payload


def _chunks_from_payload(
    payload: dict[str, Any],
    *,
    tenant_key: str,
    source_urls: set[str],
    include_all_company_docs: bool,
) -> tuple[dict[str, Any], ...]:
    chunks: list[dict[str, Any]] = []
    for doc in payload.get("documents") or []:
        text = doc.get("text")
        metadata = _scalar_metadata(doc.get("metadata") or {})
        source_url = _normalize_url(metadata.get("source_url"))
        if not include_all_company_docs and source_url not in source_urls:
            continue
        if not isinstance(text, str) or len(text.strip()) < 10:
            continue
        metadata["source_url"] = source_url
        metadata["tenant_key"] = tenant_key
        chunks.append(
            {
                "text": text,
                "type": metadata.get("chunk_type") or "full_text",
                "metadata": metadata,
            }
        )
    return tuple(chunks)


def prepare_seed_companies(
    golden_items: list[dict[str, Any]],
    *,
    bm25_dir: Path = DEFAULT_BM25_DIR,
    strict_missing: bool = False,
    include_all_company_docs: bool = False,
    allow_legacy_bm25: bool = False,
) -> list[SeedCompany]:
    groups = _company_groups(golden_items)
    companies: list[SeedCompany] = []
    missing: list[str] = []

    for (tenant_key, company_id), group in sorted(groups.items()):
        tenant_key = group["tenant_key"]
        source_urls = set(group["source_urls"])
        found = _find_bm25_path(
            bm25_dir,
            company_id,
            tenant_key,
            allow_legacy_bm25=allow_legacy_bm25,
        )
        if found is None:
            missing.append(f"{tenant_key}/{company_id}: tenant-aware BM25 file not found")
            continue
        path, legacy_bm25 = found

        payload = _load_bm25_payload(path, company_id)
        chunks = _chunks_from_payload(
            payload,
            tenant_key=tenant_key,
            source_urls=source_urls,
            include_all_company_docs=include_all_company_docs,
        )
        if not chunks:
            missing.append(
                f"{tenant_key}/{company_id}: no matching BM25 documents for golden sources"
            )
            continue

        company_name = group["company_name"]
        if not company_name:
            first_meta = chunks[0].get("metadata") or {}
            company_name = str(first_meta.get("company_name") or company_id)

        companies.append(
            SeedCompany(
                company_id=company_id,
                tenant_key=tenant_key,
                company_name=company_name,
                bm25_path=path,
                legacy_bm25=legacy_bm25,
                source_urls=tuple(sorted(source_urls)),
                chunks=chunks,
            )
        )

    if missing and strict_missing:
        raise SeedCorpusError("; ".join(missing))
    return companies


def _assert_saved_bm25(company: SeedCompany) -> None:
    from app.utils.bm25_store import BM25_PERSIST_DIR

    path = BM25_PERSIST_DIR / f"{company.tenant_key}__{company.company_id}.json"
    if not path.exists():
        raise SeedCorpusError(f"BM25 output was not written: {path}")

    payload = _load_bm25_payload(path, company.company_id)
    documents = payload.get("documents") or []
    if len(documents) != len(company.chunks):
        raise SeedCorpusError(
            f"BM25 output doc count mismatch for {company.company_id}: "
            f"expected={len(company.chunks)} actual={len(documents)}"
        )

    for doc in documents:
        metadata = doc.get("metadata") or {}
        if metadata.get("tenant_key") != company.tenant_key:
            raise SeedCorpusError(f"BM25 output tenant_key mismatch: {path}")
        if metadata.get("company_id") != company.company_id:
            raise SeedCorpusError(f"BM25 output company_id mismatch: {path}")


async def seed_companies(companies: list[SeedCompany]) -> int:
    from app.rag.vector_store import store_company_info, update_bm25_index

    seeded = 0
    for company in companies:
        source_url = company.source_urls[0] if company.source_urls else ""
        ok = await store_company_info(
            company_id=company.company_id,
            company_name=company.company_name,
            content_chunks=list(company.chunks),
            source_url=source_url,
            tenant_key=company.tenant_key,
        )
        if not ok:
            raise SeedCorpusError(f"failed to seed company_id={company.company_id}")
        if not update_bm25_index(company.company_id, tenant_key=company.tenant_key):
            raise SeedCorpusError(f"failed to update BM25 company_id={company.company_id}")
        _assert_saved_bm25(company)
        seeded += 1
        print(
            f"seeded {company.company_name} ({company.company_id}) "
            f"chunks={len(company.chunks)} sources={len(company.source_urls)}"
        )
    return seeded


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Seed tenant-aware Chroma/BM25 eval corpus from existing BM25 JSON"
    )
    parser.add_argument("--input", type=Path, default=DEFAULT_GOLDEN_PATH)
    parser.add_argument("--bm25-dir", type=Path, default=DEFAULT_BM25_DIR)
    parser.add_argument("--strict-missing", action="store_true")
    parser.add_argument(
        "--allow-legacy-bm25",
        action="store_true",
        help="Allow company-only BM25 fixtures as an explicit migration fallback.",
    )
    parser.add_argument("--include-all-company-docs", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


async def main_async(args: argparse.Namespace) -> int:
    items = load_jsonl(args.input)
    companies = prepare_seed_companies(
        items,
        bm25_dir=args.bm25_dir,
        strict_missing=args.strict_missing,
        include_all_company_docs=args.include_all_company_docs,
        allow_legacy_bm25=args.allow_legacy_bm25,
    )
    total_chunks = sum(len(company.chunks) for company in companies)
    print(
        f"prepared companies={len(companies)} chunks={total_chunks} "
        f"input={args.input} bm25_dir={args.bm25_dir}"
    )
    if args.dry_run:
        for company in companies:
            print(
                f"dry-run {company.company_name} ({company.company_id}) "
                f"chunks={len(company.chunks)} source_file={company.bm25_path} "
                f"legacy_bm25={str(company.legacy_bm25).lower()}"
            )
        return 0

    seeded = await seed_companies(companies)
    print(f"seeded companies={seeded}")
    return 0


def main() -> int:
    args = parse_args()
    try:
        return asyncio.run(main_async(args))
    except SeedCorpusError as exc:
        print(f"seed_eval_corpus failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
