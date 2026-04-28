from __future__ import annotations

from typing import Callable, Literal, Optional

from app.utils.text_chunker import JapaneseTextChunker

ContextualMode = Literal["metadata_only", "prefix_text"]
SummaryFn = Callable[[str, dict], str]


class ContextualChunker:
    """Add document-level retrieval context while preserving the base chunker contract."""

    def __init__(
        self,
        *,
        base: JapaneseTextChunker,
        summarizer: SummaryFn,
        mode: ContextualMode = "metadata_only",
    ) -> None:
        if mode not in {"metadata_only", "prefix_text"}:
            raise ValueError("mode must be metadata_only or prefix_text")
        self.base = base
        self.summarizer = summarizer
        self.mode = mode

    def chunk_with_metadata(self, text: str, base_metadata: Optional[dict] = None) -> list[dict]:
        metadata = dict(base_metadata or {})
        prefix = " ".join((self.summarizer(text, metadata) or "").split())
        base_chunks = self.base.chunk_with_metadata(text, metadata)
        if not prefix:
            for chunk in base_chunks:
                chunk["embedding_text"] = chunk["text"]
            return base_chunks

        contextualized: list[dict] = []
        for chunk in base_chunks:
            chunk_metadata = dict(chunk.get("metadata") or {})
            chunk_metadata["contextual_prefix"] = prefix
            raw_text = str(chunk.get("text") or "")
            embedding_text = f"{prefix}\n\n{raw_text}".strip()
            if self.mode == "prefix_text":
                text_for_storage = embedding_text
            else:
                text_for_storage = raw_text
            contextualized.append(
                {
                    **chunk,
                    "text": text_for_storage,
                    "embedding_text": embedding_text,
                    "metadata": chunk_metadata,
                }
            )
        return contextualized
