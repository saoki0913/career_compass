"""
Vector Store Utility Module

Provides vector storage and retrieval using ChromaDB for company RAG.
"""

import chromadb
from chromadb.config import Settings as ChromaSettings
from pathlib import Path
from typing import Optional
import json

from app.utils.embeddings import generate_embedding, generate_embeddings_batch

# ChromaDB persistent storage path
CHROMA_PERSIST_DIR = Path(__file__).parent.parent.parent / "data" / "chroma"

# Collection names
COMPANY_COLLECTION = "company_info"

# Singleton client
_chroma_client: Optional[chromadb.PersistentClient] = None


def get_chroma_client() -> chromadb.PersistentClient:
    """Get or create ChromaDB client."""
    global _chroma_client
    if _chroma_client is None:
        # Ensure directory exists
        CHROMA_PERSIST_DIR.mkdir(parents=True, exist_ok=True)

        _chroma_client = chromadb.PersistentClient(
            path=str(CHROMA_PERSIST_DIR),
            settings=ChromaSettings(
                anonymized_telemetry=False,
                allow_reset=True,
            )
        )
        print(f"[VectorStore] Initialized ChromaDB at {CHROMA_PERSIST_DIR}")

    return _chroma_client


def get_company_collection() -> chromadb.Collection:
    """Get or create company info collection."""
    client = get_chroma_client()
    return client.get_or_create_collection(
        name=COMPANY_COLLECTION,
        metadata={"description": "Company recruitment information for RAG"}
    )


async def store_company_info(
    company_id: str,
    company_name: str,
    content_chunks: list[dict],
    source_url: str
) -> bool:
    """
    Store company information in vector database.

    Args:
        company_id: Unique company identifier
        company_name: Company name
        content_chunks: List of content chunks with text and metadata
            Each chunk: {"text": str, "type": str, "metadata": dict}
        source_url: Source URL of the information

    Returns:
        True if successful, False otherwise
    """
    try:
        collection = get_company_collection()

        # Delete existing entries for this company (to allow updates)
        try:
            collection.delete(where={"company_id": company_id})
        except Exception:
            pass  # Collection might not have existing entries

        # Prepare documents and metadata
        documents = []
        metadatas = []
        ids = []

        for idx, chunk in enumerate(content_chunks):
            text = chunk.get("text", "")
            if not text or len(text.strip()) < 10:
                continue

            doc_id = f"{company_id}_{idx}"
            metadata = {
                "company_id": company_id,
                "company_name": company_name,
                "source_url": source_url,
                "chunk_type": chunk.get("type", "general"),
                "chunk_index": idx,
            }
            # Add any additional metadata from the chunk
            if chunk.get("metadata"):
                for key, value in chunk["metadata"].items():
                    if isinstance(value, (str, int, float, bool)):
                        metadata[key] = value

            documents.append(text)
            metadatas.append(metadata)
            ids.append(doc_id)

        if not documents:
            print(f"[VectorStore] No valid content chunks for company {company_id}")
            return False

        # Generate embeddings
        embeddings = await generate_embeddings_batch(documents)

        # Filter out failed embeddings
        valid_items = [
            (doc, meta, doc_id, emb)
            for doc, meta, doc_id, emb in zip(documents, metadatas, ids, embeddings)
            if emb is not None
        ]

        if not valid_items:
            print(f"[VectorStore] Failed to generate embeddings for company {company_id}")
            return False

        # Unpack valid items
        valid_docs, valid_metas, valid_ids, valid_embs = zip(*valid_items)

        # Add to collection
        collection.add(
            documents=list(valid_docs),
            metadatas=list(valid_metas),
            ids=list(valid_ids),
            embeddings=list(valid_embs)
        )

        print(f"[VectorStore] Stored {len(valid_docs)} chunks for company {company_id}")
        return True

    except Exception as e:
        print(f"[VectorStore] Error storing company info: {e}")
        return False


async def search_company_context(
    company_id: str,
    query: str,
    n_results: int = 5
) -> list[dict]:
    """
    Search for relevant company context based on query.

    Args:
        company_id: Company identifier to search within
        query: Search query (e.g., ES content)
        n_results: Maximum number of results to return

    Returns:
        List of relevant context chunks with metadata
    """
    try:
        collection = get_company_collection()

        # Generate query embedding
        query_embedding = await generate_embedding(query)
        if query_embedding is None:
            print("[VectorStore] Failed to generate query embedding")
            return []

        # Search
        results = collection.query(
            query_embeddings=[query_embedding],
            where={"company_id": company_id},
            n_results=n_results,
            include=["documents", "metadatas", "distances"]
        )

        # Format results
        contexts = []
        if results["documents"] and results["documents"][0]:
            for idx, doc in enumerate(results["documents"][0]):
                context = {
                    "text": doc,
                    "metadata": results["metadatas"][0][idx] if results["metadatas"] else {},
                    "distance": results["distances"][0][idx] if results["distances"] else None,
                }
                contexts.append(context)

        return contexts

    except Exception as e:
        print(f"[VectorStore] Error searching company context: {e}")
        return []


async def get_company_context_for_review(
    company_id: str,
    es_content: str,
    max_context_length: int = 2000
) -> str:
    """
    Get formatted company context for ES review.

    Args:
        company_id: Company identifier
        es_content: ES content to find relevant context for
        max_context_length: Maximum length of returned context

    Returns:
        Formatted context string for LLM prompt
    """
    contexts = await search_company_context(company_id, es_content)

    if not contexts:
        return ""

    # Format context
    context_parts = []
    total_length = 0

    for ctx in contexts:
        text = ctx["text"]
        chunk_type = ctx["metadata"].get("chunk_type", "general")

        # Add type label
        type_labels = {
            "deadline": "締切情報",
            "recruitment_type": "募集区分",
            "required_documents": "提出物",
            "application_method": "応募方法",
            "selection_process": "選考プロセス",
            "general": "企業情報",
        }
        label = type_labels.get(chunk_type, "企業情報")

        formatted = f"【{label}】\n{text}"

        if total_length + len(formatted) > max_context_length:
            break

        context_parts.append(formatted)
        total_length += len(formatted)

    return "\n\n".join(context_parts)


def has_company_rag(company_id: str) -> bool:
    """
    Check if company has RAG data stored.

    Args:
        company_id: Company identifier

    Returns:
        True if company has RAG data
    """
    try:
        collection = get_company_collection()
        results = collection.get(
            where={"company_id": company_id},
            limit=1
        )
        return bool(results["ids"])
    except Exception:
        return False


def delete_company_rag(company_id: str) -> bool:
    """
    Delete company RAG data.

    Args:
        company_id: Company identifier

    Returns:
        True if successful
    """
    try:
        collection = get_company_collection()
        collection.delete(where={"company_id": company_id})
        print(f"[VectorStore] Deleted RAG data for company {company_id}")
        return True
    except Exception as e:
        print(f"[VectorStore] Error deleting company RAG: {e}")
        return False
