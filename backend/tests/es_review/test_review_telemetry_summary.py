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
                "rewrite_attempt_count": 2,
                "length_fix_attempted": False,
                "length_fix_result": "not_needed",
                "length_policy": "strict",
                "fallback_to_generic": False,
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
                "rewrite_attempt_count": 4,
                "length_fix_attempted": True,
                "length_fix_result": "strict_recovered",
                "length_policy": "soft_min_applied",
                "fallback_to_generic": True,
                "weak_evidence_notice": True,
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
    assert summary["length_fix_results"]["strict_recovered"] == 1
    assert summary["providers"] == {"openai": 1, "claude": 1}
    assert summary["quality_signals"] == {
        "length_fix_attempted": 1,
        "fallback_to_generic": 1,
        "weak_evidence_notice": 1,
        "soft_min_applied": 1,
    }
    assert summary["token_usage_totals"] == {
        "input_tokens": 210,
        "output_tokens": 75,
        "reasoning_tokens": 6,
        "cached_input_tokens": 20,
        "llm_call_count": 7,
        "structured_call_count": 2,
        "text_call_count": 5,
    }
