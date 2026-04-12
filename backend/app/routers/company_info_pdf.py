"""PDF ingestion helpers for company info router."""

from __future__ import annotations

from typing import Optional
import io
import json

from app.config import settings
from app.routers.company_info_models import EstimateCorporatePdfResponse
from app.utils.pdf_ocr import extract_text_from_pdf_with_ocr, normalize_pdf_ocr_result
from app.utils.secure_logger import get_logger

logger = get_logger(__name__)


def _get_company_info_override(name: str, fallback):
    try:
        from app.routers import company_info as company_info_router

        override = getattr(company_info_router, name, None)
        if override is not None and override is not fallback:
            return override
    except Exception:
        pass
    return fallback


def _extract_text_pages_from_pdf_locally(pdf_bytes: bytes) -> list[str]:
    """Best-effort embedded-text extraction from a PDF, preserving page boundaries."""
    try:
        from pypdf import PdfReader
    except Exception:
        return []

    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
    except Exception:
        return []

    pages: list[str] = []
    for page in reader.pages:
        try:
            text = page.extract_text() or ""
        except Exception:
            text = ""
        pages.append(text.strip())

    return pages


def _extract_text_from_pdf_locally(pdf_bytes: bytes) -> str:
    return "\n\n".join(text for text in _extract_text_pages_from_pdf_locally(pdf_bytes) if text).strip()


def _get_pdf_page_count(pdf_bytes: bytes) -> int | None:
    try:
        from pypdf import PdfReader
    except Exception:
        return None

    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        return len(reader.pages)
    except Exception:
        return None


def _normalize_rag_pdf_billing_plan(raw: str | None) -> str:
    v = (raw or "free").strip().lower()
    if v in ("standard", "pro"):
        return v
    return "free"


def _rag_pdf_max_ingest_pages(plan: str) -> int:
    if plan == "pro":
        return int(settings.rag_pdf_max_pages_pro)
    if plan == "standard":
        return int(settings.rag_pdf_max_pages_standard)
    return int(settings.rag_pdf_max_pages_free)


def _rag_pdf_max_google_ocr_pages(plan: str) -> int:
    if plan == "pro":
        return int(settings.rag_pdf_google_ocr_max_pages_pro)
    if plan == "standard":
        return int(settings.rag_pdf_google_ocr_max_pages_standard)
    return int(settings.rag_pdf_google_ocr_max_pages_free)


def _rag_pdf_max_mistral_ocr_pages(plan: str) -> int:
    if plan == "pro":
        return int(settings.rag_pdf_mistral_ocr_max_pages_pro)
    if plan == "standard":
        return int(settings.rag_pdf_mistral_ocr_max_pages_standard)
    return int(settings.rag_pdf_mistral_ocr_max_pages_free)


def _slice_pdf_bytes_to_first_n_pages(pdf_bytes: bytes, max_pages: int) -> tuple[bytes, bool]:
    if max_pages <= 0 or not pdf_bytes:
        return pdf_bytes, False
    try:
        from pypdf import PdfReader, PdfWriter

        reader = PdfReader(io.BytesIO(pdf_bytes))
        total = len(reader.pages)
        if total <= max_pages:
            return pdf_bytes, False
        writer = PdfWriter()
        for i in range(max_pages):
            writer.add_page(reader.pages[i])
        out = io.BytesIO()
        writer.write(out)
        return out.getvalue(), True
    except Exception:
        return pdf_bytes, False


def _slice_pdf_bytes_to_page_indexes(pdf_bytes: bytes, page_indexes: list[int]) -> bytes:
    if not pdf_bytes or not page_indexes:
        return b""

    try:
        from pypdf import PdfReader, PdfWriter

        reader = PdfReader(io.BytesIO(pdf_bytes))
        writer = PdfWriter()
        total_pages = len(reader.pages)
        for page_index in page_indexes:
            if 0 <= page_index < total_pages:
                writer.add_page(reader.pages[page_index])
        out = io.BytesIO()
        writer.write(out)
        return out.getvalue()
    except Exception:
        return b""


def _chars_per_page(text: str, page_count: int | None) -> float:
    pages = max(page_count or 1, 1)
    return len((text or "").strip()) / pages


def _is_garbled_text(text: str) -> bool:
    stripped = (text or "").strip()
    if not stripped:
        return False
    replacement_ratio = stripped.count("\ufffd") / max(len(stripped), 1)
    return replacement_ratio > 0.05


def _is_local_pdf_page_readable(text: str) -> bool:
    stripped = (text or "").strip()
    if not stripped:
        return False
    if _is_garbled_text(stripped):
        return False
    return len(stripped) >= int(settings.pdf_ocr_min_chars_per_page)


def _should_run_pdf_ocr(text: str, page_count: int | None) -> bool:
    stripped = (text or "").strip()
    if len(stripped) < int(settings.pdf_ocr_min_total_chars):
        return True
    return _chars_per_page(stripped, page_count) < float(settings.pdf_ocr_min_chars_per_page)


def _should_route_page_to_mistral(
    *,
    billing_plan: str,
    content_type: str | None,
    page_text: str,
) -> bool:
    if billing_plan not in {"standard", "pro"}:
        return False
    if content_type not in {"ir_materials", "midterm_plan"}:
        return False
    stripped = (page_text or "").strip()
    if stripped and not _is_garbled_text(stripped):
        return False
    return True


def _build_page_routing_summary(
    *,
    source_total_pages: int | None,
    processed_pages: int,
    planned_route: list[str],
    actual_route: list[str],
) -> dict[str, object]:
    return {
        "total_pages": source_total_pages or processed_pages,
        "ingest_pages": processed_pages,
        "local_pages": actual_route.count("local"),
        "google_ocr_pages": actual_route.count("google"),
        "mistral_ocr_pages": actual_route.count("mistral"),
        "truncated_pages": max((source_total_pages or processed_pages) - processed_pages, 0),
        "planned_route": planned_route,
        "actual_route": actual_route,
    }


def _build_pdf_processing_notice_ja(
    *,
    source_total_pages: int | None,
    processed_pages: int,
    page_routing_summary: dict[str, object],
) -> str | None:
    parts: list[str] = []
    truncated_pages = int(page_routing_summary.get("truncated_pages") or 0)
    if truncated_pages > 0 and source_total_pages is not None:
        parts.append(f"全{source_total_pages}ページのうち先頭{processed_pages}ページのみを取り込みました。")
    google_pages = int(page_routing_summary.get("google_ocr_pages") or 0)
    mistral_pages = int(page_routing_summary.get("mistral_ocr_pages") or 0)
    if google_pages > 0 or mistral_pages > 0:
        parts.append(
            f"ページごとに本文抽出経路を分岐し、Google OCR {google_pages}ページ・Mistral OCR {mistral_pages}ページを使いました。"
        )
    return " ".join(parts).strip() or None


def _plan_pdf_page_routes(
    *,
    page_texts: list[str],
    billing_plan: str,
    content_type: str | None,
) -> list[str]:
    planned: list[str] = []
    google_budget = _rag_pdf_max_google_ocr_pages(billing_plan)
    mistral_budget = _rag_pdf_max_mistral_ocr_pages(billing_plan)

    for page_text in page_texts:
        if _is_local_pdf_page_readable(page_text):
            planned.append("local")
            continue
        if (
            mistral_budget > 0
            and _should_route_page_to_mistral(
                billing_plan=billing_plan,
                content_type=content_type,
                page_text=page_text,
            )
        ):
            planned.append("mistral")
            mistral_budget -= 1
            continue
        if google_budget > 0:
            planned.append("google")
            google_budget -= 1
            continue
        planned.append("local")

    return planned


async def _ocr_selected_pdf_pages(
    *,
    pdf_bytes: bytes,
    filename: str,
    page_indexes: list[int],
    source_kind: str,
    billing_plan: str,
    content_type: str | None,
    feature: str,
    route_hint: str,
    local_text: str,
):
    if not page_indexes:
        return normalize_pdf_ocr_result(None)

    slice_pdf_bytes_to_page_indexes = _get_company_info_override(
        "_slice_pdf_bytes_to_page_indexes",
        _slice_pdf_bytes_to_page_indexes,
    )
    extract_text_with_ocr = _get_company_info_override(
        "extract_text_from_pdf_with_ocr",
        extract_text_from_pdf_with_ocr,
    )

    selected_pdf = slice_pdf_bytes_to_page_indexes(pdf_bytes, page_indexes)
    if not selected_pdf:
        return normalize_pdf_ocr_result(None)

    return normalize_pdf_ocr_result(
        await extract_text_with_ocr(
            selected_pdf,
            filename,
            source_kind=source_kind,
            billing_plan=billing_plan,
            content_type=content_type,
            page_count=len(page_indexes),
            local_text=local_text,
            feature=feature,
            route_hint=route_hint,  # type: ignore[arg-type]
        )
    )


async def _extract_text_from_pdf_with_page_routing(
    *,
    pdf_bytes: bytes,
    filename: str,
    billing_plan: str,
    content_type: str | None,
    source_kind: str,
    feature: str,
) -> dict[str, object]:
    get_pdf_page_count = _get_company_info_override("_get_pdf_page_count", _get_pdf_page_count)
    slice_pdf_bytes_to_first_n_pages = _get_company_info_override(
        "_slice_pdf_bytes_to_first_n_pages",
        _slice_pdf_bytes_to_first_n_pages,
    )
    extract_text_pages_from_pdf_locally = _get_company_info_override(
        "_extract_text_pages_from_pdf_locally",
        _extract_text_pages_from_pdf_locally,
    )

    source_total_pages = get_pdf_page_count(pdf_bytes)
    max_ingest = _rag_pdf_max_ingest_pages(billing_plan)
    working_pdf, ingest_truncated = slice_pdf_bytes_to_first_n_pages(pdf_bytes, max_ingest)
    page_texts = extract_text_pages_from_pdf_locally(working_pdf)
    processed_pages = len(page_texts) or get_pdf_page_count(working_pdf) or 1
    if not page_texts:
        page_texts = [""] * processed_pages

    planned_route = _plan_pdf_page_routes(
        page_texts=page_texts,
        billing_plan=billing_plan,
        content_type=content_type,
    )
    actual_route = list(planned_route)
    merged_page_texts = list(page_texts)

    google_indexes = [i for i, route in enumerate(planned_route) if route == "google"]
    mistral_indexes = [i for i, route in enumerate(planned_route) if route == "mistral"]

    est_cost_usd = 0.0
    ocr_ran = False
    ocr_provider: Optional[str] = None
    ocr_route: Optional[str] = None
    quality_score: Optional[float] = None
    fallback_count = 0

    if google_indexes:
        google_result = await _ocr_selected_pdf_pages(
            pdf_bytes=working_pdf,
            filename=filename,
            page_indexes=google_indexes,
            source_kind=source_kind,
            billing_plan=billing_plan,
            content_type=content_type,
            feature=feature,
            route_hint="default",
            local_text="\n\n".join(page_texts[i] for i in google_indexes if page_texts[i]).strip(),
        )
        ocr_ran = True
        fallback_count += 1
        ocr_provider = google_result.provider or ocr_provider
        ocr_route = "default"
        quality_score = google_result.quality_score
        est_cost_usd += float(google_result.estimated_cost_usd or 0.0)
        for offset, page_index in enumerate(google_indexes):
            page_text = google_result.page_texts[offset] if offset < len(google_result.page_texts) else ""
            if page_text.strip():
                merged_page_texts[page_index] = page_text.strip()
                actual_route[page_index] = "google"
            else:
                actual_route[page_index] = "local"

    if mistral_indexes:
        mistral_result = await _ocr_selected_pdf_pages(
            pdf_bytes=working_pdf,
            filename=filename,
            page_indexes=mistral_indexes,
            source_kind=source_kind,
            billing_plan=billing_plan,
            content_type=content_type,
            feature=feature,
            route_hint="high_accuracy",
            local_text="\n\n".join(page_texts[i] for i in mistral_indexes if page_texts[i]).strip(),
        )
        ocr_ran = True
        fallback_count += 1
        ocr_provider = mistral_result.provider or ocr_provider
        ocr_route = "high_accuracy"
        quality_score = mistral_result.quality_score or quality_score
        est_cost_usd += float(mistral_result.estimated_cost_usd or 0.0)
        for offset, page_index in enumerate(mistral_indexes):
            page_text = mistral_result.page_texts[offset] if offset < len(mistral_result.page_texts) else ""
            if page_text.strip():
                merged_page_texts[page_index] = page_text.strip()
                actual_route[page_index] = "mistral"
            else:
                actual_route[page_index] = "local"

    merged_text = "\n\n".join(text for text in merged_page_texts if text.strip()).strip()
    page_routing_summary = _build_page_routing_summary(
        source_total_pages=source_total_pages,
        processed_pages=processed_pages,
        planned_route=planned_route,
        actual_route=actual_route,
    )
    processing_notice_ja = _build_pdf_processing_notice_ja(
        source_total_pages=source_total_pages,
        processed_pages=processed_pages,
        page_routing_summary=page_routing_summary,
    )
    extraction_method = (
        "ocr_high_accuracy"
        if page_routing_summary["mistral_ocr_pages"]
        else "ocr"
        if page_routing_summary["google_ocr_pages"]
        else "pypdf"
    )

    return {
        "text": merged_text,
        "extraction_method": extraction_method,
        "source_total_pages": source_total_pages,
        "processed_pages": processed_pages,
        "ingest_truncated": ingest_truncated,
        "ocr_truncated": False,
        "page_routing_summary": page_routing_summary,
        "processing_notice_ja": processing_notice_ja,
        "ocr_ran": ocr_ran,
        "ocr_est_usd": est_cost_usd or None,
        "ocr_provider": ocr_provider,
        "ocr_route": ocr_route,
        "ocr_quality_score": quality_score,
        "ocr_fallback_count": fallback_count,
    }


def _pdf_ingest_telemetry_line(
    *,
    ocr_ran: bool,
    source_total_pages: int | None,
    processed_pages: int | None,
    ingest_truncated: bool,
    ocr_truncated: bool,
    est_cost_usd: float | None,
    elapsed_sec: float,
    success: bool,
    ocr_provider: str | None = None,
    ocr_route: str | None = None,
    quality_score: float | None = None,
    fallback_count: int | None = None,
    source_kind: str = "upload",
) -> None:
    if not settings.company_pdf_ingest_telemetry_log:
        return
    payload = {
        "event": "pdf_ingest_telemetry",
        "ocr_ran": ocr_ran,
        "source_total_pages": source_total_pages,
        "processed_pages": processed_pages,
        "ingest_truncated": ingest_truncated,
        "ocr_truncated": ocr_truncated,
        "est_ocr_cost_usd": est_cost_usd,
        "elapsed_sec": round(elapsed_sec, 3),
        "success": success,
        "ocr_provider": ocr_provider,
        "ocr_route": ocr_route,
        "quality_score": quality_score,
        "fallback_count": fallback_count,
        "source_kind": source_kind,
    }
    logger.info("[pdf_ingest_telemetry] " + json.dumps(payload, ensure_ascii=False))


def _build_pdf_estimate_response(
    *,
    company_id: str,
    source_url: str,
    source_total_pages: int | None,
    processed_pages: int,
    page_routing_summary: dict[str, object],
    processing_notice_ja: str | None,
    remaining_free_pdf_pages: int,
) -> EstimateCorporatePdfResponse:
    estimated_free_pdf_pages = min(max(remaining_free_pdf_pages, 0), processed_pages)
    overflow_pages = max(0, processed_pages - estimated_free_pdf_pages)
    estimated_credits = 0 if overflow_pages <= 0 else (2 if overflow_pages <= 20 else 6 if overflow_pages <= 60 else 12)
    estimated_mistral_ocr_pages = int(page_routing_summary.get("planned_route", []).count("mistral"))
    return EstimateCorporatePdfResponse(
        success=True,
        company_id=company_id,
        source_url=source_url,
        page_count=processed_pages,
        source_total_pages=source_total_pages,
        estimated_free_pdf_pages=estimated_free_pdf_pages,
        estimated_credits=estimated_credits,
        estimated_google_ocr_pages=int(page_routing_summary.get("planned_route", []).count("google")),
        estimated_mistral_ocr_pages=estimated_mistral_ocr_pages,
        will_truncate=bool(page_routing_summary.get("truncated_pages")),
        requires_confirmation=estimated_credits > 0
        or estimated_mistral_ocr_pages > 0
        or bool(page_routing_summary.get("truncated_pages")),
        processing_notice_ja=processing_notice_ja,
        page_routing_summary=page_routing_summary,
        errors=[],
    )
