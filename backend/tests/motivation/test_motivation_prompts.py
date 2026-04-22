"""Unit tests for motivation prompt templates.

Covers:
- P1-3 / A-1: `slot_summaries_section` variable is wired into the evaluation prompt
- P2-1 / P2-2 / P2-3: deepdive few-shot, slot completeness rubric, skeleton-slot mapping
- P2-7 / C-1: positive instruction for RAG-grounded question phrasing lands in all 3 fallbacks
- P2-9 / C-2: 3-line persona shipped to MOTIVATION_QUESTION_PROMPT
"""

from __future__ import annotations

from app.prompts.motivation_prompts import (
    MOTIVATION_DEEPDIVE_QUESTION_PROMPT,
    MOTIVATION_EVALUATION_PROMPT,
    MOTIVATION_QUESTION_PROMPT,
    _MOTIVATION_DEEPDIVE_QUESTION_PROMPT_FALLBACK,
    _MOTIVATION_EVALUATION_PROMPT_FALLBACK,
    _MOTIVATION_QUESTION_PROMPT_FALLBACK,
)


class TestSlotSummariesSectionWiring:
    """A-1: slot_summaries_section が motivation.evaluation に到達する."""

    def test_placeholder_exists_in_python_fallback(self) -> None:
        assert "{slot_summaries_section}" in MOTIVATION_EVALUATION_PROMPT

    def test_evaluation_prompt_format_injects_summary(self) -> None:
        """format() で slot_summaries_section が本文に展開されることを確認."""
        summary = "- 業界志望理由: 金融×テクノロジーの交差点に関心\n- 企業志望理由: DX支援実績"
        rendered = MOTIVATION_EVALUATION_PROMPT.format(
            conversation="Q: ...\nA: ...",
            company_name="株式会社テスト",
            industry="金融",
            selected_role_line="- 志望職種: エンジニア",
            company_context="企業情報サンプル",
            slot_summaries_section=summary,
        )
        assert summary in rendered, "slot_summaries_section が rendered prompt に注入されていない"
        # 隣接セクション見出しも損なわれていないこと
        assert "## 確認済みスロット要約" in rendered


class TestPositiveGroundingInstruction:
    """C-1 / P2-7: RAG 固有名詞の参照を肯定形で許可するルールが 3 つの prompt fallback に届く."""

    def test_positive_instruction_in_all_python_fallbacks(self) -> None:
        for fallback in (
            _MOTIVATION_EVALUATION_PROMPT_FALLBACK,
            _MOTIVATION_QUESTION_PROMPT_FALLBACK,
            _MOTIVATION_DEEPDIVE_QUESTION_PROMPT_FALLBACK,
        ):
            assert "Woven City" in fallback
            assert "のような取り組み" in fallback

    def test_woven_city_example_present_in_active_prompts(self) -> None:
        for prompt in (
            MOTIVATION_EVALUATION_PROMPT,
            MOTIVATION_QUESTION_PROMPT,
            MOTIVATION_DEEPDIVE_QUESTION_PROMPT,
        ):
            assert "Woven City" in prompt
            assert "のような取り組み" in prompt


class TestQuestionPersonaThreeLine:
    """C-2 / P2-9: motivation.question の冒頭ペルソナを 3 行化する."""

    _PERSONA_LINES = (
        "あなたは就活生の志望動機づくりをサポートするアドバイザーです。",
        "相手は志望理由をまだうまく言葉にできていない学生です。",
        "1問ずつ短く聞いて、学生自身の言葉で材料を引き出してください。",
    )

    def test_python_fallback_has_three_line_persona(self) -> None:
        for line in self._PERSONA_LINES:
            assert line in _MOTIVATION_QUESTION_PROMPT_FALLBACK

    def test_active_prompt_starts_with_three_line_persona(self) -> None:
        head = "\n".join(MOTIVATION_QUESTION_PROMPT.splitlines()[:3])
        for line in self._PERSONA_LINES:
            assert line in head, f"ペルソナが prompt 冒頭にない: {line!r}\n先頭3行:\n{head}"

    def test_old_single_line_persona_removed(self) -> None:
        """旧 1 行ペルソナがそのまま残っていないこと."""
        legacy = (
            "あなたは就活生向けの志望動機作成アドバイザーです。"
            "会話履歴と企業情報を読み、"
        )
        assert legacy not in MOTIVATION_QUESTION_PROMPT, "旧 1 行ペルソナが削除されていない"


class TestDeepDiveFewShotExamples:
    """Phase 2: 深掘り質問の few-shot 例が prompt に入る."""

    def test_deepdive_prompt_contains_good_and_bad_examples(self) -> None:
        prompt = MOTIVATION_DEEPDIVE_QUESTION_PROMPT
        assert "## 質問の良い例・悪い例" in prompt
        assert "### 例1: company_reason_strengthening" in prompt
        assert "良い質問: 「アジア展開の中でも" in prompt
        assert "悪い質問: 「もう少し詳しく教えてください」" in prompt
        assert "### 例3: differentiation_strengthening" in prompt
        assert "悪い質問: 「なぜ他社を選ばないのですか」" in prompt


class TestCompletenessAndSkeletonGuidance:
    """Phase 2: 6要素判定基準と4部構造→スロット対応が prompt に入る."""

    def test_slot_completeness_rules_include_four_state_examples(self) -> None:
        prompt = MOTIVATION_EVALUATION_PROMPT
        assert "filled_strong" in prompt
        assert "filled_weak" in prompt
        assert "partial" in prompt
        assert "Woven City" in prompt
        assert "グローバルに展開している点が魅力" in prompt
        assert "知名度がある" in prompt

    def test_question_prompt_includes_structure_to_slot_mapping(self) -> None:
        prompt = MOTIVATION_QUESTION_PROMPT
        assert "## 志望動機ドラフトの基本構成と6スロットの対応" in prompt
        assert "冒頭15% → industry_reason + company_reason" in prompt
        assert "企業理解25% → company_reason + differentiation" in prompt
        assert "自己接点35% → self_connection + desired_work" in prompt
        assert "締め25% → value_contribution" in prompt
