from __future__ import annotations

import asyncio
import base64
import json
from dataclasses import asdict, dataclass, field
from typing import Any, Literal

import httpx

from app.config import settings
from app.utils.secure_logger import get_logger

logger = get_logger(__name__)

PdfOcrProvider = Literal["google_document_ai", "mistral_ocr", "unknown"]

GOOGLE_DOCUMENT_AI_PRICE_PER_PAGE_USD = 0.0015
MISTRAL_OCR_PRICE_PER_PAGE_USD = 0.002


@dataclass
class PdfOcrResult:
    text: str
    provider: PdfOcrProvider | str = "unknown"
    quality_score: float | None = None
    processed_pages: int | None = None
    estimated_cost_usd: float | None = None
    diagnostics: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


async def extract_text_from_pdf_with_ocr(
    pdf_bytes: bytes,
    filename: str,
    *,
    source_kind: Literal["upload", "schedule"],
    billing_plan: str,
    content_type: str | None,
    page_count: int | None,
    local_text: str,
    feature: str,
    route_hint: Literal["default", "high_accuracy"] = "default",
) -> PdfOcrResult:
    if route_hint == "high_accuracy":
        return await _extract_text_from_pdf_with_mistral(
            pdf_bytes,
            filename,
            page_count=page_count,
            feature=feature,
            source_kind=source_kind,
            billing_plan=billing_plan,
            content_type=content_type,
            local_text=local_text,
        )
    return await _extract_text_from_pdf_with_google_document_ai(
        pdf_bytes,
        filename,
        page_count=page_count,
        feature=feature,
        source_kind=source_kind,
        billing_plan=billing_plan,
        content_type=content_type,
        local_text=local_text,
    )


def normalize_pdf_ocr_result(value: PdfOcrResult | dict[str, Any] | None) -> PdfOcrResult:
    if isinstance(value, PdfOcrResult):
        return value
    if isinstance(value, dict):
        return PdfOcrResult(
            text=str(value.get("text") or ""),
            provider=str(value.get("provider") or "unknown"),
            quality_score=_to_optional_float(value.get("quality_score")),
            processed_pages=_to_optional_int(value.get("processed_pages")),
            estimated_cost_usd=_to_optional_float(value.get("estimated_cost_usd")),
            diagnostics=dict(value.get("diagnostics") or {}),
        )
    return PdfOcrResult(text="")


def _to_optional_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _to_optional_int(value: Any) -> int | None:
    try:
        if value is None:
            return None
        return int(value)
    except (TypeError, ValueError):
        return None


async def _extract_text_from_pdf_with_google_document_ai(
    pdf_bytes: bytes,
    filename: str,
    *,
    page_count: int | None,
    feature: str,
    source_kind: str,
    billing_plan: str,
    content_type: str | None,
    local_text: str,
) -> PdfOcrResult:
    if not pdf_bytes:
        return PdfOcrResult(text="")

    service_account_json = (settings.google_document_ai_service_account_json or "").strip()
    project_id = (settings.google_document_ai_project_id or "").strip()
    location = (settings.google_document_ai_location or "").strip()
    processor_id = (settings.google_document_ai_processor_id or "").strip()
    if not service_account_json or not project_id or not location or not processor_id:
        logger.warning("[pdf_ocr] Google Document AI is not configured")
        return PdfOcrResult(text="", provider="google_document_ai")

    access_token = await _get_google_document_ai_access_token(service_account_json)
    if not access_token:
        return PdfOcrResult(text="", provider="google_document_ai")

    url = (
        "https://documentai.googleapis.com/v1/projects/"
        f"{project_id}/locations/{location}/processors/{processor_id}:process"
    )
    payload = {
        "skipHumanReview": True,
        "rawDocument": {
            "mimeType": "application/pdf",
            "content": base64.b64encode(pdf_bytes).decode("ascii"),
            "displayName": filename or "document.pdf",
        },
    }
    timeout = float(settings.pdf_ocr_timeout_seconds)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                url,
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
        response.raise_for_status()
    except Exception as exc:
        logger.warning(f"[pdf_ocr] Google Document AI failed: {exc}")
        return PdfOcrResult(
            text="",
            provider="google_document_ai",
            estimated_cost_usd=_estimate_cost(page_count, GOOGLE_DOCUMENT_AI_PRICE_PER_PAGE_USD),
            diagnostics={"error": str(exc), "route_hint": "default"},
        )

    data = response.json()
    document = data.get("document") or {}
    pages = document.get("pages") or []
    quality_scores = [
        _to_optional_float((page.get("imageQualityScores") or {}).get("qualityScore"))
        for page in pages
    ]
    quality_scores = [score for score in quality_scores if score is not None]
    avg_quality = sum(quality_scores) / len(quality_scores) if quality_scores else None

    return PdfOcrResult(
        text=str(document.get("text") or ""),
        provider="google_document_ai",
        quality_score=avg_quality,
        processed_pages=len(pages) or page_count,
        estimated_cost_usd=_estimate_cost(len(pages) or page_count, GOOGLE_DOCUMENT_AI_PRICE_PER_PAGE_USD),
        diagnostics={
            "route_hint": "default",
            "page_count": len(pages) or page_count,
            "source_kind": source_kind,
            "billing_plan": billing_plan,
            "content_type": content_type,
            "local_text_chars": len(local_text or ""),
            "feature": feature,
        },
    )


async def _extract_text_from_pdf_with_mistral(
    pdf_bytes: bytes,
    filename: str,
    *,
    page_count: int | None,
    feature: str,
    source_kind: str,
    billing_plan: str,
    content_type: str | None,
    local_text: str,
) -> PdfOcrResult:
    if not pdf_bytes:
        return PdfOcrResult(text="")

    api_key = (settings.mistral_api_key or "").strip()
    if not api_key:
        logger.warning("[pdf_ocr] Mistral OCR is not configured")
        return PdfOcrResult(text="", provider="mistral_ocr")

    timeout = float(settings.pdf_ocr_timeout_seconds)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                "https://api.mistral.ai/v1/ocr",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "mistral-ocr-latest",
                    "document": {
                        "type": "document_url",
                        "document_url": (
                            "data:application/pdf;base64,"
                            + base64.b64encode(pdf_bytes).decode("ascii")
                        ),
                    },
                    "include_image_base64": False,
                },
            )
        response.raise_for_status()
    except Exception as exc:
        logger.warning(f"[pdf_ocr] Mistral OCR failed: {exc}")
        return PdfOcrResult(
            text="",
            provider="mistral_ocr",
            estimated_cost_usd=_estimate_cost(page_count, MISTRAL_OCR_PRICE_PER_PAGE_USD),
            diagnostics={"error": str(exc), "route_hint": "high_accuracy"},
        )

    data = response.json()
    pages = data.get("pages") or []
    text_parts: list[str] = []
    for page in pages:
        markdown = page.get("markdown")
        if isinstance(markdown, str) and markdown.strip():
            text_parts.append(markdown.strip())

    return PdfOcrResult(
        text="\n\n".join(text_parts).strip(),
        provider="mistral_ocr",
        processed_pages=len(pages) or page_count,
        estimated_cost_usd=_estimate_cost(len(pages) or page_count, MISTRAL_OCR_PRICE_PER_PAGE_USD),
        diagnostics={
            "route_hint": "high_accuracy",
            "page_count": len(pages) or page_count,
            "source_kind": source_kind,
            "billing_plan": billing_plan,
            "content_type": content_type,
            "local_text_chars": len(local_text or ""),
            "feature": feature,
            "filename": filename,
        },
    )


async def _get_google_document_ai_access_token(service_account_json: str) -> str:
    try:
        from google.auth.transport.requests import Request
        from google.oauth2 import service_account
    except Exception as exc:
        logger.warning(f"[pdf_ocr] google-auth is unavailable: {exc}")
        return ""

    try:
        service_account_info = json.loads(service_account_json)
        credentials = service_account.Credentials.from_service_account_info(
            service_account_info,
            scopes=["https://www.googleapis.com/auth/cloud-platform"],
        )
        await asyncio.to_thread(credentials.refresh, Request())
        return credentials.token or ""
    except Exception as exc:
        logger.warning(f"[pdf_ocr] Failed to refresh Google credentials: {exc}")
        return ""


def _estimate_cost(page_count: int | None, unit_price: float) -> float | None:
    if page_count is None:
        return None
    pages = max(int(page_count), 0)
    return round(pages * unit_price, 6)
