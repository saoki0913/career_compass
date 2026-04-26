"""Unit tests for motivation retry helper taxonomy and hint generation."""

from __future__ import annotations

from app.routers.motivation_retry import (
    _build_draft_quality_retry_hints,
    _build_question_retry_hint,
    _classify_question_failure_code,
    _collect_draft_quality_failure_codes,
)


def test_classify_question_failure_code_returns_targeted_reason() -> None:
    report = {"fallback_used": True, "fallback_reason": "duplicate_text"}
    assert _classify_question_failure_code(report) == "duplicate_text"


def test_classify_question_failure_code_ignores_non_retryable_reason() -> None:
    report = {"fallback_used": True, "fallback_reason": "instruction_copy"}
    assert _classify_question_failure_code(report) is None


def test_build_question_retry_hint_for_missing_keyword() -> None:
    hint = _build_question_retry_hint(
        "missing_keyword",
        stage="desired_work",
        company_name="株式会社テスト",
    )
    assert hint is not None
    assert "やりたい仕事" in hint


def test_build_question_retry_hint_for_duplicate_semantic() -> None:
    hint = _build_question_retry_hint(
        "duplicate_semantic",
        stage="company_reason",
        company_name="株式会社テスト",
    )
    assert hint is not None
    assert "別の角度" in hint


def test_collect_draft_quality_failure_codes_detects_multiple_issues() -> None:
    failure_codes, smell_score, within_limits = _collect_draft_quality_failure_codes(
        draft_text="抽象的な志望動機です。",
        user_origin_text="具体的な原体験があります。",
        template_type="company_motivation",
        char_min=40,
        char_max=50,
        anchor_keywords=["DX支援"],
    )

    assert "under_char_min" in failure_codes
    assert "missing_company_keywords" in failure_codes
    assert isinstance(smell_score, dict)
    assert within_limits is False


def test_build_draft_quality_retry_hints_covers_char_ai_and_company_codes() -> None:
    hints = _build_draft_quality_retry_hints(
        failure_codes=[
            "under_char_min",
            "ai_smell_high",
            "missing_company_keywords",
        ],
        ai_warnings=[{"code": "repetitive_ending", "detail": "〜したい"}],
        anchor_keywords=["DX支援", "業務改革"],
        char_min=270,
        char_max=300,
    )

    joined = "\n".join(hints)
    assert "270字以上" in joined
    assert "DX支援" in joined
    assert "文末表現" in joined


def test_maybe_retry_for_draft_quality_accepts_max_attempts_and_extra_hints() -> None:
    """Verify the function signature accepts the new parameters."""
    import asyncio
    from app.routers.motivation_retry import _maybe_retry_for_draft_quality

    async def _run() -> None:
        draft, smell, codes, telem = await _maybe_retry_for_draft_quality(
            initial_draft="私は御社の企業理念に共感し、DX推進に貢献したいと考��ています。具体的には、前職での業務改善経験を活かし、現場の課題解決に取り組みたいです。",
            user_origin_text="私はDX推進に関心があります。",
            template_type="company_motivation",
            char_min=50,
            char_max=300,
            anchor_keywords=["DX推進"],
            max_attempts=3,
            extra_hints=["前回生成済みドラフトからの改善を優先"],
            retry_prompt_builder=lambda hints: ("system", "user"),
            llm_call_fn=lambda s, u: asyncio.coroutine(lambda: None)(),
        )
        assert isinstance(telem, dict)

    asyncio.run(_run())
