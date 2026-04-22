import logging
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

import app.utils.bm25_store as bm25_module
from app.utils.bm25_store import BM25Index


@pytest.fixture
def index_with_docs():
    idx = BM25Index("test-company")
    idx.add_document("doc1", "テスト文書です")
    idx.add_document("doc2", "別のテスト文書です")
    bm25_module.HAS_BM25 = True
    yield idx
    bm25_module.HAS_BM25 = False


def test_empty_ndarray_returns_empty_list(index_with_docs):
    mock_bm25 = MagicMock()
    mock_bm25.retrieve.return_value = (np.array([]), np.array([]))
    index_with_docs._bm25 = mock_bm25

    result = index_with_docs.search("テスト")
    assert result == []


def test_none_results_returns_empty_list(index_with_docs):
    mock_bm25 = MagicMock()
    mock_bm25.retrieve.return_value = (None, None)
    index_with_docs._bm25 = mock_bm25

    result = index_with_docs.search("テスト")
    assert result == []


def test_length_mismatch_returns_empty_list_with_warning(index_with_docs):
    mock_bm25 = MagicMock()
    mock_bm25.retrieve.return_value = (
        np.array([[0, 1]]),
        np.array([[0.5]]),
    )
    index_with_docs._bm25 = mock_bm25

    mock_logger = MagicMock()
    original_logger = bm25_module.logger
    bm25_module.logger = mock_logger
    try:
        result = index_with_docs.search("テスト")
    finally:
        bm25_module.logger = original_logger
    assert result == []
    mock_logger.warning.assert_called_once()
    assert "mismatch" in mock_logger.warning.call_args[0][0]


def test_inner_empty_array_returns_empty_list(index_with_docs):
    mock_bm25 = MagicMock()
    mock_bm25.retrieve.return_value = (
        np.array([np.array([])]),
        np.array([np.array([])]),
    )
    index_with_docs._bm25 = mock_bm25

    result = index_with_docs.search("テスト")
    assert result == []
