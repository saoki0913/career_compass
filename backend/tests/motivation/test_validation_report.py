"""Regression test for E-2 (P3-4): validation_report exposes fallback usage.

`_validate_or_repair_question` must populate the injected `validation_report`
dict with `fallback_used` / `fallback_reason` so that response builders can
surface it via `candidate_validation_summary`.
"""

from __future__ import annotations

from app.routers.motivation import _validate_or_repair_question


def _call(question: str, *, stage: str = "company_reason", **kwargs) -> tuple[str, dict]:
    report: dict = {}
    result = _validate_or_repair_question(
        question=question,
        stage=stage,
        company_name=kwargs.get("company_name", "株式会社テスト"),
        selected_industry=kwargs.get("selected_industry"),
        selected_role=kwargs.get("selected_role"),
        desired_work=kwargs.get("desired_work"),
        grounded_company_anchor=None,
        gakuchika_episode=None,
        gakuchika_strength=None,
        confirmed_facts=kwargs.get("confirmed_facts"),
        validation_report=report,
    )
    return result, report


class TestValidationReport:
    def test_valid_question_marks_report_false(self) -> None:
        _, report = _call("株式会社テストの事業や取り組みで、気になっている点はありますか？")
        assert report["fallback_used"] is False
        assert report["fallback_reason"] is None

    def test_empty_question_records_empty_reason(self) -> None:
        _, report = _call("")
        assert report["fallback_used"] is True
        assert report["fallback_reason"] == "empty"

    def test_generic_blocklist_records_reason(self) -> None:
        _, report = _call("もう少し詳しく教えてください")
        assert report["fallback_used"] is True
        assert report["fallback_reason"] == "generic_blocklist"

    def test_missing_keyword_records_reason(self) -> None:
        _, report = _call("好きな食べ物は何ですか？", stage="self_connection")
        assert report["fallback_used"] is True
        assert report["fallback_reason"] == "missing_keyword"

    def test_report_is_optional_and_keeps_behavior(self) -> None:
        # validation_report=None でも既存動作が維持されること（fallback 返却）
        result = _validate_or_repair_question(
            question="",
            stage="company_reason",
            company_name="株式会社テスト",
            selected_industry=None,
            selected_role=None,
            desired_work=None,
            grounded_company_anchor=None,
            gakuchika_episode=None,
            gakuchika_strength=None,
        )
        assert result  # fallback 文字列が返る
