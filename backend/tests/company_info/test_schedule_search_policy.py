from app.routers.company_info import (
    _build_recruit_queries,
    _build_schedule_source_metadata,
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
