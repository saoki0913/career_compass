import io

import pytest
from fastapi import HTTPException, UploadFile
from starlette.requests import Request

from app.routers import company_info
from app.security.upload_limits import MAX_PDF_UPLOAD_BYTES
from app.security.career_principal import CareerPrincipal


def _minimal_request(headers: list[tuple[bytes, bytes]] | None = None) -> Request:
    return Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/rag/upload-pdf",
            "headers": headers or [],
            "query_string": b"",
            "client": ("testclient", 0),
            "server": ("test", 80),
            "scheme": "http",
        }
    )


def _company_principal(company_id: str = "company-1") -> CareerPrincipal:
    return CareerPrincipal(
        scope="company",
        actor_kind="user",
        actor_id="user-1",
        plan="standard",
        company_id=company_id,
        jti="test-jti",
        tenant_key="a" * 32,
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
        principal=_company_principal(),
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
        principal=_company_principal(),
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
        principal=_company_principal(),
    )

    assert result.success is True
    assert result.extraction_method == "ocr_high_accuracy"
    assert calls == ["high_accuracy"]
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
        principal=_company_principal(),
    )

    assert result.success is True
    assert result.extraction_method == "ocr"
    assert result.page_routing_summary is not None
    assert result.page_routing_summary["local_pages"] == 2
    assert result.page_routing_summary["google_ocr_pages"] == 2


class _ReadGuardUpload:
    filename = "company.pdf"
    content_type = "application/pdf"

    def __init__(self, payload: bytes) -> None:
        self._file = io.BytesIO(payload)

    async def read(self, size: int | None = None) -> bytes:
        if size is None:
            raise AssertionError("upload route must not call unbounded read()")
        return self._file.read(size)


@pytest.mark.asyncio
async def test_upload_pdf_reads_with_explicit_cap(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: dict[str, bytes] = {}

    async def _fake_upload_pdf_impl(**kwargs):
        seen["pdf_bytes"] = kwargs["pdf_bytes"]
        return company_info.UploadCorporatePdfResponse(
            success=True,
            company_id=kwargs["company_id"],
            source_url=kwargs["source_url"],
            chunks_stored=1,
            extracted_chars=120,
            extraction_method="local",
            errors=[],
        )

    monkeypatch.setattr(company_info, "_upload_pdf_impl", _fake_upload_pdf_impl)

    await company_info.upload_corporate_pdf(
        _minimal_request(headers=[(b"content-length", b"1024")]),
        company_id="company-1",
        company_name="テスト株式会社",
        source_url="upload://corporate-pdf/company-1/test",
        content_type=None,
        content_channel=None,
        billing_plan="free",
        file=_ReadGuardUpload(b"%PDF-1.4 test"),
        principal=_company_principal(),
    )

    assert seen["pdf_bytes"].startswith(b"%PDF-")


@pytest.mark.asyncio
async def test_upload_pdf_rejects_oversized_content_length_before_read() -> None:
    with pytest.raises(HTTPException) as exc_info:
        await company_info.upload_corporate_pdf(
            _minimal_request(headers=[(b"content-length", str(MAX_PDF_UPLOAD_BYTES + 1).encode())]),
            company_id="company-1",
            company_name="テスト株式会社",
            source_url="upload://corporate-pdf/company-1/test",
            content_type=None,
            content_channel=None,
            billing_plan="free",
            file=_ReadGuardUpload(b"%PDF-1.4 test"),
            principal=_company_principal(),
        )

    assert exc_info.value.status_code == 413


@pytest.mark.asyncio
async def test_upload_pdf_rejects_invalid_pdf_magic() -> None:
    with pytest.raises(HTTPException) as exc_info:
        await company_info.upload_corporate_pdf(
            _minimal_request(headers=[(b"content-length", b"128")]),
            company_id="company-1",
            company_name="テスト株式会社",
            source_url="upload://corporate-pdf/company-1/test",
            content_type=None,
            content_channel=None,
            billing_plan="free",
            file=_ReadGuardUpload(b"not a pdf"),
            principal=_company_principal(),
        )

    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_private_pdf_requires_explicit_consent_before_processing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _should_not_run(**_kwargs):
        raise AssertionError("private material reached ingest without consent")

    monkeypatch.setattr(company_info, "_upload_pdf_impl", _should_not_run)

    with pytest.raises(HTTPException) as exc_info:
        await company_info.upload_corporate_pdf(
            _minimal_request(headers=[(b"content-length", b"128")]),
            company_id="company-1",
            company_name="テスト株式会社",
            source_url="upload://private/company-1/test",
            content_type=None,
            content_channel=None,
            billing_plan="free",
            source_kind="private_user_material",
            private_material_consent=False,
            consent_reference=None,
            file=_ReadGuardUpload(b"%PDF-1.4 test"),
            principal=_company_principal(),
        )

    assert exc_info.value.status_code == 400
