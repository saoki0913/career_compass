"""
Embeddings Utility Module

Provides text embedding generation using OpenAI embeddings with local fallback.
"""

import importlib.util
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

# Lazy load sentence transformers for local fallback
_local_model = None


@dataclass(frozen=True)
class EmbeddingBackend:
    provider: Literal["openai", "local"]
    model: str
    dimension: Optional[int] = None


def _normalize_provider(value: Optional[str]) -> str:
    provider = (value or "auto").strip().lower()
    return provider if provider in ("auto", "openai", "local") else "auto"


def is_local_embedding_available() -> bool:
    return importlib.util.find_spec("sentence_transformers") is not None


def get_local_model():
    """Lazy load local sentence transformer model."""
    global _local_model
    if _local_model is None:
        try:
            from sentence_transformers import SentenceTransformer
            _local_model = SentenceTransformer(settings.local_embedding_model)
            print("[埋め込み] ✅ ローカルモデル読み込み完了")
        except Exception as e:
            print(f"[埋め込み] ❌ ローカルモデル読み込み失敗: {e}")
            _local_model = False  # Mark as failed
    return _local_model if _local_model else None


def _to_list_embedding(embedding) -> list[float] | None:
    """Convert embedding tensor/array to list without requiring NumPy."""
    if embedding is None:
        return None
    try:
        if hasattr(embedding, "detach"):
            embedding = embedding.detach()
        if hasattr(embedding, "cpu"):
            embedding = embedding.cpu()
        if hasattr(embedding, "tolist"):
            return embedding.tolist()
        if isinstance(embedding, list):
            return embedding
    except Exception:
        return None
    return None


def _to_list_embeddings(embeddings) -> list[list[float]] | None:
    """Convert batch embeddings to list of lists without requiring NumPy."""
    if embeddings is None:
        return None
    try:
        if hasattr(embeddings, "detach"):
            embeddings = embeddings.detach()
        if hasattr(embeddings, "cpu"):
            embeddings = embeddings.cpu()
        if hasattr(embeddings, "tolist"):
            embeddings = embeddings.tolist()
        if isinstance(embeddings, list):
            converted: list[list[float]] = []
            for item in embeddings:
                if isinstance(item, list):
                    converted.append(item)
                    continue
                item_list = _to_list_embedding(item)
                if item_list is None:
                    return None
                converted.append(item_list)
            return converted
    except Exception:
        return None
    return None


def get_available_backends(preferred: Optional[str] = None) -> list[EmbeddingBackend]:
    provider = _normalize_provider(preferred or settings.embeddings_provider)
    backends: list[EmbeddingBackend] = []

    if provider in ("openai", "auto"):
        if settings.openai_api_key:
            backends.append(
                EmbeddingBackend(
                    provider="openai",
                    model=settings.openai_embedding_model or OPENAI_EMBEDDING_MODEL,
                    dimension=EMBEDDING_DIMENSION,
                )
            )
        elif provider == "openai":
            print("[埋め込み] ⚠️ OPENAI_API_KEY 未設定のため OpenAI 埋め込み利用不可")

    if provider in ("local", "auto"):
        if is_local_embedding_available():
            backends.append(
                EmbeddingBackend(
                    provider="local",
                    model=settings.local_embedding_model,
                    dimension=settings.local_embedding_dimension,
                )
            )
        elif provider == "local":
            print("[埋め込み] ⚠️ sentence_transformers 未インストールのためローカル埋め込み利用不可")

    return backends


def get_configured_backends(preferred: Optional[str] = None) -> list[EmbeddingBackend]:
    provider = _normalize_provider(preferred or settings.embeddings_provider)
    backends: list[EmbeddingBackend] = []

    if provider in ("openai", "auto"):
        backends.append(
            EmbeddingBackend(
                provider="openai",
                model=settings.openai_embedding_model or OPENAI_EMBEDDING_MODEL,
                dimension=EMBEDDING_DIMENSION,
            )
        )
    if provider in ("local", "auto"):
        backends.append(
            EmbeddingBackend(
                provider="local",
                model=settings.local_embedding_model,
                dimension=settings.local_embedding_dimension,
            )
        )
    return backends


def resolve_embedding_backend(preferred: Optional[str] = None) -> Optional[EmbeddingBackend]:
    provider = _normalize_provider(preferred or settings.embeddings_provider)
    backends = get_available_backends(provider)
    if not backends:
        return None
    # Prefer OpenAI when auto
    if provider == "auto":
        for backend in backends:
            if backend.provider == "openai":
                return backend
    return backends[0]


def _fallback_allowed() -> bool:
    return _normalize_provider(settings.embeddings_provider) == "auto"


def _is_openai_quota_error(exc: Exception) -> bool:
    status_code = getattr(exc, "status_code", None)
    if status_code == 429:
        return True
    message = str(exc).lower()
    if "insufficient_quota" in message or "quota" in message or "rate limit" in message:
        return True
    error = getattr(exc, "error", None)
    if isinstance(error, dict):
        code = str(error.get("code", "")).lower()
        if code in ("insufficient_quota", "rate_limit_exceeded"):
            return True
    return False


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
    allow_fallback: Optional[bool] = None
) -> Optional[list[float]]:
    """
    Generate embedding for text.

    Args:
        text: Text to embed
        backend: Explicit backend selection
        allow_fallback: Allow OpenAI → local fallback on quota/rate limit

    Returns:
        Embedding vector as list of floats, or None on failure
    """
    if not text or not text.strip():
        return None

    backend_provided = backend is not None
    backend = backend or resolve_embedding_backend()
    if backend is None:
        print("[埋め込み] ❌ 利用可能な埋め込みバックエンドなし")
        return None
    if allow_fallback is None:
        allow_fallback = (not backend_provided) and _fallback_allowed()

    max_len = settings.embedding_max_input_chars

    if backend.provider == "openai":
        try:
            client = openai.AsyncOpenAI(api_key=settings.openai_api_key)
            response = await client.embeddings.create(
                model=backend.model,
                input=text[:max_len],
            )
            return response.data[0].embedding
        except Exception as e:
            print(f"[埋め込み] ❌ OpenAI 埋め込み失敗: {e}")
            if allow_fallback and _is_openai_quota_error(e):
                local_backend = resolve_embedding_backend("local")
                if local_backend:
                    print("[埋め込み] ⚠️ ローカル埋め込みにフォールバック")
                    return await generate_embedding(text, backend=local_backend, allow_fallback=False)

    if backend.provider == "local":
        model = get_local_model()
        if model:
            try:
                embedding = model.encode(text[:max_len], convert_to_numpy=True)
                return embedding.tolist()
            except Exception as e:
                print(f"[埋め込み] ❌ ローカル埋め込み失敗: {e}")
                if "numpy" in str(e).lower():
                    try:
                        embedding = model.encode(text[:max_len], convert_to_numpy=False)
                        as_list = _to_list_embedding(embedding)
                        if as_list is not None:
                            return as_list
                    except Exception as retry_error:
                        print(f"[埋め込み] ❌ NumPyなしリトライ失敗: {retry_error}")

    print("[埋め込み] ❌ 埋め込み手段なし")
    return None


async def generate_embeddings_batch(
    texts: list[str],
    backend: Optional[EmbeddingBackend] = None,
    allow_fallback: Optional[bool] = None
) -> list[Optional[list[float]]]:
    """
    Generate embeddings for multiple texts.

    Args:
        texts: List of texts to embed
        backend: Explicit backend selection
        allow_fallback: Allow OpenAI → local fallback on quota/rate limit

    Returns:
        List of embedding vectors
    """
    if not texts:
        return []

    # Filter empty texts
    valid_texts = [(i, t) for i, t in enumerate(texts) if t and t.strip()]
    if not valid_texts:
        return [None] * len(texts)

    backend_provided = backend is not None
    backend = backend or resolve_embedding_backend()
    if backend is None:
        print("[埋め込み] ❌ 利用可能な埋め込みバックエンドなし")
        return [None] * len(texts)
    if allow_fallback is None:
        allow_fallback = (not backend_provided) and _fallback_allowed()

    max_len = settings.embedding_max_input_chars

    if backend.provider == "openai":
        try:
            client = openai.AsyncOpenAI(api_key=settings.openai_api_key)

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
            if allow_fallback and _is_openai_quota_error(e):
                local_backend = resolve_embedding_backend("local")
                if local_backend:
                    print("[埋め込み] ⚠️ ローカル埋め込みにフォールバック")
                    return await generate_embeddings_batch(texts, backend=local_backend, allow_fallback=False)

    if backend.provider == "local":
        model = get_local_model()
        if model:
            try:
                embeddings = model.encode(
                    [t[:max_len] for _, t in valid_texts],
                    convert_to_numpy=True
                )

                results = [None] * len(texts)
                for idx, (orig_idx, _) in enumerate(valid_texts):
                    results[orig_idx] = embeddings[idx].tolist()
                return results
            except Exception as e:
                print(f"[埋め込み] ❌ ローカルバッチ埋め込み失敗: {e}")
                if "numpy" in str(e).lower():
                    try:
                        embeddings = model.encode(
                            [t[:max_len] for _, t in valid_texts],
                            convert_to_numpy=False
                        )
                        as_lists = _to_list_embeddings(embeddings)
                        if as_lists is not None:
                            results = [None] * len(texts)
                            for idx, (orig_idx, _) in enumerate(valid_texts):
                                results[orig_idx] = as_lists[idx]
                            return results
                    except Exception as retry_error:
                        print(f"[埋め込み] ❌ NumPyなしバッチリトライ失敗: {retry_error}")

    return [None] * len(texts)
