from __future__ import annotations

import pytest

from app.utils.llm_usage_cost import (
    DEFAULT_LLM_CALL_BUDGET,
    FEATURE_LLM_CALL_BUDGETS,
    check_and_decrement_llm_call_budget,
    get_remaining_llm_call_budget,
    reset_request_llm_call_budget,
    set_request_llm_call_budget,
)


@pytest.fixture(autouse=True)
def _reset_budget():
    reset_request_llm_call_budget()
    yield
    reset_request_llm_call_budget()


def test_no_budget_set_returns_none():
    assert check_and_decrement_llm_call_budget() is None
    assert get_remaining_llm_call_budget() is None


def test_explicit_budget():
    set_request_llm_call_budget(budget=3)
    assert get_remaining_llm_call_budget() == 3
    assert check_and_decrement_llm_call_budget() is None
    assert get_remaining_llm_call_budget() == 2


def test_budget_exceeded_at_zero():
    set_request_llm_call_budget(budget=1)
    assert check_and_decrement_llm_call_budget() is None
    assert get_remaining_llm_call_budget() == 0
    assert check_and_decrement_llm_call_budget() == "budget_exceeded"


def test_zero_budget_always_exceeded():
    set_request_llm_call_budget(budget=0)
    assert check_and_decrement_llm_call_budget() == "budget_exceeded"


def test_feature_budget_es_review():
    set_request_llm_call_budget(feature="es_review")
    assert get_remaining_llm_call_budget() == FEATURE_LLM_CALL_BUDGETS["es_review"]


def test_feature_budget_gakuchika():
    set_request_llm_call_budget(feature="gakuchika")
    assert get_remaining_llm_call_budget() == FEATURE_LLM_CALL_BUDGETS["gakuchika"]


def test_default_budget_for_unknown_feature():
    set_request_llm_call_budget(feature="nonexistent_feature")
    assert get_remaining_llm_call_budget() == DEFAULT_LLM_CALL_BUDGET


def test_default_budget_no_args():
    set_request_llm_call_budget()
    assert get_remaining_llm_call_budget() == DEFAULT_LLM_CALL_BUDGET


def test_reset_clears_budget():
    set_request_llm_call_budget(budget=5)
    reset_request_llm_call_budget()
    assert get_remaining_llm_call_budget() is None


def test_budget_type_is_literal():
    set_request_llm_call_budget(budget=0)
    result = check_and_decrement_llm_call_budget()
    assert result == "budget_exceeded"
