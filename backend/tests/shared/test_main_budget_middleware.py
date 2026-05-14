from __future__ import annotations

from app.utils.llm_usage_cost import (
    get_remaining_llm_call_budget,
    reset_request_llm_call_budget,
    set_request_llm_call_budget,
    DEFAULT_LLM_CALL_BUDGET,
)


def test_budget_lifecycle_mirrors_middleware():
    """Verify the same init/reset pattern used in RequestIdMiddleware."""
    reset_request_llm_call_budget()
    assert get_remaining_llm_call_budget() is None

    set_request_llm_call_budget()
    assert get_remaining_llm_call_budget() == DEFAULT_LLM_CALL_BUDGET

    reset_request_llm_call_budget()
    assert get_remaining_llm_call_budget() is None
