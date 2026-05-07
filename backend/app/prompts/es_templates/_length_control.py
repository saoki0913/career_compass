"""Length control profiles and prompt blocks for ES templates."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class LengthControlProfile:
    profile_id: str
    provider_family: str
    band: str
    stage: str
    target_lower: int | None
    target_upper: int | None
    gap: int
    source_fill_ratio: float
    required_growth: int
    latest_failed_length: int
    early_length_fix_after_attempt: int


@dataclass(frozen=True)
class LengthBand:
    lower: int | None
    upper: int | None


@dataclass(frozen=True)
class LengthTargetPlan:
    """DTO that separates generation targets from validation acceptance."""

    profile: LengthControlProfile
    generation_target: LengthBand
    acceptance_band: LengthBand

    @property
    def generation_target_lower(self) -> int | None:
        return self.generation_target.lower

    @property
    def generation_target_upper(self) -> int | None:
        return self.generation_target.upper

    @property
    def acceptance_lower(self) -> int | None:
        return self.acceptance_band.lower

    @property
    def acceptance_upper(self) -> int | None:
        return self.acceptance_band.upper

    @property
    def generation_exceeds_acceptance(self) -> bool:
        if self.generation_target.upper is None or self.acceptance_band.upper is None:
            return False
        return self.generation_target.upper > self.acceptance_band.upper


_DEFAULT_STAGE_KEY = "default"
_RECOVERY_STAGE_KEY = "under_min_recovery"
_TIGHT_STAGE_KEY = "tight_length"

DELTA_BAND_LARGE = 70
DELTA_BAND_MEDIUM = 35
DELTA_BAND_SMALL = 15


def compute_shortfall_delta_band(
    *,
    char_min: int | None,
    current_length: int | None,
) -> str | None:
    """Compute delta band from shortfall. SSOT for all modules."""
    if not char_min or not current_length or current_length >= char_min:
        return None
    shortfall = char_min - current_length
    if shortfall >= DELTA_BAND_LARGE:
        return "large"
    if shortfall >= DELTA_BAND_MEDIUM:
        return "medium"
    if shortfall >= DELTA_BAND_SMALL:
        return "small"
    return "tiny"


_MODEL_FAMILY_DEFAULTS = {
    "openai_gpt5_mini": {
        _DEFAULT_STAGE_KEY: {"short": 8, "medium": 16, "long": 20},
        _RECOVERY_STAGE_KEY: {"short": -20, "medium": -15, "long": -10},
        _TIGHT_STAGE_KEY: {"short": 10, "medium": 16, "long": 18},
        "early_length_fix_after_attempt": 2,
    },
    "openai_gpt5": {
        _DEFAULT_STAGE_KEY: {"short": 8, "medium": 14, "long": 18},
        _RECOVERY_STAGE_KEY: {"short": -15, "medium": -12, "long": -8},
        _TIGHT_STAGE_KEY: {"short": 10, "medium": 14, "long": 16},
        "early_length_fix_after_attempt": 2,
    },
    "anthropic_claude": {
        _DEFAULT_STAGE_KEY: {"short": 8, "medium": 12, "long": 14},
        _RECOVERY_STAGE_KEY: {"short": -15, "medium": -12, "long": -8},
        _TIGHT_STAGE_KEY: {"short": 10, "medium": 14, "long": 16},
        "early_length_fix_after_attempt": 2,
    },
    "google_gemini": {
        _DEFAULT_STAGE_KEY: {"short": 8, "medium": 12, "long": 14},
        _RECOVERY_STAGE_KEY: {"short": -15, "medium": -12, "long": -8},
        _TIGHT_STAGE_KEY: {"short": 10, "medium": 14, "long": 16},
        "early_length_fix_after_attempt": 2,
    },
    "generic": {
        _DEFAULT_STAGE_KEY: {"short": 8, "medium": 12, "long": 14},
        _RECOVERY_STAGE_KEY: {"short": -15, "medium": -12, "long": -8},
        _TIGHT_STAGE_KEY: {"short": 10, "medium": 14, "long": 16},
        "early_length_fix_after_attempt": 2,
    },
}


def _length_band(char_max: int | None) -> str:
    if not char_max or char_max <= 220:
        return "short"
    if char_max <= 320:
        return "medium"
    return "long"


def _model_provider_family(llm_model: str | None) -> str:
    model_l = (llm_model or "").strip().lower()
    if "claude" in model_l:
        return "anthropic_claude"
    if "gemini" in model_l:
        return "google_gemini"
    if "gpt-5.4-mini" in model_l or "mini" in model_l:
        return "openai_gpt5_mini"
    if "gpt-5" in model_l or model_l.startswith("o"):
        return "openai_gpt5"
    return "generic"


def resolve_length_control_profile(
    char_min: Optional[int],
    char_max: Optional[int],
    *,
    stage: str = "default",
    original_len: int = 0,
    llm_model: Optional[str] = None,
    latest_failed_len: int = 0,
) -> LengthControlProfile:
    band = _length_band(char_max)
    provider_family = _model_provider_family(llm_model)
    profile = _MODEL_FAMILY_DEFAULTS.get(provider_family, _MODEL_FAMILY_DEFAULTS["generic"])
    stage_key = stage if stage in {_DEFAULT_STAGE_KEY, _RECOVERY_STAGE_KEY, _TIGHT_STAGE_KEY} else _DEFAULT_STAGE_KEY
    ratio = min(1.25, max(0.0, float(original_len) / float(max(char_max or 1, 1))))
    gap = int(profile[stage_key][band])

    if stage_key == _DEFAULT_STAGE_KEY:
        if ratio < 0.45:
            gap += 1 if provider_family == "openai_gpt5_mini" else 2
        elif 0.80 < ratio < 0.95:
            gap -= 1
        elif ratio >= 0.95:
            gap += 1

    span = max(1, char_max - (char_min or 0)) if char_max else 1
    if gap < 0 and stage_key == _RECOVERY_STAGE_KEY:
        overshoot = abs(gap)
        target_upper = (char_max or 0) + overshoot
        target_lower = (char_max or 0) + max(1, overshoot - 5)
    else:
        gap = max(1, min(span, gap))
        target_upper = char_max
        target_lower = max(char_min or 0, (char_max or 0) - gap) if char_max else char_min
    profile_id = f"{provider_family}:{band}:{stage_key}"
    required_growth = max(0, (char_min or 0) - latest_failed_len) if char_min else 0
    return LengthControlProfile(
        profile_id=profile_id,
        provider_family=provider_family,
        band=band,
        stage=stage_key,
        target_lower=target_lower,
        target_upper=target_upper,
        gap=gap,
        source_fill_ratio=round(ratio, 4),
        required_growth=required_growth,
        latest_failed_length=int(latest_failed_len or 0),
        early_length_fix_after_attempt=int(profile["early_length_fix_after_attempt"]),
    )


def _format_char_condition(char_min: Optional[int], char_max: Optional[int]) -> str:
    if char_min and char_max:
        return f"{char_min}字〜{char_max}字"
    if char_max:
        return f"{char_max}字以内"
    if char_min:
        return f"{char_min}字以上"
    return "未指定"


def format_length_band(band: LengthBand) -> str:
    return _format_char_condition(band.lower, band.upper)


def format_generation_target(plan: LengthTargetPlan) -> str:
    return format_length_band(plan.generation_target)


def format_acceptance_band(plan: LengthTargetPlan) -> str:
    return format_length_band(plan.acceptance_band)


def resolve_length_target_plan(
    char_min: Optional[int],
    char_max: Optional[int],
    *,
    stage: str = "default",
    original_len: int = 0,
    llm_model: Optional[str] = None,
    latest_failed_len: int = 0,
) -> LengthTargetPlan:
    profile = resolve_length_control_profile(
        char_min,
        char_max,
        stage=stage,
        original_len=original_len,
        llm_model=llm_model,
        latest_failed_len=latest_failed_len,
    )
    target_lower = profile.target_lower
    target_upper = profile.target_upper
    if char_max is not None and target_upper is not None and target_upper > char_max:
        target_upper = char_max
        if target_lower is not None and target_lower > target_upper:
            target_lower = char_min if char_min is not None else max(0, target_upper - profile.gap)
    return LengthTargetPlan(
        profile=profile,
        generation_target=LengthBand(target_lower, target_upper),
        acceptance_band=LengthBand(char_min, char_max),
    )


# 文字数パイプライン: メイン rewrite → _validate_rewrite_candidate →（必要時）length_fix。
# 内部目標帯は compute_internal_target_gap / _format_target_char_window で
# メイン・フォールバック・length_fix プロンプトに一貫して埋め込む。


def compute_internal_target_gap(
    char_min: Optional[int],
    char_max: Optional[int],
    *,
    original_len: int = 0,
    llm_model: Optional[str] = None,
    stage: str = "default",
) -> int:
    """LLM向けの内部目標帯の幅（char_max からの差分）。"""
    profile = resolve_length_control_profile(
        char_min,
        char_max,
        original_len=original_len,
        llm_model=llm_model,
        stage=stage,
        latest_failed_len=original_len,
    )
    return profile.gap


def _target_window_bounds(
    char_min: Optional[int],
    char_max: Optional[int],
    *,
    stage: str = "default",
    original_len: int = 0,
    llm_model: Optional[str] = None,
) -> tuple[Optional[int], Optional[int]]:
    plan = resolve_length_target_plan(
        char_min,
        char_max,
        stage=stage,
        original_len=original_len,
        llm_model=llm_model,
        latest_failed_len=original_len,
    )
    return plan.generation_target_lower, plan.generation_target_upper


def _format_target_char_window(
    char_min: Optional[int],
    char_max: Optional[int],
    *,
    stage: str = "default",
    original_len: int = 0,
    llm_model: Optional[str] = None,
) -> str:
    plan = resolve_length_target_plan(
        char_min,
        char_max,
        stage=stage,
        original_len=original_len,
        llm_model=llm_model,
        latest_failed_len=original_len,
    )
    return format_generation_target(plan)


def _format_length_policy_block(
    char_min: Optional[int],
    char_max: Optional[int],
    *,
    stage: str = "default",
    original_len: int = 0,
    llm_model: Optional[str] = None,
) -> str:
    plan = resolve_length_target_plan(
        char_min,
        char_max,
        stage=stage,
        original_len=original_len,
        llm_model=llm_model,
        latest_failed_len=original_len,
    )
    target_window = format_generation_target(plan)
    acceptance_band = format_acceptance_band(plan)
    final_floor = f"{int(char_max * 0.9 + 0.999999999)}字" if char_max else "未指定"
    long_line = ""
    if char_min and char_max and char_max >= 350:
        long_line = (
            f"\n- 長文設問: 設問が求める複数の軸を削らず、{char_min}字未満で終えない。"
            "最終文まで strict 帯内に収める"
        )
    return f"""<length_policy>
- strict受理帯: {acceptance_band}
- 今回の内部目標帯: {target_window}
- strictに届かない場合でも、最終段だけ {final_floor} 以上なら受理余地がある
- ただし soft救済は最後だけで、通常段では strict を守る{long_line}
</length_policy>"""
