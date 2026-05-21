from app.prompts.es_templates._length_control import (
    LengthBand,
    _format_length_policy_block,
    _format_target_char_window,
    compute_internal_target_gap,
    compute_retry_overshoot,
    format_acceptance_band,
    format_generation_target,
    resolve_length_target_plan,
)


def test_recovery_with_failed_len_overshoots_beyond_char_max() -> None:
    plan = resolve_length_target_plan(
        390,
        400,
        stage="under_min_recovery",
        original_len=42,
        llm_model="claude-sonnet-4-6",
        latest_failed_len=361,
    )

    expected_overshoot = compute_retry_overshoot(
        char_min=390, char_max=400, latest_failed_length=361,
    )
    assert expected_overshoot > 0
    assert plan.acceptance_band == LengthBand(390, 400)
    assert plan.generation_target == LengthBand(400, 400 + expected_overshoot)
    assert plan.generation_exceeds_acceptance is True
    assert format_acceptance_band(plan) == "390字〜400字"


def test_recovery_without_failed_len_stays_at_char_max() -> None:
    plan = resolve_length_target_plan(
        390,
        400,
        stage="under_min_recovery",
        original_len=42,
        llm_model="claude-sonnet-4-6",
        latest_failed_len=0,
    )

    assert plan.acceptance_band == LengthBand(390, 400)
    assert plan.generation_target == LengthBand(400, 400)
    assert plan.generation_exceeds_acceptance is False


def test_length_policy_block_formats_acceptance_and_generation_target_separately() -> None:
    block = _format_length_policy_block(
        390,
        400,
        stage="under_min_recovery",
        original_len=42,
        llm_model="claude-sonnet-4-6",
    )

    assert "strict受理帯: 390字〜400字" in block
    assert "今回の生成目標帯: 400字" in block
    assert "長文設問: 設問が求める複数の軸を削らず、390字未満で終えない" in block


def test_length_policy_block_shows_overshoot_target_with_failed_len() -> None:
    block = _format_length_policy_block(
        390,
        400,
        stage="under_min_recovery",
        original_len=42,
        llm_model="claude-sonnet-4-6",
        latest_failed_len=361,
    )

    assert "strict受理帯: 390字〜400字" in block
    assert "今回の生成目標帯: 400字〜" in block
    assert "今回の生成目標帯: 390字" not in block
    assert "最終提出文は必ず400字以内へ圧縮する" in block


def test_compute_retry_overshoot_various_shortfalls() -> None:
    assert compute_retry_overshoot(char_min=200, char_max=300, latest_failed_length=200) == 0
    assert compute_retry_overshoot(char_min=200, char_max=300, latest_failed_length=190) > 0

    small = compute_retry_overshoot(char_min=200, char_max=300, latest_failed_length=190)
    large = compute_retry_overshoot(char_min=200, char_max=300, latest_failed_length=130)
    assert large > small

    capped = compute_retry_overshoot(char_min=200, char_max=200, latest_failed_length=50)
    assert capped <= max(5, int(200 * 0.25))


def test_length_target_plan_keeps_generation_target_for_short_openai_mini() -> None:
    answer = "幅広い事業に関わり、自分の視野を広げたい。"

    plan = resolve_length_target_plan(
        72,
        140,
        original_len=len(answer),
        llm_model="gpt-5.4-mini",
    )

    assert plan.acceptance_band == LengthBand(72, 140)
    assert plan.generation_target == LengthBand(129, 140)
    assert format_generation_target(plan) == _format_target_char_window(
        72,
        140,
        original_len=len(answer),
        llm_model="gpt-5.4-mini",
    )
    assert compute_internal_target_gap(
        72,
        140,
        original_len=len(answer),
        llm_model="gpt-5.4-mini",
    ) == 11


def test_length_target_plan_handles_one_sided_limits() -> None:
    max_only = resolve_length_target_plan(0, 200, original_len=12)
    min_only = resolve_length_target_plan(120, None, original_len=12)

    assert format_acceptance_band(max_only) == "200字以内"
    assert format_generation_target(max_only) == "188字〜200字"
    assert format_acceptance_band(min_only) == "120字以上"
    assert format_generation_target(min_only) == "120字以上"


def test_tight_length_retry_lowers_generation_upper_with_buffer_narrow_band() -> None:
    base = resolve_length_target_plan(
        390, 400, stage="tight_length", llm_model="claude-sonnet-4-6", attempt_index=0
    )
    retry = resolve_length_target_plan(
        390, 400, stage="tight_length", llm_model="claude-sonnet-4-6", attempt_index=1
    )

    # 受理帯は再試行でも不変。
    assert base.acceptance_band == LengthBand(390, 400)
    assert retry.acceptance_band == LengthBand(390, 400)
    # 初回は char_max まで生成許容。
    assert base.generation_target_upper == 400
    # 再試行(attempt>=1)は buffer 分下げる。狭帯は char_min にクランプ。
    assert retry.generation_target_upper == 390


def test_tight_length_retry_lowers_generation_upper_with_buffer_wide_band() -> None:
    retry = resolve_length_target_plan(
        200, 400, stage="tight_length", llm_model="claude-sonnet-4-6", attempt_index=1
    )

    assert retry.acceptance_band == LengthBand(200, 400)
    assert retry.generation_target_upper == 385  # char_max - 15


def test_default_stage_ignores_attempt_index_buffer() -> None:
    base = resolve_length_target_plan(
        390, 400, stage="default", llm_model="claude-sonnet-4-6", attempt_index=0
    )
    retry = resolve_length_target_plan(
        390, 400, stage="default", llm_model="claude-sonnet-4-6", attempt_index=1
    )

    assert base.generation_target_upper == 400
    assert retry.generation_target_upper == 400
