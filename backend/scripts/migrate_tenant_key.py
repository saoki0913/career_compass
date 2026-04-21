#!/usr/bin/env python3
"""
Tenant key migration script.

Backfills tenant_key metadata into existing ChromaDB documents and renames
BM25 index files to use tenant-aware paths ({tenant_key}__{company_id}).

Usage:
    python scripts/migrate_tenant_key.py --dry-run
    python scripts/migrate_tenant_key.py --verbose --batch-size 50
"""
from __future__ import annotations

import argparse
import hashlib
import hmac
import os
import sys
from dataclasses import dataclass, field
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_ROOT))

import chromadb
from chromadb.config import Settings as ChromaSettings

CHROMA_DIR = BACKEND_ROOT / "data" / "chroma"
BM25_DIR = BACKEND_ROOT / "data" / "bm25"


def compute_tenant_key(actor_kind: str, actor_id: str, secret: str) -> str:
    msg = f"{actor_kind}:{actor_id}".encode()
    return hmac.new(secret.encode(), msg, hashlib.sha256).hexdigest()[:32]


@dataclass
class CompanyOwner:
    company_id: str
    actor_kind: str
    actor_id: str


@dataclass
class MigrationResult:
    companies_total: int = 0
    companies_processed: int = 0
    companies_skipped: int = 0
    companies_errored: int = 0
    chroma_documents_scanned: int = 0
    chroma_documents_updated: int = 0
    bm25_files_renamed: int = 0
    bm25_files_skipped: int = 0
    errors: list[str] = field(default_factory=list)


def resolve_company_owner(row: tuple) -> CompanyOwner | None:
    company_id, user_id, guest_id = row

    has_user = user_id is not None and str(user_id).strip()
    has_guest = guest_id is not None and str(guest_id).strip()

    if has_user and has_guest:
        print(f"  WARNING: company {company_id} has both user_id and guest_id, skipping")
        return None
    if not has_user and not has_guest:
        print(f"  WARNING: company {company_id} has no owner, skipping")
        return None

    if has_user:
        return CompanyOwner(company_id=company_id, actor_kind="user", actor_id=str(user_id))
    return CompanyOwner(company_id=company_id, actor_kind="guest", actor_id=str(guest_id))


def fetch_companies(database_url: str) -> list[tuple]:
    try:
        import psycopg2
    except ImportError:
        print("ERROR: psycopg2 not installed. Install with: pip install psycopg2-binary")
        sys.exit(1)

    conn = psycopg2.connect(database_url)
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id, user_id, guest_id FROM companies ORDER BY id")
            return cur.fetchall()
    finally:
        conn.close()


def backfill_chroma_collection(
    collection: chromadb.Collection,
    company_id: str,
    tenant_key: str,
    *,
    dry_run: bool,
    batch_size: int,
    verbose: bool,
    result: MigrationResult,
) -> None:
    docs = collection.get(
        where={"company_id": company_id},
        include=["metadatas"],
    )

    ids = docs.get("ids", [])
    metadatas = docs.get("metadatas", [])
    if not ids:
        return

    ids_to_update = []
    metadatas_to_update = []

    for doc_id, metadata in zip(ids, metadatas):
        result.chroma_documents_scanned += 1
        if metadata and metadata.get("tenant_key"):
            continue
        updated = dict(metadata or {})
        updated["tenant_key"] = tenant_key
        ids_to_update.append(doc_id)
        metadatas_to_update.append(updated)

    if not ids_to_update:
        if verbose:
            print(f"    {collection.name}: {len(ids)} docs already have tenant_key")
        return

    if dry_run:
        print(f"    [DRY-RUN] {collection.name}: would update {len(ids_to_update)}/{len(ids)} docs")
        result.chroma_documents_updated += len(ids_to_update)
        return

    for i in range(0, len(ids_to_update), batch_size):
        batch_ids = ids_to_update[i : i + batch_size]
        batch_meta = metadatas_to_update[i : i + batch_size]
        collection.update(ids=batch_ids, metadatas=batch_meta)

    result.chroma_documents_updated += len(ids_to_update)
    if verbose:
        print(f"    {collection.name}: updated {len(ids_to_update)}/{len(ids)} docs")


def rename_bm25_files(
    company_id: str,
    tenant_key: str,
    *,
    bm25_dir: Path,
    dry_run: bool,
    verbose: bool,
    result: MigrationResult,
) -> None:
    new_stem = f"{tenant_key}__{company_id}"

    for ext in (".json", ".pkl"):
        old_path = bm25_dir / f"{company_id}{ext}"
        new_path = bm25_dir / f"{new_stem}{ext}"

        if not old_path.exists():
            continue
        if new_path.exists():
            if verbose:
                print(f"    BM25: {new_path.name} already exists, skipping")
            result.bm25_files_skipped += 1
            continue

        if dry_run:
            print(f"    [DRY-RUN] BM25: would rename {old_path.name} -> {new_path.name}")
        else:
            os.rename(old_path, new_path)
            if verbose:
                print(f"    BM25: renamed {old_path.name} -> {new_path.name}")
        result.bm25_files_renamed += 1


def migrate_company(
    owner: CompanyOwner,
    tenant_key: str,
    *,
    chroma_client: chromadb.PersistentClient | None,
    bm25_dir: Path,
    dry_run: bool,
    batch_size: int,
    verbose: bool,
    result: MigrationResult,
) -> None:
    if chroma_client is not None:
        collections = chroma_client.list_collections()
        for col in collections:
            col_name = col if isinstance(col, str) else getattr(col, "name", str(col))
            if not col_name.startswith("company_info"):
                continue
            try:
                collection = chroma_client.get_collection(name=col_name)
                backfill_chroma_collection(
                    collection,
                    owner.company_id,
                    tenant_key,
                    dry_run=dry_run,
                    batch_size=batch_size,
                    verbose=verbose,
                    result=result,
                )
            except Exception as e:
                msg = f"ChromaDB error for {owner.company_id} in {col_name}: {e}"
                print(f"    ERROR: {msg}")
                result.errors.append(msg)

    rename_bm25_files(
        owner.company_id,
        tenant_key,
        bm25_dir=bm25_dir,
        dry_run=dry_run,
        verbose=verbose,
        result=result,
    )

    result.companies_processed += 1


def run_migration(
    database_url: str,
    tenant_key_secret: str,
    *,
    chroma_dir: Path = CHROMA_DIR,
    bm25_dir: Path = BM25_DIR,
    dry_run: bool = False,
    batch_size: int = 100,
    verbose: bool = False,
) -> MigrationResult:
    result = MigrationResult()

    print("Fetching companies from database...")
    rows = fetch_companies(database_url)
    result.companies_total = len(rows)
    print(f"Found {len(rows)} companies")

    chroma_client = None
    if chroma_dir.exists():
        chroma_client = chromadb.PersistentClient(
            path=str(chroma_dir),
            settings=ChromaSettings(anonymized_telemetry=False),
        )

    for i, row in enumerate(rows):
        owner = resolve_company_owner(row)
        if owner is None:
            result.companies_skipped += 1
            continue

        tenant_key = compute_tenant_key(owner.actor_kind, owner.actor_id, tenant_key_secret)

        if verbose or (i + 1) % 50 == 0:
            print(f"[{i + 1}/{len(rows)}] {owner.company_id} ({owner.actor_kind}:{owner.actor_id[:8]}...)")

        try:
            migrate_company(
                owner,
                tenant_key,
                chroma_client=chroma_client,
                bm25_dir=bm25_dir,
                dry_run=dry_run,
                batch_size=batch_size,
                verbose=verbose,
                result=result,
            )
        except Exception as e:
            msg = f"Error migrating {owner.company_id}: {e}"
            print(f"  ERROR: {msg}")
            result.errors.append(msg)
            result.companies_errored += 1

    print("\n=== Migration Summary ===")
    print(f"Total companies:     {result.companies_total}")
    print(f"Processed:           {result.companies_processed}")
    print(f"Skipped (no owner):  {result.companies_skipped}")
    print(f"Errored:             {result.companies_errored}")
    print(f"Chroma docs scanned: {result.chroma_documents_scanned}")
    print(f"Chroma docs updated: {result.chroma_documents_updated}")
    print(f"BM25 files renamed:  {result.bm25_files_renamed}")
    print(f"BM25 files skipped:  {result.bm25_files_skipped}")
    if result.errors:
        print(f"\nErrors ({len(result.errors)}):")
        for err in result.errors:
            print(f"  - {err}")
    if dry_run:
        print("\n[DRY-RUN] No changes were made.")

    return result


def main():
    parser = argparse.ArgumentParser(description="Migrate tenant_key into ChromaDB and BM25 stores")
    parser.add_argument("--dry-run", action="store_true", help="Show what would happen without making changes")
    parser.add_argument("--verbose", action="store_true", help="Verbose output")
    parser.add_argument("--batch-size", type=int, default=100, help="ChromaDB update batch size (default: 100)")
    args = parser.parse_args()

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("ERROR: DATABASE_URL environment variable is required")
        sys.exit(1)

    tenant_key_secret = os.environ.get("TENANT_KEY_SECRET")
    if not tenant_key_secret:
        print("ERROR: TENANT_KEY_SECRET environment variable is required")
        sys.exit(1)

    run_migration(
        database_url,
        tenant_key_secret,
        dry_run=args.dry_run,
        batch_size=args.batch_size,
        verbose=args.verbose,
    )


if __name__ == "__main__":
    main()
