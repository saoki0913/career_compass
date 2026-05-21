from __future__ import annotations

import pytest

from app.services.es_review.llm_validation import (
    LLM_VALIDATION_SCHEMA,
    _VALIDATION_SYSTEM_PROMPT,
    _validate_rewrite_with_llm,
)
from app.services.es_review.validation import _validate_rewrite_combined
from app.services.es_review.validation_profile import QUALITY_FIRST_PROFILE


def _passing_payload() -> dict:
    return {
        "conclusion_first": {"pass": True, "reason": ""},
        "company_grounding": {"pass": True, "reason": ""},
        "style_unity": {"pass": True, "reason": ""},
        "structure_clarity": {"pass": True, "reason": ""},
        "quality_blueprint_alignment": {"pass": True, "reason": ""},
        "fact_preservation": {"pass": True, "reason": ""},
        "expression_diversity": {"pass": True, "reason": ""},
        "theme_focus": {"pass": True, "reason": ""},
        "answer_completeness": {"pass": True, "reason": ""},
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


def test_validation_prompt_includes_expression_and_theme_axes() -> None:
    assert "expression_diversity" in _VALIDATION_SYSTEM_PROMPT
    assert "theme_focus" in _VALIDATION_SYSTEM_PROMPT
    assert "answer_completeness" in _VALIDATION_SYSTEM_PROMPT


def test_llm_validation_schema_has_answer_completeness() -> None:
    assert "answer_completeness" in LLM_VALIDATION_SCHEMA["properties"]
    assert "answer_completeness" in LLM_VALIDATION_SCHEMA["required"]


def test_llm_validation_schema_has_quality_blueprint_alignment() -> None:
    assert "quality_blueprint_alignment" in LLM_VALIDATION_SCHEMA["properties"]
    assert "quality_blueprint_alignment" in LLM_VALIDATION_SCHEMA["required"]


def test_validation_prompt_includes_quality_blueprint_axis() -> None:
    assert "quality_blueprint_alignment" in _VALIDATION_SYSTEM_PROMPT
    assert "QualityBlueprint" in _VALIDATION_SYSTEM_PROMPT
    assert "元回答の弱い順序や抽象表現" in _VALIDATION_SYSTEM_PROMPT


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
async def test_validate_rewrite_with_llm_collects_quality_blueprint_failure() -> None:
    async def fake_json_caller(**kwargs):
        assert "<quality_blueprint>" in kwargs["user_message"]
        assert "評価される核" in kwargs["user_message"]
        payload = _passing_payload()
        payload["quality_blueprint_alignment"] = {
            "pass": False,
            "reason": "根拠と貢献像が弱い",
        }
        return payload

    result = await _validate_rewrite_with_llm(
        "結論だけを書いた。",
        template_type="company_motivation",
        question="志望理由を教えてください。",
        user_answer="経験から志望した。",
        company_name="テスト社",
        grounding_mode="required",
        json_caller=fake_json_caller,
        quality_blueprint_summary="評価される核: 自分の経験と企業でなければならない理由をつなぐ。",
    )

    assert result.passed is False
    assert result.failed_checks == ["quality_blueprint_alignment"]
    assert result.retry_hint == "根拠と貢献像が弱い"


@pytest.mark.asyncio
async def test_validate_rewrite_with_llm_collects_answer_completeness_failure() -> None:
    async def fake_json_caller(**kwargs):
        payload = _passing_payload()
        payload["answer_completeness"] = {
            "pass": False,
            "reason": "結びが唐突",
        }
        return payload

    result = await _validate_rewrite_with_llm(
        "経験を生かし、貴社で",
        template_type="company_motivation",
        question="志望理由を教えてください。",
        user_answer="経験を生かしたい。",
        company_name="テスト社",
        grounding_mode="required",
        json_caller=fake_json_caller,
    )

    assert result.passed is False
    assert result.failed_checks == ["answer_completeness"]
    assert result.retry_hint == "結びが唐突"


@pytest.mark.asyncio
async def test_validate_rewrite_with_llm_fails_missing_required_axis() -> None:
    async def fake_json_caller(**kwargs):
        payload = _passing_payload()
        del payload["quality_blueprint_alignment"]
        return payload

    result = await _validate_rewrite_with_llm(
        "結論だけを書いた。",
        template_type="company_motivation",
        question="志望理由を教えてください。",
        user_answer="経験から志望した。",
        company_name="テスト社",
        grounding_mode="required",
        json_caller=fake_json_caller,
    )

    assert result.passed is False
    assert result.failed_checks == ["quality_blueprint_alignment"]
    assert "quality_blueprint_alignment を検証できませんでした" in result.retry_hint


@pytest.mark.asyncio
async def test_validate_rewrite_with_llm_treats_non_validation_payload_as_unavailable() -> None:
    async def fake_json_caller(**kwargs):
        return {"top3": [{"issue": "課題抽出用の応答"}]}

    result = await _validate_rewrite_with_llm(
        "結論だけを書いた。",
        template_type="company_motivation",
        question="志望理由を教えてください。",
        user_answer="経験から志望した。",
        company_name="テスト社",
        grounding_mode="required",
        json_caller=fake_json_caller,
        fail_open_on_error=False,
    )

    assert result.passed is False
    assert result.failed_checks == ["validation_unavailable"]
    assert result.validation_unavailable is True


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
async def test_validate_rewrite_combined_blocks_quality_blueprint_failure_on_final_attempt() -> None:
    async def fake_json_caller(**kwargs):
        payload = _passing_payload()
        payload["quality_blueprint_alignment"] = {
            "pass": False,
            "reason": "設問タイプの構成に沿っていない",
        }
        return payload

    accepted, code, reason, meta = await _validate_rewrite_combined(
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
        profile=QUALITY_FIRST_PROFILE,
    )

    assert accepted is None
    assert code == "llm_quality"
    assert reason == "設問タイプの構成に沿っていない"
    assert meta["llm_failed_checks"] == ["quality_blueprint_alignment"]


@pytest.mark.asyncio
async def test_quality_first_profile_treats_llm_fact_preservation_as_warning() -> None:
    async def fake_json_caller(**kwargs):
        payload = _passing_payload()
        payload["fact_preservation"] = {"pass": False, "reason": "表現上の差分"}
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
        is_final_attempt=False,
        profile=QUALITY_FIRST_PROFILE,
    )

    assert accepted == "売上を改善した。"
    assert code == "ok"
    assert reason == "ok"
    assert meta["llm_warned_checks"] == ["fact_preservation"]


@pytest.mark.asyncio
async def test_validate_rewrite_with_llm_returns_pass_on_caller_failure() -> None:
    async def exploding_caller(**kwargs):
        raise RuntimeError("LLM service unavailable")

    passed, failed, hint = await _validate_rewrite_with_llm(
        "テスト候補文。",
        template_type="basic",
        question="志望理由を教えてください。",
        user_answer="テスト候補文。",
        company_name=None,
        grounding_mode="none",
        json_caller=exploding_caller,
    )

    assert passed is True
    assert failed == []
    assert hint == ""


@pytest.mark.asyncio
async def test_validate_rewrite_with_llm_can_fail_closed_when_validation_unavailable() -> None:
    async def exploding_caller(**kwargs):
        raise RuntimeError("LLM service unavailable")

    result = await _validate_rewrite_with_llm(
        "テスト候補文。",
        template_type="basic",
        question="志望理由を教えてください。",
        user_answer="テスト候補文。",
        company_name=None,
        grounding_mode="none",
        json_caller=exploding_caller,
        fail_open_on_error=False,
    )

    assert result.passed is False
    assert result.failed_checks == ["validation_unavailable"]
    assert result.validation_unavailable is True


@pytest.mark.asyncio
async def test_validate_rewrite_combined_rejects_when_validation_unavailable() -> None:
    async def exploding_caller(**kwargs):
        raise RuntimeError("LLM service unavailable")

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
        json_caller=exploding_caller,
        is_final_attempt=True,
        profile=QUALITY_FIRST_PROFILE,
    )

    assert accepted is None
    assert code == "llm_quality"
    assert meta["llm_validation_unavailable"] is True


@pytest.mark.asyncio
async def test_validate_rewrite_combined_rejects_hard_fact_warning_even_when_fact_preservation_warn() -> None:
    async def fake_json_caller(**kwargs):
        payload = _passing_payload()
        payload["fact_preservation"] = {
            "pass": False,
            "reason": "元回答にない固有名詞が追加されています",
        }
        return payload

    accepted, code, reason, meta = await _validate_rewrite_combined(
        "経験を整理し、Pythonを使って改善した。",
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
        profile=QUALITY_FIRST_PROFILE,
    )

    assert accepted is None
    assert code == "hallucination"
    assert "元回答の事実" in reason
    assert any(
        warning["code"] == "proper_noun_fabrication"
        for warning in meta["hallucination_warnings"]
    )


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


@pytest.mark.asyncio
async def test_quality_first_profile_rejects_final_llm_quality_failure() -> None:
    async def fake_json_caller(**kwargs):
        payload = _passing_payload()
        payload["structure_clarity"] = {"pass": False, "reason": "重複がある"}
        return payload

    accepted, code, reason, meta = await _validate_rewrite_combined(
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
        profile=QUALITY_FIRST_PROFILE,
    )

    assert accepted is None
    assert code == "llm_quality"
    assert reason == "重複がある"
    assert meta["llm_failed_checks"] == ["structure_clarity"]


@pytest.mark.asyncio
async def test_validate_rewrite_combined_passes_fitted_text_to_llm_validation() -> None:
    captured_user_message = ""

    async def fake_json_caller(**kwargs):
        nonlocal captured_user_message
        captured_user_message = kwargs["user_message"]
        return _passing_payload()

    raw_candidate = (
        "私は課題を解決することができる。"
        "経験を活かすことができる。顧客価値を高めたい。"
    )

    accepted, code, reason, _meta = await _validate_rewrite_combined(
        raw_candidate,
        template_type="basic",
        question="志望理由を教えてください。",
        company_name=None,
        char_min=25,
        char_max=32,
        issues=[],
        role_name=None,
        grounding_mode="none",
        user_answer=raw_candidate,
        json_caller=fake_json_caller,
    )

    assert accepted is not None
    assert code == "ok"
    assert reason == "ok"
    rewritten_block = captured_user_message.split("<rewritten_text>", 1)[1].split(
        "</rewritten_text>",
        1,
    )[0]
    assert accepted in rewritten_block
    assert raw_candidate not in rewritten_block
