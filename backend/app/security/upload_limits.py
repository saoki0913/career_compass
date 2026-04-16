"""Centralized upload payload limits (Phase 7 象限④).

Keeping the size limits in one module lets us audit every ``UploadFile`` entry
point against the same ceiling and raise consistent 413 errors. Without this,
limits drift per route and a forgotten bound becomes a DoS foothold.

The primary asset protected is the PDF ingest path (``/rag/upload-pdf`` and
``/rag/estimate-upload-pdf``). 20 MB mirrors the historical constant that has
been validated against our largest legitimate corporate-PDF samples; anything
beyond that is almost certainly an adversarial payload or a rendering accident.
"""

from __future__ import annotations

from fastapi import HTTPException

# 20 MB upper bound for PDF uploads. Matches ``MAX_UPLOAD_PDF_BYTES`` as used
# in company_info.py before centralization. Bump in a single place if product
# ever needs a higher ceiling.
MAX_PDF_UPLOAD_BYTES: int = 20 * 1024 * 1024

# Generic ceiling for non-PDF binary uploads. Currently unused; here so that
# future endpoints do not invent their own arbitrary constant.
MAX_GENERIC_UPLOAD_BYTES: int = 10 * 1024 * 1024


def enforce_pdf_upload_size(
    pdf_bytes: bytes,
    *,
    detail: str = "PDFファイルが大きすぎます。20MB以下にしてください。",
) -> None:
    """Raise 413 when the PDF payload exceeds ``MAX_PDF_UPLOAD_BYTES``.

    Callers should have already rejected empty payloads (400) before invoking
    this helper so the user-facing message stays specific to size.
    """
    if len(pdf_bytes) > MAX_PDF_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=detail)
