import io

import pytest
from fastapi import UploadFile
from starlette.requests import Request

from app.routers import company_info


def _minimal_request() -> Request:
    return Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/rag/upload-pdf",
            "headers": [],
            "query_string": b"",
            "client": ("testclient", 0),
            "server": ("test", 80),
            "scheme": "http",
        }
    )


@pytest.mark.asyncio
async def test_upload_pdf_uses_ocr_when_text_too_short(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(company_info, "resolve_embedding_backend", lambda: object())
    monkeypatch.setattr(
        company_info,
        "_extract_text_pages_from_pdf_locally",
        lambda _pdf_bytes: ["short text"] * 5,
    )

    async def _fake_ocr(*_args, **_kwargs):
        return {
            "text": "これは十分な長さのOCR抽出テキストです。" * 20,
            "provider": "google_document_ai",
            "quality_score": 0.85,
            "processed_pages": 5,
            "estimated_cost_usd": 0.01,
            "page_texts": ["これは十分な長さのOCR抽出テキストです。" * 4] * 5,
            "diagnostics": {},
        }

    async def _fake_store_full_text_content(**_kwargs):
        return {
            "success": True,
            "dominant_content_type": "ir_materials",
            "secondary_content_types": ["csr_sustainability"],
        }

    monkeypatch.setattr(company_info, "extract_text_from_pdf_with_ocr", _fake_ocr)
    monkeypatch.setattr(company_info, "store_full_text_content", _fake_store_full_text_content)
    monkeypatch.setattr(company_info, "_get_pdf_page_count", lambda _b: 5)
    monkeypatch.setattr(company_info, "_slice_pdf_bytes_to_first_n_pages", lambda b, _n: (b, False))
    monkeypatch.setattr(company_info, "_slice_pdf_bytes_to_page_indexes", lambda b, _indexes: b)

    upload = UploadFile(filename="company.pdf", file=io.BytesIO(b"%PDF-1.4 test"))

    result = await company_info.upload_corporate_pdf(
        _minimal_request(),
        company_id="company-1",
        company_name="テスト株式会社",
        source_url="upload://corporate-pdf/company-1/test",
        content_type=None,
        content_channel=None,
        billing_plan="free",
        file=upload,
    )

    assert result.success is True
    assert result.extraction_method == "ocr"
    assert result.content_type == "ir_materials"
    assert result.secondary_content_types == ["csr_sustainability"]
    assert result.chunks_stored > 0
    assert result.page_routing_summary is not None
    assert result.page_routing_summary["google_ocr_pages"] == 5


@pytest.mark.asyncio
async def test_upload_pdf_uses_google_ocr_route_when_text_too_short(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(company_info, "resolve_embedding_backend", lambda: object())
    monkeypatch.setattr(
        company_info,
        "_extract_text_pages_from_pdf_locally",
        lambda _pdf_bytes: ["short text"] * 5,
    )

    async def _fake_pdf_ocr(*_args, **_kwargs):
        return {
            "text": "Google OCR result " * 30,
            "provider": "google_document_ai",
            "quality_score": 0.9,
            "processed_pages": 5,
            "estimated_cost_usd": 0.01,
            "page_texts": ["Google OCR result " * 6] * 5,
            "diagnostics": {},
        }

    async def _fake_store_full_text_content(**_kwargs):
        return {
            "success": True,
            "dominant_content_type": "corporate_site",
            "secondary_content_types": [],
        }

    monkeypatch.setattr(company_info, "extract_text_from_pdf_with_ocr", _fake_pdf_ocr)
    monkeypatch.setattr(company_info, "store_full_text_content", _fake_store_full_text_content)
    monkeypatch.setattr(company_info, "_get_pdf_page_count", lambda _b: 5)
    monkeypatch.setattr(company_info, "_slice_pdf_bytes_to_first_n_pages", lambda b, _n: (b, False))
    monkeypatch.setattr(company_info, "_slice_pdf_bytes_to_page_indexes", lambda b, _indexes: b)

    upload = UploadFile(filename="company.pdf", file=io.BytesIO(b"%PDF-1.4 test"))

    result = await company_info.upload_corporate_pdf(
        _minimal_request(),
        company_id="company-1",
        company_name="テスト株式会社",
        source_url="upload://corporate-pdf/company-1/test",
        content_type="corporate_site",
        content_channel=None,
        billing_plan="free",
        file=upload,
    )

    assert result.success is True
    assert result.extraction_method == "ocr"


@pytest.mark.asyncio
async def test_upload_pdf_uses_high_accuracy_ocr_for_standard_ir_materials(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(company_info, "resolve_embedding_backend", lambda: object())
    monkeypatch.setattr(
        company_info,
        "_extract_text_pages_from_pdf_locally",
        lambda _pdf_bytes: [""] * 12,
    )
    monkeypatch.setattr(company_info, "_get_pdf_page_count", lambda _b: 12)
    monkeypatch.setattr(company_info, "_slice_pdf_bytes_to_first_n_pages", lambda b, _n: (b, False))
    monkeypatch.setattr(company_info, "_slice_pdf_bytes_to_page_indexes", lambda b, _indexes: b)

    calls: list[str] = []

    async def _fake_pdf_ocr(*_args, **kwargs):
        route_hint = kwargs.get("route_hint", "default")
        calls.append(route_hint)
        if route_hint == "high_accuracy":
            return {
                "text": "Mistral OCR result " * 40,
                "provider": "mistral_ocr",
                "quality_score": 0.92,
                "processed_pages": 12,
                "estimated_cost_usd": 0.03,
                "page_texts": ["Mistral OCR result " * 10] * 10,
                "diagnostics": {},
            }
        return {
            "text": "weak google result",
            "provider": "google_document_ai",
            "quality_score": 0.4,
            "processed_pages": 12,
            "estimated_cost_usd": 0.02,
            "page_texts": [""] * 2,
            "diagnostics": {},
        }

    async def _fake_store_full_text_content(**_kwargs):
        return {
            "success": True,
            "dominant_content_type": "ir_materials",
            "secondary_content_types": [],
        }

    monkeypatch.setattr(company_info, "extract_text_from_pdf_with_ocr", _fake_pdf_ocr)
    monkeypatch.setattr(company_info, "store_full_text_content", _fake_store_full_text_content)

    upload = UploadFile(filename="ir.pdf", file=io.BytesIO(b"%PDF-1.4 test"))

    result = await company_info.upload_corporate_pdf(
        _minimal_request(),
        company_id="company-1",
        company_name="テスト株式会社",
        source_url="upload://corporate-pdf/company-1/test",
        content_type="ir_materials",
        content_channel=None,
        billing_plan="standard",
        file=upload,
    )

    assert result.success is True
    assert result.extraction_method == "ocr_high_accuracy"
    assert calls == ["default", "high_accuracy"]
    assert result.page_routing_summary is not None
    assert result.page_routing_summary["mistral_ocr_pages"] == 10


@pytest.mark.asyncio
async def test_upload_pdf_keeps_readable_pages_local_and_ocrs_only_hard_pages(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(company_info, "resolve_embedding_backend", lambda: object())
    monkeypatch.setattr(
        company_info,
        "_extract_text_pages_from_pdf_locally",
        lambda _pdf_bytes: [
            "local page text " * 20,
            "",
            "second local page " * 20,
            "",
        ],
    )
    monkeypatch.setattr(company_info, "_get_pdf_page_count", lambda _b: 4)
    monkeypatch.setattr(company_info, "_slice_pdf_bytes_to_first_n_pages", lambda b, _n: (b, False))
    monkeypatch.setattr(company_info, "_slice_pdf_bytes_to_page_indexes", lambda b, _indexes: b)

    async def _fake_pdf_ocr(*_args, **_kwargs):
        return {
            "text": "ocr page 2\n\nocr page 4",
            "provider": "google_document_ai",
            "quality_score": 0.9,
            "processed_pages": 2,
            "estimated_cost_usd": 0.01,
            "page_texts": ["ocr page 2", "ocr page 4"],
            "diagnostics": {},
        }

    async def _fake_store_full_text_content(**_kwargs):
        return {
            "success": True,
            "dominant_content_type": "corporate_site",
            "secondary_content_types": [],
        }

    monkeypatch.setattr(company_info, "extract_text_from_pdf_with_ocr", _fake_pdf_ocr)
    monkeypatch.setattr(company_info, "store_full_text_content", _fake_store_full_text_content)

    upload = UploadFile(filename="mix.pdf", file=io.BytesIO(b"%PDF-1.4 test"))

    result = await company_info.upload_corporate_pdf(
        _minimal_request(),
        company_id="company-1",
        company_name="テスト株式会社",
        source_url="upload://corporate-pdf/company-1/test",
        content_type="corporate_site",
        content_channel=None,
        billing_plan="free",
        file=upload,
    )

    assert result.success is True
    assert result.extraction_method == "ocr"
    assert result.page_routing_summary is not None
    assert result.page_routing_summary["local_pages"] == 2
    assert result.page_routing_summary["google_ocr_pages"] == 2
