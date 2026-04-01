import pytest

from app.utils.embeddings import EmbeddingBackend
from app.utils import vector_store


class FakeCollection:
    def __init__(self) -> None:
        self.records: dict[str, dict] = {}
        self.fail_add = False

    def add(self, *, documents, metadatas, ids, embeddings) -> None:
        if self.fail_add:
            raise RuntimeError("simulated add failure")
        for doc, metadata, doc_id, embedding in zip(documents, metadatas, ids, embeddings):
            self.records[doc_id] = {
                "document": doc,
                "metadata": metadata,
                "embedding": embedding,
            }

    def get(self, where=None, include=None, limit=None):
        include = include or []
        matches = []
        for doc_id, record in self.records.items():
            if _matches_where(record["metadata"], where):
                matches.append((doc_id, record))

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


def _matches_where(metadata: dict, where) -> bool:
    if where is None:
        return True
    if "$and" in where:
        return all(_matches_where(metadata, clause) for clause in where["$and"])
    return all(metadata.get(key) == value for key, value in where.items())


@pytest.fixture
def fake_backend() -> EmbeddingBackend:
    return EmbeddingBackend(provider="openai", model="test-embedding-model", dimension=3)


@pytest.fixture
def fake_collection(monkeypatch: pytest.MonkeyPatch) -> FakeCollection:
    collection = FakeCollection()
    monkeypatch.setattr(vector_store, "_get_collection", lambda *_args, **_kwargs: collection)
    monkeypatch.setattr(vector_store, "get_company_collection", lambda *_args, **_kwargs: collection)
    monkeypatch.setattr(vector_store, "schedule_bm25_update", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(vector_store, "get_rag_cache", lambda: None)
    return collection


@pytest.mark.asyncio
async def test_store_full_text_content_replaces_only_same_source_url(
    monkeypatch: pytest.MonkeyPatch,
    fake_backend: EmbeddingBackend,
    fake_collection: FakeCollection,
) -> None:
    monkeypatch.setattr(vector_store, "_resolve_write_backend", lambda *_args, **_kwargs: fake_backend)

    async def _generate_embeddings(documents, backend=None):
        return [[0.1, 0.2, 0.3] for _ in documents]

    monkeypatch.setattr(vector_store, "generate_embeddings_batch", _generate_embeddings)

    async def _classify(chunks, **_kwargs):
        return chunks

    monkeypatch.setattr(vector_store, "classify_chunks", _classify)

    text_a_v1 = "Aの初回データです。" * 80
    text_b = "Bの保持データです。" * 80
    text_a_v2 = "Aの更新データです。" * 80

    result_a_v1 = await vector_store.store_full_text_content(
        company_id="company-1",
        company_name="テスト株式会社",
        raw_text=text_a_v1,
        source_url="https://example.com/a",
        content_type="corporate_site",
        backend=fake_backend,
        raw_format="text",
    )
    result_b = await vector_store.store_full_text_content(
        company_id="company-1",
        company_name="テスト株式会社",
        raw_text=text_b,
        source_url="https://example.com/b",
        content_type="corporate_site",
        backend=fake_backend,
        raw_format="text",
    )
    result_a_v2 = await vector_store.store_full_text_content(
        company_id="company-1",
        company_name="テスト株式会社",
        raw_text=text_a_v2,
        source_url="https://example.com/a",
        content_type="corporate_site",
        backend=fake_backend,
        raw_format="text",
    )

    assert result_a_v1["success"] is True
    assert result_b["success"] is True
    assert result_a_v2["success"] is True

    documents = fake_collection.get(include=["documents", "metadatas"])
    grouped = {}
    for document, metadata in zip(documents["documents"], documents["metadatas"]):
        grouped.setdefault(metadata["source_url"], []).append((document, metadata))

    assert set(grouped) == {"https://example.com/a", "https://example.com/b"}
    assert all("Aの更新データです。" in document for document, _ in grouped["https://example.com/a"])
    assert all("Bの保持データです。" in document for document, _ in grouped["https://example.com/b"])


@pytest.mark.asyncio
async def test_store_full_text_content_moves_url_to_new_content_type_on_reingest(
    monkeypatch: pytest.MonkeyPatch,
    fake_backend: EmbeddingBackend,
    fake_collection: FakeCollection,
) -> None:
    monkeypatch.setattr(vector_store, "_resolve_write_backend", lambda *_args, **_kwargs: fake_backend)

    async def _generate_embeddings(documents, backend=None):
        return [[0.1, 0.2, 0.3] for _ in documents]

    monkeypatch.setattr(vector_store, "generate_embeddings_batch", _generate_embeddings)

    async def _classify(chunks, **_kwargs):
        for chunk in chunks:
            meta = chunk.setdefault("metadata", {})
            if "updated" in chunk["text"]:
                meta["content_type"] = "ir_materials"
            else:
                meta["content_type"] = "corporate_site"
        return chunks

    monkeypatch.setattr(vector_store, "classify_chunks", _classify)

    await vector_store.store_full_text_content(
        company_id="company-1",
        company_name="テスト株式会社",
        raw_text="initial data " * 80,
        source_url="https://example.com/a",
        content_type="corporate_site",
        backend=fake_backend,
        raw_format="text",
    )
    await vector_store.store_full_text_content(
        company_id="company-1",
        company_name="テスト株式会社",
        raw_text="updated data " * 80,
        source_url="https://example.com/a",
        content_type="corporate_site",
        backend=fake_backend,
        raw_format="text",
    )

    documents = fake_collection.get(include=["metadatas"])
    source_types = {
        metadata["content_type"]
        for metadata in documents["metadatas"]
        if metadata["source_url"] == "https://example.com/a"
    }
    assert source_types == {"ir_materials"}


@pytest.mark.asyncio
async def test_store_full_text_content_keeps_previous_source_data_on_reingest_failure(
    monkeypatch: pytest.MonkeyPatch,
    fake_backend: EmbeddingBackend,
    fake_collection: FakeCollection,
) -> None:
    monkeypatch.setattr(vector_store, "_resolve_write_backend", lambda *_args, **_kwargs: fake_backend)

    async def _generate_embeddings(documents, backend=None):
        return [[0.1, 0.2, 0.3] for _ in documents]

    monkeypatch.setattr(vector_store, "generate_embeddings_batch", _generate_embeddings)

    async def _classify(chunks, **_kwargs):
        return chunks

    monkeypatch.setattr(vector_store, "classify_chunks", _classify)

    success = await vector_store.store_full_text_content(
        company_id="company-1",
        company_name="テスト株式会社",
        raw_text="stable data " * 80,
        source_url="https://example.com/a",
        content_type="corporate_site",
        backend=fake_backend,
        raw_format="text",
    )
    assert success["success"] is True

    before = fake_collection.get(
        where={"$and": [{"company_id": "company-1"}, {"source_url": "https://example.com/a"}]},
        include=["documents", "metadatas"],
    )

    fake_collection.fail_add = True
    failed = await vector_store.store_full_text_content(
        company_id="company-1",
        company_name="テスト株式会社",
        raw_text="new failing data " * 80,
        source_url="https://example.com/a",
        content_type="corporate_site",
        backend=fake_backend,
        raw_format="text",
    )

    after = fake_collection.get(
        where={"$and": [{"company_id": "company-1"}, {"source_url": "https://example.com/a"}]},
        include=["documents", "metadatas"],
    )

    assert failed["success"] is False
    assert after == before


def test_extract_ids_to_delete_for_source_skips_current_ingest_session() -> None:
    results = {
        "ids": ["old-1", "new-1", "old-2"],
        "metadatas": [
            {"ingest_session_id": "old-session"},
            {"ingest_session_id": "current-session"},
            {},
        ],
    }

    ids = vector_store._extract_ids_to_delete_for_source(
        results,
        current_ingest_session_id="current-session",
    )

    assert ids == ["old-1", "old-2"]
