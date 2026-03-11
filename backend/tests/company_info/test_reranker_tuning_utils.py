import json
from pathlib import Path

from app.utils.reranker import (
    resolve_reranker_model_name,
    resolve_reranker_variant,
)
from evals.company_info_search.reranker_tuning import (
    build_dataset_rows_from_report,
    compare_reports,
    split_rows_by_company,
)


def test_resolve_reranker_variant_base(monkeypatch) -> None:
    monkeypatch.setenv("RERANKER_VARIANT", "base")
    assert resolve_reranker_variant("acme") == "base"


def test_resolve_reranker_variant_ab_deterministic(monkeypatch) -> None:
    monkeypatch.setenv("RERANKER_VARIANT", "ab")
    monkeypatch.setenv("RERANKER_AB_TUNED_RATIO", "1.0")
    assert resolve_reranker_variant("same-key") == "tuned"
    assert resolve_reranker_variant("same-key") == "tuned"


def test_resolve_reranker_model_name(monkeypatch) -> None:
    monkeypatch.setenv("RERANKER_BASE_MODEL", "base-model")
    monkeypatch.setenv("RERANKER_TUNED_MODEL_PATH", "tuned-model")
    assert resolve_reranker_model_name("base") == "base-model"
    assert resolve_reranker_model_name("tuned") == "tuned-model"


def test_build_dataset_rows_and_split(tmp_path: Path) -> None:
    report = {
        "runs": [
            {
                "mode": "hybrid",
                "kind": "recruitment_main",
                "company_name": "テスト株式会社",
                "queries": ["テスト株式会社 新卒採用 27卒"],
                "error": None,
                "hybrid_raw_top": [
                    {
                        "url": "https://test.co.jp/recruit/",
                        "title": "新卒採用",
                        "snippet": "27卒募集",
                        "is_official": True,
                        "company_name_matched": True,
                        "year_matched": True,
                    },
                    {
                        "url": "https://example.com/recruit/",
                        "title": "他社採用",
                        "snippet": "26卒募集",
                        "is_official": False,
                        "company_name_matched": False,
                        "year_matched": False,
                    },
                ],
            }
        ]
    }
    report_path = tmp_path / "report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False), encoding="utf-8")

    rows = build_dataset_rows_from_report(report_path)
    assert any(r.label == 1 for r in rows)
    assert any(r.label == 0 for r in rows)

    splits = split_rows_by_company(rows)
    assert sum(len(v) for v in splits.values()) == len(rows)


def test_compare_reports(tmp_path: Path) -> None:
    base = {
        "summary": {
            "overall": {"hybrid": {"rate": 0.50}},
            "recruitment": {"hybrid": {"rate": 0.30}},
            "corporate": {"hybrid": {"rate": 0.60}},
            "failure_analysis": {
                "top_failure_codes": [
                    ["year_mismatch", 10],
                    ["url_pattern_mismatch", 20],
                ]
            },
        }
    }
    tuned = {
        "summary": {
            "overall": {"hybrid": {"rate": 0.55}},
            "recruitment": {"hybrid": {"rate": 0.35}},
            "corporate": {"hybrid": {"rate": 0.65}},
            "failure_analysis": {
                "top_failure_codes": [
                    ["year_mismatch", 7],
                    ["url_pattern_mismatch", 15],
                ]
            },
        }
    }
    base_path = tmp_path / "base.json"
    tuned_path = tmp_path / "tuned.json"
    base_path.write_text(json.dumps(base), encoding="utf-8")
    tuned_path.write_text(json.dumps(tuned), encoding="utf-8")

    result = compare_reports(base_path, tuned_path)
    assert result["overall_rate_delta"] > 0
    assert result["failure_code_deltas"]["year_mismatch"] < 0
