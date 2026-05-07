from __future__ import annotations

import pytest

from app.services.es_review.llm_validation import (
    _VALIDATION_SYSTEM_PROMPT,
    _validate_rewrite_with_llm,
)
from app.services.es_review.validation import _validate_rewrite_combined


def _passing_payload() -> dict:
    return {
        "conclusion_first": {"pass": True, "reason": ""},
        "company_grounding": {"pass": True, "reason": ""},
        "style_unity": {"pass": True, "reason": ""},
        "structure_clarity": {"pass": True, "reason": ""},
        "fact_preservation": {"pass": True, "reason": ""},
    }


def test_fact_preservation_allows_structural_improvement() -> None:
    assert "構造改善" in _VALIDATION_SYSTEM_PROMPT
    assert "pass=true" in _VALIDATION_SYSTEM_PROMPT
    assert "行動の具体化" in _VALIDATION_SYSTEM_PROMPT
    assert "論理接続の補強" in _VALIDATION_SYSTEM_PROMPT


def test_fact_preservation_still_blocks_fabrication() -> None:
    assert "数値の追加" in _VALIDATION_SYSTEM_PROMPT
    assert "固有名詞" in _VALIDATION_SYSTEM_PROMPT
    assert "経験や出来事の創作" in _VALIDATION_SYSTEM_PROMPT


@pytest.mark.asyncio
async def test_validate_rewrite_with_llm_collects_failed_checks_and_hints() -> None:
    async def fake_json_caller(**kwargs):
        assert kwargs["feature"] == "es_review_validation"
        assert kwargs["response_format"] == "json_object"
        payload = _passing_payload()
        payload["conclusion_first"] = {"pass": False, "reason": "冒頭が背景説明"}
        payload["style_unity"] = {"pass": False, "reason": "ですます混在"}
        return payload

    passed, failed, hint = await _validate_rewrite_with_llm(
        "背景から始まります。改善したいです。",
        template_type="basic",
        question="志望理由を教えてください。",
        user_answer="改善したい。",
        company_name=None,
        grounding_mode="none",
        json_caller=fake_json_caller,
    )

    assert passed is False
    assert failed == ["conclusion_first", "style_unity"]
    assert hint == "冒頭が背景説明。ですます混在"


@pytest.mark.asyncio
async def test_validate_rewrite_combined_blocks_fact_preservation_failure() -> None:
    async def fake_json_caller(**kwargs):
        payload = _passing_payload()
        payload["fact_preservation"] = {"pass": False, "reason": "元にない数値"}
        return payload

    accepted, code, reason, meta = await _validate_rewrite_combined(
        "売上を改善した。",
        template_type="basic",
        question="経験を教えてください。",
        company_name=None,
        char_min=5,
        char_max=80,
        issues=[],
        role_name=None,
        grounding_mode="none",
        user_answer="売上を改善した。",
        json_caller=fake_json_caller,
        is_final_attempt=True,
    )

    assert accepted is None
    assert code == "fact_preservation"
    assert reason == "元にない数値"
    assert meta["llm_failed_checks"] == ["fact_preservation"]


@pytest.mark.asyncio
async def test_validate_rewrite_combined_lenient_final_pass_for_non_fact_failure() -> None:
    async def fake_json_caller(**kwargs):
        payload = _passing_payload()
        payload["structure_clarity"] = {"pass": False, "reason": "重複がある"}
        return payload

    accepted, code, _, meta = await _validate_rewrite_combined(
        "経験を整理し、改善した。",
        template_type="basic",
        question="経験を教えてください。",
        company_name=None,
        char_min=5,
        char_max=80,
        issues=[],
        role_name=None,
        grounding_mode="none",
        user_answer="経験を整理し、改善した。",
        json_caller=fake_json_caller,
        is_final_attempt=True,
    )

    assert accepted == "経験を整理し、改善した。"
    assert code == "ok"
    assert meta["llm_lenient_pass"] is True
