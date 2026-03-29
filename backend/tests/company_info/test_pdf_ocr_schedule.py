import pytest

from app.routers import company_info


@pytest.mark.asyncio
async def test_schedule_pdf_uses_shared_pdf_ocr_route(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(company_info, "_extract_text_from_pdf_locally", lambda _pdf_bytes: "short")

    calls: list[dict[str, object]] = []

    async def _fake_pdf_ocr(*_args, **kwargs):
        calls.append(kwargs)
        return {
            "text": "schedule ocr text " * 20,
            "provider": "google_document_ai",
            "quality_score": 0.88,
            "processed_pages": 2,
            "estimated_cost_usd": 0.01,
            "diagnostics": {},
        }

    monkeypatch.setattr(company_info, "extract_text_from_pdf_with_ocr", _fake_pdf_ocr)

    text, is_pdf = await company_info._extract_schedule_text_from_bytes(
        "https://example.com/schedule.pdf",
        b"%PDF-1.4 test",
    )

    assert is_pdf is True
    assert "schedule ocr text" in text
    assert len(calls) == 1
    assert calls[0]["source_kind"] == "schedule"
    assert calls[0]["billing_plan"] == "free"
