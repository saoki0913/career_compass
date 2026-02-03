"""
Backend Tests - Shared Fixtures and Utilities

pytest conftest.py with shared fixtures for all test files.
"""

import json
import os
import sys
from pathlib import Path
from typing import Optional

import pytest

# Add backend to path for imports (before other local imports)
sys.path.insert(0, str(Path(__file__).parent.parent))

# Rate limiter for parallel test execution
try:
    from tests.utils.rate_limiter import DistributedRateLimiter

    HAS_RATE_LIMITER = True
except ImportError:
    HAS_RATE_LIMITER = False

# =============================================================================
# Constants
# =============================================================================

MAPPINGS_FILE = Path(__file__).parent.parent / "data" / "company_mappings.json"


# =============================================================================
# Utility Functions
# =============================================================================


def load_all_companies() -> dict:
    """company_mappings.json から全企業を読み込む

    Returns:
        dict: 企業名をキー、マッピング情報を値とする辞書
              （コメント行は除外）
    """
    with open(MAPPINGS_FILE, encoding="utf-8") as f:
        data = json.load(f)
    return {k: v for k, v in data.get("mappings", {}).items() if not k.startswith("_")}


def get_domains(mapping) -> list[str]:
    """マッピングからドメインパターンを取得"""
    if isinstance(mapping, list):
        return mapping
    return mapping.get("domains", [])


def has_parent(mapping) -> bool:
    """子会社かどうかを判定"""
    return isinstance(mapping, dict) and "parent" in mapping


def get_subsidiaries(companies: dict) -> list[tuple[str, dict]]:
    """子会社のリストを取得

    Returns:
        list of (company_name, mapping) tuples for subsidiaries
    """
    return [
        (name, mapping) for name, mapping in companies.items() if has_parent(mapping)
    ]


def get_parents(companies: dict) -> list[tuple[str, list]]:
    """親会社・独立企業のリストを取得

    Returns:
        list of (company_name, domains) tuples for parent/standalone companies
    """
    return [
        (name, get_domains(mapping))
        for name, mapping in companies.items()
        if not has_parent(mapping)
    ]


def get_parent_companies_set(companies: dict) -> set[str]:
    """親会社名のセットを取得（子会社から参照されている親会社）"""
    parents = set()
    for mapping in companies.values():
        if isinstance(mapping, dict) and "parent" in mapping:
            parents.add(mapping["parent"])
    return parents


def get_subsidiary_parent_pairs(companies: dict) -> list[tuple[str, str]]:
    """(子会社名, 親会社名) のペアリストを取得"""
    return [
        (name, mapping["parent"])
        for name, mapping in companies.items()
        if isinstance(mapping, dict) and "parent" in mapping
    ]


# =============================================================================
# Pytest Fixtures
# =============================================================================


@pytest.fixture(scope="session")
def all_companies():
    """全企業データ（セッション全体で共有）"""
    return load_all_companies()


@pytest.fixture(scope="session")
def subsidiaries(all_companies):
    """全子会社リスト"""
    return get_subsidiaries(all_companies)


@pytest.fixture(scope="session")
def parent_companies(all_companies):
    """全親会社・独立企業リスト"""
    return get_parents(all_companies)


@pytest.fixture(scope="session")
def parent_company_names(all_companies):
    """親会社名のセット"""
    return get_parent_companies_set(all_companies)


# =============================================================================
# Rate Limiter Fixtures (for pytest-xdist)
# =============================================================================


@pytest.fixture(scope="session")
def rate_limiter():
    """Distributed rate limiter shared across xdist workers."""
    if HAS_RATE_LIMITER:
        return DistributedRateLimiter()
    return None


# =============================================================================
# Pytest Markers and Hooks
# =============================================================================


def pytest_configure(config):
    """Register custom markers and initialize rate limiter."""
    config.addinivalue_line(
        "markers", "slow: marks tests as slow (deselect with '-m \"not slow\"')"
    )
    config.addinivalue_line(
        "markers", "integration: marks tests that make real API calls"
    )

    # Initialize rate limiter state on controller (not workers)
    # xdist workers have PYTEST_XDIST_WORKER env var set
    if HAS_RATE_LIMITER and not os.environ.get("PYTEST_XDIST_WORKER"):
        DistributedRateLimiter.reset()


def pytest_sessionfinish(session, exitstatus):
    """Print rate limiter stats at end of session."""
    if HAS_RATE_LIMITER and not os.environ.get("PYTEST_XDIST_WORKER"):
        limiter = DistributedRateLimiter()
        stats = limiter.get_stats()
        if stats and stats.get("request_count", 0) > 0:
            print(f"\n[Rate Limiter Stats]")
            print(f"  Total requests: {stats.get('request_count', 0)}")
            print(f"  Errors (429): {stats.get('error_count', 0)}")
