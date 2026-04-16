"""Unit tests for B-2 (P2-5) draft_ready source classification telemetry.

Covers:
- `_classify_draft_ready_source()` の 4 パターン (both_agree / planner_only:<reason> / eval_only / neither)
- `_build_draft_ready_telemetry()` が `draft_ready_eval`, `draft_ready_planner`,
  `draft_ready_source`, `planner_unlock_reason` の 4 キーを付与する
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.routers.motivation import (
    _build_draft_ready_telemetry,
    _classify_draft_ready_source,
)


class TestClassifyDraftReadySource:
    def test_both_agree(self) -> None:
        assert (
            _classify_draft_ready_source(
                eval_ready=True,
                planner_unlock=True,
                unlock_reason="max_turn_reached",
            )
            == "both_agree"
        )

    def test_planner_only_with_reason(self) -> None:
        assert (
            _classify_draft_ready_source(
                eval_ready=False,
                planner_unlock=True,
                unlock_reason="max_turn_reached",
            )
            == "planner_only:max_turn_reached"
        )

    def test_planner_only_missing_reason_falls_back_to_unknown(self) -> None:
        assert (
            _classify_draft_ready_source(
                eval_ready=False,
                planner_unlock=True,
                unlock_reason=None,
            )
            == "planner_only:unknown"
        )

    def test_eval_only(self) -> None:
        assert (
            _classify_draft_ready_source(
                eval_ready=True,
                planner_unlock=False,
                unlock_reason=None,
            )
            == "eval_only"
        )

    def test_neither(self) -> None:
        assert (
            _classify_draft_ready_source(
                eval_ready=False,
                planner_unlock=False,
                unlock_reason=None,
            )
            == "neither"
        )


def _make_prep(*, eval_ready: bool, is_complete: bool, unlock_reason: str | None):
    """Minimal stub matching the fields `_build_draft_ready_telemetry` reads."""
    return SimpleNamespace(
        eval_result={"ready_for_draft": eval_ready},
        is_complete=is_complete,
        unlock_reason=unlock_reason,
    )


class TestBuildDraftReadyTelemetry:
    def test_merges_into_existing_cost_summary(self) -> None:
        prep = _make_prep(eval_ready=True, is_complete=True, unlock_reason="max_turn_reached")
        base = {"feature": "motivation", "input_tokens_total": 123}
        telemetry = _build_draft_ready_telemetry(prep, base)
        # 元のキーを破壊していない
        assert telemetry["feature"] == "motivation"
        assert telemetry["input_tokens_total"] == 123
        # 新しいキーが付与される
        assert telemetry["draft_ready_eval"] is True
        assert telemetry["draft_ready_planner"] is True
        assert telemetry["draft_ready_source"] == "both_agree"
        assert telemetry["planner_unlock_reason"] == "max_turn_reached"

    def test_base_is_none_returns_new_dict(self) -> None:
        prep = _make_prep(eval_ready=False, is_complete=False, unlock_reason=None)
        telemetry = _build_draft_ready_telemetry(prep, None)
        assert telemetry is not None
        assert telemetry["draft_ready_source"] == "neither"
        assert telemetry["draft_ready_eval"] is False
        assert telemetry["draft_ready_planner"] is False
        assert telemetry["planner_unlock_reason"] is None

    def test_planner_only_reason_is_encoded(self) -> None:
        prep = _make_prep(eval_ready=False, is_complete=True, unlock_reason="max_turn_reached")
        telemetry = _build_draft_ready_telemetry(prep, {})
        assert telemetry["draft_ready_source"] == "planner_only:max_turn_reached"

    def test_does_not_mutate_base(self) -> None:
        prep = _make_prep(eval_ready=True, is_complete=False, unlock_reason=None)
        base = {"feature": "motivation"}
        telemetry = _build_draft_ready_telemetry(prep, base)
        # 新しい dict を返すため元の base には draft_ready_* が付与されていない
        assert "draft_ready_source" not in base
        assert telemetry is not base
