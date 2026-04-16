"""Regression test for E-1 (P3-3): expanded unresolved / contradiction patterns."""

from __future__ import annotations

import pytest

from app.routers.motivation_context import (
    _answer_signals_contradiction,
    _answer_signals_unresolved,
)


class TestUnresolvedPatterns:
    """新しく追加された未整理パターンが検出される."""

    @pytest.mark.parametrize(
        "text",
        [
            "正直よくわからないです",
            "あまりピンと来ないというか…",
            "まだ漠然としているので整理できていません",
            "今は考え中ですね",
            # 既存パターンの回帰
            "まだ整理できていないと思います",
            "まだわからないです",
        ],
    )
    def test_unresolved_detected(self, text: str) -> None:
        assert _answer_signals_unresolved(text)

    @pytest.mark.parametrize(
        "text",
        [
            "顧客課題に向き合いたいからです",
            "",
            "DX支援を通じて成長したい",
        ],
    )
    def test_unresolved_not_detected_in_clear_answers(self, text: str) -> None:
        assert not _answer_signals_unresolved(text)


class TestContradictionPatterns:
    """新しく追加された撤回/言い直しパターンが検出される."""

    @pytest.mark.parametrize(
        "text",
        [
            "前の答えは違って、本当はこっちです",
            "さっきのは撤回します",
            "実は、また別の軸もあって",
            "考え直すと、違う話になるかもしれません",
            # 既存パターンの回帰
            "ではなく、もう少し違う角度です",
            "訂正するとこう言いたかったです",
        ],
    )
    def test_contradiction_detected(self, text: str) -> None:
        assert _answer_signals_contradiction(text)

    @pytest.mark.parametrize(
        "text",
        [
            "そのままの気持ちです",
            "",
            "顧客との接点が魅力です",
        ],
    )
    def test_contradiction_not_detected_in_coherent_answers(self, text: str) -> None:
        assert not _answer_signals_contradiction(text)
