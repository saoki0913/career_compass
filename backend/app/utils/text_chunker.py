"""
Japanese Text Chunker Module

Provides text chunking optimized for Japanese text, using character-based
splitting with Japanese-aware separators.
"""

from dataclasses import dataclass
from typing import Optional

DEFAULT_CHUNK_SIZE = 500
DEFAULT_CHUNK_OVERLAP = 100

CHUNK_SIZE_BY_CONTENT_TYPE = {
    "recruitment_homepage": 300,
    "employee_interviews": 400,
    "corporate_site": 500,
    "ir_materials": 700,
    "ceo_message": 500,
    "midterm_plan": 800,
}


def get_chunk_settings(content_type: Optional[str]) -> tuple[int, int]:
    ct = (content_type or "").lower()
    size = CHUNK_SIZE_BY_CONTENT_TYPE.get(ct, DEFAULT_CHUNK_SIZE)
    return size, DEFAULT_CHUNK_OVERLAP


def get_chunker_for_content_type(content_type: Optional[str]) -> "JapaneseTextChunker":
    chunk_size, chunk_overlap = get_chunk_settings(content_type)
    return JapaneseTextChunker(chunk_size=chunk_size, chunk_overlap=chunk_overlap)


@dataclass
class ChunkResult:
    """Result of text chunking."""

    text: str
    start_index: int
    end_index: int
    chunk_index: int


class JapaneseTextChunker:
    """
    Text chunker optimized for Japanese text.

    Uses character-based splitting (not token-based) since Japanese characters
    are information-dense. Respects Japanese sentence boundaries.
    """

    def __init__(
        self,
        chunk_size: int = DEFAULT_CHUNK_SIZE,
        chunk_overlap: int = DEFAULT_CHUNK_OVERLAP,
        separators: Optional[list[str]] = None,
        min_chunk_size: int = 50,
    ):
        """
        Initialize the chunker.

        Args:
            chunk_size: Target size of each chunk in characters
            chunk_overlap: Number of characters to overlap between chunks
            separators: List of separators to try, in order of preference
            min_chunk_size: Minimum chunk size (smaller chunks are merged)
        """
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.separators = separators or ["\n\n", "\n", "。", "！", "？", "、", " ", ""]
        self.min_chunk_size = min_chunk_size

    def chunk(self, text: str) -> list[ChunkResult]:
        """
        Split text into chunks.

        Args:
            text: Text to split

        Returns:
            List of ChunkResult objects
        """
        if not text or len(text.strip()) == 0:
            return []

        # Normalize whitespace
        text = self._normalize_text(text)

        # If text is shorter than chunk_size, return as single chunk
        if len(text) <= self.chunk_size:
            return [
                ChunkResult(
                    text=text, start_index=0, end_index=len(text), chunk_index=0
                )
            ]

        # Recursive splitting
        chunks = self._split_recursive(text, self.separators)

        # Merge small chunks and add overlap
        merged_chunks = self._merge_and_overlap(chunks, text)

        return merged_chunks

    def _normalize_text(self, text: str) -> str:
        """Normalize text by cleaning up whitespace."""
        # Replace multiple newlines with double newline
        import re

        text = re.sub(r"\n{3,}", "\n\n", text)
        # Replace multiple spaces with single space
        text = re.sub(r"[ \t]+", " ", text)
        # Strip leading/trailing whitespace
        text = text.strip()
        return text

    def _split_recursive(self, text: str, separators: list[str]) -> list[str]:
        """
        Recursively split text using separators.

        Args:
            text: Text to split
            separators: Remaining separators to try

        Returns:
            List of text chunks
        """
        if not separators:
            # No more separators, force split by chunk_size
            return self._force_split(text)

        separator = separators[0]
        remaining_separators = separators[1:]

        if separator == "":
            # Empty separator means character-by-character split
            return self._force_split(text)

        # Split by current separator
        parts = text.split(separator)

        if len(parts) == 1:
            # Separator not found, try next
            return self._split_recursive(text, remaining_separators)

        # Reconstruct parts with separator (except for the last one)
        result = []
        for i, part in enumerate(parts):
            if i < len(parts) - 1:
                part_with_sep = part + separator
            else:
                part_with_sep = part

            if not part_with_sep.strip():
                continue

            # If part is still too long, split further
            if len(part_with_sep) > self.chunk_size:
                result.extend(
                    self._split_recursive(part_with_sep, remaining_separators)
                )
            else:
                result.append(part_with_sep)

        return result

    def _force_split(self, text: str) -> list[str]:
        """Force split text by chunk_size."""
        chunks = []
        for i in range(0, len(text), self.chunk_size):
            chunk = text[i : i + self.chunk_size]
            if chunk.strip():
                chunks.append(chunk)
        return chunks

    def _merge_and_overlap(
        self, chunks: list[str], original_text: str
    ) -> list[ChunkResult]:
        """
        Merge small chunks and add overlap between chunks.

        Args:
            chunks: List of text chunks
            original_text: Original text for index tracking

        Returns:
            List of ChunkResult with proper indices and overlap
        """
        if not chunks:
            return []

        # First pass: merge small chunks
        merged = []
        current = ""

        for chunk in chunks:
            if len(current) + len(chunk) <= self.chunk_size:
                current += chunk
            else:
                if current.strip():
                    merged.append(current)
                current = chunk

        if current.strip():
            merged.append(current)

        # If still have small chunks at the end, merge with previous
        final_chunks = []
        for i, chunk in enumerate(merged):
            if len(chunk) < self.min_chunk_size and final_chunks:
                # Merge with previous chunk
                final_chunks[-1] += chunk
            else:
                final_chunks.append(chunk)

        # Second pass: create results with overlap
        results = []
        current_pos = 0

        for i, chunk in enumerate(final_chunks):
            # Find the actual position in original text
            chunk_start = original_text.find(chunk[:50], current_pos)
            if chunk_start == -1:
                chunk_start = current_pos

            chunk_end = chunk_start + len(chunk)

            # Add overlap from previous chunk
            if i > 0 and self.chunk_overlap > 0:
                overlap_start = max(0, chunk_start - self.chunk_overlap)
                overlap_text = original_text[overlap_start:chunk_start]
                chunk_with_overlap = overlap_text + chunk
                actual_start = overlap_start
            else:
                chunk_with_overlap = chunk
                actual_start = chunk_start

            results.append(
                ChunkResult(
                    text=chunk_with_overlap.strip(),
                    start_index=actual_start,
                    end_index=chunk_end,
                    chunk_index=i,
                )
            )

            current_pos = chunk_end

        return results

    def chunk_with_metadata(
        self, text: str, base_metadata: Optional[dict] = None
    ) -> list[dict]:
        """
        Chunk text and return with metadata suitable for vector storage.

        Args:
            text: Text to chunk
            base_metadata: Base metadata to include in each chunk

        Returns:
            List of dicts with 'text', 'type', and 'metadata' keys
        """
        chunks = self.chunk(text)
        base_metadata = base_metadata or {}

        results = []
        for chunk in chunks:
            results.append(
                {
                    "text": chunk.text,
                    "type": "full_text",
                    "metadata": {
                        **base_metadata,
                        "chunk_index": chunk.chunk_index,
                        "start_index": chunk.start_index,
                        "end_index": chunk.end_index,
                    },
                }
            )

        return results


def chunk_html_content(
    html_content: str, chunk_size: int = 500, chunk_overlap: int = 100
) -> list[dict]:
    """
    Extract text from HTML and chunk it.

    Args:
        html_content: HTML content to process
        chunk_size: Target chunk size
        chunk_overlap: Overlap between chunks

    Returns:
        List of chunk dicts for vector storage
    """
    from bs4 import BeautifulSoup

    # Parse HTML
    soup = BeautifulSoup(html_content, "html.parser")

    # Remove script and style elements
    for element in soup(["script", "style", "nav", "footer", "header"]):
        element.decompose()

    # Extract text
    text = soup.get_text(separator="\n")

    # Chunk
    chunker = JapaneseTextChunker(chunk_size=chunk_size, chunk_overlap=chunk_overlap)

    return chunker.chunk_with_metadata(text)


def extract_sections_from_html(html_content: str) -> list[dict]:
    """
    Extract sections from HTML based on headings.

    This is useful for preserving document structure.

    Args:
        html_content: HTML content to process

    Returns:
        List of section dicts with 'heading', 'content', 'level' keys
    """
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(html_content, "html.parser")

    # Remove unwanted elements
    for element in soup(["script", "style", "nav", "footer"]):
        element.decompose()

    sections = []
    current_section = {"heading": "", "content": "", "level": 0}

    for element in soup.find_all(["h1", "h2", "h3", "h4", "p", "div", "li"]):
        if element.name in ["h1", "h2", "h3", "h4"]:
            # Save current section if it has content
            if current_section["content"].strip():
                sections.append(current_section)

            # Start new section
            level = int(element.name[1])
            current_section = {
                "heading": element.get_text(strip=True),
                "content": "",
                "level": level,
            }
        else:
            # Add to current section
            text = element.get_text(strip=True)
            if text and text not in current_section["content"]:
                current_section["content"] += text + "\n"

    # Don't forget the last section
    if current_section["content"].strip():
        sections.append(current_section)

    return sections


def chunk_sections_with_metadata(
    sections: list[dict], chunk_size: int = 500, chunk_overlap: int = 100
) -> list[dict]:
    """
    Chunk sectioned content and attach heading metadata.

    Args:
        sections: List of dicts with 'heading', 'content', 'level'
        chunk_size: Target chunk size
        chunk_overlap: Overlap size

    Returns:
        List of chunk dicts with metadata for vector storage
    """
    chunker = JapaneseTextChunker(chunk_size=chunk_size, chunk_overlap=chunk_overlap)

    results = []
    global_index = 0

    for section_index, section in enumerate(sections):
        content = (section.get("content") or "").strip()
        if not content:
            continue

        heading = section.get("heading") or ""
        level = section.get("level") or 0

        chunks = chunker.chunk(content)
        for chunk in chunks:
            results.append(
                {
                    "text": chunk.text,
                    "type": "full_text",
                    "metadata": {
                        "chunk_index": global_index,
                        "section_index": section_index,
                        "heading": heading,
                        "heading_path": heading,
                        "heading_level": level,
                    },
                }
            )
            global_index += 1

    return results
