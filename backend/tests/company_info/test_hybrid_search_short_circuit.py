from app.rag.hybrid_search import _should_short_circuit_search


def test_short_circuit_when_top_results_are_confident_and_diverse() -> None:
    results = [
        {"boosted_score": 0.92, "metadata": {"content_type": "new_grad_recruitment"}},
        {"boosted_score": 0.85, "metadata": {"content_type": "employee_interviews"}},
        {"boosted_score": 0.83, "metadata": {"content_type": "ceo_message"}},
    ]

    assert _should_short_circuit_search(results, n_results=3) is True


def test_short_circuit_stays_disabled_when_results_are_thin() -> None:
    results = [
        {"boosted_score": 0.64, "metadata": {"content_type": "corporate_site"}},
        {"boosted_score": 0.61, "metadata": {"content_type": "corporate_site"}},
        {"boosted_score": 0.57, "metadata": {"content_type": "corporate_site"}},
    ]

    assert _should_short_circuit_search(results, n_results=3) is False
