"""Regression test for D-1 (P2-8): every fallback candidate must survive validation.

If a fallback itself fails `_validate_or_repair_question`, we hit an infinite-fallback
loop where the fallback replaces itself and produces the same text anyway. This test
catches that class of bug up-front.

Covers all branches of `_build_question_fallback_candidates` for 6 stages × relevant
input combinations.
"""

from __future__ import annotations

from unittest.mock import patch

import pytest

from app.routers import motivation as motivation_module
from app.routers.motivation import (
    _build_question_fallback_candidates,
    _validate_or_repair_question,
)


def _check_candidate_passes(
    candidate: str,
    *,
    stage: str,
    company_name: str = "株式会社テスト",
    selected_industry: str | None = None,
    selected_role: str | None = None,
    desired_work: str | None = None,
    confirmed_facts: dict[str, bool] | None = None,
) -> None:
    """候補文を `_validate_or_repair_question` に通し、fallback ログが出ないことを確認."""
    with patch.object(motivation_module.logger, "info") as info_mock:
        result = _validate_or_repair_question(
            question=candidate,
            stage=stage,
            company_name=company_name,
            selected_industry=selected_industry,
            selected_role=selected_role,
            desired_work=desired_work,
            grounded_company_anchor=None,
            gakuchika_episode=None,
            gakuchika_strength=None,
            confirmed_facts=confirmed_facts,
        )
    fallback_calls = [
        call.args
        for call in info_mock.call_args_list
        if len(call.args) >= 2 and "question_fallback" in call.args[0]
    ]
    assert not fallback_calls, (
        f"[{stage}] 候補 {candidate!r} が自身の validation で棄却された。"
        f" 発火ログ: {fallback_calls}"
    )
    assert result == candidate, (
        f"[{stage}] 候補 {candidate!r} が validation で変換された。result={result!r}"
    )


class TestAllFallbackCandidatesPassValidation:
    """D-1: リライト後のフォールバック候補 18 問以上がすべて自己検証を通過する."""

    def test_industry_reason_with_industry(self) -> None:
        candidates = _build_question_fallback_candidates(
            stage="industry_reason",
            company_name="株式会社テスト",
            selected_industry="金融",
            selected_role=None,
            desired_work=None,
            grounded_company_anchor=None,
            gakuchika_episode=None,
            gakuchika_strength=None,
        )
        assert len(candidates) >= 3
        for c in candidates:
            _check_candidate_passes(c, stage="industry_reason", selected_industry="金融")

    def test_industry_reason_without_industry(self) -> None:
        candidates = _build_question_fallback_candidates(
            stage="industry_reason",
            company_name="株式会社テスト",
            selected_industry=None,
            selected_role=None,
            desired_work=None,
            grounded_company_anchor=None,
            gakuchika_episode=None,
            gakuchika_strength=None,
        )
        assert len(candidates) >= 2
        for c in candidates:
            _check_candidate_passes(c, stage="industry_reason")

    def test_company_reason_unconfirmed_with_role(self) -> None:
        candidates = _build_question_fallback_candidates(
            stage="company_reason",
            company_name="株式会社テスト",
            selected_industry=None,
            selected_role="エンジニア",
            desired_work=None,
            grounded_company_anchor=None,
            gakuchika_episode=None,
            gakuchika_strength=None,
            confirmed_facts={"company_reason_confirmed": False},
        )
        assert len(candidates) >= 3
        for c in candidates:
            _check_candidate_passes(
                c,
                stage="company_reason",
                selected_role="エンジニア",
                confirmed_facts={"company_reason_confirmed": False},
            )

    def test_company_reason_confirmed_with_role(self) -> None:
        candidates = _build_question_fallback_candidates(
            stage="company_reason",
            company_name="株式会社テスト",
            selected_industry=None,
            selected_role="エンジニア",
            desired_work=None,
            grounded_company_anchor=None,
            gakuchika_episode=None,
            gakuchika_strength=None,
            confirmed_facts={"company_reason_confirmed": True},
        )
        assert len(candidates) >= 3
        for c in candidates:
            _check_candidate_passes(
                c,
                stage="company_reason",
                selected_role="エンジニア",
                confirmed_facts={"company_reason_confirmed": True},
            )

    def test_company_reason_no_role(self) -> None:
        candidates = _build_question_fallback_candidates(
            stage="company_reason",
            company_name="株式会社テスト",
            selected_industry=None,
            selected_role=None,
            desired_work=None,
            grounded_company_anchor=None,
            gakuchika_episode=None,
            gakuchika_strength=None,
        )
        assert len(candidates) >= 3
        for c in candidates:
            _check_candidate_passes(c, stage="company_reason")

    def test_self_connection_with_gakuchika(self) -> None:
        candidates = _build_question_fallback_candidates(
            stage="self_connection",
            company_name="株式会社テスト",
            selected_industry=None,
            selected_role=None,
            desired_work=None,
            grounded_company_anchor=None,
            gakuchika_episode="学生団体運営",
            gakuchika_strength=None,
        )
        assert len(candidates) >= 3
        for c in candidates:
            _check_candidate_passes(c, stage="self_connection")

    def test_self_connection_without_gakuchika(self) -> None:
        candidates = _build_question_fallback_candidates(
            stage="self_connection",
            company_name="株式会社テスト",
            selected_industry=None,
            selected_role=None,
            desired_work=None,
            grounded_company_anchor=None,
            gakuchika_episode=None,
            gakuchika_strength=None,
        )
        assert len(candidates) >= 3
        for c in candidates:
            _check_candidate_passes(c, stage="self_connection")

    def test_desired_work_with_role_and_desired_work(self) -> None:
        candidates = _build_question_fallback_candidates(
            stage="desired_work",
            company_name="株式会社テスト",
            selected_industry=None,
            selected_role="エンジニア",
            desired_work="データ基盤開発",
            grounded_company_anchor=None,
            gakuchika_episode=None,
            gakuchika_strength=None,
        )
        assert len(candidates) >= 3
        for c in candidates:
            _check_candidate_passes(
                c,
                stage="desired_work",
                selected_role="エンジニア",
                desired_work="データ基盤開発",
            )

    def test_desired_work_with_role_only(self) -> None:
        candidates = _build_question_fallback_candidates(
            stage="desired_work",
            company_name="株式会社テスト",
            selected_industry=None,
            selected_role="エンジニア",
            desired_work=None,
            grounded_company_anchor=None,
            gakuchika_episode=None,
            gakuchika_strength=None,
        )
        assert len(candidates) >= 3
        for c in candidates:
            _check_candidate_passes(c, stage="desired_work", selected_role="エンジニア")

    def test_desired_work_no_role(self) -> None:
        candidates = _build_question_fallback_candidates(
            stage="desired_work",
            company_name="株式会社テスト",
            selected_industry=None,
            selected_role=None,
            desired_work=None,
            grounded_company_anchor=None,
            gakuchika_episode=None,
            gakuchika_strength=None,
        )
        assert len(candidates) >= 3
        for c in candidates:
            _check_candidate_passes(c, stage="desired_work")

    def test_value_contribution(self) -> None:
        candidates = _build_question_fallback_candidates(
            stage="value_contribution",
            company_name="株式会社テスト",
            selected_industry=None,
            selected_role=None,
            desired_work=None,
            grounded_company_anchor=None,
            gakuchika_episode=None,
            gakuchika_strength=None,
        )
        assert len(candidates) >= 3
        for c in candidates:
            _check_candidate_passes(c, stage="value_contribution")

    def test_differentiation(self) -> None:
        candidates = _build_question_fallback_candidates(
            stage="differentiation",
            company_name="株式会社テスト",
            selected_industry=None,
            selected_role=None,
            desired_work=None,
            grounded_company_anchor=None,
            gakuchika_episode=None,
            gakuchika_strength=None,
        )
        assert len(candidates) >= 3
        for c in candidates:
            _check_candidate_passes(c, stage="differentiation")


class TestNoBannedPatternsInCandidates:
    """D-1: 禁止型 (選択型・機械的ペアリング) が候補から消えている."""

    BANNED_SUBSTRINGS = (
        "最も近いものを1つ",  # 選択型誘導
        "近いものを1つ教え",  # 同上バリアント
        "で{selected_role}を考えるとき",  # 機械的企業×職種ペアリング (未展開)
    )

    def test_all_stage_candidates_free_of_banned_patterns(self) -> None:
        # 代表的な入力で各ステージの候補を取得
        cases = [
            ("industry_reason", {"selected_industry": "金融"}),
            ("industry_reason", {}),
            ("company_reason", {"selected_role": "エンジニア", "confirmed_facts": {"company_reason_confirmed": False}}),
            ("company_reason", {"selected_role": "エンジニア", "confirmed_facts": {"company_reason_confirmed": True}}),
            ("company_reason", {}),
            ("self_connection", {"gakuchika_episode": "学生団体運営"}),
            ("self_connection", {}),
            ("desired_work", {"selected_role": "エンジニア", "desired_work": "データ基盤開発"}),
            ("desired_work", {"selected_role": "エンジニア"}),
            ("desired_work", {}),
            ("value_contribution", {}),
            ("differentiation", {}),
        ]
        for stage, overrides in cases:
            candidates = _build_question_fallback_candidates(
                stage=stage,
                company_name="株式会社テスト",
                selected_industry=overrides.get("selected_industry"),
                selected_role=overrides.get("selected_role"),
                desired_work=overrides.get("desired_work"),
                grounded_company_anchor=None,
                gakuchika_episode=overrides.get("gakuchika_episode"),
                gakuchika_strength=None,
                confirmed_facts=overrides.get("confirmed_facts"),
            )
            for c in candidates:
                for banned in self.BANNED_SUBSTRINGS:
                    assert banned not in c, (
                        f"[{stage}] 候補 {c!r} に禁止パターン {banned!r} が残っている"
                    )
