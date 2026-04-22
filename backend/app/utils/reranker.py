"""
Cross-Encoder Reranker Module

Provides fast, accurate reranking using cross-encoder models.
Replaces LLM-based reranking for improved latency and reduced cost.
"""

import logging
import os
import hashlib
from typing import Optional

logger = logging.getLogger(__name__)

os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

CrossEncoder = None  # type: ignore[assignment]
HAS_CROSS_ENCODER: Optional[bool] = None


def _ensure_cross_encoder_imported() -> bool:
    """Import sentence-transformers lazily to avoid heavy startup side effects."""
    global CrossEncoder, HAS_CROSS_ENCODER

    if HAS_CROSS_ENCODER is not None:
        return HAS_CROSS_ENCODER

    try:
        from sentence_transformers import CrossEncoder as ImportedCrossEncoder

        CrossEncoder = ImportedCrossEncoder
        HAS_CROSS_ENCODER = True
    except ImportError:
        HAS_CROSS_ENCODER = False
        CrossEncoder = None  # type: ignore[assignment]
        logger.warning(
            "sentence-transformers not installed. Cross-encoder reranking disabled."
        )

    return bool(HAS_CROSS_ENCODER)


# Default model: Japanese-specific cross-encoder trained on native Japanese data
# ModernBERT-based (ruri-v3-pt-130m), L13-H384, ~130M params
# Requires transformers>=4.48.0
DEFAULT_CROSS_ENCODER_MODEL = "hotchpotch/japanese-reranker-base-v2"
# Alternatives:
# - "hotchpotch/japanese-reranker-xsmall-v2" (faster, ~30M params, avg 0.870)
# - "hotchpotch/japanese-reranker-base-v2" (higher accuracy, ~130M params, avg 0.893)
# - "cl-nagoya/ruri-v3-reranker-310m" (SOTA, 315M params, avg 0.917, but heavy)
# - "cross-encoder/mmarco-mMiniLMv2-L12-H384-v1" (previous: multilingual, machine-translated training data)

RERANKER_VARIANTS = {"base", "tuned", "ab"}


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

        if _ensure_cross_encoder_imported():
            try:
                self.model = CrossEncoder(model_name)
                logger.info(f"Loaded cross-encoder model: {model_name}")
            except Exception as e:
                logger.error(f"Failed to load cross-encoder model: {e}")
                self.model = None
        else:
            logger.warning("CrossEncoder not available - reranking disabled")
    @classmethod
    def get_instance(
        cls, model_name: str = DEFAULT_CROSS_ENCODER_MODEL
    ) -> "CrossEncoderReranker":
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
        sort: bool = True,
    ) -> list[dict]:
        """
        Rerank search results using cross-encoder scores.

        Args:
            query: Search query
            results: List of search results (must contain 'text' field)
            top_k: Number of top results to return
            text_key: Key for text content in results
            min_score: Minimum score threshold (optional)
            sort: Whether to sort results by rerank_score (default True).
                  Set to False when the caller needs to preserve original order
                  and map scores back by index.

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

            # Sort by rerank score (unless caller wants original order)
            if sort:
                reranked = sorted(
                    results,
                    key=lambda x: x.get("rerank_score", -float("inf")),
                    reverse=True,
                )
            else:
                reranked = results

            # Apply minimum score filter if specified
            if min_score is not None:
                reranked = [
                    r for r in reranked if r.get("rerank_score", 0) >= min_score
                ]

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


def _stable_bucket(value: str) -> float:
    """Return deterministic bucket [0,1) from an arbitrary key."""
    key = (value or "").strip().lower()
    digest = hashlib.md5(key.encode("utf-8")).hexdigest()
    # 8 hex chars are enough for stable bucketing.
    return int(digest[:8], 16) / 0xFFFFFFFF


def resolve_reranker_variant(routing_key: str | None = None) -> str:
    """Resolve reranker variant based on environment and optional routing key."""
    requested = os.getenv("RERANKER_VARIANT", "base").strip().lower()
    if requested not in RERANKER_VARIANTS:
        requested = "base"

    if requested != "ab":
        return requested

    ratio_raw = os.getenv("RERANKER_AB_TUNED_RATIO", "0.5").strip()
    try:
        tuned_ratio = float(ratio_raw)
    except ValueError:
        tuned_ratio = 0.5
    tuned_ratio = max(0.0, min(1.0, tuned_ratio))

    bucket = _stable_bucket(routing_key or "")
    return "tuned" if bucket < tuned_ratio else "base"


def resolve_reranker_model_name(variant: str) -> str:
    """Resolve model name/path from variant."""
    base_model = os.getenv("RERANKER_BASE_MODEL", DEFAULT_CROSS_ENCODER_MODEL).strip()
    tuned_model = os.getenv("RERANKER_TUNED_MODEL_PATH", "").strip()

    if variant == "tuned":
        return tuned_model or base_model
    return base_model


def check_reranker_health() -> dict:
    """
    Run a health check on the cross-encoder reranker.

    Returns:
        dict with keys: available, model_name, test_score, error
    """
    result = {
        "available": False,
        "model_name": DEFAULT_CROSS_ENCODER_MODEL,
        "test_score": None,
        "error": None,
    }

    if not _ensure_cross_encoder_imported():
        result["error"] = "sentence-transformers not installed"
        logger.error(
            "Reranker health check FAILED: sentence-transformers not installed. "
            "Install with: pip install sentence-transformers sentencepiece"
        )
        return result

    try:
        reranker = CrossEncoderReranker.get_instance()
        if not reranker.is_available():
            result["error"] = "Cross-encoder model failed to load"
            logger.error("Reranker health check FAILED: model not loaded")
            return result

        # Quick sanity test with a known-good pair
        # A matching query-document pair should score well above 0.5
        test_pairs = [("テスト用クエリ", "テスト用クエリに関する公式ページ")]
        scores = reranker.score_pairs(test_pairs)
        test_score = scores[0] if scores else 0.0
        result["test_score"] = test_score

        if test_score < 0.5:
            result["available"] = False
            result["error"] = (
                f"Scoring sanity check failed: test_score={test_score:.4f} "
                f"(expected >0.5). Likely a torch/transformers version mismatch."
            )
            logger.error(f"Reranker health check FAILED: {result['error']}")
        else:
            result["available"] = True
            logger.info(
                f"Reranker health check PASSED: model={reranker.model_name}, "
                f"test_score={test_score:.4f}"
            )
    except Exception as e:
        result["error"] = str(e)
        logger.error(f"Reranker health check FAILED: {e}")

    return result


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


def get_reranker_with_variant(
    routing_key: str | None = None,
) -> tuple[CrossEncoderReranker, str, str]:
    """
    Get reranker instance plus resolved variant and model name.

    Returns:
        (reranker_instance, resolved_variant, model_name)
    """
    resolved_variant = resolve_reranker_variant(routing_key)
    model_name = resolve_reranker_model_name(resolved_variant)
    reranker = get_reranker(model_name)
    return reranker, resolved_variant, model_name
