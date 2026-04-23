"""Tests for question_group coverage dynamic planning."""

from __future__ import annotations

import pytest

from backend.app.normalization.gakuchika_question_planner import (
    _compute_group_coverage,
    _render_coverage_summary,
    _select_next_deepdive_focus_by_coverage,
)


class TestComputeGroupCoverage:
    def test_empty_inputs_all_unsatisfied(self):
        coverage = _compute_group_coverage([], [], [], [])
        assert not coverage["foundation"]["satisfied"]
        assert not coverage["reasoning"]["satisfied"]
        assert not coverage["evidence"]["satisfied"]
        assert not coverage["narrative"]["satisfied"]

    def test_resolved_focus_satisfies_group(self):
        coverage = _compute_group_coverage(
            asked_focuses=["role"],
            resolved_focuses=["role"],
            blocked_focuses=[],
            loop_blocked_focuses=[],
        )
        assert coverage["foundation"]["satisfied"]

    def test_all_asked_satisfies_group(self):
        coverage = _compute_group_coverage(
            asked_focuses=["role", "challenge"],
            resolved_focuses=[],
            blocked_focuses=[],
            loop_blocked_focuses=[],
        )
        assert coverage["foundation"]["satisfied"]

    def test_blocked_not_available(self):
        coverage = _compute_group_coverage(
            asked_focuses=[],
            resolved_focuses=[],
            blocked_focuses=["role"],
            loop_blocked_focuses=[],
        )
        assert "role" not in coverage["foundation"]["available"]
        assert "challenge" in coverage["foundation"]["available"]


class TestSelectNextFocus:
    def test_required_before_optional(self):
        coverage = _compute_group_coverage([], [], [], [])
        result = _select_next_deepdive_focus_by_coverage(coverage, None, 1)
        assert result in ("role", "challenge")

    def test_all_required_satisfied_returns_optional_after_q3(self):
        coverage = _compute_group_coverage(
            ["role", "action_reason"], ["role", "action_reason"], [], [],
        )
        result = _select_next_deepdive_focus_by_coverage(coverage, None, 4)
        assert result in ("result_evidence", "learning_transfer", "future", "backstory")

    def test_all_satisfied_returns_none(self):
        all_focuses = [
            "role", "challenge", "action_reason", "credibility",
            "result_evidence", "learning_transfer", "future", "backstory",
        ]
        coverage = _compute_group_coverage(all_focuses, all_focuses, [], [])
        result = _select_next_deepdive_focus_by_coverage(coverage, None, 5)
        assert result is None


class TestRenderCoverageSummary:
    def test_output_format(self):
        coverage = _compute_group_coverage(["role"], ["role"], [], [])
        summary = _render_coverage_summary(coverage)
        assert "深掘りカバレッジ状況" in summary
        assert "到達済み" in summary
        assert "未到達" in summary
        assert "【必須】" in summary
