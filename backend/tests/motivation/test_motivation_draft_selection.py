"""Regression test for D-3 (P2-2): deterministic draft selection rule.

`_select_motivation_draft` must encode the 5-pattern decision tree:
1. retry が None → initial (retry_failed)
2. 両方 limits 内 → AI smell score が低い方 (同点 initial 優先)
3. retry のみ limits 内 → retry
4. initial のみ limits 内 → initial
5. 両方 limits 外 → initial

B-2 では `_maybe_retry_for_ai_smell` が LLM 呼び出し失敗
(`retry_llm_failed`) と 空ドラフト応答 (`retry_empty_draft`) を区別して
`draft_selection_reason` を出すことを担保する。
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.routers.motivation import (
    _build_user_origin_from_conversation,
    _maybe_retry_for_ai_smell,
    _select_motivation_draft,
)
from app.routers.motivation_models import Message


CHAR_MIN = 280
CHAR_MAX = 400


def _score(value: float) -> dict:
    return {"score": value, "tier": 2 if value >= 0.5 else 1, "band": "mid", "details": []}


class TestSelectMotivationDraft:
    def test_retry_failed_falls_back_to_initial(self) -> None:
        draft, reason = _select_motivation_draft(
            initial_draft="A",
            initial_smell_score=_score(0.6),
            initial_within_limits=True,
            retry_draft=None,
            retry_smell_score=None,
            retry_within_limits=None,
            char_min=CHAR_MIN,
            char_max=CHAR_MAX,
        )
        assert draft == "A"
        assert reason == "retry_failed"

    def test_both_within_limits_retry_better_score(self) -> None:
        draft, reason = _select_motivation_draft(
            initial_draft="A",
            initial_smell_score=_score(0.8),
            initial_within_limits=True,
            retry_draft="B",
            retry_smell_score=_score(0.3),
            retry_within_limits=True,
            char_min=CHAR_MIN,
            char_max=CHAR_MAX,
        )
        assert draft == "B"
        assert reason == "retry_better_score"

    def test_both_within_limits_equal_prefers_initial(self) -> None:
        draft, reason = _select_motivation_draft(
            initial_draft="A",
            initial_smell_score=_score(0.5),
            initial_within_limits=True,
            retry_draft="B",
            retry_smell_score=_score(0.5),
            retry_within_limits=True,
            char_min=CHAR_MIN,
            char_max=CHAR_MAX,
        )
        assert draft == "A"
        assert reason == "initial_equal_or_better"

    def test_both_within_limits_initial_better_keeps_initial(self) -> None:
        draft, reason = _select_motivation_draft(
            initial_draft="A",
            initial_smell_score=_score(0.2),
            initial_within_limits=True,
            retry_draft="B",
            retry_smell_score=_score(0.9),
            retry_within_limits=True,
            char_min=CHAR_MIN,
            char_max=CHAR_MAX,
        )
        assert draft == "A"
        assert reason == "initial_equal_or_better"

    def test_only_retry_within_limits_adopts_retry(self) -> None:
        draft, reason = _select_motivation_draft(
            initial_draft="A",
            initial_smell_score=_score(0.1),
            initial_within_limits=False,
            retry_draft="B",
            retry_smell_score=_score(0.9),
            retry_within_limits=True,
            char_min=CHAR_MIN,
            char_max=CHAR_MAX,
        )
        assert draft == "B"
        assert reason == "retry_within_limits"

    def test_only_initial_within_limits_keeps_initial(self) -> None:
        draft, reason = _select_motivation_draft(
            initial_draft="A",
            initial_smell_score=_score(0.9),
            initial_within_limits=True,
            retry_draft="B",
            retry_smell_score=_score(0.1),
            retry_within_limits=False,
            char_min=CHAR_MIN,
            char_max=CHAR_MAX,
        )
        assert draft == "A"
        assert reason == "initial_within_limits"

    def test_both_out_of_limits_keeps_initial(self) -> None:
        draft, reason = _select_motivation_draft(
            initial_draft="A",
            initial_smell_score=_score(0.9),
            initial_within_limits=False,
            retry_draft="B",
            retry_smell_score=_score(0.1),
            retry_within_limits=False,
            char_min=CHAR_MIN,
            char_max=CHAR_MAX,
        )
        assert draft == "A"
        assert reason == "both_out_of_limits"


class TestBuildUserOriginFromConversation:
    def test_extracts_last_three_user_messages_in_chronological_order(self) -> None:
        history = [
            Message(role="assistant", content="Q1"),
            Message(role="user", content="A1"),
            Message(role="assistant", content="Q2"),
            Message(role="user", content="A2"),
            Message(role="assistant", content="Q3"),
            Message(role="user", content="A3"),
            Message(role="user", content="A4"),
        ]
        joined = _build_user_origin_from_conversation(history)
        # 直近 3 件 (A2, A3, A4) が chronological 順で含まれる
        assert joined == "A2\nA3\nA4"

    def test_skips_empty_user_messages(self) -> None:
        history = [
            Message(role="user", content=""),
            Message(role="user", content="   "),
            Message(role="user", content="実質回答"),
        ]
        joined = _build_user_origin_from_conversation(history)
        assert joined == "実質回答"

    def test_truncates_to_max_chars(self) -> None:
        long_text = "あ" * 2000
        history = [Message(role="user", content=long_text)]
        joined = _build_user_origin_from_conversation(history, max_chars=300)
        assert len(joined) == 300

    def test_returns_empty_string_when_no_user_messages(self) -> None:
        history = [
            Message(role="assistant", content="Q1"),
            Message(role="assistant", content="Q2"),
        ]
        joined = _build_user_origin_from_conversation(history)
        assert joined == ""


class TestMaybeRetryForAiSmellFailureModes:
    """B-2: retry_llm_failed と retry_empty_draft を区別してテレメトリに記録する."""

    @pytest.fixture(autouse=True)
    def _stub_ai_smell_helpers(self, monkeypatch: pytest.MonkeyPatch) -> None:
        # Tier 2 を必ず返してリトライ経路を踏ませる
        monkeypatch.setattr(
            "app.routers.motivation_retry._detect_ai_smell_patterns",
            lambda draft, origin: [],
        )
        monkeypatch.setattr(
            "app.routers.motivation_retry._compute_ai_smell_score",
            lambda warnings, template_type, char_max: {
                "score": 0.8,
                "tier": 2,
                "band": "high",
                "details": [],
            },
        )
        monkeypatch.setattr(
            "app.routers.motivation_retry._is_within_char_limits",
            lambda draft, lo, hi: (True, []),
        )
        monkeypatch.setattr(
            "app.routers.motivation_retry._build_ai_smell_retry_hints",
            lambda warnings: [],
        )

    @pytest.mark.asyncio
    async def test_retry_llm_failed_when_llm_call_fails(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        async def fake_call(**kwargs):
            return SimpleNamespace(
                success=False,
                data=None,
                raw_text=None,
                error=SimpleNamespace(message="rate limited"),
            )

        monkeypatch.setattr("app.routers.motivation_retry.call_llm_with_error", fake_call)

        draft, reason, telemetry = await _maybe_retry_for_ai_smell(
            initial_draft="initial",
            user_origin_text="origin",
            system_prompt="sys",
            user_prompt="user",
            char_min=280,
            char_max=400,
            max_tokens=1200,
        )

        assert draft == "initial"
        assert reason == "retry_llm_failed"
        assert telemetry["draft_selection_reason"] == "retry_llm_failed"
        assert telemetry["retry_llm_failed"] is True
        assert telemetry["retry_attempted"] is True
        assert telemetry["retry_within_limits"] is None

    @pytest.mark.asyncio
    async def test_retry_empty_draft_when_llm_returns_blank(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        async def fake_call(**kwargs):
            return SimpleNamespace(
                success=True,
                data={"draft": "   "},
                raw_text='{"draft":"   "}',
                error=None,
            )

        monkeypatch.setattr("app.routers.motivation_retry.call_llm_with_error", fake_call)

        draft, reason, telemetry = await _maybe_retry_for_ai_smell(
            initial_draft="initial",
            user_origin_text="origin",
            system_prompt="sys",
            user_prompt="user",
            char_min=280,
            char_max=400,
            max_tokens=1200,
        )

        assert draft == "initial"
        assert reason == "retry_empty_draft"
        assert telemetry["draft_selection_reason"] == "retry_empty_draft"
        assert telemetry["retry_llm_failed"] is False
        assert telemetry["retry_attempted"] is True
