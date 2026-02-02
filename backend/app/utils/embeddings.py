"""
Embeddings Utility Module

Provides text embedding generation using OpenAI embeddings.
"""

from dataclasses import dataclass
from typing import Optional, Literal

import openai

from app.config import settings

# Default embedding model
OPENAI_EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIMENSION = 1536  # For text-embedding-3-small

# Batch processing limits for OpenAI API
OPENAI_BATCH_TOKEN_LIMIT = 250_000  # OpenAI max is 300K, use 250K for safety
ESTIMATED_TOKENS_PER_CHAR_JP = 2.5  # Japanese text: ~2-3 tokens per character

# OpenAI client singleton for connection pooling
_openai_embedding_client: Optional[openai.AsyncOpenAI] = None


@dataclass(frozen=True)
class EmbeddingBackend:
    """Embedding backend configuration."""
    provider: Literal["openai"]
    model: str
    dimension: int = EMBEDDING_DIMENSION


def get_openai_embedding_client() -> openai.AsyncOpenAI:
    """Get or create OpenAI embedding client (connection pooling)."""
    global _openai_embedding_client
    if _openai_embedding_client is None:
        _openai_embedding_client = openai.AsyncOpenAI(api_key=settings.openai_api_key)
    return _openai_embedding_client


def get_available_backends() -> list[EmbeddingBackend]:
    """Get available embedding backends."""
    if settings.openai_api_key:
        return [
            EmbeddingBackend(
                provider="openai",
                model=settings.openai_embedding_model or OPENAI_EMBEDDING_MODEL,
                dimension=EMBEDDING_DIMENSION,
            )
        ]
    print("[埋め込み] ⚠️ OPENAI_API_KEY 未設定のため埋め込み利用不可")
    return []


def get_configured_backends() -> list[EmbeddingBackend]:
    """Get configured embedding backends (for collection naming)."""
    return [
        EmbeddingBackend(
            provider="openai",
            model=settings.openai_embedding_model or OPENAI_EMBEDDING_MODEL,
            dimension=EMBEDDING_DIMENSION,
        )
    ]


def resolve_embedding_backend() -> Optional[EmbeddingBackend]:
    """Resolve the best available embedding backend."""
    backends = get_available_backends()
    return backends[0] if backends else None


def _split_into_token_batches(
    valid_texts: list[tuple[int, str]],
    max_len: int,
    token_limit: int = OPENAI_BATCH_TOKEN_LIMIT
) -> list[list[tuple[int, str]]]:
    """
    Split texts into batches based on estimated token count.

    Args:
        valid_texts: List of (original_index, text) tuples
        max_len: Maximum character length per text
        token_limit: Maximum tokens per batch (default: OPENAI_BATCH_TOKEN_LIMIT)

    Returns:
        List of batches, where each batch is a list of (original_index, text) tuples
    """
    if not valid_texts:
        return []

    batches: list[list[tuple[int, str]]] = []
    current_batch: list[tuple[int, str]] = []
    current_tokens = 0

    for item in valid_texts:
        idx, text = item
        text_len = min(len(text), max_len)
        estimated_tokens = int(text_len * ESTIMATED_TOKENS_PER_CHAR_JP)

        # If adding this text would exceed the limit and we have items, start a new batch
        if current_tokens + estimated_tokens > token_limit and current_batch:
            batches.append(current_batch)
            current_batch = []
            current_tokens = 0

        current_batch.append(item)
        current_tokens += estimated_tokens

    # Don't forget the last batch
    if current_batch:
        batches.append(current_batch)

    return batches


async def generate_embedding(
    text: str,
    backend: Optional[EmbeddingBackend] = None,
    allow_fallback: Optional[bool] = None  # Kept for API compatibility, ignored
) -> Optional[list[float]]:
    """
    Generate embedding for text using OpenAI.

    Args:
        text: Text to embed
        backend: Explicit backend selection (optional)
        allow_fallback: Deprecated parameter, kept for API compatibility

    Returns:
        Embedding vector as list of floats, or None on failure
    """
    if not text or not text.strip():
        return None

    backend = backend or resolve_embedding_backend()
    if backend is None:
        print("[埋め込み] ❌ 利用可能な埋め込みバックエンドなし（OPENAI_API_KEY未設定）")
        return None

    max_len = settings.embedding_max_input_chars

    try:
        client = get_openai_embedding_client()
        response = await client.embeddings.create(
            model=backend.model,
            input=text[:max_len],
        )
        return response.data[0].embedding
    except Exception as e:
        print(f"[埋め込み] ❌ OpenAI 埋め込み失敗: {e}")
        return None


async def generate_embeddings_batch(
    texts: list[str],
    backend: Optional[EmbeddingBackend] = None,
    allow_fallback: Optional[bool] = None  # Kept for API compatibility, ignored
) -> list[Optional[list[float]]]:
    """
    Generate embeddings for multiple texts using OpenAI.

    Args:
        texts: List of texts to embed
        backend: Explicit backend selection (optional)
        allow_fallback: Deprecated parameter, kept for API compatibility

    Returns:
        List of embedding vectors
    """
    if not texts:
        return []

    # Filter empty texts
    valid_texts = [(i, t) for i, t in enumerate(texts) if t and t.strip()]
    if not valid_texts:
        return [None] * len(texts)

    backend = backend or resolve_embedding_backend()
    if backend is None:
        print("[埋め込み] ❌ 利用可能な埋め込みバックエンドなし（OPENAI_API_KEY未設定）")
        return [None] * len(texts)

    max_len = settings.embedding_max_input_chars

    try:
        client = get_openai_embedding_client()

        # Split into batches to avoid token limit (300K max, using 250K for safety)
        batches = _split_into_token_batches(valid_texts, max_len)
        if len(batches) > 1:
            print(f"[埋め込み] ℹ️ {len(valid_texts)}テキストを{len(batches)}バッチに分割")

        # Process each batch and collect embeddings
        all_embeddings: list = []
        for batch_idx, batch in enumerate(batches):
            response = await client.embeddings.create(
                model=backend.model,
                input=[t[:max_len] for _, t in batch],
            )
            all_embeddings.extend(response.data)

        # Map embeddings back to original indices
        results: list[Optional[list[float]]] = [None] * len(texts)
        for idx, (orig_idx, _) in enumerate(valid_texts):
            results[orig_idx] = all_embeddings[idx].embedding
        return results
    except Exception as e:
        print(f"[埋め込み] ❌ OpenAI バッチ埋め込み失敗: {e}")
        return [None] * len(texts)
