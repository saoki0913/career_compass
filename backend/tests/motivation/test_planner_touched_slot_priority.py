"""Tests for touched-slot priority in _determine_next_turn."""
from app.services.motivation.planner import _determine_next_turn


class TestTouchedSlotPriority:
    def test_prioritizes_touched_slot_over_fixed_order(self):
        context = {
            "conversationMode": "slot_fill",
            "slotStates": {
                "industry_reason": "empty",
                "company_reason": "empty",
                "self_connection": "empty",
                "desired_work": "empty",
                "value_contribution": "empty",
                "differentiation": "empty",
            },
            "lastUserAnswer": "入社後は営業企画に携わりたいです",
        }
        result = _determine_next_turn(context)
        assert result["target_slot"] == "desired_work"

    def test_falls_back_to_fixed_order_when_no_touched_slot(self):
        context = {
            "conversationMode": "slot_fill",
            "slotStates": {
                "industry_reason": "empty",
                "company_reason": "empty",
                "self_connection": "empty",
                "desired_work": "empty",
                "value_contribution": "empty",
                "differentiation": "empty",
            },
            "lastUserAnswer": "よろしくお願いします",
        }
        result = _determine_next_turn(context)
        assert result["target_slot"] == "industry_reason"

    def test_skips_locked_touched_slot(self):
        context = {
            "conversationMode": "slot_fill",
            "slotStates": {
                "industry_reason": "empty",
                "company_reason": "empty",
                "self_connection": "empty",
                "desired_work": "locked",
                "value_contribution": "empty",
                "differentiation": "empty",
            },
            "lastUserAnswer": "入社後は営業企画に携わりたいです",
        }
        result = _determine_next_turn(context)
        assert result["target_slot"] == "industry_reason"

    def test_no_last_answer_uses_fixed_order(self):
        context = {
            "conversationMode": "slot_fill",
            "slotStates": {
                "industry_reason": "locked",
                "company_reason": "empty",
                "self_connection": "empty",
                "desired_work": "empty",
                "value_contribution": "empty",
                "differentiation": "empty",
            },
        }
        result = _determine_next_turn(context)
        assert result["target_slot"] == "company_reason"
