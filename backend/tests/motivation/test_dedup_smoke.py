"""
Smoke tests verifying that motivation.py uses functions imported from
motivation_context and motivation_planner, not local shadow copies.

These tests guard against re-introducing duplicate definitions inside
motivation.py that would shadow the canonical implementations.
"""

from app.routers import motivation
from app.routers import motivation_context
from app.routers import motivation_planner
from app.routers import motivation_retry
from app.routers import motivation_validation


def test_motivation_uses_context_functions():
    """Verify motivation.py uses functions from motivation_context, not local copies."""
    assert motivation._normalize_conversation_context is motivation_context._normalize_conversation_context
    assert motivation._answer_is_confirmed_for_stage is motivation_context._answer_is_confirmed_for_stage
    assert motivation._normalize_slot_state is motivation_context._normalize_slot_state
    assert motivation._normalize_slot_status_v2 is motivation_context._normalize_slot_status_v2
    assert motivation._default_slot_states is motivation_context._default_slot_states


def test_motivation_uses_context_constants():
    """Verify motivation.py uses constants from motivation_context, not local copies."""
    assert motivation.CONVERSATION_MODE_SLOT_FILL is motivation_context.CONVERSATION_MODE_SLOT_FILL
    assert motivation.CONVERSATION_MODE_DEEPDIVE is motivation_context.CONVERSATION_MODE_DEEPDIVE
    assert motivation.SLOT_STATE_VALUES is motivation_context.SLOT_STATE_VALUES
    assert motivation.UNRESOLVED_PATTERNS is motivation_context.UNRESOLVED_PATTERNS
    assert motivation.CONTRADICTION_PATTERNS is motivation_context.CONTRADICTION_PATTERNS


def test_motivation_uses_planner_functions():
    """Verify motivation.py uses functions from motivation_planner, not local copies."""
    assert motivation._build_progress_payload is motivation_planner._build_progress_payload
    assert motivation._compute_deterministic_causal_gaps is motivation_planner._compute_deterministic_causal_gaps
    assert motivation._determine_next_turn is motivation_planner._determine_next_turn
    assert motivation._slot_label is motivation_planner._slot_label


def test_motivation_uses_planner_constants():
    """Verify motivation.py uses constants from motivation_planner, not local copies."""
    assert motivation.DEEPDIVE_INTENT_BY_GAP_ID is motivation_planner.DEEPDIVE_INTENT_BY_GAP_ID
    assert motivation.NEXT_ADVANCE_CONDITION_BY_SLOT is motivation_planner.NEXT_ADVANCE_CONDITION_BY_SLOT


def test_motivation_uses_retry_helpers():
    """Verify motivation.py uses extracted retry helpers, not local copies."""
    assert motivation._select_motivation_draft is motivation_retry._select_motivation_draft
    assert motivation._maybe_retry_for_ai_smell is motivation_retry._maybe_retry_for_ai_smell
    assert motivation._apply_multipass_refinement is motivation_retry._apply_multipass_refinement


def test_motivation_uses_validation_helpers():
    """Verify motivation.py uses extracted validation helpers for semantic dedup."""
    assert motivation._is_semantically_duplicate_question is motivation_validation._is_semantically_duplicate_question
