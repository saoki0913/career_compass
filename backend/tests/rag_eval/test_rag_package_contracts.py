from __future__ import annotations

from dataclasses import dataclass

import pytest


def test_reference_es_collection_name_is_separate_from_company_rag() -> None:
    from app.rag.ids import collection_name_for_backend

    name = collection_name_for_backend("reference_es", provider="openai", model="text-embedding-3-small")

    assert name == "reference_es__openai__text-embedding-3-small"
    assert "company_info" not in name


def test_contextual_chunker_metadata_only_keeps_chunk_text_clean() -> None:
    from app.rag.chunking import ContextualChunker
    from app.utils.text_chunker import JapaneseTextChunker

    chunker = ContextualChunker(
        base=JapaneseTextChunker(chunk_size=40, chunk_overlap=0, min_chunk_size=1),
        summarizer=lambda _text, meta: f"{meta['company_name']} の採用ページの抜粋",
        mode="metadata_only",
    )

    chunks = chunker.chunk_with_metadata(
        "事業内容を説明します。新卒採用では挑戦を重視します。",
        {"company_name": "Example"},
    )

    assert chunks
    first = chunks[0]
    assert first["text"].startswith("事業内容")
    assert first["metadata"]["contextual_prefix"] == "Example の採用ページの抜粋"
    assert first["embedding_text"].startswith("Example の採用ページの抜粋\n\n事業内容")


def test_contextual_chunker_prefix_text_mode_marks_text() -> None:
    from app.rag.chunking import ContextualChunker
    from app.utils.text_chunker import JapaneseTextChunker

    chunker = ContextualChunker(
        base=JapaneseTextChunker(chunk_size=80, chunk_overlap=0, min_chunk_size=1),
        summarizer=lambda _text, _meta: "採用情報の文脈",
        mode="prefix_text",
    )

    chunks = chunker.chunk_with_metadata("本文です。", {})

    assert chunks[0]["text"] == "採用情報の文脈\n\n本文です。"
    assert chunks[0]["embedding_text"] == chunks[0]["text"]


def test_metrics_exporter_starts_once(monkeypatch) -> None:
    from app.rag import metrics_exporter

    calls: list[tuple[int, str]] = []

    def fake_start_http_server(port: int, addr: str) -> object:
        calls.append((port, addr))
        return object()

    @dataclass
    class DummySettings:
        rag_metrics_exporter_enabled: bool = True
        rag_metrics_exporter_host: str = "127.0.0.1"
        rag_metrics_exporter_port: int = 9464

    monkeypatch.setattr(metrics_exporter, "_started", False)
    monkeypatch.setattr(metrics_exporter, "_start_http_server", fake_start_http_server)

    assert metrics_exporter.start_metrics_exporter_once(DummySettings()) is True
    assert metrics_exporter.start_metrics_exporter_once(DummySettings()) is False
    assert calls == [(9464, "127.0.0.1")]


def test_metrics_exporter_disabled(monkeypatch) -> None:
    from app.rag import metrics_exporter

    @dataclass
    class DummySettings:
        rag_metrics_exporter_enabled: bool = False
        rag_metrics_exporter_host: str = "127.0.0.1"
        rag_metrics_exporter_port: int = 9464

    monkeypatch.setattr(metrics_exporter, "_started", False)

    assert metrics_exporter.start_metrics_exporter_once(DummySettings()) is False


def test_hybrid_search_keyword_extraction_uses_domain_expansion(monkeypatch) -> None:
    from app.rag import hybrid_search

    monkeypatch.setattr(
        hybrid_search,
        "tokenize_with_domain_expansion",
        lambda text: ["採用", "採用", "職種", text],
    )

    assert hybrid_search._extract_keywords("新卒採用") == ["採用", "職種", "新卒採用"]


def test_culture_boost_profile_matches_rag_plan() -> None:
    from app.rag.hybrid_search import CONTENT_TYPE_BOOSTS

    culture = CONTENT_TYPE_BOOSTS["culture"]

    assert culture["employee_interviews"] == 1.4
    assert culture["ceo_message"] == 1.3


@pytest.mark.asyncio
async def test_contextual_dual_write_uses_embedding_text_for_contextual_collection(monkeypatch) -> None:
    from app.rag import vector_store
    from app.utils.embeddings import EmbeddingBackend

    class FakeCollection:
        def __init__(self) -> None:
            self.add_calls: list[dict] = []

        def add(self, **kwargs) -> None:
            self.add_calls.append(kwargs)

    company_collection = FakeCollection()
    contextual_collection = FakeCollection()

    @dataclass
    class DummySettings:
        contextual_retrieval_dual_write: bool = True

    async def fake_generate_embeddings_batch(texts, *, backend):
        return [[float(idx), 0.0, 0.0] for idx, _text in enumerate(texts)]

    monkeypatch.setattr(vector_store, "settings", DummySettings())
    monkeypatch.setattr(vector_store, "get_company_collection", lambda _backend: company_collection)
    monkeypatch.setattr(vector_store, "get_company_contextual_collection", lambda _backend: contextual_collection)
    monkeypatch.setattr(vector_store, "generate_embeddings_batch", fake_generate_embeddings_batch)
    monkeypatch.setattr(vector_store, "_delete_source_records_for_backends", lambda **_kwargs: 0)

    ok = await vector_store._store_content_by_source_url(
        company_id="company-1",
        company_name="Example",
        content_chunks=[
            {
                "text": "新卒採用では挑戦を重視し、事業成長への主体性を評価します。",
                "embedding_text": "Example の採用文脈\n\n新卒採用では挑戦を重視し、事業成長への主体性を評価します。",
                "metadata": {"content_type": "new_grad_recruitment"},
            },
        ],
        source_url="https://example.com/recruit",
        backend=EmbeddingBackend(provider="openai", model="text-embedding-3-small"),
        tenant_key="0" * 32,
    )

    assert ok is True
    assert company_collection.add_calls[0]["documents"] == [
        "新卒採用では挑戦を重視し、事業成長への主体性を評価します。"
    ]
    assert contextual_collection.add_calls[0]["documents"] == [
        "Example の採用文脈\n\n新卒採用では挑戦を重視し、事業成長への主体性を評価します。"
    ]
