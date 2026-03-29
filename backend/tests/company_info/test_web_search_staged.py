from app.utils.web_search import WebSearchResult, should_run_deep_search


def test_skips_deep_search_when_fast_path_already_has_enough_official_results() -> None:
    results = [
        WebSearchResult(
            url="https://example.co.jp/recruit",
            title="採用情報",
            snippet="",
            is_official=True,
            source_type="official",
        ),
        WebSearchResult(
            url="https://example.co.jp/company",
            title="会社情報",
            snippet="",
            is_official=True,
            source_type="official",
        ),
        WebSearchResult(
            url="https://job.mynavi.jp/example",
            title="マイナビ",
            snippet="",
            source_type="aggregator",
            is_aggregator=True,
        ),
    ]

    assert should_run_deep_search(results, search_intent="recruitment", content_type="new_grad_recruitment") is False


def test_runs_deep_search_when_official_results_are_missing() -> None:
    results = [
        WebSearchResult(
            url="https://job.mynavi.jp/example",
            title="マイナビ",
            snippet="",
            source_type="aggregator",
            is_aggregator=True,
        )
    ]

    assert should_run_deep_search(results, search_intent="corporate_about", content_type="corporate_site") is True
