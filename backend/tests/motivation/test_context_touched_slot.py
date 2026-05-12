"""Tests for detect_touched_slot in context.py."""
from app.services.motivation.context import detect_touched_slot


class TestDetectTouchedSlot:
    def test_detects_industry_reason(self):
        assert detect_touched_slot("IT業界に興味がある理由は成長性です") == "industry_reason"

    def test_detects_company_reason(self):
        assert detect_touched_slot("御社の企業理念に共感しています") == "company_reason"

    def test_detects_self_connection(self):
        assert detect_touched_slot("大学でのゼミ活動がきっかけで関心を持ちました") == "self_connection"

    def test_detects_desired_work(self):
        assert detect_touched_slot("入社後は営業企画に携わりたいです") == "desired_work"

    def test_detects_value_contribution(self):
        assert detect_touched_slot("自分のスキルで顧客に価値を提供できると考えています") == "value_contribution"

    def test_detects_differentiation(self):
        assert detect_touched_slot("他社と比べて独自の技術力があります") == "differentiation"

    def test_returns_none_for_unrecognized(self):
        assert detect_touched_slot("よろしくお願いします") is None

    def test_returns_none_for_empty(self):
        assert detect_touched_slot("") is None
