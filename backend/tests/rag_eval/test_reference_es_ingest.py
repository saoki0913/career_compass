from __future__ import annotations

import pytest


def test_reference_es_ingest_loader_accepts_jsonl(tmp_path):
    from scripts.ingest_reference_es import load_records

    path = tmp_path / "reference_es.jsonl"
    path.write_text(
        '{"es_id":"ref-1","question_type":"gakuchika","industry":"it","char_max":400,'
        '"anonymized":true,"usage_consent":true,"anonymization_level":"synthetic",'
        '"source_provenance":"internal_synthetic_seed",'
        '"text":"学生時代に力を入れたことは、長期インターンで業務改善に取り組んだ経験です。"}\n',
        encoding="utf-8",
    )

    records = load_records(path, default_source_version="v1", ingest_session_id="test-session")

    assert len(records) == 1
    assert records[0].es_id == "ref-1"
    assert records[0].question_type == "gakuchika"
    assert records[0].industry == "it"
    assert records[0].char_max == 400
    assert records[0].source_version == "v1"
    assert records[0].ingest_session_id == "test-session"
    assert records[0].anonymization_level == "synthetic"
    assert records[0].source_provenance == "internal_synthetic_seed"
    assert records[0].usage_consent is True


def test_reference_es_ingest_loader_rejects_short_text(tmp_path):
    from scripts.ingest_reference_es import load_records

    path = tmp_path / "reference_es.jsonl"
    path.write_text(
        '{"es_id":"ref-1","question_type":"gakuchika","anonymized":true,'
        '"usage_consent":true,"anonymization_level":"synthetic",'
        '"source_provenance":"internal_synthetic_seed","text":"短い"}\n',
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="too-short text"):
        load_records(path, default_source_version="v1")


def test_reference_es_ingest_loader_requires_anonymized_consent_metadata(tmp_path):
    from scripts.ingest_reference_es import load_records

    path = tmp_path / "reference_es.jsonl"
    path.write_text(
        '{"es_id":"ref-1","question_type":"gakuchika","text":"学生時代に力を入れたことは、'
        '架空プロジェクトで業務改善に取り組んだ経験です。"}\n',
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="anonymized=true"):
        load_records(path, default_source_version="v1")


def test_reference_es_dry_run_summary_is_gate_evidence(tmp_path):
    from scripts.ingest_reference_es import build_dry_run_summary, load_records

    path = tmp_path / "reference_es.jsonl"
    path.write_text(
        "\n".join(
            [
                '{"es_id":"ref-1","question_type":"gakuchika","industry":"it","char_max":400,'
                '"anonymized":true,"usage_consent":true,"anonymization_level":"synthetic",'
                '"source_provenance":"internal_synthetic_seed",'
                '"text":"学生時代に力を入れたことは、架空プロジェクトで業務改善に取り組んだ経験です。"}',
                '{"es_id":"ref-2","question_type":"motivation","industry":"finance","char_max":600,'
                '"anonymized":true,"usage_consent":true,"anonymization_level":"anonymized",'
                '"source_provenance":"internal_anonymized_seed",'
                '"text":"志望理由は、架空の顧客課題に向き合い改善提案を続けた経験を活かしたいからです。"}',
            ]
        )
        + "\n",
        encoding="utf-8",
    )

    records = load_records(
        path,
        default_source_version="v1",
        ingest_session_id="dry-run-session",
    )

    assert build_dry_run_summary(records) == {
        "records": 2,
        "dryRun": True,
        "ingestSessionId": "dry-run-session",
        "questionTypes": {"gakuchika": 1, "motivation": 1},
        "sourceVersions": {"v1": 2},
        "consentedRecords": 2,
        "anonymizedRecords": 2,
    }


def test_contextual_comparison_builds_metric_deltas():
    from evals.rag.compare_contextual_retrieval import build_comparison

    comparison = build_comparison(
        {"ndcg_at_k_src": 0.8, "mrr_src": 0.7, "hit_rate_src": 0.9, "recall_src": 0.6, "n_items": 3},
        {"ndcg_at_k_src": 0.83, "mrr_src": 0.72, "hit_rate_src": 0.88, "recall_src": 0.7, "n_items": 3},
    )

    assert comparison["delta"]["ndcg_at_k_src"] == pytest.approx(0.03)
    assert comparison["delta"]["hit_rate_src"] == pytest.approx(-0.02)
    assert comparison["decisionThresholds"]["mrr_src_min_delta"] == -0.03


def test_contextual_comparison_includes_collection_distribution():
    from evals.rag.compare_contextual_retrieval import build_comparison

    comparison = build_comparison(
        {"collection_distribution": {"company_openai_text_embedding_3_small": 2}},
        {"collection_distribution": {"company_openai_text_embedding_3_small__ctx": 2}},
    )

    assert comparison["collectionDistribution"]["disabled"] == {
        "company_openai_text_embedding_3_small": 2
    }
    assert comparison["collectionDistribution"]["enabled"] == {
        "company_openai_text_embedding_3_small__ctx": 2
    }


def test_reference_es_eval_metric_helpers():
    from evals.rag.evaluate_reference_es import _ndcg_at_k, _recall_at_k

    retrieved = ["other", "ref-1", "ref-2"]

    assert _recall_at_k(retrieved, "ref-1") == 1.0
    assert _recall_at_k(retrieved, "missing") == 0.0
    assert _ndcg_at_k(retrieved, "ref-1") == pytest.approx(0.6309297536)
    assert _ndcg_at_k(retrieved, "missing") == 0.0


def test_reference_es_where_filter_uses_chroma_and_shape():
    from app.rag.reference_es import _and_where

    assert _and_where({"question_type": "gakuchika"}, {"anonymized": True}) == {
        "$and": [{"question_type": "gakuchika"}, {"anonymized": True}]
    }
    assert _and_where({"question_type": "gakuchika"}) == {"question_type": "gakuchika"}


@pytest.mark.asyncio
async def test_reference_es_eval_is_retired(tmp_path):
    import evals.rag.evaluate_reference_es as module

    path = tmp_path / "reference_es.jsonl"
    path.write_text(
        '{"es_id":"ref-1","question_type":"gakuchika","industry":"it","char_max":400,'
        '"anonymized":true,"usage_consent":true,"anonymization_level":"synthetic",'
        '"source_provenance":"internal_synthetic_seed",'
        '"text":"学生時代に力を入れたことは、架空プロジェクトで業務改善に取り組んだ経験です。"}\n',
        encoding="utf-8",
    )

    with pytest.raises(RuntimeError, match="removed from runtime"):
        await module.evaluate_reference_es(
            path,
            recall_k=10,
            ndcg_k=5,
            ingest_first=False,
            ingest_session_id="test-session",
        )
