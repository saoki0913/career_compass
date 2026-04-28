import logging
import pickle
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

import app.utils.bm25_store as bm25_module
from app.utils.bm25_store import BM25Index


@pytest.fixture
def index_with_docs():
    idx = BM25Index("test-company", tenant_key="a" * 32)
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


def test_save_does_not_clobber_stale_fixed_tmp_file(tmp_path, monkeypatch):
    monkeypatch.setattr(bm25_module, "BM25_PERSIST_DIR", tmp_path)
    tenant_key = "a" * 32
    company_id = "company-1"
    stale_tmp = tmp_path / f"{tenant_key}__{company_id}.json.tmp"
    stale_tmp.write_text("stale data", encoding="utf-8")

    idx = BM25Index(company_id, tenant_key=tenant_key)
    idx.add_document("doc1", "テスト文書です")
    idx.save()

    assert (tmp_path / f"{tenant_key}__{company_id}.json").exists()
    assert stale_tmp.read_text(encoding="utf-8") == "stale data"


def test_load_ignores_tenant_scoped_pickle(tmp_path, monkeypatch):
    monkeypatch.setattr(bm25_module, "BM25_PERSIST_DIR", tmp_path)
    tenant_key = "a" * 32
    company_id = "company-1"
    pickle_path = tmp_path / f"{tenant_key}__{company_id}.pkl"
    pickle_path.write_bytes(
        pickle.dumps(
            {
                "documents": [
                    {
                        "doc_id": "legacy-doc",
                        "text": "古い文書",
                        "tokens": ["古い", "文書"],
                        "metadata": {},
                    }
                ]
            }
        )
    )

    assert BM25Index.load(company_id, tenant_key=tenant_key) is None
    assert pickle_path.exists()
