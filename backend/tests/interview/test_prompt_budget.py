"""
backend/tests/interview/test_prompt_budget.py

Phase 2 Stage 1-6: Hot path prompt token budget regression test.

全 24 固定ケースに対して、5 builder のプロンプトトークン数が hot path budget 内に
収まっていることを CI で毎回検証する。

予算 (Stage 1 の目標 + INTERVIEWER_COMMON_RULES 追加分):
  plan      ≤ 1,200
  opening   ≤ 2,100
  turn p95  ≤ 2,600   (代用: 24 ケース全体の max)
  continue  ≤ 1,900   (代用: 24 ケース全体の max)
  feedback  ≤ 2,800

将来のプロンプト追加時、このテストが fail すれば Stage 1 で達成した
token 最適化の回帰を即時検出できる。
"""

from __future__ import annotations

from typing import Any

import pytest

from tests.interview.harness.evaluator import collect_prompt_tokens
from tests.interview.harness.fixtures import HARNESS_CASES

# Phase 3 quality hot path budget.
# Phase 2 Stage 1 baseline に Phase 3 quality 改善分を加算:
#   - GROUNDING_CORE: +seed 活用指示 2 行 (全 builder に影響)
#   - SCORING_RUBRIC: +軸別 3 点 anchor 7 行 (feedback のみ)
#   - mixed_panel ペルソナ: +ターン回転指示 1 行 (interviewer=mixed_panel 時のみ)
# 更新時は plan v4 §1-1 のテーブルと docs/review/TRACKER.md の interview エントリを更新する。
BUDGETS: dict[str, int] = {
    "plan": 1_300,
    "opening": 2_300,
    "turn": 2_850,
    "continue": 2_150,
    "feedback": 3_150,
}


@pytest.mark.parametrize(
    "case",
    HARNESS_CASES,
    ids=[f"case_{c['case_id']}" for c in HARNESS_CASES],
)
def test_prompt_budget_hot_path(case: dict[str, Any]) -> None:
    """全 24 ケースの 5 builder が Stage 1 hot path budget 内に収まる。

    Hard gate: CI でこのテストが fail すれば新規プロンプト追加を再検討する。
    """
    tokens = collect_prompt_tokens(case)
    violations: list[str] = []
    for builder, count in tokens.items():
        budget = BUDGETS.get(builder)
        if budget is None:
            continue
        if count > budget:
            violations.append(
                f"{builder}={count} tokens > budget {budget} (over by {count - budget})"
            )

    assert not violations, (
        f"Case {case['case_id']} ({case['description']}) budget violations:\n"
        + "\n".join(f"  - {v}" for v in violations)
    )
