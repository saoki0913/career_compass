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
from starlette.requests import Request

# 20 MB upper bound for PDF uploads. Matches ``MAX_UPLOAD_PDF_BYTES`` as used
# in company_info.py before centralization. Bump in a single place if product
# ever needs a higher ceiling.
MAX_PDF_UPLOAD_BYTES: int = 20 * 1024 * 1024

# Generic ceiling for non-PDF binary uploads. Currently unused; here so that
# future endpoints do not invent their own arbitrary constant.
MAX_GENERIC_UPLOAD_BYTES: int = 10 * 1024 * 1024
UPLOAD_READ_CHUNK_BYTES: int = 1024 * 1024


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


def validate_pdf_upload_metadata(filename: str, content_type: str | None) -> None:
    """Reject non-PDF names and MIME/extension mismatches."""
    normalized_filename = (filename or "").lower()
    normalized_content_type = (content_type or "").lower()
    if not normalized_filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="PDFファイルを指定してください。")
    if normalized_content_type and normalized_content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="PDFファイルを指定してください。")


def enforce_pdf_content_length(request: Request) -> None:
    """Reject clearly oversized multipart uploads before reading the body file."""
    value = request.headers.get("content-length")
    if value is None:
        return
    try:
        content_length = int(value)
    except ValueError:
        raise HTTPException(status_code=400, detail="Content-Length が不正です。")
    if content_length > MAX_PDF_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="PDFファイルが大きすぎます。20MB以下にしてください。")


async def read_pdf_upload_bytes(file, request: Request) -> bytes:
    """Read a PDF upload in bounded chunks and validate the magic header."""
    enforce_pdf_content_length(request)
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(UPLOAD_READ_CHUNK_BYTES)
        if not chunk:
            break
        total += len(chunk)
        if total > MAX_PDF_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="PDFファイルが大きすぎます。20MB以下にしてください。")
        chunks.append(chunk)
    pdf_bytes = b"".join(chunks)
    if not pdf_bytes:
        raise HTTPException(status_code=400, detail="PDFファイルが空です。")
    if not pdf_bytes.startswith(b"%PDF-"):
        raise HTTPException(status_code=400, detail="PDFファイルの形式が不正です。")
    return pdf_bytes
