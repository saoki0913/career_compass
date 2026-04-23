from __future__ import annotations

import json
from pathlib import Path

from tests.conversation.conversation_runner import (
    _GAKUCHIKA_EMERGENCY_FALLBACK,
    build_deterministic_gakuchika_followup,
)


_CASES_PATH = Path(__file__).resolve().parents[3] / "tests" / "ai_eval" / "gakuchika_cases.json"
_EXTENDED_CASE_IDS = {
    "gakuchika_quantitative_outcome",
    "gakuchika_process_over_result",
    "gakuchika_retail_shift_coordination",
    "gakuchika_engineering_team_latency",
    "gakuchika_volunteer_outreach",
    "gakuchika_research_lab_reproducibility",
}
_SMOKE_REQUIRED_GROUPS = {
    "gakuchika_scope_and_role": [["課題", "きっかけ"], ["役割", "担当"], ["結果", "変化"]],
    "gakuchika_team_conflict": [["対立", "状況"], ["役割", "担当"], ["合意", "結果"]],
}
_FORBIDDEN_JUKU_TERMS = ("塾", "生徒", "宿題", "保護者", "学習", "校舎", "授業")


def _load_cases() -> list[dict[str, object]]:
    return json.loads(_CASES_PATH.read_text())


def test_build_deterministic_gakuchika_followup_prefers_case_answers_even_when_short() -> None:
    case_answers = [
        "大学祭の準備で確認漏れが起きやすい状況でした。",
        "私は進行表の更新役を担っていました。",
        "更新タイミングを固定して共有しました。",
    ]

    answer = build_deterministic_gakuchika_followup(
        next_question="役割や担当を教えてください。",
        attempt_index=0,
        latest_complete=None,
        case_answers=case_answers,
    )

    assert answer == case_answers[1]
    assert answer not in _GAKUCHIKA_EMERGENCY_FALLBACK


def test_extended_gakuchika_cases_define_eight_domain_specific_answers() -> None:
    cases = {case["id"]: case for case in _load_cases()}

    for case_id in _EXTENDED_CASE_IDS:
        answers = cases[case_id]["answers"]

        assert isinstance(answers, list)
        assert len(answers) == 8, case_id
        for answer in answers:
            assert isinstance(answer, str)
            assert 30 <= len(answer) <= 80, (case_id, answer, len(answer))
            assert not any(term in answer for term in _FORBIDDEN_JUKU_TERMS), (case_id, answer)


def test_smoke_gakuchika_cases_define_required_question_token_groups() -> None:
    cases = {case["id"]: case for case in _load_cases()}

    for case_id, expected_groups in _SMOKE_REQUIRED_GROUPS.items():
        assert cases[case_id].get("requiredQuestionTokenGroups") == expected_groups
