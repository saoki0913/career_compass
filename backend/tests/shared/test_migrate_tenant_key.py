from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock

import pytest

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from scripts.migrate_tenant_key import (
    CompanyOwner,
    MigrationResult,
    backfill_chroma_collection,
    compute_tenant_key,
    rename_bm25_files,
    resolve_company_owner,
    migrate_company,
)


class TestComputeTenantKey:
    def test_deterministic_and_truncated(self):
        key1 = compute_tenant_key("user", "user-123", "secret")
        key2 = compute_tenant_key("user", "user-123", "secret")
        assert key1 == key2
        assert len(key1) == 32

    def test_different_inputs_different_keys(self):
        k1 = compute_tenant_key("user", "id-1", "secret")
        k2 = compute_tenant_key("guest", "id-1", "secret")
        k3 = compute_tenant_key("user", "id-2", "secret")
        assert k1 != k2
        assert k1 != k3


class TestResolveCompanyOwner:
    def test_user_owner(self):
        owner = resolve_company_owner(("comp-1", "user-1", None))
        assert owner is not None
        assert owner.actor_kind == "user"
        assert owner.actor_id == "user-1"

    def test_guest_owner(self):
        owner = resolve_company_owner(("comp-1", None, "guest-1"))
        assert owner is not None
        assert owner.actor_kind == "guest"
        assert owner.actor_id == "guest-1"

    def test_both_owners_returns_none(self):
        owner = resolve_company_owner(("comp-1", "user-1", "guest-1"))
        assert owner is None

    def test_no_owner_returns_none(self):
        owner = resolve_company_owner(("comp-1", None, None))
        assert owner is None

    def test_empty_string_treated_as_no_owner(self):
        owner = resolve_company_owner(("comp-1", "", None))
        assert owner is None


class TestBackfillChromaCollection:
    def test_updates_only_docs_without_tenant_key(self):
        collection = MagicMock()
        collection.name = "company_info__test"
        collection.get.return_value = {
            "ids": ["doc-1", "doc-2"],
            "metadatas": [
                {"company_id": "comp-1"},
                {"company_id": "comp-1", "tenant_key": "existing"},
            ],
        }

        result = MigrationResult()
        backfill_chroma_collection(
            collection, "comp-1", "new-key",
            dry_run=False, batch_size=100, verbose=False, result=result,
        )

        collection.update.assert_called_once()
        call_args = collection.update.call_args
        assert call_args.kwargs["ids"] == ["doc-1"]
        assert call_args.kwargs["metadatas"][0]["tenant_key"] == "new-key"
        assert result.chroma_documents_scanned == 2
        assert result.chroma_documents_updated == 1

    def test_dry_run_no_updates(self):
        collection = MagicMock()
        collection.name = "company_info__test"
        collection.get.return_value = {
            "ids": ["doc-1"],
            "metadatas": [{"company_id": "comp-1"}],
        }

        result = MigrationResult()
        backfill_chroma_collection(
            collection, "comp-1", "new-key",
            dry_run=True, batch_size=100, verbose=False, result=result,
        )

        collection.update.assert_not_called()
        assert result.chroma_documents_updated == 1


class TestRenameBM25Files:
    def test_rename_and_idempotent(self, tmp_path: Path):
        company_id = "comp-1"
        tenant_key = "a" * 32
        old_path = tmp_path / f"{company_id}.json"
        old_path.write_text('{"test": true}')

        result = MigrationResult()
        rename_bm25_files(
            company_id, tenant_key,
            bm25_dir=tmp_path, dry_run=False, verbose=False, result=result,
        )

        new_path = tmp_path / f"{tenant_key}__{company_id}.json"
        assert new_path.exists()
        assert not old_path.exists()
        assert result.bm25_files_renamed == 1

        # Second run: idempotent
        result2 = MigrationResult()
        rename_bm25_files(
            company_id, tenant_key,
            bm25_dir=tmp_path, dry_run=False, verbose=False, result=result2,
        )
        assert result2.bm25_files_renamed == 0

    def test_dry_run_no_rename(self, tmp_path: Path):
        company_id = "comp-1"
        tenant_key = "a" * 32
        old_path = tmp_path / f"{company_id}.json"
        old_path.write_text('{"test": true}')

        result = MigrationResult()
        rename_bm25_files(
            company_id, tenant_key,
            bm25_dir=tmp_path, dry_run=True, verbose=False, result=result,
        )

        assert old_path.exists()
        assert result.bm25_files_renamed == 1


class TestMigrateCompany:
    def test_processes_all_collections(self, tmp_path: Path):
        company_id = "comp-1"
        tenant_key = "a" * 32
        owner = CompanyOwner(company_id=company_id, actor_kind="user", actor_id="user-1")

        collection = MagicMock()
        collection.name = "company_info__openai__test"
        collection.get.return_value = {
            "ids": ["doc-1", "doc-2"],
            "metadatas": [
                {"company_id": company_id},
                {"company_id": company_id, "tenant_key": tenant_key},
            ],
        }

        chroma_client = MagicMock()
        chroma_client.list_collections.return_value = [
            "company_info__openai__test",
            "other_collection",
        ]
        chroma_client.get_collection.return_value = collection

        tmp_bm25 = tmp_path / "bm25"
        tmp_bm25.mkdir()
        (tmp_bm25 / f"{company_id}.json").write_text("{}")

        result = MigrationResult()
        migrate_company(
            owner, tenant_key,
            chroma_client=chroma_client,
            bm25_dir=tmp_bm25,
            dry_run=False, batch_size=100, verbose=False, result=result,
        )

        assert result.chroma_documents_scanned == 2
        assert result.chroma_documents_updated == 1
        assert result.bm25_files_renamed == 1
        chroma_client.get_collection.assert_called_once_with(name="company_info__openai__test")
