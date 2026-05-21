from __future__ import annotations

from app.services.es_review.llm_validation import LlmValidationResult
from app.services.es_review.validation import _should_attempt_semantic_compression
from app.services.es_review.validation_profile import (
    LENIENT_PROFILE,
    QUALITY_FIRST_PROFILE,
    STRICT_PROFILE,
    apply_information_tier_adjustments,
    compute_information_density,
    count_facts,
    resolve_profile,
)


def test_information_density_tier_boundaries() -> None:
    assert compute_information_density("あ" * 99, fact_count=0).tier == "sparse"
    assert compute_information_density("あ" * 100, fact_count=0).tier == "low"
    assert compute_information_density("あ" * 200, fact_count=0).tier == "moderate"
    assert compute_information_density("あ" * 400, fact_count=0).tier == "sufficient"


def test_count_facts_counts_numbers_roles_and_experiences() -> None:
    text = "5人のチームで副会長として海外留学プロジェクトに取り組んだ。"
    assert count_facts(text) >= 3


def test_profile_defaults() -> None:
    assert STRICT_PROFILE.name == "strict"
    assert STRICT_PROFILE.fact_preservation == "required"
    assert STRICT_PROFILE.max_retry == 3
    assert not STRICT_PROFILE.best_effort_enabled

    assert LENIENT_PROFILE.name == "lenient"
    assert LENIENT_PROFILE.company_grounding == "warn"
    assert LENIENT_PROFILE.fact_preservation == "warn"
    assert LENIENT_PROFILE.max_retry == 2
    assert LENIENT_PROFILE.best_effort_enabled


def test_information_tier_adjustments_for_strict_profile() -> None:
    moderate = apply_information_tier_adjustments(STRICT_PROFILE, "moderate")
    assert moderate is STRICT_PROFILE

    low = apply_information_tier_adjustments(STRICT_PROFILE, "low")
    assert low.fact_preservation == "warn"
    assert low.fact_guard_hard_block_codes == frozenset(
        {"number_mutation", "role_title_mutation"}
    )
    assert low.hallucination_tier2_threshold == 4.5

    sparse = apply_information_tier_adjustments(STRICT_PROFILE, "sparse")
    assert sparse.fact_preservation == "warn"
    assert sparse.fact_guard_hard_block_codes == frozenset({"number_mutation"})
    assert sparse.hallucination_tier2_threshold == 6.0


def test_quality_first_profile_warns_fact_preservation_but_blocks_hard_fact_mutation() -> None:
    profile = QUALITY_FIRST_PROFILE
    assert profile.name == "quality_first"
    assert profile.fact_preservation == "warn"
    assert profile.best_effort_enabled
    assert profile.max_retry == 3
    assert "number_mutation" in profile.fact_guard_hard_block_codes
    assert "role_title_mutation" in profile.fact_guard_hard_block_codes
    assert "metric_fabrication" in profile.fact_guard_hard_block_codes
    assert "experience_fabrication" in profile.fact_guard_hard_block_codes
    assert "award_fabrication" in profile.fact_guard_hard_block_codes
    assert "proper_noun_fabrication" in profile.fact_guard_hard_block_codes
    assert "hallucination" in profile.degraded_block_codes
    assert "fact_preservation" in profile.degraded_block_codes
    assert "llm_quality" in profile.degraded_block_codes


def test_quality_first_profile_is_not_relaxed_by_information_tier() -> None:
    assert apply_information_tier_adjustments(QUALITY_FIRST_PROFILE, "sparse") is QUALITY_FIRST_PROFILE
    assert apply_information_tier_adjustments(QUALITY_FIRST_PROFILE, "low") is QUALITY_FIRST_PROFILE


def test_lenient_profile_degraded_block_codes_are_reduced() -> None:
    assert "hallucination" in STRICT_PROFILE.degraded_block_codes
    assert "fact_preservation" in STRICT_PROFILE.degraded_block_codes
    assert "hallucination" not in LENIENT_PROFILE.degraded_block_codes
    assert "fact_preservation" not in LENIENT_PROFILE.degraded_block_codes


def test_resolve_profile() -> None:
    assert resolve_profile("gakuchika") is LENIENT_PROFILE
    assert resolve_profile("motivation") is LENIENT_PROFILE
    assert resolve_profile("es_review") is QUALITY_FIRST_PROFILE


def test_semantic_compression_threshold_covers_overshoot() -> None:
    # char_max=400 の許容超過幅は max(90, int(400*0.40)) = 160 字。
    assert _should_attempt_semantic_compression(400, None) is False
    assert _should_attempt_semantic_compression(400, 400) is False
    assert _should_attempt_semantic_compression(490, 400) is True
    assert _should_attempt_semantic_compression(520, 400) is True
    assert _should_attempt_semantic_compression(540, 400) is True
    assert _should_attempt_semantic_compression(560, 400) is True
    assert _should_attempt_semantic_compression(561, 400) is False
    # char_max=200 では floor の 90 字が効く（int(200*0.40)=80 < 90）。
    assert _should_attempt_semantic_compression(225, 200) is True
    assert _should_attempt_semantic_compression(290, 200) is True
    assert _should_attempt_semantic_compression(291, 200) is False


def test_llm_validation_result_legacy_unpacking() -> None:
    result = LlmValidationResult(
        passed=False,
        failed_checks=["structure_clarity"],
        retry_hint="重複がある",
        warned_checks=["fact_preservation"],
    )
    passed, failed, hint = result
    assert passed is False
    assert failed == ["structure_clarity"]
    assert hint == "重複がある"
    assert result.warned_checks == ["fact_preservation"]
