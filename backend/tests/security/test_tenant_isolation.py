from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi import HTTPException

import app.security.career_principal as career_principal
import app.utils.bm25_store as bm25_store
from app.rag import vector_store
from app.utils.cache import RAGCache
from app.utils.bm25_store import BM25Index, clear_index_cache, get_or_create_index
from app.utils.embeddings import EmbeddingBackend


def _matches_where(metadata: dict, where: dict | None) -> bool:
    if where is None:
        return True
    if "$and" in where:
        return all(_matches_where(metadata, clause) for clause in where["$and"])
    return all(metadata.get(key) == value for key, value in where.items())


class FakeCollection:
    def __init__(self) -> None:
        self.records: dict[str, dict] = {}
        self.last_get_where: dict | None = None
        self.last_query_where: dict | None = None

    def add(self, *, documents, metadatas, ids, embeddings) -> None:
        for doc, metadata, doc_id, embedding in zip(documents, metadatas, ids, embeddings):
            self.records[doc_id] = {
                "document": doc,
                "metadata": metadata,
                "embedding": embedding,
            }

    def get(self, where=None, include=None, limit=None):
        self.last_get_where = where
        include = include or []
        matches = [
            (doc_id, record)
            for doc_id, record in self.records.items()
            if _matches_where(record["metadata"], where)
        ]
        if limit is not None:
            matches = matches[:limit]

        result = {"ids": [doc_id for doc_id, _ in matches]}
        if "metadatas" in include:
            result["metadatas"] = [record["metadata"] for _, record in matches]
        if "documents" in include:
            result["documents"] = [record["document"] for _, record in matches]
        return result

    def delete(self, *, ids=None, where=None) -> None:
        if ids is not None:
            for doc_id in ids:
                self.records.pop(doc_id, None)
            return

        targets = [
            doc_id
            for doc_id, record in self.records.items()
            if _matches_where(record["metadata"], where)
        ]
        for doc_id in targets:
            self.records.pop(doc_id, None)

    def query(self, *, query_embeddings, where=None, n_results=5, include=None):
        self.last_query_where = where
        include = include or []
        matches = [
            (doc_id, record)
            for doc_id, record in self.records.items()
            if _matches_where(record["metadata"], where)
        ][:n_results]

        result = {
            "ids": [[doc_id for doc_id, _ in matches]],
            "documents": [[record["document"] for _, record in matches]],
            "metadatas": [[record["metadata"] for _, record in matches]],
            "distances": [[float(index) for index, _ in enumerate(matches)]],
        }
        if "embeddings" in include:
            result["embeddings"] = [[record["embedding"] for _, record in matches]]
        return result


class StaticBM25:
    def retrieve(self, _queries, k=10):
        return [[0] * min(k, 1)], [[1.0] * min(k, 1)]


@pytest.fixture
def tenant_keys():
    """Two distinct tenant keys for isolation testing."""
    return {
        "tenant_a": "a" * 32,
        "tenant_b": "b" * 32,
    }


@pytest.fixture
def tmp_chroma_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    path = tmp_path / "chroma"
    monkeypatch.setattr(vector_store, "CHROMA_PERSIST_DIR", path)
    monkeypatch.setattr(vector_store, "_chroma_client", None)
    return path


@pytest.fixture
def tmp_bm25_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    path = tmp_path / "bm25"
    monkeypatch.setattr(bm25_store, "BM25_PERSIST_DIR", path)
    clear_index_cache()
    yield path
    clear_index_cache()


@pytest.fixture
def fake_backend() -> EmbeddingBackend:
    return EmbeddingBackend(provider="openai", model="test-embedding-model", dimension=3)


@pytest.fixture
def fake_collection(
    monkeypatch: pytest.MonkeyPatch,
    fake_backend: EmbeddingBackend,
    tmp_chroma_dir: Path,
) -> FakeCollection:
    collection = FakeCollection()

    monkeypatch.setattr(vector_store, "_get_collection", lambda *_args, **_kwargs: collection)
    monkeypatch.setattr(
        vector_store, "get_company_collection", lambda *_args, **_kwargs: collection
    )
    monkeypatch.setattr(vector_store, "_resolve_write_backend", lambda *_args, **_kwargs: fake_backend)
    monkeypatch.setattr(
        vector_store, "_resolve_read_backends", lambda *_args, **_kwargs: [fake_backend]
    )
    monkeypatch.setattr(vector_store, "schedule_bm25_update", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(vector_store, "get_rag_cache", lambda: None)

    async def _generate_embeddings(documents, backend=None):
        return [[0.1, 0.2, 0.3] for _ in documents]

    async def _generate_embedding(_query, backend=None):
        return [0.1, 0.2, 0.3]

    async def _classify(chunks, **_kwargs):
        return chunks

    monkeypatch.setattr(vector_store, "generate_embeddings_batch", _generate_embeddings)
    monkeypatch.setattr(vector_store, "generate_embedding", _generate_embedding)
    monkeypatch.setattr(vector_store, "classify_chunks", _classify)
    return collection


class TestBM25TenantIsolation:
    """S4: BM25 file namespace isolation."""

    def test_tenant_aware_file_naming(self, tmp_bm25_dir: Path, tenant_keys) -> None:
        company_id = "company-test-001"
        index = BM25Index(company_id, tenant_key=tenant_keys["tenant_a"])
        index.add_document("doc-a", "テスト用の本文です。")
        index.save()

        saved_path = tmp_bm25_dir / f"{tenant_keys['tenant_a']}__{company_id}.json"
        assert saved_path.exists()

        payload = json.loads(saved_path.read_text(encoding="utf-8"))
        assert payload["company_id"] == company_id
        assert payload["documents"][0]["doc_id"] == "doc-a"

    def test_separate_indices_per_tenant(
        self,
        tmp_bm25_dir: Path,
        tenant_keys,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        company_id = "company-test-001"
        index_a = BM25Index(company_id, tenant_key=tenant_keys["tenant_a"])
        index_a.add_document("doc-a", "第一テナントの本文です。")
        index_a.save()

        index_b = BM25Index(company_id, tenant_key=tenant_keys["tenant_b"])
        index_b.add_document("doc-b", "第二テナントの本文です。")
        index_b.save()

        assert (tmp_bm25_dir / f"{tenant_keys['tenant_a']}__{company_id}.json").exists()
        assert (tmp_bm25_dir / f"{tenant_keys['tenant_b']}__{company_id}.json").exists()

        clear_index_cache()
        loaded_a = get_or_create_index(company_id, tenant_key=tenant_keys["tenant_a"])
        loaded_b = get_or_create_index(company_id, tenant_key=tenant_keys["tenant_b"])

        assert [doc.doc_id for doc in loaded_a.documents] == ["doc-a"]
        assert [doc.doc_id for doc in loaded_b.documents] == ["doc-b"]

        monkeypatch.setattr(bm25_store, "HAS_BM25", True)
        loaded_a._bm25 = StaticBM25()
        loaded_b._bm25 = StaticBM25()

        assert loaded_a.search("本文") == [("doc-a", 1.0)]
        assert loaded_b.search("本文") == [("doc-b", 1.0)]

    def test_company_only_bm25_path_is_not_used(
        self,
        tmp_bm25_dir: Path,
        tenant_keys,
    ) -> None:
        company_id = "company-test-001"
        legacy_path = tmp_bm25_dir / f"{company_id}.json"
        legacy_path.parent.mkdir(parents=True, exist_ok=True)
        legacy_path.write_text(
            json.dumps(
                {
                    "version": 1,
                    "company_id": company_id,
                    "documents": [
                        {
                            "doc_id": "legacy-doc",
                            "text": "移行前の本文です。",
                            "tokens": ["移行前"],
                            "metadata": {"company_id": company_id},
                        }
                    ],
                }
            ),
            encoding="utf-8",
        )

        clear_index_cache()
        loaded = BM25Index.load(company_id, tenant_key=tenant_keys["tenant_a"])

        assert loaded is None


class TestChromaDBTenantIsolation:
    """S1-S3: ChromaDB metadata and search isolation."""

    @pytest.mark.asyncio
    async def test_search_without_tenant_key_fails_closed(
        self,
        fake_collection: FakeCollection,
        tenant_keys,
    ) -> None:
        company_id = "company-test-001"
        stored = await vector_store.store_full_text_content(
            company_id=company_id,
            company_name="テスト株式会社",
            raw_text="後方互換の確認に使う本文です。" * 10,
            source_url="https://example.com/compat",
            content_type="corporate_site",
            raw_format="text",
            tenant_key=tenant_keys["tenant_a"],
        )

        assert stored["success"] is True
        results = await vector_store.search_company_context_by_type(
            company_id=company_id,
            query="後方互換",
            tenant_key=None,  # type: ignore[arg-type]
        )
        assert results == []

    @pytest.mark.asyncio
    async def test_tenant_key_in_stored_metadata(
        self,
        fake_collection: FakeCollection,
        tenant_keys,
    ) -> None:
        company_id = "company-test-001"
        await vector_store.store_full_text_content(
            company_id=company_id,
            company_name="テスト株式会社",
            raw_text="tenant metadata を検証する本文です。" * 10,
            source_url="https://example.com/tenant-a",
            content_type="corporate_site",
            raw_format="text",
            tenant_key=tenant_keys["tenant_a"],
        )

        stored_records = fake_collection.get(include=["metadatas"])
        assert stored_records["metadatas"]
        assert all(
            metadata["tenant_key"] == tenant_keys["tenant_a"]
            for metadata in stored_records["metadatas"]
        )

        await vector_store.search_company_context_by_type(
            company_id=company_id,
            query="metadata",
            tenant_key=tenant_keys["tenant_a"],
        )

        assert fake_collection.last_query_where == {
            "$and": [
                {"company_id": company_id},
                {"tenant_key": tenant_keys["tenant_a"]},
            ]
        }

    @pytest.mark.asyncio
    async def test_cross_tenant_search_returns_empty(
        self,
        fake_collection: FakeCollection,
        tenant_keys,
    ) -> None:
        company_id = "company-test-001"
        await vector_store.store_full_text_content(
            company_id=company_id,
            company_name="テスト株式会社",
            raw_text="第一テナントだけが見える本文です。" * 10,
            source_url="https://example.com/tenant-a-only",
            content_type="corporate_site",
            raw_format="text",
            tenant_key=tenant_keys["tenant_a"],
        )

        results_for_other_tenant = await vector_store.search_company_context_by_type(
            company_id=company_id,
            query="第一テナント",
            tenant_key=tenant_keys["tenant_b"],
        )
        results_for_owner = await vector_store.search_company_context_by_type(
            company_id=company_id,
            query="第一テナント",
            tenant_key=tenant_keys["tenant_a"],
        )

        assert results_for_other_tenant == []
        assert len(results_for_owner) > 0
        assert all(
            item["metadata"]["tenant_key"] == tenant_keys["tenant_a"]
            for item in results_for_owner
        )

    @pytest.mark.asyncio
    async def test_status_is_tenant_scoped(
        self,
        fake_collection: FakeCollection,
        tenant_keys,
    ) -> None:
        company_id = "company-test-001"
        await vector_store.store_full_text_content(
            company_id=company_id,
            company_name="テスト株式会社",
            raw_text="第一テナントのRAG本文です。" * 20,
            source_url="https://example.com/tenant-a",
            content_type="corporate_site",
            raw_format="text",
            tenant_key=tenant_keys["tenant_a"],
        )
        await vector_store.store_full_text_content(
            company_id=company_id,
            company_name="テスト株式会社",
            raw_text="第二テナントのRAG本文です。" * 20,
            source_url="https://example.com/tenant-b",
            content_type="corporate_site",
            raw_format="text",
            tenant_key=tenant_keys["tenant_b"],
        )

        status_a = vector_store.get_company_rag_status(
            company_id,
            tenant_key=tenant_keys["tenant_a"],
        )
        status_b = vector_store.get_company_rag_status(
            company_id,
            tenant_key=tenant_keys["tenant_b"],
        )
        status_missing = vector_store.get_company_rag_status(
            company_id,
            tenant_key="c" * 32,
        )

        assert vector_store.has_company_rag(company_id, tenant_key=tenant_keys["tenant_a"])
        assert vector_store.has_company_rag(company_id, tenant_key=tenant_keys["tenant_b"])
        assert not vector_store.has_company_rag(company_id, tenant_key="c" * 32)
        assert status_a["has_rag"] is True
        assert status_b["has_rag"] is True
        assert status_missing["has_rag"] is False
        assert status_a["total_chunks"] > 0
        assert status_b["total_chunks"] > 0

    @pytest.mark.asyncio
    async def test_structured_rag_ids_are_tenant_scoped(
        self,
        fake_collection: FakeCollection,
        tenant_keys,
    ) -> None:
        company_id = "company-test-001"
        chunks = [{"text": "構造化RAGの本文です。", "type": "general", "metadata": {}}]

        assert await vector_store.store_company_info(
            company_id=company_id,
            company_name="テスト株式会社",
            content_chunks=chunks,
            source_url="https://example.com/structured",
            tenant_key=tenant_keys["tenant_a"],
        )
        assert await vector_store.store_company_info(
            company_id=company_id,
            company_name="テスト株式会社",
            content_chunks=chunks,
            source_url="https://example.com/structured",
            tenant_key=tenant_keys["tenant_b"],
        )

        assert f"{tenant_keys['tenant_a']}_{company_id}_0" in fake_collection.records
        assert f"{tenant_keys['tenant_b']}_{company_id}_0" in fake_collection.records

    @pytest.mark.asyncio
    async def test_delete_by_urls_is_tenant_scoped(
        self,
        fake_collection: FakeCollection,
        tenant_keys,
    ) -> None:
        company_id = "company-test-001"
        source_url = "https://example.com/shared-source"
        await vector_store.store_full_text_content(
            company_id=company_id,
            company_name="テスト株式会社",
            raw_text="第一テナントだけに残すRAG本文です。" * 20,
            source_url=source_url,
            content_type="corporate_site",
            raw_format="text",
            tenant_key=tenant_keys["tenant_a"],
        )
        await vector_store.store_full_text_content(
            company_id=company_id,
            company_name="テスト株式会社",
            raw_text="第二テナントだけ削除するRAG本文です。" * 20,
            source_url=source_url,
            content_type="corporate_site",
            raw_format="text",
            tenant_key=tenant_keys["tenant_b"],
        )

        result = vector_store.delete_company_rag_by_urls(
            company_id,
            [source_url],
            tenant_key=tenant_keys["tenant_b"],
        )

        remaining_a = await vector_store.search_company_context_by_type(
            company_id=company_id,
            query="第一テナント",
            tenant_key=tenant_keys["tenant_a"],
        )
        remaining_b = await vector_store.search_company_context_by_type(
            company_id=company_id,
            query="第二テナント",
            tenant_key=tenant_keys["tenant_b"],
        )

        assert result["total_deleted"] > 0
        assert len(remaining_a) > 0
        assert remaining_b == []

    @pytest.mark.asyncio
    async def test_delete_all_is_tenant_scoped(
        self,
        fake_collection: FakeCollection,
        tenant_keys,
    ) -> None:
        company_id = "company-test-001"
        await vector_store.store_full_text_content(
            company_id=company_id,
            company_name="テスト株式会社",
            raw_text="第一テナントだけ削除するRAG本文です。" * 20,
            source_url="https://example.com/tenant-a",
            content_type="corporate_site",
            raw_format="text",
            tenant_key=tenant_keys["tenant_a"],
        )
        await vector_store.store_full_text_content(
            company_id=company_id,
            company_name="テスト株式会社",
            raw_text="第二テナントに残すRAG本文です。" * 20,
            source_url="https://example.com/tenant-b",
            content_type="corporate_site",
            raw_format="text",
            tenant_key=tenant_keys["tenant_b"],
        )

        assert vector_store.delete_company_rag(company_id, tenant_key=tenant_keys["tenant_a"])

        assert not vector_store.has_company_rag(company_id, tenant_key=tenant_keys["tenant_a"])
        assert vector_store.has_company_rag(company_id, tenant_key=tenant_keys["tenant_b"])


class TestTenantKeyComputation:
    """Verify tenant_key derivation."""

    def test_deterministic(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(career_principal.settings, "tenant_key_secret", "test-secret")

        first = career_principal.compute_tenant_key("user", "user-123")
        second = career_principal.compute_tenant_key("user", "user-123")

        assert first == second
        assert first is not None
        assert len(first) == 32

    def test_different_actors_different_keys(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(career_principal.settings, "tenant_key_secret", "test-secret")

        user_key = career_principal.compute_tenant_key("user", "shared-id")
        guest_key = career_principal.compute_tenant_key("guest", "shared-id")
        other_user_key = career_principal.compute_tenant_key("user", "other-id")

        assert user_key != guest_key
        assert user_key != other_user_key

    def test_no_secret_returns_none(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(career_principal.settings, "tenant_key_secret", "   ")

        assert career_principal.compute_tenant_key("user", "user-123") is None


class TestRAGTenantStrictHelpers:
    """Endpoint/cache helpers used by strict tenant RAG paths."""

    def test_rag_endpoint_requires_tenant_key(self) -> None:
        from app.security.career_principal import CareerPrincipal
        from app.security.career_principal import require_tenant_key

        principal = CareerPrincipal(
            scope="company",
            actor_kind="user",
            actor_id="user-123",
            plan="free",
            company_id="company-test-001",
            jti="jti",
            tenant_key=None,
        )

        with pytest.raises(HTTPException) as exc_info:
            require_tenant_key(principal)

        assert exc_info.value.status_code == 503
        assert exc_info.value.detail == {
            "error": "tenant key is not configured",
            "error_type": "tenant_key_not_configured",
        }

    def test_rag_cache_key_includes_tenant_key(self) -> None:
        cache = RAGCache(redis_url="")

        tenant_a_key = cache._context_key("company-1", "query-hash", "a" * 32)
        tenant_b_key = cache._context_key("company-1", "query-hash", "b" * 32)

        assert tenant_a_key != tenant_b_key
