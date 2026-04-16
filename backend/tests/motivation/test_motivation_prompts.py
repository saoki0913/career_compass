"""Unit tests for motivation prompt templates and managed prompt registry.

Covers:
- P1-3 / A-1: `slot_summaries_section` variable is wired into `motivation.evaluation`
- P2-7 / C-1: positive instruction for RAG-grounded question phrasing lands in all 3 keys
- P2-9 / C-2: 3-line persona shipped to `motivation.question`
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.prompts.motivation_prompts import (
    MOTIVATION_DEEPDIVE_QUESTION_PROMPT,
    MOTIVATION_EVALUATION_PROMPT,
    MOTIVATION_QUESTION_PROMPT,
)

REPO_ROOT = Path(__file__).resolve().parents[3]
GENERATED_PROMPTS_PATH = REPO_ROOT / "backend" / "app" / "prompts" / "generated" / "notion_prompts.json"


@pytest.fixture(scope="module")
def generated_prompts() -> dict:
    with open(GENERATED_PROMPTS_PATH, encoding="utf-8") as f:
        return json.load(f)


class TestSlotSummariesSectionWiring:
    """A-1: slot_summaries_section が motivation.evaluation に到達する."""

    def test_variable_listed_in_managed_prompt(self, generated_prompts: dict) -> None:
        variables = generated_prompts["motivation.evaluation"]["variables"]
        assert "slot_summaries_section" in variables, (
            "motivation.evaluation variables に slot_summaries_section が未登録。"
            " str.format() で silent drop される。"
        )

    def test_placeholder_exists_in_content(self, generated_prompts: dict) -> None:
        content = generated_prompts["motivation.evaluation"]["content"]
        assert "{slot_summaries_section}" in content, (
            "motivation.evaluation content に {slot_summaries_section} プレースホルダが不在。"
        )

    def test_placeholder_exists_in_python_fallback(self) -> None:
        # Python fallback でも同じ variable を参照していること
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
    """C-1 / P2-7: RAG 固有名詞の参照を肯定形で許可するルールが 3 つの managed prompt に届く."""

    MOTIVATION_KEYS = (
        "motivation.evaluation",
        "motivation.question",
        "motivation.deepdive_question",
    )

    def test_woven_city_example_present_in_all_managed_prompts(self, generated_prompts: dict) -> None:
        for key in self.MOTIVATION_KEYS:
            content = generated_prompts[key]["content"]
            assert "Woven City" in content, (
                f"{key} に肯定形グラウンディング例 (Woven City) が同期されていない。"
                f" Notion 側の本文更新と --apply による再同期が必要。"
            )

    def test_positive_form_instruction_present_in_all_managed_prompts(self, generated_prompts: dict) -> None:
        for key in self.MOTIVATION_KEYS:
            content = generated_prompts[key]["content"]
            # 「〜について」形式を許可する肯定指示が存在する
            assert "のような取り組み" in content, (
                f"{key} に肯定形の質問例「〜のような取り組み」が含まれていない"
            )

    def test_positive_instruction_also_in_python_fallback(self) -> None:
        """`.py` fallback 側にも新ルールが入っていること（Notion 削除時のセーフティネット）."""
        # evaluation/question/deepdive_question すべて同じ _GROUNDING_AND_SAFETY_RULES を参照するため
        # 代表として 2 種を確認
        from app.prompts.motivation_prompts import (
            _MOTIVATION_EVALUATION_PROMPT_FALLBACK,
            _MOTIVATION_QUESTION_PROMPT_FALLBACK,
            _MOTIVATION_DEEPDIVE_QUESTION_PROMPT_FALLBACK,
        )
        for fallback in (
            _MOTIVATION_EVALUATION_PROMPT_FALLBACK,
            _MOTIVATION_QUESTION_PROMPT_FALLBACK,
            _MOTIVATION_DEEPDIVE_QUESTION_PROMPT_FALLBACK,
        ):
            assert "Woven City" in fallback
            assert "のような取り組み" in fallback


class TestQuestionPersonaThreeLine:
    """C-2 / P2-9: motivation.question の冒頭ペルソナを 3 行化する."""

    _PERSONA_LINES = (
        "あなたは就活生の志望動機づくりをサポートするアドバイザーです。",
        "相手は志望理由をまだうまく言葉にできていない学生です。",
        "1問ずつ短く聞いて、学生自身の言葉で材料を引き出してください。",
    )

    def test_managed_prompt_starts_with_three_line_persona(self, generated_prompts: dict) -> None:
        content = generated_prompts["motivation.question"]["content"]
        for line in self._PERSONA_LINES:
            assert line in content, f"motivation.question に新ペルソナ行が見当たらない: {line!r}"
        # 先頭 3 行が上記 3 行であることを確認（ペルソナが別セクションに埋没していない）
        head = "\n".join(content.splitlines()[:3])
        for line in self._PERSONA_LINES:
            assert line in head, f"ペルソナが prompt 冒頭にない: {line!r}\n先頭3行:\n{head}"

    def test_python_fallback_has_three_line_persona(self) -> None:
        from app.prompts.motivation_prompts import _MOTIVATION_QUESTION_PROMPT_FALLBACK
        for line in self._PERSONA_LINES:
            assert line in _MOTIVATION_QUESTION_PROMPT_FALLBACK

    def test_old_single_line_persona_removed(self, generated_prompts: dict) -> None:
        """旧 1 行ペルソナがそのまま残っていないこと."""
        content = generated_prompts["motivation.question"]["content"]
        legacy = (
            "あなたは就活生向けの志望動機作成アドバイザーです。"
            "会話履歴と企業情報を読み、"
        )
        assert legacy not in content, "旧 1 行ペルソナが削除されていない"
