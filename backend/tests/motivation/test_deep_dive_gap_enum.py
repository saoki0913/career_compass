"""Regression test for E-3 (P3-5): DeepDiveGap enum unifies 3 namespaces.

既存ワイヤー文字列 (planner gap_id / API target_area / model weakness_tag) を
canonical enum で相互変換できることを保証する。既存の API/FE 契約は温存したまま、
境界層で normalize するための土台。
"""

from __future__ import annotations

import pytest

from app.routers.motivation_models import DeepDiveGap


GAP_ID_CASES = [
    ("company_reason_specificity", DeepDiveGap.COMPANY_REASON),
    ("self_connection_gap", DeepDiveGap.SELF_CONNECTION),
    ("role_reason_missing", DeepDiveGap.DESIRED_WORK),
    ("value_contribution_vague", DeepDiveGap.VALUE_CONTRIBUTION),
    ("differentiation_missing", DeepDiveGap.DIFFERENTIATION),
    ("why_now_missing", DeepDiveGap.WHY_NOW),
]

TARGET_AREA_CASES = [
    ("company_reason_strengthening", DeepDiveGap.COMPANY_REASON),
    ("origin_background", DeepDiveGap.SELF_CONNECTION),
    ("desired_work_clarity", DeepDiveGap.DESIRED_WORK),
    ("value_contribution_clarity", DeepDiveGap.VALUE_CONTRIBUTION),
    ("differentiation_strengthening", DeepDiveGap.DIFFERENTIATION),
    ("why_now_strengthening", DeepDiveGap.WHY_NOW),
]

WEAKNESS_TAG_CASES = [
    ("company_reason_generic", DeepDiveGap.COMPANY_REASON),
    ("self_connection_weak", DeepDiveGap.SELF_CONNECTION),
    ("desired_work_too_abstract", DeepDiveGap.DESIRED_WORK),
    ("value_contribution_vague", DeepDiveGap.VALUE_CONTRIBUTION),
    ("differentiation_missing", DeepDiveGap.DIFFERENTIATION),
    ("why_now_missing", DeepDiveGap.WHY_NOW),
]


class TestFromWireStrings:
    @pytest.mark.parametrize("wire,gap", GAP_ID_CASES)
    def test_from_gap_id(self, wire: str, gap: DeepDiveGap) -> None:
        assert DeepDiveGap.from_gap_id(wire) is gap

    @pytest.mark.parametrize("wire,gap", TARGET_AREA_CASES)
    def test_from_target_area(self, wire: str, gap: DeepDiveGap) -> None:
        assert DeepDiveGap.from_target_area(wire) is gap

    @pytest.mark.parametrize("wire,gap", WEAKNESS_TAG_CASES)
    def test_from_weakness_tag(self, wire: str, gap: DeepDiveGap) -> None:
        assert DeepDiveGap.from_weakness_tag(wire) is gap

    def test_unknown_string_returns_none(self) -> None:
        assert DeepDiveGap.from_gap_id("unknown_xyz") is None
        assert DeepDiveGap.from_target_area("unknown_xyz") is None
        assert DeepDiveGap.from_weakness_tag("unknown_xyz") is None

    def test_none_and_empty_return_none(self) -> None:
        assert DeepDiveGap.from_gap_id(None) is None
        assert DeepDiveGap.from_gap_id("") is None
        assert DeepDiveGap.from_gap_id("   ") is None


class TestToWireStrings:
    @pytest.mark.parametrize("wire,gap", GAP_ID_CASES)
    def test_roundtrip_gap_id(self, wire: str, gap: DeepDiveGap) -> None:
        assert gap.to_gap_id() == wire

    @pytest.mark.parametrize("wire,gap", TARGET_AREA_CASES)
    def test_roundtrip_target_area(self, wire: str, gap: DeepDiveGap) -> None:
        assert gap.to_target_area() == wire

    @pytest.mark.parametrize("wire,gap", WEAKNESS_TAG_CASES)
    def test_roundtrip_weakness_tag(self, wire: str, gap: DeepDiveGap) -> None:
        assert gap.to_weakness_tag() == wire


class TestCrossNamespaceConversion:
    @pytest.mark.parametrize(
        "gap_id,expected_weakness_tag",
        [
            ("company_reason_specificity", "company_reason_generic"),
            ("self_connection_gap", "self_connection_weak"),
            ("role_reason_missing", "desired_work_too_abstract"),
            ("differentiation_missing", "differentiation_missing"),
        ],
    )
    def test_gap_id_to_weakness_tag_via_enum(
        self, gap_id: str, expected_weakness_tag: str
    ) -> None:
        gap = DeepDiveGap.from_gap_id(gap_id)
        assert gap is not None
        assert gap.to_weakness_tag() == expected_weakness_tag

    @pytest.mark.parametrize(
        "target_area,expected_stage",
        [
            ("company_reason_strengthening", "company_reason"),
            ("origin_background", "self_connection"),
            ("desired_work_clarity", "desired_work"),
            ("value_contribution_clarity", "value_contribution"),
            ("differentiation_strengthening", "differentiation"),
            # why_now は company_reason 系として扱う（従来動作）
            ("why_now_strengthening", "company_reason"),
        ],
    )
    def test_target_area_to_stage_via_enum(
        self, target_area: str, expected_stage: str
    ) -> None:
        gap = DeepDiveGap.from_target_area(target_area)
        assert gap is not None
        assert gap.to_stage() == expected_stage


class TestFromStage:
    """E-3 code-review follow-up (C-1): stage 逆引きでも enum が取れる."""

    @pytest.mark.parametrize(
        "stage,gap",
        [
            ("company_reason", DeepDiveGap.COMPANY_REASON),
            ("self_connection", DeepDiveGap.SELF_CONNECTION),
            ("desired_work", DeepDiveGap.DESIRED_WORK),
            ("value_contribution", DeepDiveGap.VALUE_CONTRIBUTION),
            ("differentiation", DeepDiveGap.DIFFERENTIATION),
        ],
    )
    def test_from_stage_resolves_canonical(self, stage: str, gap: DeepDiveGap) -> None:
        assert DeepDiveGap.from_stage(stage) is gap

    def test_unknown_stage_returns_none(self) -> None:
        assert DeepDiveGap.from_stage("unknown") is None
        assert DeepDiveGap.from_stage(None) is None


class TestWiringIntoCallSites:
    """C-1: DeepDiveGap が実際に call site で使われていることを保証.

    このテストが壊れたら、enum が dead code 化していることを意味する。
    """

    def test_motivation_helpers_route_through_enum(self) -> None:
        from app.routers.motivation import (
            _deepdive_area_to_stage,
            _deepdive_area_to_weakness_tag,
            _infer_weakness_tag_from_eval,
        )

        # target_area → stage / weakness_tag は enum 経由
        assert _deepdive_area_to_stage("value_contribution_clarity") == (
            DeepDiveGap.VALUE_CONTRIBUTION.to_stage()
        )
        assert _deepdive_area_to_weakness_tag("desired_work_clarity") == (
            DeepDiveGap.DESIRED_WORK.to_weakness_tag()
        )
        # fallback もすべて enum の to_weakness_tag / to_stage で表現されている
        assert _deepdive_area_to_weakness_tag("unknown") == (
            DeepDiveGap.COMPANY_REASON.to_weakness_tag()
        )
        # draft_blockers → weakness_tag は from_stage 経由
        assert _infer_weakness_tag_from_eval({"draft_blockers": ["differentiation"]}) == (
            DeepDiveGap.DIFFERENTIATION.to_weakness_tag()
        )
        assert _infer_weakness_tag_from_eval({"draft_blockers": ["self_connection"]}) == (
            DeepDiveGap.SELF_CONNECTION.to_weakness_tag()
        )

    def test_planner_emits_gap_id_and_intent_via_enum(self) -> None:
        from app.routers.motivation_planner import (
            DEEPDIVE_INTENT_BY_GAP_ID,
            _compute_deterministic_causal_gaps,
        )

        # DEEPDIVE_INTENT_BY_GAP_ID の key はすべて enum 経由で構築されている
        assert DeepDiveGap.COMPANY_REASON.to_gap_id() in DEEPDIVE_INTENT_BY_GAP_ID
        assert DeepDiveGap.SELF_CONNECTION.to_gap_id() in DEEPDIVE_INTENT_BY_GAP_ID
        assert DeepDiveGap.DESIRED_WORK.to_gap_id() in DEEPDIVE_INTENT_BY_GAP_ID
        assert DeepDiveGap.VALUE_CONTRIBUTION.to_gap_id() in DEEPDIVE_INTENT_BY_GAP_ID
        assert DeepDiveGap.DIFFERENTIATION.to_gap_id() in DEEPDIVE_INTENT_BY_GAP_ID

        # differentiation が空 → differentiation_missing ギャップが生成される
        gaps = _compute_deterministic_causal_gaps(
            {
                "slotSummaries": {
                    "company_reason": "DX支援に惹かれる",
                    "self_connection": "経験がある",
                    "desired_work": "顧客に価値を出したい",
                    "value_contribution": "顧客へ価値貢献したい",
                    "differentiation": "",
                },
                "selectedIndustry": "IT",
            }
        )
        diff_gap = next(g for g in gaps if g["slot"] == DeepDiveGap.DIFFERENTIATION.to_stage())
        assert diff_gap["id"] == DeepDiveGap.DIFFERENTIATION.to_gap_id()
