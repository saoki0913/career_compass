from __future__ import annotations

from app.utils.content_types import content_type_label


class MetadataDocumentSummarizer:
    """Deterministic fallback summarizer for metadata-only contextual retrieval."""

    def summarize(self, document_text: str, *, meta: dict) -> str:
        company_name = str(meta.get("company_name") or "対象企業").strip()
        content_type = content_type_label(str(meta.get("content_type") or "corporate_site"))
        heading = str(meta.get("heading") or meta.get("heading_path") or "").strip()
        topic = heading if heading else "企業公開情報"
        return f"この抜粋は {company_name} の {content_type} より。文書主題: {topic}"
