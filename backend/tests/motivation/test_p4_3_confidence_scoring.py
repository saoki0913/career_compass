"""P4-3: slot_status confidence scoring + low-confidence downgrade tests.

評価プロンプト出力 (`_evaluate_motivation_internal`) の slot_status を
{"state": ..., "confidence": ...} 形式に拡張したことに対する単体テスト。

検証項目:
- dict 形式の高信頼度 filled_strong は維持される
- dict 形式の低信頼度 filled / filled_strong は partial にダウングレードされる
- partial / missing は confidence によらずそのまま
- 旧 flat 文字列形式は後方互換で受理される (confidence=1.0 デフォルト)
- 不正な confidence 値 / confidence 欠損は 1.0 にフォールバック
"""

from __future__ import annotations

import pytest

from app.routers.motivation import _normalize_slot_status_with_confidence


class TestNormalizeSlotStatusWithConfidence:
    def test_dict_high_confidence_filled_strong_kept(self):
        states, confs = _normalize_slot_status_with_confidence({
            "industry_reason": {"state": "filled_strong", "confidence": 0.9}
        })
        assert states["industry_reason"] == "filled_strong"
        assert confs["industry_reason"] == pytest.approx(0.9)

    def test_dict_low_confidence_filled_strong_downgraded_to_partial(self):
        states, confs = _normalize_slot_status_with_confidence({
            "industry_reason": {"state": "filled_strong", "confidence": 0.4}
        })
        assert states["industry_reason"] == "partial"
        assert confs["industry_reason"] == pytest.approx(0.4)

    def test_dict_low_confidence_filled_weak_downgraded_to_partial(self):
        # 旧 "filled" 文字列も legacy 入力として ducktype 対象。
        states, _ = _normalize_slot_status_with_confidence({
            "industry_reason": {"state": "filled", "confidence": 0.5}
        })
        assert states["industry_reason"] == "partial"

    def test_dict_partial_state_unchanged_regardless_of_confidence(self):
        states, _ = _normalize_slot_status_with_confidence({
            "industry_reason": {"state": "partial", "confidence": 0.3}
        })
        assert states["industry_reason"] == "partial"

    def test_dict_missing_state_unchanged_regardless_of_confidence(self):
        states, _ = _normalize_slot_status_with_confidence({
            "industry_reason": {"state": "missing", "confidence": 0.1}
        })
        assert states["industry_reason"] == "missing"

    def test_string_form_backward_compatible_filled_to_filled_strong(self):
        states, confs = _normalize_slot_status_with_confidence({
            "industry_reason": "filled"
        })
        assert states["industry_reason"] == "filled_strong"  # _normalize_slot_state による正規化
        assert confs["industry_reason"] == 1.0  # default

    def test_string_form_backward_compatible_filled_strong(self):
        states, confs = _normalize_slot_status_with_confidence({
            "company_reason": "filled_strong"
        })
        assert states["company_reason"] == "filled_strong"
        assert confs["company_reason"] == 1.0

    def test_invalid_confidence_defaults_to_one(self):
        states, confs = _normalize_slot_status_with_confidence({
            "industry_reason": {"state": "filled_strong", "confidence": "invalid"}
        })
        assert confs["industry_reason"] == 1.0
        assert states["industry_reason"] == "filled_strong"

    def test_missing_confidence_defaults_to_one(self):
        states, confs = _normalize_slot_status_with_confidence({
            "industry_reason": {"state": "filled_strong"}
        })
        assert confs["industry_reason"] == 1.0
        assert states["industry_reason"] == "filled_strong"

    def test_threshold_boundary_06_kept(self):
        """confidence == 0.6 はダウングレード対象外 (< 0.6 のみダウングレード)."""
        states, _ = _normalize_slot_status_with_confidence({
            "industry_reason": {"state": "filled_strong", "confidence": 0.6}
        })
        assert states["industry_reason"] == "filled_strong"

    def test_threshold_boundary_just_below_06_downgraded(self):
        states, _ = _normalize_slot_status_with_confidence({
            "industry_reason": {"state": "filled_strong", "confidence": 0.59}
        })
        assert states["industry_reason"] == "partial"

    def test_filled_weak_with_low_confidence_not_downgraded(self):
        """filled_weak は意図的にダウングレード対象外 (P4-3 仕様)."""
        states, _ = _normalize_slot_status_with_confidence({
            "industry_reason": {"state": "filled_weak", "confidence": 0.3}
        })
        assert states["industry_reason"] == "filled_weak"

    def test_empty_input_returns_empty_dicts(self):
        states, confs = _normalize_slot_status_with_confidence({})
        assert states == {}
        assert confs == {}

    def test_none_input_returns_empty_dicts(self):
        states, confs = _normalize_slot_status_with_confidence(None)
        assert states == {}
        assert confs == {}

    def test_unknown_state_normalized_to_missing(self):
        states, _ = _normalize_slot_status_with_confidence({
            "industry_reason": {"state": "garbage", "confidence": 0.9}
        })
        # _normalize_slot_state で unknown は missing に倒される
        assert states["industry_reason"] == "missing"

    def test_multiple_slots_independent(self):
        states, confs = _normalize_slot_status_with_confidence({
            "industry_reason": {"state": "filled_strong", "confidence": 0.9},
            "company_reason": {"state": "filled_strong", "confidence": 0.4},
            "self_connection": "partial",  # legacy string
            "desired_work": {"state": "missing", "confidence": 0.0},
        })
        assert states["industry_reason"] == "filled_strong"
        assert states["company_reason"] == "partial"  # downgraded
        assert states["self_connection"] == "partial"
        assert states["desired_work"] == "missing"
        assert confs["industry_reason"] == pytest.approx(0.9)
        assert confs["company_reason"] == pytest.approx(0.4)
        assert confs["self_connection"] == 1.0  # legacy default
        assert confs["desired_work"] == pytest.approx(0.0)
