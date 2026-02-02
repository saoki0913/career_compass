"""
Cross-Encoder Reranker Module

Provides fast, accurate reranking using cross-encoder models.
Replaces LLM-based reranking for improved latency and reduced cost.
"""

from typing import Optional
import logging

logger = logging.getLogger(__name__)

# Try to import sentence-transformers
try:
    from sentence_transformers import CrossEncoder
    HAS_CROSS_ENCODER = True
except ImportError:
    HAS_CROSS_ENCODER = False
    CrossEncoder = None  # type: ignore
    logger.warning("sentence-transformers not installed. Cross-encoder reranking disabled.")


# Default models (can be configured)
DEFAULT_CROSS_ENCODER_MODEL = "cross-encoder/ms-marco-MiniLM-L-6-v2"
# Japanese-optimized alternatives:
# - "cl-tohoku/bert-base-japanese-v3" (requires fine-tuning)
# - "line-corporation/line-distilbert-base-japanese" (requires fine-tuning)


class CrossEncoderReranker:
    """
    Cross-encoder based reranker for search results.

    Uses a pre-trained cross-encoder model to score query-document pairs
    and rerank results based on relevance scores.

    Attributes:
        model: CrossEncoder model instance
        model_name: Name of the loaded model
    """

    _instance: Optional["CrossEncoderReranker"] = None
    _model_name: Optional[str] = None

    def __init__(self, model_name: str = DEFAULT_CROSS_ENCODER_MODEL):
        """
        Initialize the reranker with a cross-encoder model.

        Args:
            model_name: HuggingFace model name for the cross-encoder
        """
        self.model_name = model_name
        self.model: Optional["CrossEncoder"] = None

        if HAS_CROSS_ENCODER:
            try:
                self.model = CrossEncoder(model_name)
                logger.info(f"Loaded cross-encoder model: {model_name}")
            except Exception as e:
                logger.error(f"Failed to load cross-encoder model: {e}")
                self.model = None
        else:
            logger.warning("CrossEncoder not available - reranking disabled")

    @classmethod
    def get_instance(cls, model_name: str = DEFAULT_CROSS_ENCODER_MODEL) -> "CrossEncoderReranker":
        """
        Get or create singleton instance.

        Args:
            model_name: Model to use (only applied on first call)

        Returns:
            CrossEncoderReranker instance
        """
        if cls._instance is None or cls._model_name != model_name:
            cls._instance = cls(model_name)
            cls._model_name = model_name
        return cls._instance

    def is_available(self) -> bool:
        """Check if reranker is available."""
        return self.model is not None

    def rerank(
        self,
        query: str,
        results: list[dict],
        top_k: int = 10,
        text_key: str = "text",
        min_score: Optional[float] = None,
    ) -> list[dict]:
        """
        Rerank search results using cross-encoder scores.

        Args:
            query: Search query
            results: List of search results (must contain 'text' field)
            top_k: Number of top results to return
            text_key: Key for text content in results
            min_score: Minimum score threshold (optional)

        Returns:
            Reranked results with 'rerank_score' field added
        """
        if not results:
            return results

        if not self.model:
            logger.warning("Cross-encoder not available, returning original order")
            return results[:top_k]

        try:
            # Prepare query-document pairs
            pairs = []
            valid_indices = []
            for i, result in enumerate(results):
                text = result.get(text_key, "")
                if text:
                    # Truncate long texts to avoid OOM
                    pairs.append((query, text[:512]))
                    valid_indices.append(i)

            if not pairs:
                return results[:top_k]

            # Get cross-encoder scores
            scores = self.model.predict(pairs)

            # Add scores to results
            for idx, score in zip(valid_indices, scores):
                results[idx]["rerank_score"] = float(score)

            # Handle results without scores (no text)
            for i, result in enumerate(results):
                if "rerank_score" not in result:
                    result["rerank_score"] = -float("inf")

            # Sort by rerank score
            reranked = sorted(
                results,
                key=lambda x: x.get("rerank_score", -float("inf")),
                reverse=True
            )

            # Apply minimum score filter if specified
            if min_score is not None:
                reranked = [r for r in reranked if r.get("rerank_score", 0) >= min_score]

            return reranked[:top_k]

        except Exception as e:
            logger.error(f"Reranking failed: {e}")
            return results[:top_k]

    def score_pairs(self, pairs: list[tuple[str, str]]) -> list[float]:
        """
        Score query-document pairs directly.

        Args:
            pairs: List of (query, document) tuples

        Returns:
            List of relevance scores
        """
        if not self.model or not pairs:
            return [0.0] * len(pairs)

        try:
            scores = self.model.predict(pairs)
            return [float(s) for s in scores]
        except Exception as e:
            logger.error(f"Scoring failed: {e}")
            return [0.0] * len(pairs)


# Convenience function for direct use
async def rerank_with_cross_encoder(
    query: str,
    results: list[dict],
    top_k: int = 10,
    model_name: str = DEFAULT_CROSS_ENCODER_MODEL,
) -> list[dict]:
    """
    Rerank results using cross-encoder (async wrapper).

    This is a drop-in replacement for LLM-based reranking.

    Args:
        query: Search query
        results: Search results with 'text' field
        top_k: Number of results to return
        model_name: Cross-encoder model to use

    Returns:
        Reranked results
    """
    reranker = CrossEncoderReranker.get_instance(model_name)
    return reranker.rerank(query, results, top_k=top_k)


def get_reranker(model_name: str = DEFAULT_CROSS_ENCODER_MODEL) -> CrossEncoderReranker:
    """
    Get a reranker instance.

    Args:
        model_name: Cross-encoder model to use

    Returns:
        CrossEncoderReranker instance
    """
    return CrossEncoderReranker.get_instance(model_name)
