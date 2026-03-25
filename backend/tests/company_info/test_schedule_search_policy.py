import pytest

from app.routers import company_info
from app.routers.company_info import (
    FetchRequest,
    SCHEDULE_LLM_FALLBACK_MAX_CHARS,
    _build_recruit_queries,
    _build_schedule_source_metadata,
    _compress_schedule_page_text_for_llm,
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


def test_compress_schedule_page_text_keeps_windows_around_keyword_lines():
    filler = "\n".join([f"ナビゲーション項目{i}" for i in range(30)])
    core = "27卒 本選考のエントリー締切は2026年4月30日です。提出書類はエントリーシートのみ。"
    text = f"{filler}\n{core}\n{filler}"
    out = _compress_schedule_page_text_for_llm(text)
    assert "2026年4月30日" in out
    assert len(out) < len(text)


def test_compress_schedule_page_text_falls_back_to_prefix_when_no_keywords():
    text = "無関係な本文 " * 800
    out = _compress_schedule_page_text_for_llm(text)
    assert out == text.strip()[:SCHEDULE_LLM_FALLBACK_MAX_CHARS]


def test_compress_schedule_extreme_page_uses_tail_not_prefix_when_no_keyword_hits():
    from app.routers.company_info import (
        SCHEDULE_EXTREME_PAGE_CHARS,
        SCHEDULE_LLM_TEXT_MAX_CHARS_EXTREME,
    )

    # 極端に長いがキーワードも日付も含まない本文 → 末尾スライスへ（先頭フォールバックしない）
    body = "\n".join([f"NOISE-{i}-xxxxxxxxxxxxxxxx" for i in range(5000)])
    assert len(body) > SCHEDULE_EXTREME_PAGE_CHARS
    out = _compress_schedule_page_text_for_llm(body)
    assert len(out) <= SCHEDULE_LLM_TEXT_MAX_CHARS_EXTREME
    assert "NOISE-0-" not in out
    # 末尾 400 行から切り出すが、max_chars で途中で切れるため最終行 ID より高番号帯を確認
    assert "NOISE-4700" in out or "NOISE-4800" in out


def test_compress_schedule_extreme_page_keeps_date_line_without_schedule_keyword():
    from app.routers.company_info import SCHEDULE_EXTREME_PAGE_CHARS

    filler = "\n".join([f"ナビゲーション行{i}-" + "x" * 20 for i in range(6000)])
    assert len(filler) > SCHEDULE_EXTREME_PAGE_CHARS
    core = "2026年4月30日までにマイページからエントリーしてください。"
    text = f"{filler}\n{core}"
    out = _compress_schedule_page_text_for_llm(text)
    assert "2026年4月30日" in out
    assert len(out) < len(text)


def test_compress_schedule_page_text_does_not_pull_distant_lines_into_window():
    filler = "\n".join([f"ナビ行{i}" for i in range(20)])
    text = (
        "会社の歴史と沿革を長く説明しています。\n"
        f"{filler}\n"
        "選考スケジュールは書類選考の後に一次面接があります。"
    )
    out = _compress_schedule_page_text_for_llm(text)
    assert "一次面接" in out
    assert "歴史と沿革" not in out


def test_schedule_follow_links_exclude_mypage_even_if_anchor_looks_relevant():
    html = """
    <html><body>
      <a href="/mypage/login">マイページはこちら</a>
      <a href="/recruit/guideline.html">募集要項</a>
    </body></html>
    """.encode("utf-8")

    follow_links = _extract_schedule_follow_links(
        html,
        "https://www.mitsui-steel.com/recruit/",
        "三井物産スチール",
    )

    assert "https://www.mitsui-steel.com/mypage/login" not in follow_links
    assert follow_links == ["https://www.mitsui-steel.com/recruit/guideline.html"]


@pytest.mark.asyncio
async def test_fetch_schedule_response_does_not_fetch_follow_up_html(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """選考スケジュールはユーザー指定の 1 URL のみ。一次ページが短くてもリンク先は取得しない。"""
    primary_url = "https://www.mitsui-steel.com/recruit/"
    follow_url = "https://www.mitsui-steel.com/recruit/guideline.html"

    async def _fake_fetch_page_content(url: str, timeout: float = 30.0) -> bytes:
        if url == primary_url:
            return (
                "<html><body><p>募集案内</p>"
                "<a href=\"/recruit/guideline.html\">募集要項</a></body></html>"
            ).encode("utf-8")
        if url == follow_url:
            raise AssertionError("follow-up URL must not be fetched for schedule")
        raise AssertionError(f"unexpected url: {url}")

    monkeypatch.setattr(company_info, "fetch_page_content", _fake_fetch_page_content)

    response = await _fetch_schedule_response(
        FetchRequest(
            url=primary_url,
            company_name="三井物産スチール",
            graduation_year=2027,
            selection_type="main_selection",
        ),
        feature="selection_schedule",
    )

    assert response.success is False
    assert response.error and "JavaScript" in response.error


@pytest.mark.asyncio
async def test_fetch_schedule_response_does_not_fetch_linked_pdf(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """選考は 1 URL のみ。HTML 内の PDF リンク先は取得しない。"""
    primary_url = "https://www.mitsui-steel.com/recruit/"
    pdf_url = "https://www.mitsui-steel.com/recruit/guideline.pdf"

    async def _fake_fetch_page_content(url: str, timeout: float = 30.0) -> bytes:
        if url == primary_url:
            return "<html><body><a href=\"/recruit/guideline.pdf\">募集要項PDF</a></body></html>".encode(
                "utf-8"
            )
        if url == pdf_url:
            raise AssertionError("PDF URL must not be fetched for schedule")
        raise AssertionError(f"unexpected url: {url}")

    monkeypatch.setattr(company_info, "fetch_page_content", _fake_fetch_page_content)

    response = await _fetch_schedule_response(
        FetchRequest(
            url=primary_url,
            company_name="三井物産スチール",
            graduation_year=2027,
            selection_type="main_selection",
        ),
        feature="selection_schedule",
    )

    assert response.success is False
    assert response.error and "JavaScript" in response.error
