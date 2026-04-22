"""Tests for question quality evaluator."""

import pytest

from app.evaluators.question_quality import (
    _check_prohibited_patterns,
    _check_question_diversity,
    _evaluate_question_quality,
)


class TestProhibitedPatterns:
    def test_clean_question_no_violations(self):
        q = "その状況で、どのような役割を担っていましたか？"
        assert _check_prohibited_patterns(q) == []

    def test_template_expression_detected(self):
        q = "御社への志望動機を教えてください"
        violations = _check_prohibited_patterns(q)
        assert "就活テンプレ表現" in violations

    def test_evaluative_expression_detected(self):
        q = "素晴らしい経験ですね、他には？"
        violations = _check_prohibited_patterns(q)
        assert "評価的表現" in violations

    def test_json_leak_detected(self):
        q = '{"focus_key": "role", "question": "test"}'
        violations = _check_prohibited_patterns(q)
        assert "コード・JSON漏れ" in violations

    def test_multiple_questions_detected(self):
        q = "いつですか？どこですか？"
        violations = _check_prohibited_patterns(q)
        assert "複数質問" in violations

    def test_short_question_detected(self):
        q = "はい"
        violations = _check_prohibited_patterns(q)
        assert "空・極短" in violations


class TestQuestionDiversity:
    def test_no_recent_questions_full_novelty(self):
        score = _check_question_diversity("新しい質問です", [])
        assert score == 1.0

    def test_identical_question_zero_novelty(self):
        q = "その時どのような工夫をしましたか？"
        score = _check_question_diversity(q, [q])
        assert score < 0.1

    def test_different_question_high_novelty(self):
        q1 = "その時どのような工夫をしましたか？"
        q2 = "チームの規模と自分の役割を教えてください"
        score = _check_question_diversity(q2, [q1])
        assert score > 0.5


class TestEvaluateQuestionQuality:
    def test_good_question_accepted(self):
        result = _evaluate_question_quality(
            "その活動で、どのような役割を担っていましたか？",
            [],
            "role",
            [],
        )
        assert result["quality_ok"] is True
        assert result["recommended_action"] == "accept"

    def test_json_leak_blocks_focus(self):
        result = _evaluate_question_quality(
            '{"focus_key": "role"}',
            [],
            "role",
            [],
        )
        assert result["quality_ok"] is False
        assert result["recommended_action"] == "block_focus"

    def test_low_diversity_uses_fallback(self):
        recent = ["その時どのような工夫をしましたか？"]
        result = _evaluate_question_quality(
            "その時どのような工夫をしましたか？",
            recent,
            "action_reason",
            ["role"],
        )
        assert result["quality_ok"] is False
        assert result["recommended_action"] == "use_fallback"

    def test_prohibited_expression_uses_fallback(self):
        result = _evaluate_question_quality(
            "素晴らしい取り組みですね、もっと詳しく教えてください",
            [],
            "role",
            [],
        )
        assert result["quality_ok"] is False
        assert result["recommended_action"] == "use_fallback"
