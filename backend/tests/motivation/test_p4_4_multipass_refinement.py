"""P4-4: マルチパス精錬パイプラインのユニットテスト.

3 軸 (AI 臭 / 企業固有性 / 結論先行) で initial draft を検証し、必要なら 1 回限りの
修正パスを起動するロジックを検証する。
"""

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.routers.motivation import (
    _CONCLUSION_KEYWORDS,
    _apply_multipass_refinement,
    _build_multipass_refinement_hints,
    _check_conclusion_first,
    _extract_company_anchor_keywords,
)


# ---------------------------------------------------------------------------
# _extract_company_anchor_keywords
# ---------------------------------------------------------------------------


class TestExtractCompanyAnchorKeywords:
    def test_evidence_card_titles_added(self) -> None:
        kws = _extract_company_anchor_keywords(
            company_context="",
            company_sources=None,
            evidence_cards=[{"title": "Woven City", "excerpt": "未来都市"}],
        )
        assert "Woven City" in kws

    def test_long_titles_skipped(self) -> None:
        kws = _extract_company_anchor_keywords(
            company_context="",
            company_sources=None,
            evidence_cards=[{"title": "あ" * 50, "excerpt": "x"}],
        )
        # 30 文字超の title は採用されない
        assert "あ" * 50 not in kws

    def test_empty_inputs_returns_empty(self) -> None:
        assert _extract_company_anchor_keywords("", None, None) == []

    def test_max_items_respected(self) -> None:
        cards = [{"title": f"Card{i}", "excerpt": "x"} for i in range(10)]
        kws = _extract_company_anchor_keywords(
            company_context="",
            company_sources=None,
            evidence_cards=cards,
            max_items=3,
        )
        assert len(kws) <= 3

    def test_dedup(self) -> None:
        kws = _extract_company_anchor_keywords(
            company_context="",
            company_sources=None,
            evidence_cards=[
                {"title": "Same", "excerpt": "x"},
                {"title": "Same", "excerpt": "y"},
            ],
        )
        assert kws.count("Same") == 1


# ---------------------------------------------------------------------------
# _check_conclusion_first
# ---------------------------------------------------------------------------


class TestCheckConclusionFirst:
    def test_starts_with_志望(self) -> None:
        assert _check_conclusion_first("貴社を志望する理由は、") is True

    def test_starts_with_したい(self) -> None:
        assert _check_conclusion_first("私はAI開発に挑戦したいと考えています。") is True

    def test_starts_with_惹か(self) -> None:
        assert _check_conclusion_first("貴社の事業に深く惹かれました。") is True

    def test_starts_with_background_no_keyword(self) -> None:
        assert _check_conclusion_first("私は学生時代に研究をしておりました。") is False

    def test_empty_returns_false(self) -> None:
        assert _check_conclusion_first("") is False
        assert _check_conclusion_first(None) is False  # type: ignore[arg-type]

    def test_keyword_after_head_chars_not_counted(self) -> None:
        long_intro = "あ" * 100 + "志望"
        assert _check_conclusion_first(long_intro, head_chars=80) is False

    def test_all_conclusion_keywords_recognized(self) -> None:
        for kw in _CONCLUSION_KEYWORDS:
            assert _check_conclusion_first(f"冒頭に{kw}が含まれる文章。") is True


# ---------------------------------------------------------------------------
# _build_multipass_refinement_hints
# ---------------------------------------------------------------------------


class TestBuildMultipassRefinementHints:
    def test_no_issues_no_hints(self) -> None:
        hints = _build_multipass_refinement_hints(
            ai_smell_tier=0,
            ai_warnings=[],
            needs_company_specificity=False,
            anchor_keywords=[],
            needs_conclusion_first=False,
        )
        assert hints == []

    def test_company_specificity_hint_includes_keywords(self) -> None:
        hints = _build_multipass_refinement_hints(
            ai_smell_tier=0,
            ai_warnings=[],
            needs_company_specificity=True,
            anchor_keywords=["Woven City", "AI for X", "未来都市"],
            needs_conclusion_first=False,
        )
        joined = "\n".join(hints)
        assert "Woven City" in joined or "AI for X" in joined

    def test_company_specificity_skipped_when_no_keywords(self) -> None:
        hints = _build_multipass_refinement_hints(
            ai_smell_tier=0,
            ai_warnings=[],
            needs_company_specificity=True,
            anchor_keywords=[],
            needs_conclusion_first=False,
        )
        assert hints == []

    def test_conclusion_first_hint(self) -> None:
        hints = _build_multipass_refinement_hints(
            ai_smell_tier=0,
            ai_warnings=[],
            needs_company_specificity=False,
            anchor_keywords=[],
            needs_conclusion_first=True,
        )
        joined = "\n".join(hints)
        assert "結論" in joined or "冒頭" in joined

    def test_ai_smell_tier_below_two_skips(self) -> None:
        hints = _build_multipass_refinement_hints(
            ai_smell_tier=1,
            ai_warnings=[{"code": "x", "detail": "y"}],
            needs_company_specificity=False,
            anchor_keywords=[],
            needs_conclusion_first=False,
        )
        # Tier < 2 では AI 臭ヒントは追加されない
        assert hints == []


# ---------------------------------------------------------------------------
# _apply_multipass_refinement
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestApplyMultipassRefinement:
    async def test_flag_off_skips_refinement(self) -> None:
        settings = MagicMock(motivation_multipass_refinement=False)
        llm_fn = AsyncMock()
        final, tel = await _apply_multipass_refinement(
            initial_draft="背景から始まる長い文章",
            initial_smell_score={"tier": 3, "score": 5.0, "warnings": []},
            initial_within_limits=True,
            company_context="company",
            company_sources=None,
            evidence_cards=None,
            user_origin_text="orig",
            char_min=300,
            char_max=400,
            template_type="company_motivation",
            base_system_prompt="base",
            llm_call_fn=llm_fn,
            settings=settings,
        )
        assert tel["refinement_attempted"] is False
        assert final == "背景から始まる長い文章"
        llm_fn.assert_not_called()

    async def test_no_issues_skips_refinement(self) -> None:
        settings = MagicMock(motivation_multipass_refinement=True)
        llm_fn = AsyncMock()
        # 結論先行 + 企業固有名 + AI 臭低 → 3 軸全て OK
        good_draft = "貴社のWoven Cityに惹かれ志望します。" * 5
        final, tel = await _apply_multipass_refinement(
            initial_draft=good_draft,
            initial_smell_score={"tier": 0, "score": 1.0, "warnings": []},
            initial_within_limits=True,
            company_context="トヨタ Woven City",
            company_sources=None,
            evidence_cards=[{"title": "Woven City", "excerpt": "未来都市"}],
            user_origin_text="原文",
            char_min=300,
            char_max=400,
            template_type="company_motivation",
            base_system_prompt="base",
            llm_call_fn=llm_fn,
            settings=settings,
        )
        assert tel["refinement_attempted"] is False
        assert final == good_draft
        llm_fn.assert_not_called()

    async def test_high_smell_tier_triggers_refinement(self) -> None:
        settings = MagicMock(motivation_multipass_refinement=True)
        # 結論先行 + 企業固有名を含む refined draft
        refined = "貴社のWoven Cityに惹かれ志望します。" * 8
        llm_fn = AsyncMock(return_value=refined)
        final, tel = await _apply_multipass_refinement(
            initial_draft="背景から始まる長い文章" * 10,
            initial_smell_score={
                "tier": 2,
                "score": 4.5,
                "warnings": [{"code": "x", "detail": "y"}],
            },
            initial_within_limits=True,
            company_context="トヨタ Woven City",
            company_sources=None,
            evidence_cards=[{"title": "Woven City", "excerpt": "未来都市"}],
            user_origin_text="orig",
            char_min=100,
            char_max=400,
            template_type="company_motivation",
            base_system_prompt="base",
            llm_call_fn=llm_fn,
            settings=settings,
        )
        assert tel["refinement_attempted"] is True
        assert "ai_smell_tier_high" in tel["refinement_reasons"]
        llm_fn.assert_called_once()

    async def test_missing_company_specificity_triggers_refinement(self) -> None:
        settings = MagicMock(motivation_multipass_refinement=True)
        # initial には企業固有名なし。冒頭 "志望" もなし
        # refined を返さなくてよい (LLM mock は呼ばれるか確認するだけ)
        llm_fn = AsyncMock(return_value="貴社のWoven Cityに志望します。" * 8)
        final, tel = await _apply_multipass_refinement(
            initial_draft="一般的な文章で固有名なし。" * 10,
            initial_smell_score={"tier": 0, "score": 1.0, "warnings": []},
            initial_within_limits=True,
            company_context="company",
            company_sources=None,
            evidence_cards=[{"title": "Woven City", "excerpt": "x"}],
            user_origin_text="orig",
            char_min=100,
            char_max=400,
            template_type="company_motivation",
            base_system_prompt="base",
            llm_call_fn=llm_fn,
            settings=settings,
        )
        assert tel["refinement_attempted"] is True
        assert "missing_company_specificity" in tel["refinement_reasons"]

    async def test_no_conclusion_first_triggers_refinement(self) -> None:
        settings = MagicMock(motivation_multipass_refinement=True)
        llm_fn = AsyncMock(return_value="貴社を志望します。" * 30)
        # 冒頭に結論キーワードなし、企業固有名はあり、AI 臭低
        final, tel = await _apply_multipass_refinement(
            initial_draft="これは背景の説明である。トヨタについて。" * 5,
            initial_smell_score={"tier": 0, "score": 1.0, "warnings": []},
            initial_within_limits=True,
            company_context="トヨタ",
            company_sources=None,
            evidence_cards=[{"title": "トヨタ", "excerpt": "x"}],
            user_origin_text="orig",
            char_min=100,
            char_max=400,
            template_type="company_motivation",
            base_system_prompt="base",
            llm_call_fn=llm_fn,
            settings=settings,
        )
        assert tel["refinement_attempted"] is True
        assert "no_conclusion_first" in tel["refinement_reasons"]

    async def test_refined_out_of_limits_falls_back_to_initial(self) -> None:
        settings = MagicMock(motivation_multipass_refinement=True)
        llm_fn = AsyncMock(return_value="短い")  # 字数不足
        initial = "背景から始まる" * 30
        final, tel = await _apply_multipass_refinement(
            initial_draft=initial,
            initial_smell_score={"tier": 2, "score": 4.0, "warnings": []},
            initial_within_limits=True,
            company_context="company",
            company_sources=None,
            evidence_cards=[{"title": "X", "excerpt": "x"}],
            user_origin_text="orig",
            char_min=100,
            char_max=400,
            template_type="company_motivation",
            base_system_prompt="base",
            llm_call_fn=llm_fn,
            settings=settings,
        )
        assert tel["refinement_attempted"] is True
        assert tel["refinement_adopted"] is False
        assert final == initial

    async def test_refined_adopted_when_score_acceptable(self) -> None:
        """refinement が起動して、refined draft が許容スコア内なら採用される。"""
        settings = MagicMock(motivation_multipass_refinement=True)
        # initial: 結論先行なし → reasons に no_conclusion_first
        # refined: 結論先行あり、AI 臭低
        refined_clean = "貴社を志望します。トヨタ自動車のWoven Cityに惹かれた。" * 5
        llm_fn = AsyncMock(return_value=refined_clean)
        final, tel = await _apply_multipass_refinement(
            initial_draft="背景として研究を行い、" * 20,
            initial_smell_score={
                "tier": 0,
                "score": 1.0,
                "warnings": [],
            },
            initial_within_limits=True,
            company_context="トヨタ Woven City",
            company_sources=None,
            evidence_cards=[{"title": "Woven City", "excerpt": "未来都市"}],
            user_origin_text="orig",
            char_min=100,
            char_max=10000,
            template_type="company_motivation",
            base_system_prompt="base",
            llm_call_fn=llm_fn,
            settings=settings,
        )
        assert tel["refinement_attempted"] is True
        # refined draft は結論先行 + 企業固有名あり + AI 臭低 → 採用される
        assert tel["refinement_adopted"] is True
        assert "貴社" in final

    async def test_llm_failure_returns_initial(self) -> None:
        settings = MagicMock(motivation_multipass_refinement=True)
        llm_fn = AsyncMock(side_effect=RuntimeError("LLM down"))
        initial = "背景の文章" * 30
        final, tel = await _apply_multipass_refinement(
            initial_draft=initial,
            initial_smell_score={"tier": 2, "score": 4.0, "warnings": []},
            initial_within_limits=True,
            company_context="トヨタ",
            company_sources=None,
            evidence_cards=[{"title": "X", "excerpt": "x"}],
            user_origin_text="orig",
            char_min=100,
            char_max=400,
            template_type="company_motivation",
            base_system_prompt="base",
            llm_call_fn=llm_fn,
            settings=settings,
        )
        assert tel["refinement_attempted"] is True
        assert tel["refinement_adopted"] is False
        assert final == initial

    async def test_telemetry_includes_latency_when_attempted(self) -> None:
        settings = MagicMock(motivation_multipass_refinement=True)
        llm_fn = AsyncMock(return_value="貴社を志望します。" * 30)
        _, tel = await _apply_multipass_refinement(
            initial_draft="背景文章" * 30,
            initial_smell_score={"tier": 2, "score": 4.0, "warnings": []},
            initial_within_limits=True,
            company_context="トヨタ",
            company_sources=None,
            evidence_cards=[{"title": "トヨタ", "excerpt": "x"}],
            user_origin_text="orig",
            char_min=100,
            char_max=400,
            template_type="company_motivation",
            base_system_prompt="base",
            llm_call_fn=llm_fn,
            settings=settings,
        )
        assert tel["refinement_attempted"] is True
        assert "refinement_latency_ms" in tel
        assert isinstance(tel["refinement_latency_ms"], float)
