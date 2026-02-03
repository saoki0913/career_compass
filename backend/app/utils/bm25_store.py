"""
BM25 Index Store Module

Provides BM25 (keyword) search indexing with persistence.
Used for hybrid search combining with semantic search.
"""

import json
import pickle
import time
from pathlib import Path
from typing import Optional
from dataclasses import dataclass, field

from cachetools import LRUCache

try:
    import bm25s

    HAS_BM25 = True
except ImportError:
    HAS_BM25 = False
    bm25s = None  # type: ignore
    print("Warning: bm25s not installed. BM25 search will be disabled.")

from app.utils.japanese_tokenizer import tokenize

# BM25 index persistence directory
BM25_PERSIST_DIR = Path(__file__).parent.parent.parent / "data" / "bm25"

# Current JSON format version for schema validation
BM25_FORMAT_VERSION = 1


@dataclass
class BM25Document:
    """A document in the BM25 index."""

    doc_id: str
    text: str
    tokens: list[str] = field(default_factory=list)
    metadata: dict = field(default_factory=dict)


class BM25Index:
    """
    BM25 index for a single company.

    Stores tokenized documents and provides keyword search.
    Persists to disk for durability.
    """

    def __init__(self, company_id: str):
        """
        Initialize BM25 index for a company.

        Args:
            company_id: Company identifier
        """
        self.company_id = company_id
        self.documents: list[BM25Document] = []
        self._bm25: Optional["bm25s.BM25"] = None

    def add_document(self, doc_id: str, text: str, metadata: Optional[dict] = None):
        """
        Add a document to the index.

        Args:
            doc_id: Unique document identifier
            text: Document text
            metadata: Optional metadata
        """
        tokens = tokenize(text)
        if not tokens:
            return

        doc = BM25Document(
            doc_id=doc_id, text=text, tokens=tokens, metadata=metadata or {}
        )
        self.documents.append(doc)
        # Invalidate BM25 index (will be rebuilt on next search)
        self._bm25 = None

    def add_documents(self, docs: list[dict]):
        """
        Add multiple documents to the index.

        Args:
            docs: List of dicts with 'id', 'text', and optional 'metadata'
        """
        for doc in docs:
            self.add_document(
                doc_id=doc["id"], text=doc["text"], metadata=doc.get("metadata", {})
            )

    def _build_index(self):
        """Build the BM25 index from documents."""
        if not HAS_BM25:
            return

        if not self.documents:
            self._bm25 = None
            return

        corpus = [doc.tokens for doc in self.documents]
        self._bm25 = bm25s.BM25()
        self._bm25.index(corpus)

    def search(self, query: str, k: int = 10) -> list[tuple[str, float]]:
        """
        Search the index.

        Args:
            query: Search query
            k: Maximum number of results

        Returns:
            List of (doc_id, score) tuples sorted by score descending
        """
        if not HAS_BM25 or not self.documents:
            return []

        if self._bm25 is None:
            self._build_index()

        if self._bm25 is None:
            return []

        # Tokenize query
        query_tokens = tokenize(query)
        if not query_tokens:
            return []

        # Limit k to corpus size to avoid bm25s ValueError
        k = min(k, len(self.documents))
        if k == 0:
            return []

        results, scores = self._bm25.retrieve([query_tokens], k=k)
        if results is None or scores is None or len(results) == 0 or len(scores) == 0:
            return []

        indices = results[0]
        score_list = scores[0]
        output: list[tuple[str, float]] = []
        for rank, doc_idx in enumerate(indices):
            if doc_idx is None:
                continue
            try:
                doc_id = self.documents[int(doc_idx)].doc_id
            except Exception:
                continue
            try:
                score_value = float(score_list[rank])
            except Exception:
                score_value = 0.0
            output.append((doc_id, score_value))

        return output

    def get_document(self, doc_id: str) -> Optional[BM25Document]:
        """Get a document by ID."""
        for doc in self.documents:
            if doc.doc_id == doc_id:
                return doc
        return None

    def clear(self):
        """Clear all documents from the index."""
        self.documents = []
        self._bm25 = None

    def save(self):
        """Save the index to disk using JSON format."""
        BM25_PERSIST_DIR.mkdir(parents=True, exist_ok=True)
        json_path = BM25_PERSIST_DIR / f"{self.company_id}.json"

        data = {
            "version": BM25_FORMAT_VERSION,
            "company_id": self.company_id,
            "documents": [
                {
                    "doc_id": doc.doc_id,
                    "text": doc.text,
                    "tokens": doc.tokens,
                    "metadata": doc.metadata,
                }
                for doc in self.documents
            ],
        }

        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)

        print(f"[BM25] Saved index for {self.company_id} ({len(self.documents)} docs)")

    @classmethod
    def load(cls, company_id: str) -> Optional["BM25Index"]:
        """
        Load an index from disk.

        Tries JSON format first (secure), then falls back to pickle for migration.
        Corrupted files are moved to .corrupted extension.

        Args:
            company_id: Company identifier

        Returns:
            BM25Index if found, None otherwise
        """
        json_path = BM25_PERSIST_DIR / f"{company_id}.json"
        pkl_path = BM25_PERSIST_DIR / f"{company_id}.pkl"

        # Try JSON first (new secure format)
        if json_path.exists():
            try:
                with open(json_path, encoding="utf-8") as f:
                    data = json.load(f)

                # Validate schema version
                version = data.get("version", 0)
                if version != BM25_FORMAT_VERSION:
                    print(f"[BM25] ⚠️ Unsupported version {version} for {company_id}")
                    return None

                index = cls(company_id)
                for doc_data in data.get("documents", []):
                    doc = BM25Document(
                        doc_id=doc_data["doc_id"],
                        text=doc_data["text"],
                        tokens=doc_data["tokens"],
                        metadata=doc_data.get("metadata", {}),
                    )
                    index.documents.append(doc)

                print(
                    f"[BM25] ✅ Loaded index for {company_id} ({len(index.documents)} docs)"
                )
                return index

            except Exception as e:
                print(f"[BM25] ❌ Error loading JSON index for {company_id}: {e}")
                # Move corrupted file
                corrupted_path = json_path.with_suffix(
                    f".json.corrupted.{int(time.time())}"
                )
                try:
                    json_path.rename(corrupted_path)
                    print(f"[BM25] Moved corrupted file to: {corrupted_path}")
                except Exception as rename_error:
                    print(f"[BM25] Could not move corrupted file: {rename_error}")
                return None

        # Fall back to pickle for migration (legacy format)
        if pkl_path.exists():
            try:
                print(f"[BM25] Migrating pickle to JSON for {company_id}...")
                with open(pkl_path, "rb") as f:
                    data = pickle.load(f)

                index = cls(company_id)
                for doc_data in data.get("documents", []):
                    doc = BM25Document(
                        doc_id=doc_data["doc_id"],
                        text=doc_data["text"],
                        tokens=doc_data["tokens"],
                        metadata=doc_data.get("metadata", {}),
                    )
                    index.documents.append(doc)

                # Save as JSON (migrate)
                index.save()

                # Remove old pickle file after successful migration
                pkl_path.unlink()
                print(
                    f"[BM25] ✅ Migrated {company_id} from pickle to JSON ({len(index.documents)} docs)"
                )
                return index

            except Exception as e:
                print(f"[BM25] ❌ Error loading pickle index for {company_id}: {e}")
                # Move corrupted pickle file
                corrupted_path = pkl_path.with_suffix(
                    f".pkl.corrupted.{int(time.time())}"
                )
                try:
                    pkl_path.rename(corrupted_path)
                    print(f"[BM25] Moved corrupted pickle to: {corrupted_path}")
                except Exception as rename_error:
                    print(f"[BM25] Could not move corrupted file: {rename_error}")
                return None

        return None

    @classmethod
    def delete(cls, company_id: str) -> bool:
        """
        Delete an index from disk.

        Args:
            company_id: Company identifier

        Returns:
            True if deleted, False if not found
        """
        deleted = False
        json_path = BM25_PERSIST_DIR / f"{company_id}.json"
        pkl_path = BM25_PERSIST_DIR / f"{company_id}.pkl"

        if json_path.exists():
            json_path.unlink()
            deleted = True
        if pkl_path.exists():
            pkl_path.unlink()
            deleted = True

        if deleted:
            print(f"[BM25] Deleted index for {company_id}")
        return deleted

    @classmethod
    def exists(cls, company_id: str) -> bool:
        """Check if an index exists on disk."""
        json_path = BM25_PERSIST_DIR / f"{company_id}.json"
        pkl_path = BM25_PERSIST_DIR / f"{company_id}.pkl"
        return json_path.exists() or pkl_path.exists()


# LRU cache for performance with bounded memory usage
# Max 100 companies cached to prevent memory leak
_index_cache: LRUCache = LRUCache(maxsize=100)


def get_or_create_index(company_id: str) -> BM25Index:
    """
    Get or create a BM25 index for a company.

    Uses LRU cache for performance with bounded memory.

    Args:
        company_id: Company identifier

    Returns:
        BM25Index instance
    """
    if company_id in _index_cache:
        return _index_cache[company_id]

    # Try to load from disk
    index = BM25Index.load(company_id)
    if index is None:
        index = BM25Index(company_id)

    _index_cache[company_id] = index
    return index


def clear_index_cache(company_id: Optional[str] = None):
    """
    Clear the index cache.

    Args:
        company_id: If provided, only clear that company's cache.
                   If None, clear all.
    """
    if company_id:
        _index_cache.pop(company_id, None)
    else:
        _index_cache.clear()
