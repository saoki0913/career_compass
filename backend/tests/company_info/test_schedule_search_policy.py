from types import SimpleNamespace

import pytest

from app.routers import company_info
from app.routers.company_info import (
    FetchRequest,
    _build_recruit_queries,
    _build_schedule_source_metadata,
    _extract_schedule_follow_links,
    _fetch_schedule_response,
    _normalize_recruitment_source_type,
    _recruitment_hybrid_score_to_confidence,
    _recruitment_score_to_confidence,
)
from app.utils.company_names import classify_company_domain_relation
from app.utils.web_search import is_trusted_schedule_job_site


def test_trusted_schedule_job_sites_allow_whitelist_domains():
    assert is_trusted_schedule_job_site("https://job.mynavi.jp/27/pc/search/corp123/outline.html")
    assert is_trusted_schedule_job_site("https://www.onecareer.jp/companies/12345")
    assert is_trusted_schedule_job_site("https://job.rikunabi.com/2027/company/r123456789/")


def test_trusted_schedule_job_sites_reject_non_whitelist_domains():
    assert not is_trusted_schedule_job_site("https://unistyle.jp/companies/12345")
    assert not is_trusted_schedule_job_site("https://www.openwork.jp/company.php?m_id=a0C1000000")


def test_build_recruit_queries_prioritize_schedule_terms_for_main_selection():
    queries = _build_recruit_queries(
        company_name="三井物産",
        industry=None,
        custom_query=None,
        graduation_year=2027,
        selection_type="main_selection",
    )

    assert any("選考スケジュール" in query for query in queries)
    assert any("募集要項" in query for query in queries)
    assert any("エントリー 締切" in query for query in queries)


def test_related_company_candidates_are_low_confidence_only():
    assert _recruitment_score_to_confidence(12, "parent", True) == "low"
    assert _recruitment_score_to_confidence(12, "subsidiary", True) == "low"
    assert _recruitment_hybrid_score_to_confidence(0.95, "parent", True) == "low"
    assert _recruitment_hybrid_score_to_confidence(0.95, "subsidiary", True) == "low"


def test_trusted_job_site_confidence_is_capped_at_medium():
    assert _recruitment_score_to_confidence(12, "job_site", True) == "medium"
    assert _recruitment_hybrid_score_to_confidence(0.95, "job_site", True) == "medium"


def test_related_company_relation_cannot_be_promoted_back_to_official_for_recruitment():
    relation = classify_company_domain_relation(
        "https://career.mitsui.com/recruit/",
        "三井物産スチール",
        "new_grad_recruitment",
    )
    assert _normalize_recruitment_source_type(
        "https://career.mitsui.com/recruit/",
        "official",
        relation,
    ) == "parent"


def test_schedule_source_metadata_marks_parent_company_as_non_official():
    metadata = _build_schedule_source_metadata(
        "https://career.mitsui.com/recruit/",
        "三井物産スチール",
        "三井物産 27卒 本選考 エントリー締切 2026年4月30日",
        2027,
    )

    assert metadata["source_type"] == "parent"
    assert metadata["relation_company_name"] == "三井物産"
    assert metadata["year_matched"] is True
    assert metadata["used_graduation_year"] == 2027


def test_schedule_source_metadata_marks_subsidiary_company_as_non_official():
    metadata = _build_schedule_source_metadata(
        "https://www.mitsui-steel.com/recruit/",
        "三井物産",
        "三井物産スチール 27卒 募集要項 2026年3月締切",
        2027,
    )

    assert metadata["source_type"] == "subsidiary"
    assert metadata["relation_company_name"] == "三井物産スチール"
    assert metadata["year_matched"] is True


def test_schedule_follow_links_keep_same_relation_only():
    html = """
    <html><body>
      <a href="/recruit/guideline.html">募集要項</a>
      <a href="https://career.mitsui.com/recruit/">親会社採用</a>
      <a href="https://example.com/news">外部ニュース</a>
    </body></html>
    """.encode("utf-8")

    follow_links = _extract_schedule_follow_links(
        html,
        "https://www.mitsui-steel.com/recruit/",
        "三井物産スチール",
    )

    assert follow_links == ["https://www.mitsui-steel.com/recruit/guideline.html"]


@pytest.mark.asyncio
async def test_fetch_schedule_response_uses_follow_up_page_when_primary_has_no_deadlines(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    primary_url = "https://www.mitsui-steel.com/recruit/"
    follow_url = "https://www.mitsui-steel.com/recruit/guideline.html"

    async def _fake_fetch_page_content(url: str, timeout: float = 30.0) -> bytes:
        if url == primary_url:
            return (
                "<html><body><p>募集案内</p>"
                "<a href=\"/recruit/guideline.html\">募集要項</a></body></html>"
            ).encode("utf-8")
        if url == follow_url:
            return (
                "<html><body><p>27卒 本選考 エントリー締切 2026年4月30日。"
                "応募方法はマイページからエントリーし、詳細な提出物や選考フローもこのページに記載します。"
                "応募前に必ず募集要項を確認してください。</p></body></html>"
            ).encode("utf-8")
        raise AssertionError(f"unexpected url: {url}")

    async def _fake_llm(**kwargs):
        user_message = kwargs.get("user_message", "")
        if "2026年4月30日" in user_message:
            return SimpleNamespace(
                success=True,
                data={
                    "deadlines": [
                        {
                            "type": "es_submission",
                            "title": "本エントリー締切",
                            "due_date": "2026-04-30",
                            "source_url": follow_url,
                            "confidence": "high",
                        }
                    ],
                    "required_documents": [],
                    "application_method": None,
                    "selection_process": None,
                },
            )
        return SimpleNamespace(
            success=True,
            data={
                "deadlines": [],
                "required_documents": [],
                "application_method": None,
                "selection_process": None,
            },
        )

    monkeypatch.setattr(company_info, "fetch_page_content", _fake_fetch_page_content)
    monkeypatch.setattr(company_info, "call_llm_with_error", _fake_llm)

    response = await _fetch_schedule_response(
        FetchRequest(
            url=primary_url,
            company_name="三井物産スチール",
            graduation_year=2027,
            selection_type="main_selection",
        ),
        feature="selection_schedule",
    )

    assert response.success is True
    assert response.data is not None
    assert response.data.deadlines[0].source_url == follow_url
    assert response.data.deadlines[0].confidence == "high"


@pytest.mark.asyncio
async def test_fetch_schedule_response_uses_pdf_follow_up_when_needed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    primary_url = "https://www.mitsui-steel.com/recruit/"
    pdf_url = "https://www.mitsui-steel.com/recruit/guideline.pdf"
    pdf_text = (
        "27卒 本選考 エントリー締切 2026年5月10日。"
        "応募方法はマイページからエントリーし、提出物はエントリーシートです。"
        "この募集要項PDFには選考フローと注意事項がまとまっています。"
    )

    async def _fake_fetch_page_content(url: str, timeout: float = 30.0) -> bytes:
        if url == primary_url:
            return "<html><body><a href=\"/recruit/guideline.pdf\">募集要項PDF</a></body></html>".encode("utf-8")
        if url == pdf_url:
            return b"%PDF-1.4 fake pdf"
        raise AssertionError(f"unexpected url: {url}")

    async def _fake_llm(**kwargs):
        user_message = kwargs.get("user_message", "")
        if "2026年5月10日" in user_message:
            return SimpleNamespace(
                success=True,
                data={
                    "deadlines": [
                        {
                            "type": "es_submission",
                            "title": "PDF掲載締切",
                            "due_date": "2026-05-10",
                            "source_url": pdf_url,
                            "confidence": "high",
                        }
                    ],
                    "required_documents": [],
                    "application_method": None,
                    "selection_process": None,
                },
            )
        return SimpleNamespace(
            success=True,
            data={
                "deadlines": [],
                "required_documents": [],
                "application_method": None,
                "selection_process": None,
            },
        )

    monkeypatch.setattr(company_info, "fetch_page_content", _fake_fetch_page_content)
    monkeypatch.setattr(company_info, "_extract_text_from_pdf_locally", lambda _pdf: pdf_text)
    monkeypatch.setattr(company_info, "call_llm_with_error", _fake_llm)

    response = await _fetch_schedule_response(
        FetchRequest(
            url=primary_url,
            company_name="三井物産スチール",
            graduation_year=2027,
            selection_type="main_selection",
        ),
        feature="selection_schedule",
    )

    assert response.success is True
    assert response.data is not None
    assert response.data.deadlines[0].source_url == pdf_url
    assert response.data.deadlines[0].due_date == "2026-05-10"
