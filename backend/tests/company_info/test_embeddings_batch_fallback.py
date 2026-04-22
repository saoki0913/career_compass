from types import SimpleNamespace

import pytest

from app.utils.embeddings import EmbeddingBackend, generate_embeddings_batch
from app.utils import embeddings


class FakeEmbeddingsAPI:
    def __init__(self) -> None:
        self.batch_calls: list[list[str]] = []
        self.single_calls: list[str] = []

    async def create(self, *, model: str, input):
        if isinstance(input, list):
            self.batch_calls.append(input)
            raise RuntimeError("simulated batch failure")

        self.single_calls.append(input)
        return SimpleNamespace(data=[SimpleNamespace(embedding=[0.1, 0.2, 0.3])])


class FakeClient:
    def __init__(self) -> None:
        self.embeddings = FakeEmbeddingsAPI()


@pytest.mark.asyncio
async def test_generate_embeddings_batch_falls_back_to_single_requests(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_client = FakeClient()
    backend = EmbeddingBackend(provider="openai", model="test-embedding-model", dimension=3)

    monkeypatch.setattr(embeddings, "get_openai_embedding_client", lambda: fake_client)

    result = await generate_embeddings_batch(
        ["first chunk", "second chunk", "   "],
        backend=backend,
    )

    assert result == [
        [0.1, 0.2, 0.3],
        [0.1, 0.2, 0.3],
        None,
    ]
    assert fake_client.embeddings.batch_calls == [["first chunk", "second chunk"]]
    assert fake_client.embeddings.single_calls == ["first chunk", "second chunk"]
