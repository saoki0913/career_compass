from __future__ import annotations

import importlib.util
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[3] / "scripts" / "es-review" / "summarize_review_telemetry.py"
SPEC = importlib.util.spec_from_file_location("summarize_review_telemetry", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def test_summarize_review_meta_records_reports_retry_quality_and_token_usage() -> None:
    summary = MODULE.summarize_review_meta_records(
        [
            {
                "llm_provider": "openai",
                "llm_model": "gpt-5.4",
                "length_profile_id": "openai_gpt5:medium:default",
                "length_failure_code": "under_min",
                "rewrite_attempt_count": 2,
                "length_fix_attempted": False,
                "length_fix_result": "not_needed",
                "length_policy": "strict",
                "weak_evidence_notice": False,
                "token_usage": {
                    "input_tokens": 120,
                    "output_tokens": 40,
                    "reasoning_tokens": 6,
                    "cached_input_tokens": 20,
                    "llm_call_count": 3,
                    "structured_call_count": 1,
                    "text_call_count": 2,
                },
            },
            {
                "llm_provider": "claude",
                "llm_model": "claude-sonnet-4-6",
                "length_profile_id": "anthropic_claude:long:recovery",
                "length_failure_code": "soft_ok",
                "rewrite_attempt_count": 4,
                "length_fix_attempted": True,
                "length_fix_result": "soft_recovered",
                "length_policy": "soft_ok",
                "weak_evidence_notice": True,
                "rewrite_validation_status": "soft_ok",
                "fallback_triggered": True,
                "fallback_reason": "under_min",
                "misclassification_recovery_applied": True,
                "token_usage": {
                    "input_tokens": 90,
                    "output_tokens": 35,
                    "reasoning_tokens": 0,
                    "cached_input_tokens": 0,
                    "llm_call_count": 4,
                    "structured_call_count": 1,
                    "text_call_count": 3,
                },
            },
        ]
    )

    assert summary["total_reviews"] == 2
    assert summary["retry_distribution"] == {"2": 1, "4": 1}
    assert summary["average_rewrite_attempts"] == 3.0
    assert summary["length_fix_results"]["soft_recovered"] == 1
    assert summary["providers"] == {"openai": 1, "claude": 1}
    assert summary["length_profiles"] == {
        "openai_gpt5:medium:default": 1,
        "anthropic_claude:long:recovery": 1,
    }
    assert summary["length_failure_codes"] == {
        "under_min": 1,
        "soft_ok": 1,
    }
    assert summary["quality_signals"] == {
        "length_fix_attempted": 1,
        "weak_evidence_notice": 1,
        "soft_ok": 1,
        "soft_recovered": 1,
        "fallback_triggered": 1,
        "misclassification_recovery_applied": 1,
    }
    assert summary["fallback_reasons"] == {"under_min": 1}
    assert summary["token_usage_totals"] == {
        "input_tokens": 210,
        "output_tokens": 75,
        "reasoning_tokens": 6,
        "cached_input_tokens": 20,
        "llm_call_count": 7,
        "structured_call_count": 2,
        "text_call_count": 5,
    }
