from __future__ import annotations

from evals.company_info_search.models import GateLevel, JudgmentGrade, RunJudgment, RunRecord
from tests.company_info.integration.live_feature_report import build_company_info_search_live_rows


def test_build_company_info_search_live_rows_maps_gate_levels_and_skips_meta() -> None:
    rows = build_company_info_search_live_rows(
        [
            RunRecord(
                mode="hybrid",
                kind="recruitment_main",
                company_name="テスト株式会社",
                candidates=[{"url": "https://example.com/recruit"}],
                judgment=RunJudgment(
                    passed=True,
                    official_found=True,
                    official_rank=1,
                    grade=JudgmentGrade.GOOD,
                    grade_score=0.8,
                    metadata_score=0.92,
                    source_type_correct=True,
                    company_match_correct=True,
                    year_match_correct=True,
                    confidence_appropriate=True,
                    hard_pass=True,
                    soft_pass=True,
                    gate_level=GateLevel.PASS,
                ),
            ),
            RunRecord(
                mode="hybrid",
                kind="content_type:corporate_site",
                company_name="テスト株式会社",
                candidates=[{"url": "https://example.com"}],
                judgment=RunJudgment(
                    passed=False,
                    official_found=True,
                    official_rank=6,
                    raw_official_rank=4,
                    grade=JudgmentGrade.MARGINAL,
                    grade_score=0.3,
                    metadata_score=0.78,
                    source_type_correct=True,
                    company_match_correct=True,
                    url_pattern_match=False,
                    confidence_appropriate=False,
                    hard_pass=False,
                    soft_pass=False,
                    gate_level=GateLevel.SOFT_FAIL,
                    failure_codes=["url_pattern_mismatch", "low_confidence"],
                    failure_reasons=["soft_fail"],
                ),
            ),
            RunRecord(
                mode="legacy",
                kind="recruitment_intern",
                company_name="失敗株式会社",
                error="upstream timeout",
            ),
            RunRecord(
                mode="meta",
                kind="company_context",
                company_name="除外株式会社",
            ),
        ]
    )

    assert len(rows) == 3

    passed, degraded, failed = rows

    assert passed["caseId"] == "テスト株式会社::hybrid::recruitment_main"
    assert passed["status"] == "passed"
    assert passed["severity"] == "passed"
    assert passed["failureKind"] == "none"

    assert degraded["caseId"] == "テスト株式会社::hybrid::content_type:corporate_site"
    assert degraded["status"] == "passed"
    assert degraded["severity"] == "degraded"
    assert degraded["failureKind"] == "quality"
    assert "url_pattern_mismatch" in degraded["deterministicFailReasons"]
    assert "low_confidence" in degraded["deterministicFailReasons"]

    assert failed["caseId"] == "失敗株式会社::legacy::recruitment_intern"
    assert failed["status"] == "failed"
    assert failed["severity"] == "failed"
    assert failed["failureKind"] == "infra"
    assert failed["representativeError"] == "upstream timeout"
