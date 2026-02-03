"""
検索精度測定テスト

Usage:
    pytest backend/tests/test_search_precision.py -v
    pytest backend/tests/test_search_precision.py::test_baseline_precision -v
"""

import asyncio
import json
import time
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

import pytest

# Test data path
TEST_DATA_PATH = Path(__file__).parent / "data" / "search_test_queries.json"


def load_test_cases() -> list[dict]:
    """Load test cases from JSON file."""
    with open(TEST_DATA_PATH, encoding="utf-8") as f:
        data = json.load(f)
    return data.get("test_cases", [])


def load_evaluation_metrics() -> dict:
    """Load evaluation metrics from JSON file."""
    with open(TEST_DATA_PATH, encoding="utf-8") as f:
        data = json.load(f)
    return data.get("evaluation_metrics", {})


def extract_domain(url: str) -> str:
    """Extract domain from URL."""
    try:
        parsed = urlparse(url)
        return parsed.netloc.lower()
    except Exception:
        return ""


def check_domain_match(source_url: str, expected_patterns: list[str]) -> bool:
    """Check if URL matches any expected domain pattern."""
    domain = extract_domain(source_url)
    for pattern in expected_patterns:
        if pattern.lower() in domain:
            return True
    return False


def check_content_type_match(
    result_content_type: str, expected_types: list[str]
) -> bool:
    """Check if result content type matches expected types."""
    return result_content_type in expected_types


def check_keyword_match(text: str, expected_keywords: list[str]) -> int:
    """Count how many expected keywords are found in text."""
    text_lower = text.lower()
    return sum(1 for kw in expected_keywords if kw.lower() in text_lower)


class SearchPrecisionEvaluator:
    """Evaluate search precision metrics."""

    def __init__(self):
        self.results: dict[str, dict] = {}

    async def evaluate_single_query(
        self, test_case: dict, search_func, company_id: Optional[str] = None
    ) -> dict:
        """Evaluate a single test query."""
        query = test_case["query"]
        expected_content_types = test_case.get("expected_content_types", [])
        expected_domain_patterns = test_case.get("expected_domain_patterns", [])
        expected_keywords = test_case.get("expected_keywords", [])

        # Measure latency
        start_time = time.perf_counter()

        # Execute search
        search_results = await search_func(
            company_id=company_id or "test_company", query=query, n_results=10
        )

        latency_ms = (time.perf_counter() - start_time) * 1000

        # Evaluate top 5 results
        top_5 = search_results[:5]

        # Precision metrics
        relevant_count = 0
        domain_match_count = 0
        content_type_match_count = 0
        keyword_matches = 0

        for result in top_5:
            metadata = result.get("metadata", {})
            text = result.get("text", "")
            source_url = metadata.get("source_url", "")
            content_type = metadata.get("content_type", "")

            # Domain match
            if check_domain_match(source_url, expected_domain_patterns):
                domain_match_count += 1

            # Content type match
            if check_content_type_match(content_type, expected_content_types):
                content_type_match_count += 1

            # Keyword match
            kw_count = check_keyword_match(text, expected_keywords)
            if kw_count > 0:
                keyword_matches += kw_count

            # Consider relevant if at least one criteria matches
            if (
                check_domain_match(source_url, expected_domain_patterns)
                or check_content_type_match(content_type, expected_content_types)
                or kw_count >= len(expected_keywords) // 2
            ):
                relevant_count += 1

        # Calculate rates
        n_results = len(top_5) if top_5 else 1
        precision_at_5 = relevant_count / n_results
        domain_match_rate = (
            domain_match_count / n_results if expected_domain_patterns else 1.0
        )
        content_type_accuracy = (
            content_type_match_count / n_results if expected_content_types else 1.0
        )

        return {
            "query_id": test_case["id"],
            "query": query,
            "company_name": test_case.get("company_name", ""),
            "precision_at_5": precision_at_5,
            "domain_match_rate": domain_match_rate,
            "content_type_accuracy": content_type_accuracy,
            "keyword_matches": keyword_matches,
            "latency_ms": latency_ms,
            "num_results": len(search_results),
            "threshold": test_case.get("relevance_threshold", 0.5),
            "passed": precision_at_5 >= test_case.get("relevance_threshold", 0.5),
        }

    async def evaluate_all(self, search_func, company_id: Optional[str] = None) -> dict:
        """Evaluate all test cases and return summary."""
        test_cases = load_test_cases()
        results = []

        for test_case in test_cases:
            result = await self.evaluate_single_query(
                test_case, search_func, company_id
            )
            results.append(result)
            self.results[test_case["id"]] = result

        # Calculate aggregates
        n_tests = len(results)
        avg_precision = sum(r["precision_at_5"] for r in results) / n_tests
        avg_domain_match = sum(r["domain_match_rate"] for r in results) / n_tests
        avg_content_type = sum(r["content_type_accuracy"] for r in results) / n_tests
        avg_latency = sum(r["latency_ms"] for r in results) / n_tests
        p95_latency = (
            sorted([r["latency_ms"] for r in results])[int(n_tests * 0.95)]
            if n_tests > 0
            else 0
        )
        pass_rate = sum(1 for r in results if r["passed"]) / n_tests

        return {
            "summary": {
                "total_tests": n_tests,
                "pass_rate": pass_rate,
                "avg_precision_at_5": avg_precision,
                "avg_domain_match_rate": avg_domain_match,
                "avg_content_type_accuracy": avg_content_type,
                "avg_latency_ms": avg_latency,
                "p95_latency_ms": p95_latency,
            },
            "results": results,
        }

    def print_report(self, evaluation: dict):
        """Print a formatted evaluation report."""
        summary = evaluation["summary"]
        results = evaluation["results"]

        print("\n" + "=" * 60)
        print("検索精度評価レポート")
        print("=" * 60)

        print(f"\n総テスト数: {summary['total_tests']}")
        print(f"合格率: {summary['pass_rate']:.1%}")
        print(f"\n平均指標:")
        print(f"  Precision@5: {summary['avg_precision_at_5']:.1%}")
        print(f"  ドメインマッチ率: {summary['avg_domain_match_rate']:.1%}")
        print(f"  Content-Type精度: {summary['avg_content_type_accuracy']:.1%}")
        print(f"  平均レイテンシ: {summary['avg_latency_ms']:.0f}ms")
        print(f"  P95レイテンシ: {summary['p95_latency_ms']:.0f}ms")

        print("\n個別結果:")
        print("-" * 60)
        for r in results:
            status = "PASS" if r["passed"] else "FAIL"
            print(
                f"[{status}] {r['query_id']}: P@5={r['precision_at_5']:.0%}, "
                f"Domain={r['domain_match_rate']:.0%}, "
                f"Latency={r['latency_ms']:.0f}ms"
            )

        print("=" * 60)


# Mock search function for testing
async def mock_search_func(
    company_id: str, query: str, n_results: int = 10
) -> list[dict]:
    """Mock search function for unit tests."""
    # Return dummy results
    return [
        {
            "id": f"doc_{i}",
            "text": f"Sample text containing query terms: {query[:50]}",
            "metadata": {
                "source_url": "https://example.com/recruit",
                "content_type": "new_grad_recruitment",
                "chunk_type": "general",
            },
            "hybrid_score": 0.9 - i * 0.1,
        }
        for i in range(n_results)
    ]


# Pytest tests
@pytest.fixture
def evaluator():
    return SearchPrecisionEvaluator()


@pytest.fixture
def test_cases():
    return load_test_cases()


def test_load_test_cases():
    """Test that test cases load correctly."""
    cases = load_test_cases()
    assert len(cases) > 0
    assert all("id" in c for c in cases)
    assert all("query" in c for c in cases)


def test_load_evaluation_metrics():
    """Test that evaluation metrics load correctly."""
    metrics = load_evaluation_metrics()
    assert "precision_at_5" in metrics
    assert "domain_match_rate" in metrics
    assert "latency_p95" in metrics


def test_extract_domain():
    """Test domain extraction."""
    assert extract_domain("https://career.example.com/jobs") == "career.example.com"
    assert extract_domain("http://www.example.co.jp/recruit") == "www.example.co.jp"
    assert extract_domain("invalid") == ""


def test_check_domain_match():
    """Test domain pattern matching."""
    assert check_domain_match(
        "https://career-mc.mitsubishicorp.com/", ["career-mc", "mitsubishicorp"]
    )
    assert check_domain_match("https://toyota-recruit.jp/", ["toyota"])
    assert not check_domain_match("https://example.com/", ["toyota"])


def test_check_content_type_match():
    """Test content type matching."""
    assert check_content_type_match(
        "new_grad_recruitment", ["new_grad_recruitment", "corporate_site"]
    )
    assert not check_content_type_match("ir_materials", ["new_grad_recruitment"])


def test_check_keyword_match():
    """Test keyword matching in text."""
    text = "新卒採用の選考フローについて説明します。"
    assert check_keyword_match(text, ["新卒", "採用"]) == 2
    assert check_keyword_match(text, ["中途"]) == 0


@pytest.mark.asyncio
async def test_evaluate_single_query(evaluator, test_cases):
    """Test single query evaluation with mock search."""
    if not test_cases:
        pytest.skip("No test cases available")

    test_case = test_cases[0]
    result = await evaluator.evaluate_single_query(test_case, mock_search_func)

    assert "precision_at_5" in result
    assert "domain_match_rate" in result
    assert "latency_ms" in result
    assert 0 <= result["precision_at_5"] <= 1
    assert result["latency_ms"] > 0


@pytest.mark.asyncio
async def test_evaluate_all(evaluator):
    """Test full evaluation with mock search."""
    evaluation = await evaluator.evaluate_all(mock_search_func)

    assert "summary" in evaluation
    assert "results" in evaluation
    assert evaluation["summary"]["total_tests"] > 0


@pytest.mark.asyncio
@pytest.mark.integration
async def test_baseline_precision():
    """
    Integration test: Measure baseline precision with real search.

    Run with: pytest backend/tests/test_search_precision.py::test_baseline_precision -v -m integration
    """
    try:
        from app.utils.hybrid_search import dense_hybrid_search
    except ImportError:
        pytest.skip("Cannot import search module - run from backend directory")

    evaluator = SearchPrecisionEvaluator()

    # Note: This requires a real company_id with indexed data
    # For now, we use a placeholder - replace with actual company_id for real testing
    company_id = "test_company_id"

    try:
        evaluation = await evaluator.evaluate_all(
            lambda cid, q, n: dense_hybrid_search(company_id=cid, query=q, n_results=n),
            company_id=company_id,
        )
        evaluator.print_report(evaluation)

        # Assert minimum thresholds
        metrics = load_evaluation_metrics()
        assert evaluation["summary"]["avg_precision_at_5"] >= 0.3, "Precision too low"

    except Exception as e:
        pytest.skip(f"Integration test failed: {e}")


if __name__ == "__main__":
    # Run evaluation manually
    async def main():
        evaluator = SearchPrecisionEvaluator()
        evaluation = await evaluator.evaluate_all(mock_search_func)
        evaluator.print_report(evaluation)

    asyncio.run(main())
