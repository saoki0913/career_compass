"""Tests for ES review debug logging formatters.

Covers the three formatter functions in tracing.py which are called by
orchestrator.py when LIVE_ES_REVIEW_CAPTURE_DEBUG=1 (dev-only).
"""

from __future__ import annotations

from app.services.es_review.tracing import (
    _format_rewrite_attempt_input_block,
    _format_rewrite_attempt_output_block,
    _format_rewrite_loop_summary_block,
)


def _make_evidence_card(
    theme: str = "事業戦略",
    claim: str = "AIを活用した業務効率化に注力している",
    source_url: str = "https://www.example.co.jp/recruit",
) -> dict[str, str]:
    return {"theme": theme, "claim": claim, "source_url": source_url}


def _make_user_fact(
    source: str = "current_answer",
    text: str = "マーケティング研究会でチームリーダーとして10人を統括",
) -> dict[str, str]:
    return {"source": source, "text": text}


class TestFormatRewriteAttemptInputBlock:
    def test_first_attempt_includes_original_answer(self) -> None:
        result = _format_rewrite_attempt_input_block(
            attempt=0,
            total_attempts=3,
            template_type="company_motivation",
            focus_modes_serialized="normal",
            retry_plan_primary_code="generic",
            retry_plan_selected_codes=(),
            retry_plan_length_control_mode="default",
            retry_plan_shortfall_delta_band=None,
            retry_plan_guidance_items=(),
            target_window_lower=380,
            target_window_upper=400,
            char_min=350,
            char_max=400,
            original_answer="私は貴社のインターンに参加したい",
            selected_user_facts=[_make_user_fact()],
            selected_evidence_cards=[_make_evidence_card()],
            retry_hints=[],
            use_safe_rewrite=False,
            grounding_mode="company_general",
            company_grounding="assistive",
        )
        assert "ATTEMPT 1/3" in result
        assert "Original Answer" in result
        assert "私は貴社のインターンに参加したい" in result
        assert "company_motivation" in result

    def test_retry_attempt_omits_original_answer(self) -> None:
        result = _format_rewrite_attempt_input_block(
            attempt=1,
            total_attempts=3,
            template_type="company_motivation",
            focus_modes_serialized="length_focus_min",
            retry_plan_primary_code="under_min",
            retry_plan_selected_codes=("under_min",),
            retry_plan_length_control_mode="tight_length",
            retry_plan_shortfall_delta_band="small",
            retry_plan_guidance_items=("修飾句を1〜2箇所に加えて到達する",),
            target_window_lower=380,
            target_window_upper=400,
            char_min=350,
            char_max=400,
            original_answer="",
            selected_user_facts=[_make_user_fact()],
            selected_evidence_cards=[_make_evidence_card()],
            retry_hints=["文字数制約を満たしていません"],
            use_safe_rewrite=False,
            grounding_mode="company_general",
            company_grounding="assistive",
        )
        assert "ATTEMPT 2/3" in result
        assert "Original Answer" not in result
        assert "under_min" in result
        assert "tight_length" in result
        assert "small" in result
        assert "文字数制約を満たしていません" in result

    def test_evidence_cards_formatted(self) -> None:
        cards = [
            _make_evidence_card(theme="企業理解", claim="若手社員が主体的にプロジェクトをリード"),
            _make_evidence_card(theme="成長機会", claim="海外拠点での研修制度が充実", source_url="https://corp.example.com/career"),
        ]
        result = _format_rewrite_attempt_input_block(
            attempt=0,
            total_attempts=3,
            template_type="intern_reason",
            focus_modes_serialized="normal",
            retry_plan_primary_code="generic",
            retry_plan_selected_codes=(),
            retry_plan_length_control_mode="default",
            retry_plan_shortfall_delta_band=None,
            retry_plan_guidance_items=(),
            target_window_lower=None,
            target_window_upper=None,
            char_min=200,
            char_max=400,
            original_answer="テスト回答",
            selected_user_facts=[],
            selected_evidence_cards=cards,
            retry_hints=[],
            use_safe_rewrite=False,
            grounding_mode="company_general",
            company_grounding="required",
        )
        assert "evidence_cards=2" in result
        assert "example.co.jp" in result
        assert "corp.example.com" in result

    def test_user_facts_formatted(self) -> None:
        facts = [
            _make_user_fact(source="gakuchika_summary", text="統計分析の基礎を学んだ"),
            _make_user_fact(source="profile", text="理工学部 情報学科"),
        ]
        result = _format_rewrite_attempt_input_block(
            attempt=0,
            total_attempts=3,
            template_type="company_motivation",
            focus_modes_serialized="normal",
            retry_plan_primary_code="generic",
            retry_plan_selected_codes=(),
            retry_plan_length_control_mode="default",
            retry_plan_shortfall_delta_band=None,
            retry_plan_guidance_items=(),
            target_window_lower=None,
            target_window_upper=None,
            char_min=200,
            char_max=400,
            original_answer="テスト",
            selected_user_facts=facts,
            selected_evidence_cards=[],
            retry_hints=[],
            use_safe_rewrite=False,
            grounding_mode="none",
            company_grounding="assistive",
        )
        assert "user_facts=2" in result
        assert "gakuchika_summary" in result
        assert "profile" in result

    def test_empty_cards_and_facts_show_zero_counts(self) -> None:
        result = _format_rewrite_attempt_input_block(
            attempt=0,
            total_attempts=3,
            template_type="self_pr",
            focus_modes_serialized="normal",
            retry_plan_primary_code="generic",
            retry_plan_selected_codes=(),
            retry_plan_length_control_mode="default",
            retry_plan_shortfall_delta_band=None,
            retry_plan_guidance_items=(),
            target_window_lower=None,
            target_window_upper=None,
            char_min=200,
            char_max=400,
            original_answer="テスト",
            selected_user_facts=[],
            selected_evidence_cards=[],
            retry_hints=[],
            use_safe_rewrite=False,
            grounding_mode="none",
            company_grounding="assistive",
        )
        assert "evidence_cards=0" in result
        assert "user_facts=0" in result

    def test_long_text_truncated(self) -> None:
        long_answer = "あ" * 600
        result = _format_rewrite_attempt_input_block(
            attempt=0,
            total_attempts=3,
            template_type="company_motivation",
            focus_modes_serialized="normal",
            retry_plan_primary_code="generic",
            retry_plan_selected_codes=(),
            retry_plan_length_control_mode="default",
            retry_plan_shortfall_delta_band=None,
            retry_plan_guidance_items=(),
            target_window_lower=None,
            target_window_upper=None,
            char_min=200,
            char_max=400,
            original_answer=long_answer,
            selected_user_facts=[],
            selected_evidence_cards=[],
            retry_hints=[],
            use_safe_rewrite=False,
            grounding_mode="none",
            company_grounding="assistive",
        )
        assert "(truncated)" in result
        assert long_answer not in result

    def test_safe_rewrite_flag_shown(self) -> None:
        result = _format_rewrite_attempt_input_block(
            attempt=2,
            total_attempts=3,
            template_type="company_motivation",
            focus_modes_serialized="length_focus_min",
            retry_plan_primary_code="under_min",
            retry_plan_selected_codes=(),
            retry_plan_length_control_mode="default",
            retry_plan_shortfall_delta_band=None,
            retry_plan_guidance_items=(),
            target_window_lower=None,
            target_window_upper=None,
            char_min=200,
            char_max=400,
            original_answer="",
            selected_user_facts=[],
            selected_evidence_cards=[],
            retry_hints=[],
            use_safe_rewrite=True,
            grounding_mode="none",
            company_grounding="assistive",
        )
        assert "safe_rewrite=True" in result


class TestFormatRewriteAttemptOutputBlock:
    def test_accepted_output(self) -> None:
        result = _format_rewrite_attempt_output_block(
            attempt=0,
            total_attempts=3,
            template_type="company_motivation",
            candidate="改善されたES回答テキスト",
            accepted=True,
            retry_code="",
            failure_codes=[],
            focus_modes_serialized="normal",
            gen_chars=205,
            fit_chars=200,
            target_lower=380,
            target_upper=400,
            llm_failed_checks=[],
            llm_warned_checks=[],
            retry_reason="",
        )
        assert "OUTPUT" in result
        assert "accepted=✓" in result
        assert "gen_chars=205" in result
        assert "fit_chars=200" in result
        assert "改善されたES回答テキスト" in result
        assert "company_motivation" in result

    def test_rejected_output_shows_reason(self) -> None:
        result = _format_rewrite_attempt_output_block(
            attempt=0,
            total_attempts=3,
            template_type="intern_reason",
            candidate="短いテキスト",
            accepted=False,
            retry_code="under_min",
            failure_codes=["under_min"],
            focus_modes_serialized="normal",
            gen_chars=50,
            fit_chars=50,
            target_lower=180,
            target_upper=200,
            llm_failed_checks=["length_check"],
            llm_warned_checks=["style_check"],
            retry_reason="文字数制約を満たしていません。現在50字",
        )
        assert "accepted=✗" in result
        assert "under_min" in result
        assert "length_check" in result
        assert "style_check" in result
        assert "文字数制約を満たしていません" in result

    def test_empty_checks_handled(self) -> None:
        result = _format_rewrite_attempt_output_block(
            attempt=1,
            total_attempts=3,
            template_type="self_pr",
            candidate="テスト",
            accepted=True,
            retry_code="",
            failure_codes=[],
            focus_modes_serialized="length_focus_max",
            gen_chars=100,
            fit_chars=100,
            target_lower=None,
            target_upper=None,
            llm_failed_checks=[],
            llm_warned_checks=[],
            retry_reason="",
        )
        assert "OUTPUT" in result
        assert "accepted=✓" in result


class TestFormatRewriteLoopSummaryBlock:
    def test_success_summary(self) -> None:
        result = _format_rewrite_loop_summary_block(
            template_type="company_motivation",
            total_attempts=3,
            executed_attempts=1,
            accepted_attempt=1,
            final_rewrite_chars=388,
            best_effort_adopted=False,
            best_effort_codes=[],
            safe_rewrite_triggered=False,
        )
        assert "SUMMARY" in result
        assert "winner=attempt 1" in result
        assert "chars(post-fit)=388" in result

    def test_best_effort_summary(self) -> None:
        result = _format_rewrite_loop_summary_block(
            template_type="company_motivation",
            total_attempts=3,
            executed_attempts=3,
            accepted_attempt=None,
            final_rewrite_chars=382,
            best_effort_adopted=True,
            best_effort_codes=["under_min"],
            safe_rewrite_triggered=False,
        )
        assert "best_effort" in result
        assert "under_min" in result

    def test_safe_rewrite_summary(self) -> None:
        result = _format_rewrite_loop_summary_block(
            template_type="intern_reason",
            total_attempts=3,
            executed_attempts=2,
            accepted_attempt=2,
            final_rewrite_chars=350,
            best_effort_adopted=False,
            best_effort_codes=[],
            safe_rewrite_triggered=True,
        )
        assert "safe_rewrite=True" in result

    def test_total_failure_summary(self) -> None:
        result = _format_rewrite_loop_summary_block(
            template_type="self_pr",
            total_attempts=3,
            executed_attempts=3,
            accepted_attempt=None,
            final_rewrite_chars=0,
            best_effort_adopted=False,
            best_effort_codes=[],
            safe_rewrite_triggered=False,
        )
        assert "winner=none" in result
