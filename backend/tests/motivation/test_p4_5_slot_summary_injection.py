"""P4-5: スロット要約構造化注入のユニットテスト.

`_build_slot_summary_section` がユーザーの確定済み回答を一次材料として
正しく整形し、空入力に対して安全に空文字を返すことを検証する。
"""

from __future__ import annotations

from app.routers.motivation import _build_slot_summary_section


class TestBuildSlotSummarySection:
    def test_empty_summaries_returns_empty(self) -> None:
        assert _build_slot_summary_section(None, None) == ""
        assert _build_slot_summary_section({}, {}) == ""

    def test_summaries_only_no_evidence(self) -> None:
        result = _build_slot_summary_section(
            {"industry_reason": "AI 業界に関心がある", "company_reason": None},
            None,
        )
        assert "【一次材料：骨格要約" in result
        assert "AI 業界に関心がある" in result
        # None の slot はスキップされる
        assert "company_reason" not in result

    def test_summaries_with_evidence(self) -> None:
        result = _build_slot_summary_section(
            {"company_reason": "御社のXに惹かれた"},
            {"company_reason": ["大学の授業でAIを研究した", "Xの取り組みに感動"]},
        )
        assert "御社のXに惹かれた" in result
        assert "根拠:" in result
        assert "大学の授業" in result

    def test_evidence_truncated_to_two(self) -> None:
        result = _build_slot_summary_section(
            {"company_reason": "x"},
            {"company_reason": ["a", "b", "c", "d"]},
        )
        # 最大 2 件のみ採用
        assert "a" in result and "b" in result
        assert "c" not in result and "d" not in result

    def test_only_summaries_with_value_are_emitted(self) -> None:
        """空文字や None の slot は本文行に出さない."""
        result = _build_slot_summary_section(
            {
                "industry_reason": "",
                "company_reason": "御社のDX支援に共感",
                "self_connection": None,
                "desired_work": "プロダクト企画",
            },
            None,
        )
        assert "御社のDX支援に共感" in result
        assert "プロダクト企画" in result
        # 空文字や None の stage label は本文行 ("- 業界志望理由:" など) として現れない
        assert "- 業界志望理由:" not in result
        assert "- 自分との接続:" not in result

    def test_stage_order_preserved(self) -> None:
        """REQUIRED_MOTIVATION_STAGES の順序で並ぶ."""
        result = _build_slot_summary_section(
            {
                "differentiation": "差別化A",
                "industry_reason": "業界B",
                "value_contribution": "貢献C",
            },
            None,
        )
        idx_industry = result.index("業界B")
        idx_value = result.index("貢献C")
        idx_diff = result.index("差別化A")
        # industry_reason → value_contribution → differentiation の順
        assert idx_industry < idx_value < idx_diff
