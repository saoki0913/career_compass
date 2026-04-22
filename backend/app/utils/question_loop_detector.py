"""Question loop detection via character-level N-gram Jaccard similarity."""

from __future__ import annotations

import os
from typing import Any

LOOP_DETECTION_WINDOW = 5
SIMILARITY_THRESHOLD = 0.55
MAX_SIMILAR_BEFORE_BLOCK = 2


def _extract_char_ngrams(text: str, n: int = 2) -> set[str]:
    """Extract character n-grams from text."""
    text = text.strip()
    if len(text) < n:
        return {text} if text else set()
    return {text[index : index + n] for index in range(len(text) - n + 1)}


def _jaccard_similarity(a: set[str], b: set[str]) -> float:
    """Compute Jaccard similarity between two sets."""
    if not a or not b:
        return 0.0
    intersection = len(a & b)
    union = len(a | b)
    return intersection / union if union > 0 else 0.0


def _extract_recent_assistant_questions(
    messages: list[dict[str, Any]],
    *,
    window: int = LOOP_DETECTION_WINDOW,
) -> list[str]:
    """Extract recent assistant question texts from conversation history."""
    if window <= 0:
        return []

    questions: list[str] = []
    for message in reversed(messages):
        if len(questions) >= window:
            break
        role = message.get("role", "")
        content = message.get("content", "")
        if role == "assistant" and isinstance(content, str) and content.strip():
            questions.append(content.strip()[:100])
    questions.reverse()
    return questions


def _detect_question_loops_in_history(
    conversation_history: list[dict[str, Any]],
    candidate_question: str,
    *,
    window: int = LOOP_DETECTION_WINDOW,
    threshold: float = SIMILARITY_THRESHOLD,
) -> dict[str, Any]:
    """Check if candidate question is too similar to recent questions."""
    raw_threshold = os.getenv("GAKUCHIKA_LOOP_SIMILARITY_THRESHOLD", "").strip()
    if raw_threshold:
        try:
            threshold = float(raw_threshold)
        except ValueError:
            pass

    recent = _extract_recent_assistant_questions(conversation_history, window=window)
    if not recent:
        return {"loop_detected": False, "max_similarity": 0.0, "similar_count": 0}

    candidate_ngrams = _extract_char_ngrams(candidate_question)
    max_similarity = 0.0
    similar_count = 0

    for question in recent:
        similarity = _jaccard_similarity(candidate_ngrams, _extract_char_ngrams(question))
        max_similarity = max(max_similarity, similarity)
        if similarity >= threshold:
            similar_count += 1

    return {
        "loop_detected": similar_count >= MAX_SIMILAR_BEFORE_BLOCK,
        "max_similarity": round(max_similarity, 3),
        "similar_count": similar_count,
    }
