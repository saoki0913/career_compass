import io

import pytest
from fastapi import UploadFile

from app.routers import company_info


@pytest.mark.asyncio
async def test_upload_pdf_uses_ocr_when_text_too_short(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(company_info, "resolve_embedding_backend", lambda: object())
    monkeypatch.setattr(
        company_info,
        "_extract_text_from_pdf_locally",
        lambda _pdf_bytes: "short text",
    )

    async def _fake_ocr(*_args, **_kwargs):
        return "これは十分な長さのOCR抽出テキストです。" * 20, {
            "input_tokens": 100,
            "output_tokens": 50,
            "reasoning_tokens": 0,
            "cached_input_tokens": 0,
        }, "gpt-5.4-mini"

    async def _fake_store_full_text_content(**_kwargs):
        return {
            "success": True,
            "dominant_content_type": "ir_materials",
            "secondary_content_types": ["csr_sustainability"],
        }

    monkeypatch.setattr(company_info, "extract_text_from_pdf_with_openai", _fake_ocr)
    monkeypatch.setattr(company_info, "store_full_text_content", _fake_store_full_text_content)
    monkeypatch.setattr(company_info, "_get_pdf_page_count", lambda _b: 5)
    monkeypatch.setattr(company_info, "_slice_pdf_bytes_to_first_n_pages", lambda b, _n: (b, False))

    upload = UploadFile(filename="company.pdf", file=io.BytesIO(b"%PDF-1.4 test"))

    result = await company_info.upload_corporate_pdf(
        company_id="company-1",
        company_name="テスト株式会社",
        source_url="upload://corporate-pdf/company-1/test",
        content_type=None,
        content_channel=None,
        billing_plan="free",
        file=upload,
    )

    assert result.success is True
    assert result.extraction_method == "openai_pdf_ocr"
    assert result.content_type == "ir_materials"
    assert result.secondary_content_types == ["csr_sustainability"]
    assert result.chunks_stored > 0
