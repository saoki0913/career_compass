from unittest.mock import patch

from app.utils.web_search import generate_query_variations


def test_empty_variants_falls_back_to_company_name():
    with patch("app.utils.web_search.generate_company_variants", return_value=[]):
        with patch("app.utils.web_search._merge_query_aliases", return_value=[]):
            queries = generate_query_variations("テスト株式会社")
    assert any("テスト株式会社" in q for q in queries)


def test_empty_variants_and_empty_name_returns_queries():
    with patch("app.utils.web_search.generate_company_variants", return_value=[]):
        with patch("app.utils.web_search._merge_query_aliases", return_value=[]):
            queries = generate_query_variations("")
    assert isinstance(queries, list)


def test_normal_variants_uses_first_element():
    variants = ["テスト株式会社", "テスト"]
    with patch("app.utils.web_search.generate_company_variants", return_value=variants):
        with patch("app.utils.web_search._merge_query_aliases", return_value=variants):
            queries = generate_query_variations("テスト株式会社")
    assert any("テスト株式会社" in q for q in queries)
