"""
Embeddings Utility Module

Provides text embedding generation using OpenAI embeddings with local fallback.
"""

import openai
from app.config import settings
from typing import Optional
import numpy as np

# Default embedding model
OPENAI_EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIMENSION = 1536  # For text-embedding-3-small

# Lazy load sentence transformers for local fallback
_local_model = None


def get_local_model():
    """Lazy load local sentence transformer model."""
    global _local_model
    if _local_model is None:
        try:
            from sentence_transformers import SentenceTransformer
            _local_model = SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')
            print("[Embeddings] Loaded local sentence transformer model")
        except Exception as e:
            print(f"[Embeddings] Failed to load local model: {e}")
            _local_model = False  # Mark as failed
    return _local_model if _local_model else None


async def generate_embedding(
    text: str,
    use_local: bool = False
) -> Optional[list[float]]:
    """
    Generate embedding for text.

    Args:
        text: Text to embed
        use_local: Force use of local model

    Returns:
        Embedding vector as list of floats, or None on failure
    """
    if not text or not text.strip():
        return None

    # Try OpenAI first (unless local is forced)
    if not use_local and settings.openai_api_key:
        try:
            client = openai.AsyncOpenAI(api_key=settings.openai_api_key)
            response = await client.embeddings.create(
                model=OPENAI_EMBEDDING_MODEL,
                input=text[:8000],  # Limit input length
            )
            return response.data[0].embedding
        except Exception as e:
            print(f"[Embeddings] OpenAI embedding failed: {e}")

    # Fallback to local model
    model = get_local_model()
    if model:
        try:
            # Sentence transformers is synchronous
            embedding = model.encode(text[:8000], convert_to_numpy=True)
            return embedding.tolist()
        except Exception as e:
            print(f"[Embeddings] Local embedding failed: {e}")

    print("[Embeddings] No embedding method available")
    return None


async def generate_embeddings_batch(
    texts: list[str],
    use_local: bool = False
) -> list[Optional[list[float]]]:
    """
    Generate embeddings for multiple texts.

    Args:
        texts: List of texts to embed
        use_local: Force use of local model

    Returns:
        List of embedding vectors
    """
    if not texts:
        return []

    # Filter empty texts
    valid_texts = [(i, t) for i, t in enumerate(texts) if t and t.strip()]
    if not valid_texts:
        return [None] * len(texts)

    # Try OpenAI batch embedding
    if not use_local and settings.openai_api_key:
        try:
            client = openai.AsyncOpenAI(api_key=settings.openai_api_key)
            response = await client.embeddings.create(
                model=OPENAI_EMBEDDING_MODEL,
                input=[t[:8000] for _, t in valid_texts],
            )

            # Map back to original indices
            results: list[Optional[list[float]]] = [None] * len(texts)
            for idx, (orig_idx, _) in enumerate(valid_texts):
                results[orig_idx] = response.data[idx].embedding
            return results
        except Exception as e:
            print(f"[Embeddings] OpenAI batch embedding failed: {e}")

    # Fallback to local model
    model = get_local_model()
    if model:
        try:
            embeddings = model.encode(
                [t[:8000] for _, t in valid_texts],
                convert_to_numpy=True
            )

            # Map back to original indices
            results = [None] * len(texts)
            for idx, (orig_idx, _) in enumerate(valid_texts):
                results[orig_idx] = embeddings[idx].tolist()
            return results
        except Exception as e:
            print(f"[Embeddings] Local batch embedding failed: {e}")

    return [None] * len(texts)
