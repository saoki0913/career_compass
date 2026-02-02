"""
ES Review Character Control Tests

Tests for character limit validation and repair functionality.
Covers Phase 1-6 of the character control improvements.
"""

import pytest
from typing import Optional

from app.routers.es_review import (
    parse_validation_errors,
    build_char_adjustment_prompt,
    validate_and_repair_section_rewrite,
    should_attempt_conditional_retry,
    build_targeted_variant_repair_prompt,
)
from app.prompts.es_templates import (
    validate_template_output,
    get_character_budget,
)


class TestParseValidationErrors:
    """Tests for parse_validation_errors function."""

    def test_over_limit_detection(self):
        """Detect variants over character limit."""
        variants = [
            {"text": "a" * 410, "char_count": 410},
            {"text": "b" * 395, "char_count": 395},
            {"text": "c" * 420, "char_count": 420},
        ]
        errors = parse_validation_errors(variants, char_min=None, char_max=400)

        assert len(errors) == 2
        assert errors[0]["pattern"] == 1
        assert errors[0]["direction"] == "reduce"
        assert errors[0]["delta"] == 10
        assert errors[1]["pattern"] == 3
        assert errors[1]["delta"] == 20

    def test_under_limit_detection(self):
        """Detect variants under character minimum."""
        variants = [
            {"text": "a" * 150, "char_count": 150},
            {"text": "b" * 210, "char_count": 210},
            {"text": "c" * 180, "char_count": 180},
        ]
        errors = parse_validation_errors(variants, char_min=200, char_max=None)

        assert len(errors) == 2
        assert errors[0]["pattern"] == 1
        assert errors[0]["direction"] == "expand"
        assert errors[0]["delta"] == 50
        assert errors[1]["pattern"] == 3
        assert errors[1]["delta"] == 20

    def test_within_range_no_errors(self):
        """No errors when all variants are within range."""
        variants = [
            {"text": "a" * 380, "char_count": 380},
            {"text": "b" * 390, "char_count": 390},
            {"text": "c" * 400, "char_count": 400},
        ]
        errors = parse_validation_errors(variants, char_min=350, char_max=400)

        assert len(errors) == 0

    def test_no_limits_no_errors(self):
        """No errors when no limits are set."""
        variants = [
            {"text": "a" * 1000, "char_count": 1000},
        ]
        errors = parse_validation_errors(variants, char_min=None, char_max=None)

        assert len(errors) == 0


class TestCharAdjustmentPrompt:
    """Tests for build_char_adjustment_prompt function."""

    def test_empty_errors_returns_empty(self):
        """Empty error list returns empty string."""
        prompt = build_char_adjustment_prompt([], char_min=None, char_max=400)
        assert prompt == ""

    def test_reduce_instructions_include_strategies(self):
        """Ensure reduction instructions include Japanese compression strategies."""
        errors = [
            {"pattern": 1, "current": 420, "target": 400, "delta": 20, "direction": "reduce"}
        ]
        prompt = build_char_adjustment_prompt(errors, char_min=None, char_max=400)

        # Check for compression techniques
        assert "冗長な接続表現" in prompt
        assert "「〜ということ」→「〜こと」" in prompt
        assert "削減手順" in prompt
        assert "余裕を持って" in prompt  # Safety margin

    def test_expand_instructions_include_strategies(self):
        """Ensure expansion instructions include content addition strategies."""
        errors = [
            {"pattern": 1, "current": 150, "target": 200, "delta": 50, "direction": "expand"}
        ]
        prompt = build_char_adjustment_prompt(errors, char_min=200, char_max=None)

        # Check for expansion techniques
        assert "追加手順" in prompt
        assert "具体的な数値" in prompt
        assert "状況説明" in prompt

    def test_constraint_description_range(self):
        """Constraint description shows range correctly."""
        errors = [
            {"pattern": 1, "current": 420, "target": 400, "delta": 20, "direction": "reduce"}
        ]
        prompt = build_char_adjustment_prompt(errors, char_min=350, char_max=400)

        assert "350〜400字" in prompt


class TestSectionRewriteValidation:
    """Tests for validate_and_repair_section_rewrite function."""

    def test_within_limit_unchanged(self):
        """Rewrite within limit should pass through unchanged."""
        rewrite = "これは395文字以内のテストです。"
        result = validate_and_repair_section_rewrite(rewrite, char_limit=400)
        assert result == rewrite

    def test_over_limit_truncated_at_sentence(self):
        """Rewrite over limit should truncate at sentence boundary."""
        rewrite = "最初の文です。二番目の文です。三番目の文は長いです。"
        result = validate_and_repair_section_rewrite(rewrite, char_limit=20)

        assert result is not None
        assert len(result) <= 20
        # Should end at a natural break or with ellipsis
        assert result.endswith("。") or result.endswith("...")

    def test_no_limit_unchanged(self):
        """No char limit should pass through unchanged."""
        rewrite = "長い文章" * 100
        result = validate_and_repair_section_rewrite(rewrite, char_limit=None)
        assert result == rewrite

    def test_none_rewrite_unchanged(self):
        """None rewrite should return None."""
        result = validate_and_repair_section_rewrite(None, char_limit=400)
        assert result is None

    def test_truncation_with_japanese_punctuation(self):
        """Truncation should prefer Japanese punctuation as break points."""
        rewrite = "これはテストです、とても長い文章になっています。"
        result = validate_and_repair_section_rewrite(rewrite, char_limit=15)

        assert result is not None
        assert len(result) <= 15


class TestConditionalRetry:
    """Tests for should_attempt_conditional_retry function."""

    def test_two_passing_enables_retry(self):
        """Should retry when 2/3 variants pass."""
        template_data = {
            "variants": [
                {"text": "a" * 395},  # Pass
                {"text": "b" * 390},  # Pass
                {"text": "c" * 420},  # Fail - over limit
            ]
        }
        should_retry, failing = should_attempt_conditional_retry(
            template_data, char_min=None, char_max=400
        )

        assert should_retry is True
        assert failing == [2]

    def test_one_passing_no_retry(self):
        """Should not retry when only 1/3 variants pass."""
        template_data = {
            "variants": [
                {"text": "a" * 395},  # Pass
                {"text": "b" * 420},  # Fail
                {"text": "c" * 450},  # Fail
            ]
        }
        should_retry, failing = should_attempt_conditional_retry(
            template_data, char_min=None, char_max=400
        )

        assert should_retry is False
        assert len(failing) == 2

    def test_all_passing_no_retry(self):
        """Should not retry when all variants pass."""
        template_data = {
            "variants": [
                {"text": "a" * 380},
                {"text": "b" * 390},
                {"text": "c" * 395},
            ]
        }
        should_retry, failing = should_attempt_conditional_retry(
            template_data, char_min=None, char_max=400
        )

        assert should_retry is False
        assert failing == []

    def test_under_limit_detection(self):
        """Should detect variants under minimum limit."""
        template_data = {
            "variants": [
                {"text": "a" * 350},  # Pass
                {"text": "b" * 360},  # Pass
                {"text": "c" * 100},  # Fail - under limit
            ]
        }
        should_retry, failing = should_attempt_conditional_retry(
            template_data, char_min=200, char_max=400
        )

        assert should_retry is True
        assert failing == [2]

    def test_empty_variants_no_retry(self):
        """Should not retry with empty variants."""
        template_data = {"variants": []}
        should_retry, failing = should_attempt_conditional_retry(
            template_data, char_min=None, char_max=400
        )

        assert should_retry is False
        assert failing == []

    def test_wrong_variant_count_no_retry(self):
        """Should not retry with wrong number of variants."""
        template_data = {
            "variants": [
                {"text": "a" * 420},  # Fail
                {"text": "b" * 390},  # Pass
            ]
        }
        should_retry, failing = should_attempt_conditional_retry(
            template_data, char_min=None, char_max=400
        )

        assert should_retry is False


class TestTargetedVariantRepairPrompt:
    """Tests for build_targeted_variant_repair_prompt function."""

    def test_single_variant_repair(self):
        """Repair prompt for single failing variant."""
        template_data = {
            "variants": [
                {"text": "a" * 420},
                {"text": "b" * 390},
                {"text": "c" * 395},
            ]
        }
        prompt = build_targeted_variant_repair_prompt(
            template_data, failing_indices=[0], char_min=None, char_max=400
        )

        assert "variants[0]" in prompt
        assert "420字" in prompt
        assert "400字以下" in prompt
        assert "20字削減" in prompt
        # Should not mention other variants
        assert "variants[1]" not in prompt
        assert "variants[2]" not in prompt

    def test_multiple_variant_repair(self):
        """Repair prompt for multiple failing variants."""
        template_data = {
            "variants": [
                {"text": "a" * 420},
                {"text": "b" * 430},
                {"text": "c" * 395},
            ]
        }
        prompt = build_targeted_variant_repair_prompt(
            template_data, failing_indices=[0, 1], char_min=None, char_max=400
        )

        assert "variants[0]" in prompt
        assert "variants[1]" in prompt
        assert "variants[2]" not in prompt

    def test_under_limit_repair(self):
        """Repair prompt for under-limit variants."""
        template_data = {
            "variants": [
                {"text": "a" * 150},
                {"text": "b" * 390},
                {"text": "c" * 395},
            ]
        }
        prompt = build_targeted_variant_repair_prompt(
            template_data, failing_indices=[0], char_min=200, char_max=400
        )

        assert "variants[0]" in prompt
        assert "150字" in prompt
        assert "200字以上" in prompt
        assert "50字追加" in prompt

    def test_includes_compression_techniques(self):
        """Repair prompt includes compression/expansion techniques."""
        template_data = {
            "variants": [{"text": "a" * 420}]
        }
        prompt = build_targeted_variant_repair_prompt(
            template_data, failing_indices=[0], char_min=None, char_max=400
        )

        assert "削減" in prompt
        assert "「〜ということ」→「〜こと」" in prompt


class TestCharacterBudget:
    """Tests for get_character_budget function."""

    def test_no_limits_returns_empty(self):
        """No limits returns empty string."""
        result = get_character_budget(None, None)
        assert result == ""

    def test_range_limits_include_safety_margin(self):
        """Range limits should include safety margin target."""
        result = get_character_budget(350, 400)

        assert "目標文字数" in result
        assert "安全範囲" in result
        # Should aim for 95% of max
        assert "380" in result  # 400 * 0.95 = 380

    def test_max_only_includes_guidance(self):
        """Max-only limit includes proper guidance."""
        result = get_character_budget(None, 400)

        assert "400字以内" in result
        assert "導入" in result
        assert "本論" in result
        assert "結論" in result

    def test_min_only_includes_guidance(self):
        """Min-only limit includes proper guidance."""
        result = get_character_budget(200, None)

        assert "200字以上" in result

    def test_includes_compression_techniques(self):
        """Budget guidance includes compression/expansion techniques."""
        result = get_character_budget(350, 400)

        # Compression techniques
        assert "「〜ということ」→「〜こと」" in result
        # Expansion techniques
        assert "具体的な数値" in result
        # Common mistakes
        assert "よくある失敗" in result


class TestValidateTemplateOutput:
    """Tests for validate_template_output function."""

    def test_valid_output_passes(self):
        """Valid output should pass validation."""
        template_review = {
            "variants": [
                {"text": "a" * 380, "keywords_used": ["kw1", "kw2"]},
                {"text": "b" * 390, "keywords_used": ["kw1", "kw2"]},
                {"text": "c" * 395, "keywords_used": ["kw1", "kw2"]},
            ]
        }
        is_valid, error = validate_template_output(
            template_review, char_min=350, char_max=400, keyword_count=0
        )

        assert is_valid is True
        assert error == ""

    def test_over_limit_fails(self):
        """Over limit should fail validation."""
        template_review = {
            "variants": [
                {"text": "a" * 420, "keywords_used": []},
                {"text": "b" * 390, "keywords_used": []},
                {"text": "c" * 395, "keywords_used": []},
            ]
        }
        is_valid, error = validate_template_output(
            template_review, char_min=None, char_max=400, keyword_count=0
        )

        assert is_valid is False
        assert "パターン1" in error
        assert "削減が必要" in error

    def test_under_limit_fails(self):
        """Under limit should fail validation."""
        template_review = {
            "variants": [
                {"text": "a" * 150, "keywords_used": []},
                {"text": "b" * 390, "keywords_used": []},
                {"text": "c" * 395, "keywords_used": []},
            ]
        }
        is_valid, error = validate_template_output(
            template_review, char_min=200, char_max=400, keyword_count=0
        )

        assert is_valid is False
        assert "パターン1" in error
        assert "追加が必要" in error

    def test_wrong_variant_count_fails(self):
        """Wrong variant count should fail validation."""
        template_review = {
            "variants": [
                {"text": "a" * 380, "keywords_used": []},
                {"text": "b" * 390, "keywords_used": []},
            ]
        }
        is_valid, error = validate_template_output(
            template_review, char_min=None, char_max=400, keyword_count=0
        )

        assert is_valid is False
        assert "3パターン" in error

    def test_desu_masu_detection(self):
        """Should detect です/ます style."""
        template_review = {
            "variants": [
                {"text": "これはテストです。", "keywords_used": []},
                {"text": "である調で書いた。", "keywords_used": []},
                {"text": "である調で書いた。", "keywords_used": []},
            ]
        }
        is_valid, error = validate_template_output(
            template_review, char_min=None, char_max=None, keyword_count=0
        )

        assert is_valid is False
        assert "です・ます調" in error
